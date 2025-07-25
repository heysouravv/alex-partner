import { Application, Router } from "oak";
import { oakCors as cors } from "cors";
import { DB } from "sqlite";
import { hash, compare } from "bcrypt";
// Simple session storage
const sessions = new Map<string, any>();

const app = new Application();
const router = new Router();

// CORS middleware
app.use(cors());

// Database setup
const db = new DB("cafe_orders.db");

// Initialize database tables
async function initDatabase() {
  // Users table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      onboarding_completed BOOLEAN DEFAULT 0,
      onboarding_step INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Business profiles table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS business_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      business_name TEXT NOT NULL,
      business_type TEXT NOT NULL,
      description TEXT,
      timezone TEXT DEFAULT 'UTC',
      logo_url TEXT,
      is_active BOOLEAN DEFAULT 1,
      is_online BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
  
  // Business hours table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS business_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, etc.
      open_time TEXT, -- HH:MM format
      close_time TEXT, -- HH:MM format
      is_open BOOLEAN DEFAULT 1,
      FOREIGN KEY (business_id) REFERENCES business_profiles (id)
    )
  `);
  
  // Business types table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS business_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      is_active BOOLEAN DEFAULT 1
    )
  `);
  
  // Enhanced menu items table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      subcategory TEXT,
      price REAL NOT NULL,
      cost_price REAL,
      profit_margin REAL,
      available BOOLEAN DEFAULT 1,
      is_featured BOOLEAN DEFAULT 0,
      preparation_time INTEGER, -- minutes
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
  
  // Menu templates table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      business_type TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Menu template items table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_template_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      subcategory TEXT,
      suggested_price REAL NOT NULL,
      preparation_time INTEGER,
      FOREIGN KEY (template_id) REFERENCES menu_templates (id)
    )
  `);
  
  // Onboarding progress table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS onboarding_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      completed BOOLEAN DEFAULT 0,
      data TEXT, -- JSON data for the step
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
  
  // Enhanced orders table with AI agent fields
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_id TEXT NOT NULL,
      customer TEXT NOT NULL,
      customer_phone TEXT,
      status TEXT NOT NULL,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      agent_id TEXT,
      session_id TEXT,
      pickup_time DATETIME,
      estimated_ready_time DATETIME,
      cancellation_deadline DATETIME,
      special_instructions TEXT,
      order_source TEXT DEFAULT 'ai_agent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
  
  // Clear existing business types to prevent duplicates
  await db.execute("DELETE FROM business_types");
  
  // Insert default business types
  await db.execute(`
    INSERT INTO business_types (name, description, icon) VALUES
    ('cafe', 'Coffee shops and cafes', '☕'),
    ('restaurant', 'Full-service restaurants', '🍽️'),
    ('food_truck', 'Food trucks and mobile vendors', '🚚'),
    ('bakery', 'Bakeries and pastry shops', '🥐'),
    ('pizzeria', 'Pizza restaurants', '🍕'),
    ('fast_food', 'Quick service restaurants', '🍔'),
    ('bar', 'Bars and pubs', '🍺'),
    ('ice_cream', 'Ice cream and dessert shops', '🍦')
  `);
  
  // Insert default menu templates
  await insertDefaultMenuTemplates();
  
  // Insert sample orders for demo stats
  await insertSampleOrders();
}

// Insert default menu templates
async function insertDefaultMenuTemplates() {
  // Clear existing templates to prevent duplicates
  await db.execute("DELETE FROM menu_template_items");
  await db.execute("DELETE FROM menu_templates");
  
  // Cafe template
  const cafeTemplate = await db.query(
    "INSERT INTO menu_templates (name, description, business_type) VALUES (?, ?, ?)",
    ["Cafe Essentials", "Perfect starter menu for coffee shops", "cafe"]
  );
  
  if (cafeTemplate.length > 0) {
    const templateId = await db.query("SELECT last_insert_rowid() as id");
    const cafeItems = [
      ["Espresso", "Single shot of espresso", "drinks", "coffee", 2.50, 5],
      ["Americano", "Espresso with hot water", "drinks", "coffee", 3.00, 5],
      ["Cappuccino", "Espresso with steamed milk", "drinks", "coffee", 4.00, 5],
      ["Latte", "Espresso with steamed milk and foam", "drinks", "coffee", 4.20, 5],
      ["Croissant", "Buttery French pastry", "food", "pastries", 3.20, 2],
      ["Blueberry Muffin", "Fresh baked muffin", "food", "pastries", 2.80, 2]
    ];
    
    for (const item of cafeItems) {
      await db.query(
        "INSERT INTO menu_template_items (template_id, name, description, category, subcategory, suggested_price, preparation_time) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [templateId[0].id, ...item]
      );
    }
  }
  
  // Restaurant template
  const restaurantTemplate = await db.query(
    "INSERT INTO menu_templates (name, description, business_type) VALUES (?, ?, ?)",
    ["Restaurant Classics", "Essential dishes for restaurants", "restaurant"]
  );
  
  if (restaurantTemplate.length > 0) {
    const templateId = await db.query("SELECT last_insert_rowid() as id");
    const restaurantItems = [
      ["Caesar Salad", "Fresh romaine with caesar dressing", "food", "salads", 8.50, 10],
      ["Grilled Chicken", "Herb-marinated chicken breast", "food", "mains", 15.00, 20],
      ["Pasta Carbonara", "Creamy pasta with bacon", "food", "mains", 12.00, 15],
      ["Chocolate Cake", "Rich chocolate layer cake", "food", "desserts", 6.00, 5],
      ["Soft Drinks", "Coca-Cola, Sprite, Fanta", "drinks", "beverages", 2.50, 2]
    ];
    
    for (const item of restaurantItems) {
      await db.query(
        "INSERT INTO menu_template_items (template_id, name, description, category, subcategory, suggested_price, preparation_time) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [templateId[0].id, ...item]
      );
    }
  }
}

// Insert sample orders for demo stats
async function insertSampleOrders() {
  try {
    // Check if we already have sample orders
    const existingOrders = await db.query("SELECT COUNT(*) as count FROM orders");
    if (existingOrders[0][0] > 0) {
      console.log("Sample orders already exist, skipping...");
      return;
    }
    
    // Get a user ID to associate orders with
    const users = await db.query("SELECT id FROM users LIMIT 1");
    if (users.length === 0) {
      console.log("No users found, skipping sample orders...");
      return;
    }
    
    const userId = users[0][0];
    
    // Sample orders with different dates for stats
    const sampleOrders = [
      // Today's orders
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
          { name: "Avocado Toast", price: 6.50 }
        ]),
        total: 10.70,
        status: "completed",
        daysAgo: 0
      },
      
      // This week's orders
      {
        orderId: "DEMO-004",
        customer: "Alex D.",
        items: JSON.stringify([
          { name: "Espresso", price: 2.50 },
          { name: "Bagel", price: 2.80 }
        ]),
        total: 5.30,
        status: "completed",
        daysAgo: 1
      },
      {
        orderId: "DEMO-005",
        customer: "Jordan W.",
        items: JSON.stringify([
          { name: "Cold Brew", price: 3.50 },
          { name: "Chocolate Cake", price: 6.00 }
        ]),
        total: 9.50,
        status: "completed",
        daysAgo: 2
      },
      {
        orderId: "DEMO-006",
        customer: "Taylor B.",
        items: JSON.stringify([
          { name: "Cappuccino", price: 4.00 }
        ]),
        total: 4.00,
        status: "completed",
        daysAgo: 3
      },
      
      // This month's orders
      {
        orderId: "DEMO-007",
        customer: "Morgan C.",
        items: JSON.stringify([
          { name: "Americano", price: 3.00 },
          { name: "Croissant", price: 3.20 },
          { name: "Blueberry Muffin", price: 2.80 }
        ]),
        total: 9.00,
        status: "completed",
        daysAgo: 5
      },
      {
        orderId: "DEMO-008",
        customer: "Casey R.",
        items: JSON.stringify([
          { name: "Latte", price: 4.20 },
          { name: "Avocado Toast", price: 6.50 }
        ]),
        total: 10.70,
        status: "completed",
        daysAgo: 7
      },
      {
        orderId: "DEMO-009",
        customer: "Riley S.",
        items: JSON.stringify([
          { name: "Espresso", price: 2.50 }
        ]),
        total: 2.50,
        status: "completed",
        daysAgo: 10
      },
      {
        orderId: "DEMO-010",
        customer: "Quinn T.",
        items: JSON.stringify([
          { name: "Cappuccino", price: 4.00 },
          { name: "Bagel", price: 2.80 }
        ]),
        total: 6.80,
        status: "completed",
        daysAgo: 15
      }
    ];
    
    for (const order of sampleOrders) {
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - order.daysAgo);
      
      await db.query(
        "INSERT INTO orders (user_id, order_id, customer, status, items, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [userId, order.orderId, order.customer, order.status, order.items, order.total, orderDate.toISOString()]
      );
    }
    
    console.log("Sample orders inserted successfully");
    
    // Also insert some sample menu items
    const sampleMenuItems = [
      ["Espresso", "Single shot of espresso", "drinks", "coffee", 2.50, 1],
      ["Americano", "Espresso with hot water", "drinks", "coffee", 3.00, 1],
      ["Cappuccino", "Espresso with steamed milk", "drinks", "coffee", 4.00, 1],
      ["Latte", "Espresso with steamed milk and foam", "drinks", "coffee", 4.20, 1],
      ["Oat Latte", "Latte with oat milk", "drinks", "coffee", 4.50, 1],
      ["Cold Brew", "Smooth cold brewed coffee", "drinks", "coffee", 3.50, 1],
      ["Croissant", "Buttery French pastry", "food", "pastries", 3.20, 1],
      ["Bagel", "Fresh baked bagel", "food", "pastries", 2.80, 1],
      ["Blueberry Muffin", "Fresh baked muffin", "food", "pastries", 2.80, 1],
      ["Avocado Toast", "Sourdough with avocado", "food", "breakfast", 6.50, 1],
      ["Chocolate Cake", "Rich chocolate layer cake", "food", "desserts", 6.00, 1]
    ];
    
    for (const item of sampleMenuItems) {
      await db.query(
        "INSERT INTO menu_items (user_id, name, description, category, subcategory, price, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [userId, ...item]
      );
    }
    
    console.log("Sample menu items inserted successfully");
  } catch (error) {
    console.error("Error inserting sample orders:", error);
  }
}

// Simple session-based authentication
function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Authentication middleware
async function authMiddleware(ctx: any, next: any) {
  const sessionId = ctx.request.headers.get("Authorization")?.replace("Bearer ", "");
  
  if (!sessionId || !sessions.has(sessionId)) {
    ctx.response.status = 401;
    ctx.response.body = { message: "No valid session" };
    return;
  }
  
  ctx.state.user = sessions.get(sessionId);
  await next();
}

// Auth routescccvc   
router.post("/api/auth/signup", async (ctx) => {
  try {
    const body = await ctx.request.body().value;
    const { name, email, password, business_name } = body;
    
    // Validate input
    if (!name || !email || !password) {                                            
      ctx.response.status = 400;
      ctx.response.body = { message: "Name, email, and password are required" };
      return;
    }
    
    if (password.length < 8) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Password must be at least 8 characters" };
      return;
    }
    
    // Check if user already exists
    const existingUser = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser.length > 0) {
      ctx.response.status = 409;
      ctx.response.body = { message: "User already exists" };
      return;
    }
    
    // Hash password
    const hashedPassword = await hash(password);
    
    // Insert user
    await db.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword]
    );
    
    // Get the inserted user's ID
    const userIdResult = await db.query("SELECT last_insert_rowid() as id");
    const userId = userIdResult[0][0]; // Access first column of first row
    
    console.log('Created user with ID:', userId);
    
    // If business name is provided, create initial business profile
    if (business_name && userId) {
      console.log('Creating business profile for user:', userId);
      await db.query(
        "INSERT INTO business_profiles (user_id, business_name, business_type) VALUES (?, ?, ?)",
        [userId, business_name, 'cafe'] // Default to cafe, can be updated later
      );
      
      // Update user onboarding step and ensure onboarding is not completed
      await db.query("UPDATE users SET onboarding_step = 2, onboarding_completed = 0 WHERE id = ?", [userId]);
    } else {
      // Ensure new users start with onboarding step 1 and not completed
      await db.query("UPDATE users SET onboarding_step = 1, onboarding_completed = 0 WHERE id = ?", [userId]);
    }
    
    // Create session for immediate login
    const sessionId = generateSessionId();
    const userData = {
      userId: userId,
      id: userId,
      name: name,
      email: email
    };
    sessions.set(sessionId, userData);
    
    ctx.response.status = 201;
    ctx.response.body = { 
      message: "Account created successfully",
      token: sessionId,
      user: userData,
      onboarding_step: business_name ? 2 : 1
    };
  } catch (error) {
    console.error("Signup error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/auth/login", async (ctx) => {
  try {
    const body = await ctx.request.body().value;
    const { email, password } = body;
    
    // Validate input
    if (!email || !password) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Email and password are required" };
      return;
    }
    
    // Find user
    const users = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (users.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Invalid credentials" };
      return;
    }
    
    const user = users[0];
    
    // Verify password - user is an array: [id, name, email, password, created_at]
    const isValidPassword = await compare(password, user[3]); // password is at index 3
    if (!isValidPassword) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Invalid credentials" };
      return;
    }
    
    // Get user's onboarding status
    const userOnboarding = await db.query("SELECT onboarding_step, onboarding_completed FROM users WHERE id = ?", [user[0]]);
    const onboardingStep = userOnboarding.length > 0 ? userOnboarding[0][0] : 1;
    const onboardingCompleted = userOnboarding.length > 0 ? userOnboarding[0][1] : 0;
    
    // Create session - user is an array: [id, name, email, password, created_at]
    const sessionId = generateSessionId();
    const userData = {
      userId: user[0] || 0,
      id: user[0] || 0,
      name: user[1] || "",
      email: user[2] || ""
    };
    
    sessions.set(sessionId, userData);
    
    ctx.response.body = {
      token: sessionId,
      user: {
        id: user[0],     // id
        name: user[1],   // name
        email: user[2]   // email
      },
      onboarding_step: onboardingStep,
      onboarding_completed: onboardingCompleted === 1
    };
  } catch (error) {
    console.error("Login error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Protected routes
router.get("/api/user/profile", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const users = await db.query("SELECT id, name, email FROM users WHERE id = ?", [userId]);
    
    if (users.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "User not found" };
      return;
    }
    
    ctx.response.body = users[0];
  } catch (error) {
    console.error("Profile error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Orders routes
router.get("/api/orders", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const orders = await db.query(
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
    
    ctx.response.body = orders.map(order => ({
      id: order[0],
      user_id: order[1],
      order_id: order[2],
      customer: order[3],
      customer_phone: order[4],
      status: order[5],
      items: JSON.parse(order[6]),
      total: order[7],
      agent_id: order[8],
      session_id: order[9],
      pickup_time: order[10],
      estimated_ready_time: order[11],
      cancellation_deadline: order[12],
      special_instructions: order[13],
      order_source: order[14],
      created_at: order[15]
    }));
  } catch (error) {
    console.error("Get orders error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/orders", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { orderId, customer, items, total } = body;
    
    await db.query(
      "INSERT INTO orders (user_id, order_id, customer, status, items, total) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, orderId, customer, 'new', JSON.stringify(items), total]
    );
    
    ctx.response.status = 201;
    ctx.response.body = { message: "Order created" };
  } catch (error) {
    console.error("Create order error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.put("/api/orders/:orderId/status", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const orderId = ctx.params.orderId;
    const body = await ctx.request.body().value;
    const { status } = body;
    
    await db.query(
      "UPDATE orders SET status = ? WHERE user_id = ? AND order_id = ?",
      [status, userId, orderId]
    );
    
    ctx.response.body = { message: "Order status updated" };
  } catch (error) {
    console.error("Update order error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Order action endpoints
router.post("/api/orders/:orderId/accept", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const orderId = ctx.params.orderId;
    
    await db.query(
      "UPDATE orders SET status = 'preparing' WHERE user_id = ? AND order_id = ?",
      [userId, orderId]
    );
    
    ctx.response.body = { message: "Order accepted" };
  } catch (error) {
    console.error("Accept order error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/orders/:orderId/reject", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const orderId = ctx.params.orderId;
    
    await db.query(
      "UPDATE orders SET status = 'cancelled' WHERE user_id = ? AND order_id = ?",
      [userId, orderId]
    );
    
    ctx.response.body = { message: "Order rejected" };
  } catch (error) {
    console.error("Reject order error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/orders/:orderId/ready", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const orderId = ctx.params.orderId;
    
    await db.query(
      "UPDATE orders SET status = 'ready' WHERE user_id = ? AND order_id = ?",
      [userId, orderId]
    );
    
    ctx.response.body = { message: "Order ready" };
  } catch (error) {
    console.error("Mark ready error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/orders/:orderId/complete", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const orderId = ctx.params.orderId;
    
    await db.query(
      "UPDATE orders SET status = 'completed' WHERE user_id = ? AND order_id = ?",
      [userId, orderId]
    );
    
    ctx.response.body = { message: "Order completed" };
  } catch (error) {
    console.error("Complete order error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Activity feed endpoint
router.get("/api/activity", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    
    // Get recent order activities
    const activities = await db.query(
      `SELECT 
        order_id,
        customer,
        status,
        total,
        created_at,
        CASE 
          WHEN status = 'new' THEN 'New order received'
          WHEN status = 'preparing' THEN 'Order started preparing'
          WHEN status = 'ready' THEN 'Order ready for pickup'
          WHEN status = 'completed' THEN 'Order completed'
          WHEN status = 'cancelled' THEN 'Order cancelled'
          ELSE 'Order updated'
        END as action
       FROM orders 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [userId]
    );
    
    const formattedActivities = activities.map((activity: any) => {
      const createdAt = new Date(activity[4]);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));
      
      let timeAgo;
      if (diffMinutes < 1) timeAgo = 'just now';
      else if (diffMinutes < 60) timeAgo = `${diffMinutes}m ago`;
      else if (diffMinutes < 1440) timeAgo = `${Math.floor(diffMinutes / 60)}h ago`;
      else timeAgo = `${Math.floor(diffMinutes / 1440)}d ago`;
      
      return {
        time: timeAgo,
        action: activity[5],
        customer: activity[1],
        amount: `$${activity[3].toFixed(2)}`,
        status: activity[2],
        orderId: activity[0]
      };
    });
    
    ctx.response.body = formattedActivities;
  } catch (error) {
    console.error("Get activity error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Menu routes
router.get("/api/menu", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const menuItems = await db.query(
      "SELECT * FROM menu_items WHERE user_id = ? ORDER BY name",
      [userId]
    );
    
    ctx.response.body = menuItems;
  } catch (error) {
    console.error("Get menu error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/menu", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { name, price, available } = body;
    
    await db.query(
      "INSERT INTO menu_items (user_id, name, price, available) VALUES (?, ?, ?, ?)",
      [userId, name, price, available ? 1 : 0]
    );
    
    ctx.response.status = 201;
    ctx.response.body = { message: "Menu item created" };
  } catch (error) {
    console.error("Create menu item error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.put("/api/menu/:id", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const itemId = ctx.params.id;
    const body = await ctx.request.body().value;
    const { name, description, category, subcategory, price, cost_price, available, preparation_time, image_url } = body;
    
    await db.query(
      "UPDATE menu_items SET name = ?, description = ?, category = ?, subcategory = ?, price = ?, cost_price = ?, available = ?, preparation_time = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
      [name, description, category, subcategory, price, cost_price, available ? 1 : 0, preparation_time, image_url, itemId, userId]
    );
    
    ctx.response.body = { message: "Menu item updated" };
  } catch (error) {
    console.error("Update menu item error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Business profile routes
router.post("/api/business/profile", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { business_name, business_type, description, timezone, logo_url } = body;
    
    // Validate input
    if (!business_name || !business_type) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Business name and type are required" };
      return;
    }
    
    // Check if business profile already exists
    const existingProfile = await db.query("SELECT id FROM business_profiles WHERE user_id = ?", [userId]);
    
    if (existingProfile.length > 0) {
      // Update existing profile
      await db.query(
        "UPDATE business_profiles SET business_name = ?, business_type = ?, description = ?, timezone = ?, logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
        [business_name, business_type, description, timezone, logo_url, userId]
      );
    } else {
      // Create new profile
      await db.query(
        "INSERT INTO business_profiles (user_id, business_name, business_type, description, timezone, logo_url) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, business_name, business_type, description, timezone, logo_url]
      );
    }
    
    // Update user onboarding step
    await db.query("UPDATE users SET onboarding_step = 3 WHERE id = ?", [userId]);
    
    ctx.response.status = 201;
    ctx.response.body = { message: "Business profile saved successfully" };
  } catch (error) {
    console.error("Business profile error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.get("/api/business/profile", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const profile = await db.query(
      "SELECT * FROM business_profiles WHERE user_id = ?",
      [userId]
    );
    
    if (profile.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Business profile not found" };
      return;
    }
    
    ctx.response.body = profile[0];
  } catch (error) {
    console.error("Get business profile error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.get("/api/business/types", async (ctx) => {
  try {
    const types = await db.query("SELECT id, name, description, icon FROM business_types WHERE is_active = 1 ORDER BY name");
    
    // Convert array format to object format for frontend
    const formattedTypes = types.map((type: any) => ({
      id: type[0],
      name: type[1],
      description: type[2],
      icon: type[3]
    }));
    
    ctx.response.body = formattedTypes;
  } catch (error) {
    console.error("Get business types error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Business status routes
router.get("/api/business/status", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const profile = await db.query("SELECT is_online FROM business_profiles WHERE user_id = ?", [userId]);
    
    if (profile.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Business profile not found" };
      return;
    }
    
    ctx.response.body = {
      is_online: profile[0][0] === 1
    };
  } catch (error) {
    console.error("Get business status error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/business/status", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { is_online } = body;
    
    if (typeof is_online !== 'boolean') {
      ctx.response.status = 400;
      ctx.response.body = { message: "is_online must be a boolean" };
      return;
    }
    
    await db.query(
      "UPDATE business_profiles SET is_online = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
      [is_online ? 1 : 0, userId]
    );
    
    ctx.response.body = { 
      message: "Business status updated successfully",
      is_online: is_online
    };
  } catch (error) {
    console.error("Update business status error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Stats routes
router.get("/api/stats", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Today's stats
    const todayStats = await db.query(
      `SELECT 
        COUNT(*) as order_count,
        SUM(total) as total_revenue,
        AVG(total) as avg_order_value
       FROM orders 
       WHERE user_id = ? 
       AND DATE(created_at) = ? 
       AND status != 'cancelled'`,
      [userId, today]
    );
    
    // Past 7 days stats
    const weekStats = await db.query(
      `SELECT 
        COUNT(*) as order_count,
        SUM(total) as total_revenue,
        AVG(total) as avg_order_value
       FROM orders 
       WHERE user_id = ? 
       AND DATE(created_at) >= ? 
       AND status != 'cancelled'`,
      [userId, sevenDaysAgo]
    );
    
    // Past 30 days stats
    const monthStats = await db.query(
      `SELECT 
        COUNT(*) as order_count,
        SUM(total) as total_revenue,
        AVG(total) as avg_order_value
       FROM orders 
       WHERE user_id = ? 
       AND DATE(created_at) >= ? 
       AND status != 'cancelled'`,
      [userId, thirtyDaysAgo]
    );
    
    // Top selling items (last 30 days) - parse JSON items
    const topItemsRaw = await db.query(
      `SELECT 
        items,
        COUNT(*) as order_count
       FROM orders 
       WHERE user_id = ? 
       AND DATE(created_at) >= ? 
       AND status != 'cancelled'
       GROUP BY items
       ORDER BY order_count DESC
       LIMIT 5`,
      [userId, thirtyDaysAgo]
    );
    
    // Parse the JSON items to extract item names
    const topItems = topItemsRaw.map((row: any) => {
      try {
        const items = JSON.parse(row[0]);
        const itemNames = items.map((item: any) => item.name).join(', ');
        return [itemNames, row[1]];
      } catch (error) {
        console.error('Error parsing items JSON:', error);
        return ['Unknown Item', row[1]];
      }
    });
    
    // Busiest hours (last 30 days)
    const busyHours = await db.query(
      `SELECT 
        strftime('%H', created_at) as hour,
        COUNT(*) as order_count
       FROM orders 
       WHERE user_id = ? 
       AND DATE(created_at) >= ? 
       AND status != 'cancelled'
       GROUP BY strftime('%H', created_at)
       ORDER BY order_count DESC
       LIMIT 5`,
      [userId, thirtyDaysAgo]
    );
    
    // Fun stats
    const totalOrders = await db.query(
      "SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status != 'cancelled'",
      [userId]
    );
    
    const totalRevenue = await db.query(
      "SELECT SUM(total) as total FROM orders WHERE user_id = ? AND status != 'cancelled'",
      [userId]
    );
    
    const avgOrderValue = await db.query(
      "SELECT AVG(total) as avg FROM orders WHERE user_id = ? AND status != 'cancelled'",
      [userId]
    );
    
    // Calculate growth (compare this week to last week)
    const lastWeekStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const lastWeekEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const lastWeekRevenue = await db.query(
      `SELECT SUM(total) as total FROM orders 
       WHERE user_id = ? 
       AND DATE(created_at) >= ? 
       AND DATE(created_at) < ? 
       AND status != 'cancelled'`,
      [userId, lastWeekStart, lastWeekEnd]
    );
    
    const currentWeekRevenue = weekStats[0][1] || 0;
    const lastWeekRevenueValue = lastWeekRevenue[0][0] || 0;
    const growthPercentage = lastWeekRevenueValue > 0 
      ? ((currentWeekRevenue - lastWeekRevenueValue) / lastWeekRevenueValue * 100).toFixed(1)
      : "0";
    
    ctx.response.body = {
      today: {
        orders: todayStats[0][0] || 0,
        revenue: todayStats[0][1] || 0,
        avgOrder: todayStats[0][2] || 0
      },
      week: {
        orders: weekStats[0][0] || 0,
        revenue: weekStats[0][1] || 0,
        avgOrder: weekStats[0][2] || 0
      },
      month: {
        orders: monthStats[0][0] || 0,
        revenue: monthStats[0][1] || 0,
        avgOrder: monthStats[0][2] || 0
      },
      allTime: {
        orders: totalOrders[0][0] || 0,
        revenue: totalRevenue[0][0] || 0,
        avgOrder: avgOrderValue[0][0] || 0
      },
      growth: {
        percentage: parseFloat(growthPercentage),
        direction: parseFloat(growthPercentage) >= 0 ? 'up' : 'down'
      },
      topItems: topItems.map((item: any) => ({
        item_names: item[0],
        order_count: item[1]
      })),
      busyHours: busyHours.map((hour: any) => ({
        hour: hour[0],
        order_count: hour[1]
      }))
    };
  } catch (error) {
    console.error("Get stats error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Menu templates routes
router.get("/api/menu/templates", async (ctx) => {
  try {
    const businessType = ctx.request.url.searchParams.get("business_type");
    let query = "SELECT id, name, description, business_type FROM menu_templates WHERE is_active = 1";
    let params: any[] = [];
    
    if (businessType) {
      query += " AND business_type = ?";
      params.push(businessType);
    }
    
    query += " ORDER BY name";
    const templates = await db.query(query, params);
    
    // Convert array format to object format for frontend
    const formattedTemplates = templates.map((template: any) => ({
      id: template[0],
      name: template[1],
      description: template[2],
      business_type: template[3]
    }));
    
    ctx.response.body = formattedTemplates;
  } catch (error) {
    console.error("Get menu templates error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.get("/api/menu/templates/:id/items", async (ctx) => {
  try {
    const templateId = ctx.params.id;
    const items = await db.query(
      "SELECT * FROM menu_template_items WHERE template_id = ? ORDER BY category, name",
      [templateId]
    );
    ctx.response.body = items;
  } catch (error) {
    console.error("Get template items error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Quick menu builder routes
router.post("/api/menu/quick-add", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { items } = body;
    
    if (!items || !Array.isArray(items)) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Items array is required" };
      return;
    }
    
    const addedItems: any[] = [];
    
    for (const item of items) {
      const { name, description, category, subcategory, price, cost_price, preparation_time, image_url } = item;
      
      await db.query(
        "INSERT INTO menu_items (user_id, name, description, category, subcategory, price, cost_price, preparation_time, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [userId, name, description, category, subcategory, price, cost_price, preparation_time, image_url]
      );
      
      // Get the last inserted ID
      const lastIdResult = await db.query("SELECT last_insert_rowid() as id");
      const itemId = lastIdResult[0][0];
      
      addedItems.push({
        id: itemId,
        name,
        category,
        price
      });
    }
    
    // Update user onboarding step
    await db.query("UPDATE users SET onboarding_step = 4 WHERE id = ?", [userId]);
    
    ctx.response.status = 201;
    ctx.response.body = { 
      message: `${addedItems.length} items added successfully`,
      items: addedItems
    };
  } catch (error) {
    console.error("Quick add menu items error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Onboarding progress routes
router.get("/api/onboarding/progress", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const user = await db.query("SELECT onboarding_step, onboarding_completed FROM users WHERE id = ?", [userId]);
    const progress = await db.query("SELECT * FROM onboarding_progress WHERE user_id = ? ORDER BY step", [userId]);
    
    if (user.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "User not found" };
      return;
    }
    
    ctx.response.body = {
      current_step: user[0][0] || 1, // onboarding_step is first column
      completed: user[0][1] === 1,   // onboarding_completed is second column
      progress: progress
    };
  } catch (error) {
    console.error("Get onboarding progress error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/onboarding/progress", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { step, completed, data } = body;
    
    // Validate userId exists
    if (!userId) {
      ctx.response.status = 400;
      ctx.response.body = { message: "User ID is required" };
      return;
    }
    
    // Validate required fields
    if (step === undefined || step === null) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Step is required" };
      return;
    }
    
    // Ensure user exists in database
    const userCheck = await db.query("SELECT id FROM users WHERE id = ?", [userId]);
    if (userCheck.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "User not found" };
      return;
    }
    
    await db.query(
      "INSERT OR REPLACE INTO onboarding_progress (user_id, step, completed, data, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
      [userId, step, completed ? 1 : 0, JSON.stringify(data || {})]
    );
    
    // Update user's current step
    await db.query("UPDATE users SET onboarding_step = ? WHERE id = ?", [step, userId]);
    
    // If this is the final step, mark onboarding as completed
    if (step >= 5) {
      await db.query("UPDATE users SET onboarding_completed = 1 WHERE id = ?", [userId]);
    }
    
    ctx.response.body = { message: "Progress saved successfully" };
  } catch (error) {
    console.error("Save onboarding progress error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// ===== AI AGENT APIs =====

// Agent authentication middleware
async function agentAuthMiddleware(ctx: any, next: any) {
  const authHeader = ctx.request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Agent ')) {
    ctx.response.status = 401;
    ctx.response.body = { message: "Agent authentication required" };
    return;
  }
  
  const agentId = authHeader.replace('Agent ', '');
  // For now, accept any agent ID. In production, validate against registered agents
  ctx.state.agentId = agentId;
  await next();
}

// Business discovery feed for AI agents
router.get("/api/v1/feed", agentAuthMiddleware, async (ctx) => {
  try {
    const { limit = 20, offset = 0, business_type, location } = ctx.request.url.searchParams;
    
    let query = `
      SELECT 
        bp.id,
        bp.business_name,
        bp.business_type,
        bp.description,
        bp.is_online,
        bp.created_at,
        u.name as owner_name,
        COUNT(mi.id) as menu_item_count
      FROM business_profiles bp
      JOIN users u ON bp.user_id = u.id
      LEFT JOIN menu_items mi ON bp.user_id = mi.user_id AND mi.available = 1
      WHERE bp.is_active = 1 AND bp.is_online = 1
    `;
    
    const params: any[] = [];
    
    if (business_type) {
      query += " AND bp.business_type = ?";
      params.push(business_type);
    }
    
    query += " GROUP BY bp.id ORDER BY bp.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));
    
    const businesses = await db.query(query, params);
    
    // Format response
    const formattedBusinesses = businesses.map((business: any) => ({
      business_id: business[0],
      business_name: business[1],
      business_type: business[2],
      description: business[3],
      is_online: business[4] === 1,
      created_at: business[5],
      owner_name: business[6],
      menu_item_count: business[7],
      api_endpoint: `/api/v1/business/${business[0]}/menu`
    }));
    
    ctx.response.body = {
      businesses: formattedBusinesses,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: formattedBusinesses.length
      }
    };
  } catch (error) {
    console.error("Get business feed error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Get business menu for AI agents
router.get("/api/v1/business/:businessId/menu", agentAuthMiddleware, async (ctx) => {
  try {
    const businessId = ctx.params.businessId;
    
    // Get business profile
    const business = await db.query(
      "SELECT bp.*, u.name as owner_name FROM business_profiles bp JOIN users u ON bp.user_id = u.id WHERE bp.id = ? AND bp.is_active = 1",
      [businessId]
    );
    
    if (business.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Business not found" };
      return;
    }
    
    const businessProfile = business[0];
    
    // Get available menu items
    const menuItems = await db.query(
      "SELECT id, name, description, category, subcategory, price, preparation_time, image_url FROM menu_items WHERE user_id = ? AND available = 1 ORDER BY category, name",
      [businessProfile[1]] // user_id
    );
    
    // Format menu items
    const formattedMenu = menuItems.map((item: any) => ({
      item_id: item[0],
      name: item[1],
      description: item[2],
      category: item[3],
      subcategory: item[4],
      price: item[5],
      preparation_time: item[6],
      image_url: item[7]
    }));
    
    ctx.response.body = {
      business: {
        business_id: businessProfile[0],
        business_name: businessProfile[2],
        business_type: businessProfile[3],
        description: businessProfile[4],
        is_online: businessProfile[7] === 1,
        owner_name: businessProfile[8]
      },
      menu: formattedMenu,
      order_endpoint: `/api/v1/business/${businessId}/order`
    };
  } catch (error) {
    console.error("Get business menu error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Place order (AI agent)
router.post("/api/v1/business/:businessId/order", agentAuthMiddleware, async (ctx) => {
  try {
    const businessId = ctx.params.businessId;
    const agentId = ctx.state.agentId;
    const body = await ctx.request.body().value;
    const { customer_name, customer_phone, items, special_instructions, pickup_time } = body;
    
    // Validate required fields
    if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { message: "customer_name and items array are required" };
      return;
    }
    
    // Get business profile
    const business = await db.query(
      "SELECT user_id, business_name FROM business_profiles WHERE id = ? AND is_active = 1 AND is_online = 1",
      [businessId]
    );
    
    if (business.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Business not found or offline" };
      return;
    }
    
    const userId = business[0][0];
    const businessName = business[0][1];
    
    // Validate and calculate order
    let total = 0;
    const validatedItems: any[] = [];
    
    for (const item of items) {
      const menuItem = await db.query(
        "SELECT id, name, price, available FROM menu_items WHERE id = ? AND user_id = ? AND available = 1",
        [item.item_id, userId]
      );
      
      if (menuItem.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { message: `Item ${item.item_id} not found or unavailable` };
        return;
      }
      
      const quantity = item.quantity || 1;
      const itemTotal = menuItem[0][2] * quantity; // price * quantity
      total += itemTotal;
      
      validatedItems.push({
        item_id: menuItem[0][0],
        name: menuItem[0][1],
        price: menuItem[0][2],
        quantity: quantity,
        subtotal: itemTotal
      });
    }
    
    // Generate order ID
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate cancellation deadline (60 seconds from now)
    const cancellationDeadline = new Date(Date.now() + 60000);
    
    // Create order
    await db.query(
      `INSERT INTO orders (
        user_id, order_id, customer, customer_phone, status, items, total, 
        agent_id, special_instructions, pickup_time, cancellation_deadline, order_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, orderId, customer_name, customer_phone || null, 'new',
        JSON.stringify(validatedItems), total, agentId, special_instructions || null,
        pickup_time || null, cancellationDeadline.toISOString(), 'ai_agent'
      ]
    );
    
    ctx.response.status = 201;
    ctx.response.body = {
      order_id: orderId,
      business_name: businessName,
      customer_name: customer_name,
      items: validatedItems,
      total: total,
      status: 'new',
      cancellation_deadline: cancellationDeadline.toISOString(),
      status_endpoint: `/api/v1/order/${orderId}/status`,
      cancel_endpoint: `/api/v1/order/${orderId}/cancel`
    };
  } catch (error) {
    console.error("Place order error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Get order status (AI agent)
router.get("/api/v1/order/:orderId/status", agentAuthMiddleware, async (ctx) => {
  try {
    const orderId = ctx.params.orderId;
    const agentId = ctx.state.agentId;
    
    const order = await db.query(
      "SELECT o.*, bp.business_name FROM orders o JOIN business_profiles bp ON o.user_id = bp.user_id WHERE o.order_id = ? AND o.agent_id = ?",
      [orderId, agentId]
    );
    
    if (order.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Order not found" };
      return;
    }
    
    const orderData = order[0];
    const items = JSON.parse(orderData[6]); // items column
    
    ctx.response.body = {
      order_id: orderData[2], // order_id
      business_name: orderData[16], // business_name (from JOIN)
      customer_name: orderData[3], // customer
      customer_phone: orderData[4], // customer_phone
      status: orderData[5], // status
      items: items,
      total: orderData[7], // total
      special_instructions: orderData[13], // special_instructions
      pickup_time: orderData[10], // pickup_time
      estimated_ready_time: orderData[11], // estimated_ready_time
      cancellation_deadline: orderData[12], // cancellation_deadline
      created_at: orderData[15], // created_at
      can_cancel: new Date() < new Date(orderData[12]) // cancellation_deadline
    };
  } catch (error) {
    console.error("Get order status error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Cancel order (AI agent) - within 60 seconds
router.post("/api/v1/order/:orderId/cancel", agentAuthMiddleware, async (ctx) => {
  try {
    const orderId = ctx.params.orderId;
    const agentId = ctx.state.agentId;
    const body = await ctx.request.body().value;
    const { reason } = body;
    
    const order = await db.query(
      "SELECT o.*, bp.business_name FROM orders o JOIN business_profiles bp ON o.user_id = bp.user_id WHERE o.order_id = ? AND o.agent_id = ?",
      [orderId, agentId]
    );
    
    if (order.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Order not found" };
      return;
    }
    
    const orderData = order[0];
    const cancellationDeadline = new Date(orderData[12]); // cancellation_deadline
    
    // Check if order can still be cancelled (within 60 seconds)
    if (new Date() > cancellationDeadline) {
      ctx.response.status = 400;
      ctx.response.body = { 
        message: "Order cannot be cancelled after 60 seconds",
        cancellation_deadline: cancellationDeadline.toISOString()
      };
      return;
    }
    
    // Check if order is still in 'new' status
    if (orderData[5] !== 'new') { // status
      ctx.response.status = 400;
      ctx.response.body = { 
        message: "Order cannot be cancelled - already being prepared",
        current_status: orderData[5]
      };
      return;
    }
    
    // Cancel the order
    await db.query(
      "UPDATE orders SET status = 'cancelled' WHERE order_id = ? AND agent_id = ?",
      [orderId, agentId]
    );
    
    ctx.response.body = {
      order_id: orderId,
      status: 'cancelled',
      message: "Order cancelled successfully",
      reason: reason || null
    };
  } catch (error) {
    console.error("Cancel order error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Submit feedback (AI agent)
router.post("/api/v1/order/:orderId/feedback", agentAuthMiddleware, async (ctx) => {
  try {
    const orderId = ctx.params.orderId;
    const agentId = ctx.state.agentId;
    const body = await ctx.request.body().value;
    const { rating, comment, category } = body;
    
    // Validate feedback
    if (!rating || rating < 1 || rating > 5) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Rating must be between 1 and 5" };
      return;
    }
    
    // Check if order exists and belongs to this agent
    const order = await db.query(
      "SELECT id FROM orders WHERE order_id = ? AND agent_id = ?",
      [orderId, agentId]
    );
    
    if (order.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Order not found" };
      return;
    }
    
    // Create feedback table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS order_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders (order_id)
      )
    `);
    
    // Insert feedback
    await db.query(
      "INSERT INTO order_feedback (order_id, agent_id, rating, comment, category) VALUES (?, ?, ?, ?, ?)",
      [orderId, agentId, rating, comment || null, category || null]
    );
    
    ctx.response.body = {
      order_id: orderId,
      feedback_id: orderId, // For simplicity, using order_id as feedback_id
      rating: rating,
      comment: comment,
      category: category,
      message: "Feedback submitted successfully"
    };
  } catch (error) {
    console.error("Submit feedback error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Get business status (AI agent)
router.get("/api/v1/business/:businessId/status", agentAuthMiddleware, async (ctx) => {
  try {
    const businessId = ctx.params.businessId;
    
    const business = await db.query(
      "SELECT bp.*, u.name as owner_name FROM business_profiles bp JOIN users u ON bp.user_id = u.id WHERE bp.id = ? AND bp.is_active = 1",
      [businessId]
    );
    
    if (business.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Business not found" };
      return;
    }
    
    const businessData = business[0];
    
    // Get current order count
    const orderCount = await db.query(
      "SELECT COUNT(*) FROM orders WHERE user_id = ? AND status IN ('new', 'preparing')",
      [businessData[1]] // user_id
    );
    
    ctx.response.body = {
      business_id: businessData[0],
      business_name: businessData[2],
      business_type: businessData[3],
      is_online: businessData[7] === 1,
      is_active: businessData[6] === 1,
      current_order_count: orderCount[0][0],
      owner_name: businessData[8],
      last_updated: businessData[10] // updated_at
    };
  } catch (error) {
    console.error("Get business status error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Static file serving
app.use(async (ctx, next) => {
  try {
    await ctx.send({
      root: `${Deno.cwd()}/public`,
      index: "index.html",
    });
  } catch {
    await next();
  }
});

// Router middleware
app.use(router.routes());
app.use(router.allowedMethods());

// Initialize database and start server
async function start() {
  await initDatabase();
  console.log("Database initialized");
  
  const port = 8080;
  console.log(`Server running on http://localhost:${port}`);
  await app.listen({ port });
}

start().catch(console.error);
