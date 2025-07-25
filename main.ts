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
      ...order,
      items: JSON.parse(order.items)
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
      
      const result = await db.query(
        "INSERT INTO menu_items (user_id, name, description, category, subcategory, price, cost_price, preparation_time, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [userId, name, description, category, subcategory, price, cost_price, preparation_time, image_url]
      );
      
      addedItems.push({
        id: result[0].id,
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
