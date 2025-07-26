import { connect } from "redis";
import { config } from "../config.ts";

class RedisService {
  private client: any;

  async connect(): Promise<void> {
    const connectionConfig: any = {
      hostname: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
    };

    // Only add password if it's configured
    if (config.redis.password && config.redis.password.trim() !== "") {
      connectionConfig.password = config.redis.password;
    }

    this.client = await connect(connectionConfig);
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error("Redis get error:", error);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setex(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      console.error("Redis set error:", error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error("Redis del error:", error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error("Redis exists error:", error);
      return false;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      console.error("Redis expire error:", error);
    }
  }

  // Session management methods
  async setSession(sessionId: string, data: any): Promise<void> {
    await this.set(`session:${sessionId}`, JSON.stringify(data), config.session.maxAge);
  }

  async getSession(sessionId: string): Promise<any | null> {
    const data = await this.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }

  // Cache methods
  async setCache(key: string, data: any, ttl: number = 300): Promise<void> {
    await this.set(`cache:${key}`, JSON.stringify(data), ttl);
  }

  async getCache<T = any>(key: string): Promise<T | null> {
    const data = await this.get(`cache:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async invalidateCache(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(`cache:${pattern}`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error("Redis invalidate cache error:", error);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}

export const redis = new RedisService(); 