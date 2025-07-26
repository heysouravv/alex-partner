import { db } from "../services/database.ts";
import { redis } from "../services/redis.ts";

async function addSampleData() {
  try {
    console.log("Adding sample data...");
    
    // Connect to Redis
    await redis.connect();
    
    // Create a test user
    const hashedPassword = await import("bcrypt").then(bcrypt => bcrypt.hash("password123"));
    
    const userResult = await db.query(
      "INSERT INTO users (name, email, password, onboarding_completed, onboarding_step) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      ["Test User", "test@example.com", hashedPassword, true, 5]
    );
    
    const userId = userResult[0].id;
    console.log("Created test user with ID:", userId);
    
    // Create business profile
    await db.query(
      "INSERT INTO business_profiles (user_id, business_name, business_type, description, is_online) VALUES ($1, $2, $3, $4, $5)",
      [userId, "Test Cafe", "cafe", "A cozy cafe serving great coffee and pastries", true]
    );
    
    // Add sample menu items
    const menuItems = [
      ["Espresso", "Single shot of espresso", "drinks", "coffee", 2.50, 1],
      ["Americano", "Espresso with hot water", "drinks", "coffee", 3.00, 1],
      ["Cappuccino", "Espresso with steamed milk", "drinks", "coffee", 4.00, 1],
      ["Latte", "Espresso with steamed milk and foam", "drinks", "coffee", 4.20, 1],
      ["Croissant", "Buttery French pastry", "food", "pastries", 3.20, 1],
      ["Blueberry Muffin", "Fresh baked muffin", "food", "pastries", 2.80, 1]
    ];
    
    for (const item of menuItems) {
      await db.query(
        "INSERT INTO menu_items (user_id, name, description, category, subcategory, price, available) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [userId, ...item]
      );
    }
    
    // Add sample orders with different dates
    const sampleOrders = [
      {
        orderId: "DEMO-001",
        customer: "Sarah M.",
        items: JSON.stringify([
          { name: "Cappuccino", price: 4.00 },
          { name: "Croissant", price: 3.20 }
        ]),
        total: 7.20,
        status: "completed",
        daysAgo: 0
      },
      {
        orderId: "DEMO-002", 
        customer: "Mike R.",
        items: JSON.stringify([
          { name: "Americano", price: 3.00 },
          { name: "Blueberry Muffin", price: 2.80 }
        ]),
        total: 5.80,
        status: "completed",
        daysAgo: 0
      },
      {
        orderId: "DEMO-003",
        customer: "Emma K.",
        items: JSON.stringify([
          { name: "Latte", price: 4.20 },
          { name: "Croissant", price: 3.20 }
        ]),
        total: 7.40,
        status: "completed",
        daysAgo: 1
      },
      {
        orderId: "DEMO-004",
        customer: "Alex D.",
        items: JSON.stringify([
          { name: "Espresso", price: 2.50 },
          { name: "Blueberry Muffin", price: 2.80 }
        ]),
        total: 5.30,
        status: "completed",
        daysAgo: 2
      },
      {
        orderId: "DEMO-005",
        customer: "Jordan W.",
        items: JSON.stringify([
          { name: "Cappuccino", price: 4.00 }
        ]),
        total: 4.00,
        status: "completed",
        daysAgo: 3
      },
      {
        orderId: "DEMO-006",
        customer: "Taylor B.",
        items: JSON.stringify([
          { name: "Latte", price: 4.20 },
          { name: "Croissant", price: 3.20 }
        ]),
        total: 7.40,
        status: "completed",
        daysAgo: 5
      },
      {
        orderId: "DEMO-007",
        customer: "Morgan C.",
        items: JSON.stringify([
          { name: "Americano", price: 3.00 }
        ]),
        total: 3.00,
        status: "completed",
        daysAgo: 7
      },
      {
        orderId: "DEMO-008",
        customer: "Casey R.",
        items: JSON.stringify([
          { name: "Cappuccino", price: 4.00 },
          { name: "Blueberry Muffin", price: 2.80 }
        ]),
        total: 6.80,
        status: "completed",
        daysAgo: 10
      }
    ];
    
    for (const order of sampleOrders) {
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - order.daysAgo);
      
      await db.query(
        "INSERT INTO orders (user_id, order_id, customer, status, items, total, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [userId, order.orderId, order.customer, order.status, order.items, order.total, orderDate.toISOString()]
      );
    }
    
    console.log("Sample data added successfully!");
    console.log("Test user email: test@example.com");
    console.log("Test user password: password123");
    
  } catch (error) {
    console.error("Error adding sample data:", error);
  } finally {
    await redis.close();
  }
}

// Run if this script is executed directly
if (import.meta.main) {
  addSampleData().catch(console.error);
} 