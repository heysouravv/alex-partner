import { db } from "../services/database.ts";
import { redis } from "../services/redis.ts";

interface TestResult {
  endpoint: string;
  requests: number;
  successCount: number;
  errorCount: number;
  totalTime: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughput: number; // requests per second
}

class StressTester {
  private results: TestResult[] = [];
  private startTime: number = 0;
  private endTime: number = 0;

  async runTest(
    endpoint: string,
    requests: number,
    concurrent: number,
    method: string = "GET",
    headers: Record<string, string> = {},
    body?: any
  ): Promise<TestResult> {
    console.log(`\n🚀 Testing ${endpoint} with ${requests} requests (${concurrent} concurrent)`);
    
    const responseTimes: number[] = [];
    let successCount = 0;
    let errorCount = 0;
    
    const startTime = Date.now();
    
    // Create batches of concurrent requests
    const batches = Math.ceil(requests / concurrent);
    
    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(concurrent, requests - batch * concurrent);
      const promises: Promise<void>[] = [];
      
      for (let i = 0; i < batchSize; i++) {
        promises.push(this.makeRequest(endpoint, method, headers, body, responseTimes));
      }
      
      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          errorCount++;
        }
      });
      
      // Small delay between batches to prevent overwhelming
      if (batch < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    const totalTime = Date.now() - startTime;
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    const throughput = (requests / totalTime) * 1000; // requests per second
    
    const result: TestResult = {
      endpoint,
      requests,
      successCount,
      errorCount,
      totalTime,
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      throughput
    };
    
    this.results.push(result);
    return result;
  }

  private async makeRequest(
    endpoint: string,
    method: string,
    headers: Record<string, string>,
    body?: any,
    responseTimes: number[] = []
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const url = `http://localhost:8080${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseTime = Date.now() - startTime;
      responseTimes.push(responseTime);
      
    } catch (error) {
      console.error(`Request failed: ${error.message}`);
      throw error;
    }
  }

  async runDatabaseStressTest(): Promise<void> {
    console.log("\n🗄️  Database Stress Test");
    console.log("========================");
    
    // Test database connection pooling
    await this.runTest("/api/health", 100, 10);
    
    // Test business types (cached)
    await this.runTest("/api/business/types", 200, 20);
    
    // Test menu templates
    await this.runTest("/api/menu/templates", 150, 15);
    
    // Test bakery templates specifically
    await this.runTest("/api/menu/templates?business_type=bakery", 100, 10);
  }

  async runAuthenticationStressTest(): Promise<void> {
    console.log("\n🔐 Authentication Stress Test");
    console.log("=============================");
    
    // Test multiple signups
    const signupPromises = [];
    for (let i = 0; i < 20; i++) {
      const email = `stress-test-${Date.now()}-${i}@example.com`;
      signupPromises.push(
        this.makeRequest("/api/auth/signup", "POST", {}, {
          name: `Stress Test User ${i}`,
          email,
          password: "password123",
          business_name: `Stress Business ${i}`
        })
      );
    }
    
    console.log("Creating 20 test users...");
    await Promise.allSettled(signupPromises);
    
    // Test login with one user
    const loginResponse = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123"
      })
    });
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // Test authenticated endpoints
      await this.runTest("/api/user/profile", 50, 5, "GET", { "Authorization": `Bearer ${token}` });
      await this.runTest("/api/business/profile", 50, 5, "GET", { "Authorization": `Bearer ${token}` });
      await this.runTest("/api/orders", 50, 5, "GET", { "Authorization": `Bearer ${token}` });
      await this.runTest("/api/menu", 50, 5, "GET", { "Authorization": `Bearer ${token}` });
      await this.runTest("/api/stats", 30, 3, "GET", { "Authorization": `Bearer ${token}` });
      await this.runTest("/api/activity", 30, 3, "GET", { "Authorization": `Bearer ${token}` });
    }
  }

  async runCacheStressTest(): Promise<void> {
    console.log("\n⚡ Cache Stress Test");
    console.log("===================");
    
    // Test cache hit performance
    await this.runTest("/api/business/types", 500, 50); // Should be cached
    
    // Test cache invalidation
    const loginResponse = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123"
      })
    });
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // Test menu cache
      await this.runTest("/api/menu", 100, 10, "GET", { "Authorization": `Bearer ${token}` });
      
      // Test stats cache
      await this.runTest("/api/stats", 50, 5, "GET", { "Authorization": `Bearer ${token}` });
    }
  }

  async runConcurrentUserTest(): Promise<void> {
    console.log("\n👥 Concurrent User Test");
    console.log("=======================");
    
    // Simulate multiple users accessing the system simultaneously
    const userPromises = [];
    
    for (let i = 0; i < 10; i++) {
      userPromises.push(this.simulateUserSession(i));
    }
    
    await Promise.all(userPromises);
  }

  private async simulateUserSession(userId: number): Promise<void> {
    try {
      // Create user
      const email = `concurrent-user-${userId}-${Date.now()}@example.com`;
      const signupResponse = await fetch("http://localhost:8080/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Concurrent User ${userId}`,
          email,
          password: "password123",
          business_name: `Concurrent Business ${userId}`
        })
      });
      
      if (signupResponse.ok) {
        const signupData = await signupResponse.json();
        const token = signupData.token;
        
        // Simulate user activity
        const activities = [
          () => fetch(`http://localhost:8080/api/user/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
          }),
          () => fetch(`http://localhost:8080/api/business/profile`, {
            headers: { "Authorization": `Bearer ${token}` }
          }),
          () => fetch(`http://localhost:8080/api/menu`, {
            headers: { "Authorization": `Bearer ${token}` }
          }),
          () => fetch(`http://localhost:8080/api/stats`, {
            headers: { "Authorization": `Bearer ${token}` }
          })
        ];
        
        // Perform activities in parallel
        await Promise.all(activities.map(activity => activity()));
      }
    } catch (error) {
      console.error(`User session ${userId} failed:`, error.message);
    }
  }

  async runMemoryLeakTest(): Promise<void> {
    console.log("\n🧠 Memory Leak Test");
    console.log("===================");
    
    // Test repeated requests to check for memory leaks
    for (let round = 0; round < 5; round++) {
      console.log(`Round ${round + 1}/5`);
      await this.runTest("/api/health", 100, 10);
      await this.runTest("/api/business/types", 100, 10);
      
      // Small delay between rounds
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async runFullStressTest(): Promise<void> {
    console.log("🔥 Starting Full Stress Test");
    console.log("============================");
    
    this.startTime = Date.now();
    
    // Run all tests
    await this.runDatabaseStressTest();
    await this.runAuthenticationStressTest();
    await this.runCacheStressTest();
    await this.runConcurrentUserTest();
    await this.runMemoryLeakTest();
    
    this.endTime = Date.now();
    
    this.printResults();
  }

  private printResults(): void {
    console.log("\n📊 Stress Test Results");
    console.log("=====================");
    
    const totalTime = this.endTime - this.startTime;
    const totalRequests = this.results.reduce((sum, r) => sum + r.requests, 0);
    const totalSuccess = this.results.reduce((sum, r) => sum + r.successCount, 0);
    const totalErrors = this.results.reduce((sum, r) => sum + r.errorCount, 0);
    const overallThroughput = (totalRequests / totalTime) * 1000;
    
    console.log(`\n📈 Overall Performance:`);
    console.log(`   Total Time: ${totalTime}ms`);
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Success Rate: ${((totalSuccess / totalRequests) * 100).toFixed(2)}%`);
    console.log(`   Error Rate: ${((totalErrors / totalRequests) * 100).toFixed(2)}%`);
    console.log(`   Overall Throughput: ${overallThroughput.toFixed(2)} req/s`);
    
    console.log(`\n📋 Detailed Results:`);
    this.results.forEach(result => {
      console.log(`\n   ${result.endpoint}:`);
      console.log(`     Requests: ${result.requests}`);
      console.log(`     Success: ${result.successCount} (${((result.successCount / result.requests) * 100).toFixed(1)}%)`);
      console.log(`     Errors: ${result.errorCount}`);
      console.log(`     Avg Response Time: ${result.avgResponseTime.toFixed(2)}ms`);
      console.log(`     Min/Max Response Time: ${result.minResponseTime}ms / ${result.maxResponseTime}ms`);
      console.log(`     Throughput: ${result.throughput.toFixed(2)} req/s`);
    });
    
    // Performance analysis
    console.log(`\n🎯 Performance Analysis:`);
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.avgResponseTime, 0) / this.results.length;
    const maxResponseTime = Math.max(...this.results.map(r => r.maxResponseTime));
    
    console.log(`   Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`   Maximum Response Time: ${maxResponseTime}ms`);
    
    if (avgResponseTime < 100) {
      console.log(`   ✅ Excellent performance!`);
    } else if (avgResponseTime < 500) {
      console.log(`   ✅ Good performance`);
    } else if (avgResponseTime < 1000) {
      console.log(`   ⚠️  Acceptable performance`);
    } else {
      console.log(`   ❌ Performance needs improvement`);
    }
    
    if (totalErrors === 0) {
      console.log(`   ✅ Perfect reliability!`);
    } else if ((totalErrors / totalRequests) < 0.01) {
      console.log(`   ✅ High reliability`);
    } else if ((totalErrors / totalRequests) < 0.05) {
      console.log(`   ⚠️  Acceptable reliability`);
    } else {
      console.log(`   ❌ Reliability needs improvement`);
    }
  }
}

// Run stress test
async function main() {
  try {
    console.log("🚀 Starting PostgreSQL + Redis Stress Test");
    console.log("==========================================");
    
    const tester = new StressTester();
    await tester.runFullStressTest();
    
  } catch (error) {
    console.error("Stress test failed:", error);
  }
}

if (import.meta.main) {
  main().catch(console.error);
} 