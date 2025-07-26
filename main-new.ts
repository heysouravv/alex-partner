import { Application, Router } from "oak";
import { oakCors as cors } from "cors";
import { hash, compare } from "bcrypt";

// Import services
import { db } from "./services/database.ts";
import { redis } from "./services/redis.ts";
import { config } from "./config.ts";

// Import middleware
import { authMiddleware, agentAuthMiddleware, generateSessionId, createRateLimiter } from "./middleware/auth.ts";

// Import migrations
import { runMigrations } from "./db/migrations.ts";

const app = new Application();
const router = new Router();

// CORS middleware
app.use(cors());

// Rate limiting middleware
const rateLimiter = createRateLimiter(100, 60000); // 100 requests per minute
app.use(rateLimiter);

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error("Unhandled error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Auth routes
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
    const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.length > 0) {
      ctx.response.status = 409;
      ctx.response.body = { message: "User already exists" };
      return;
    }
    
    // Hash password
    const hashedPassword = await hash(password);
    
    // Insert user
    const result = await db.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id",
      [name, email, hashedPassword]
    );
    
    const userId = result[0].id;
    
    // If business name is provided, create initial business profile
    if (business_name && userId) {
      await db.query(
        "INSERT INTO business_profiles (user_id, business_name, business_type) VALUES ($1, $2, $3)",
        [userId, business_name, 'cafe']
      );
      
      // Update user onboarding step
      await db.query("UPDATE users SET onboarding_step = 2, onboarding_completed = false WHERE id = $1", [userId]);
    } else {
      // Ensure new users start with onboarding step 1
      await db.query("UPDATE users SET onboarding_step = 1, onboarding_completed = false WHERE id = $1", [userId]);
    }
    
    // Create session for immediate login
    const sessionId = generateSessionId();
    const userData = {
      userId: userId,
      id: userId,
      name: name,
      email: email
    };
    
    await redis.setSession(sessionId, userData);
    
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
    const users = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (users.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Invalid credentials" };
      return;
    }
    
    const user = users[0];
    
    // Verify password
    const isValidPassword = await compare(password, user.password);
    if (!isValidPassword) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Invalid credentials" };
      return;
    }
    
    // Get user's onboarding status
    const userOnboarding = await db.query("SELECT onboarding_step, onboarding_completed FROM users WHERE id = $1", [user.id]);
    const onboardingStep = userOnboarding.length > 0 ? userOnboarding[0].onboarding_step : 1;
    const onboardingCompleted = userOnboarding.length > 0 ? userOnboarding[0].onboarding_completed : false;
    
    // Create session
    const sessionId = generateSessionId();
    const userData = {
      userId: user.id,
      id: user.id,
      name: user.name,
      email: user.email
    };
    
    await redis.setSession(sessionId, userData);
    
    ctx.response.body = {
      token: sessionId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      onboarding_step: onboardingStep,
      onboarding_completed: onboardingCompleted
    };
  } catch (error) {
    console.error("Login error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

router.post("/api/auth/logout", authMiddleware, async (ctx) => {
  try {
    const sessionId = ctx.request.headers.get("Authorization")?.replace("Bearer ", "");
    if (sessionId) {
      await redis.deleteSession(sessionId);
    }
    
    ctx.response.body = { message: "Logged out successfully" };
  } catch (error) {
    console.error("Logout error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Protected routes
router.get("/api/user/profile", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const users = await db.query("SELECT id, name, email FROM users WHERE id = $1", [userId]);
    
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

// Orders routes with caching
router.get("/api/orders", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    
    // Try to get from cache first
    const cacheKey = `orders:${userId}`;
    const cachedOrders = await redis.getCache(cacheKey);
    
    if (cachedOrders) {
      ctx.response.body = cachedOrders;
      return;
    }
    
    const orders = await db.query(
      "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    
    const formattedOrders = orders.map(order => ({
      id: order.id,
      user_id: order.user_id,
      order_id: order.order_id,
      customer: order.customer,
      customer_phone: order.customer_phone,
      status: order.status,
      items: order.items,
      total: order.total,
      agent_id: order.agent_id,
      session_id: order.session_id,
      pickup_time: order.pickup_time,
      estimated_ready_time: order.estimated_ready_time,
      cancellation_deadline: order.cancellation_deadline,
      special_instructions: order.special_instructions,
      order_source: order.order_source,
      created_at: order.created_at
    }));
    
    // Cache for 5 minutes
    await redis.setCache(cacheKey, formattedOrders, 300);
    
    ctx.response.body = formattedOrders;
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
      "INSERT INTO orders (user_id, order_id, customer, status, items, total) VALUES ($1, $2, $3, $4, $5, $6)",
      [userId, orderId, customer, 'new', JSON.stringify(items), total]
    );
    
    // Invalidate orders cache
    await redis.invalidateCache(`orders:${userId}`);
    
      ctx.response.status = 201;
  ctx.response.body = { message: "Order created" };
} catch (error) {
  console.error("Create order error:", error);
  ctx.response.status = 500;
  ctx.response.body = { message: "Internal server error" };
}
});

// Order status update endpoint
router.put("/api/orders/:orderId/status", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const orderId = ctx.params.orderId;
    const body = await ctx.request.body().value;
    const { status } = body;
    
    await db.query(
      "UPDATE orders SET status = $1 WHERE user_id = $2 AND order_id = $3",
      [status, userId, orderId]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`orders:${userId}`);
    
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
      "UPDATE orders SET status = 'preparing' WHERE user_id = $1 AND order_id = $2",
      [userId, orderId]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`orders:${userId}`);
    
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
      "UPDATE orders SET status = 'cancelled' WHERE user_id = $1 AND order_id = $2",
      [userId, orderId]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`orders:${userId}`);
    
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
      "UPDATE orders SET status = 'ready' WHERE user_id = $1 AND order_id = $2",
      [userId, orderId]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`orders:${userId}`);
    
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
      "UPDATE orders SET status = 'completed' WHERE user_id = $1 AND order_id = $2",
      [userId, orderId]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`orders:${userId}`);
    
    ctx.response.body = { message: "Order completed" };
  } catch (error) {
    console.error("Complete order error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Menu routes with caching
router.get("/api/menu", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    
    // Try to get from cache first
    const cacheKey = `menu:${userId}`;
    const cachedMenu = await redis.getCache(cacheKey);
    
    if (cachedMenu) {
      ctx.response.body = cachedMenu;
      return;
    }
    
    const menuItems = await db.query(
      "SELECT * FROM menu_items WHERE user_id = $1 ORDER BY name",
      [userId]
    );
    
    // Cache for 10 minutes
    await redis.setCache(cacheKey, menuItems, 600);
    
    ctx.response.body = menuItems;
  } catch (error) {
    console.error("Get menu error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Menu templates routes
router.get("/api/menu/templates", async (ctx) => {
  try {
    const businessType = ctx.request.url.searchParams.get("business_type");
    let query = "SELECT id, name, description, business_type FROM menu_templates WHERE is_active = true";
    let params: any[] = [];
    
    if (businessType) {
      query += " AND business_type = $1";
      params.push(businessType);
    }
    
    query += " ORDER BY name";
    const templates = await db.query(query, params);
    
    ctx.response.body = templates;
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
      "SELECT * FROM menu_template_items WHERE template_id = $1 ORDER BY category, name",
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
        "INSERT INTO menu_items (user_id, name, description, category, subcategory, price, cost_price, preparation_time, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        [userId, name, description, category, subcategory, price, cost_price, preparation_time, image_url]
      );
      
      const itemId = result[0].id;
      
      addedItems.push({
        id: itemId,
        name,
        category,
        price
      });
    }
    
    // Update user onboarding step
    await db.query("UPDATE users SET onboarding_step = 4 WHERE id = $1", [userId]);
    
    // Invalidate menu cache
    await redis.invalidateCache(`menu:${userId}`);
    
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

// Business profile routes
router.get("/api/business/profile", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    
    // Try to get from cache first
    const cacheKey = `business_profile:${userId}`;
    const cachedProfile = await redis.getCache(cacheKey);
    
    if (cachedProfile) {
      ctx.response.body = cachedProfile;
      return;
    }
    
    const profile = await db.query(
      "SELECT * FROM business_profiles WHERE user_id = $1",
      [userId]
    );
    
    if (profile.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Business profile not found" };
      return;
    }
    
    // Cache for 30 minutes
    await redis.setCache(cacheKey, profile[0], 1800);
    
    ctx.response.body = profile[0];
  } catch (error) {
    console.error("Get business profile error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

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
    const existingProfile = await db.query("SELECT id FROM business_profiles WHERE user_id = $1", [userId]);
    
    if (existingProfile.length > 0) {
      // Update existing profile
      await db.query(
        "UPDATE business_profiles SET business_name = $1, business_type = $2, description = $3, timezone = $4, logo_url = $5, updated_at = CURRENT_TIMESTAMP WHERE user_id = $6",
        [business_name, business_type, description, timezone, logo_url, userId]
      );
    } else {
      // Create new profile
      await db.query(
        "INSERT INTO business_profiles (user_id, business_name, business_type, description, timezone, logo_url) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, business_name, business_type, description, timezone, logo_url]
      );
    }
    
    // Update user onboarding step
    await db.query("UPDATE users SET onboarding_step = 3 WHERE id = $1", [userId]);
    
    // Invalidate cache
    await redis.invalidateCache(`business_profile:${userId}`);
    
    ctx.response.status = 201;
    ctx.response.body = { message: "Business profile saved successfully" };
  } catch (error) {
    console.error("Business profile error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// ===== MENU MANAGEMENT ENDPOINTS =====

// Get menu categories (must come before /:id route)
router.get("/api/menu/categories", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    
    const categories = await db.query(
      `SELECT DISTINCT category, subcategory 
       FROM menu_items 
       WHERE user_id = $1 AND category IS NOT NULL 
       ORDER BY category, subcategory`,
      [userId]
    );
    
    // Group by category and subcategory
    const groupedCategories = categories.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      if (item.subcategory && !acc[item.category].includes(item.subcategory)) {
        acc[item.category].push(item.subcategory);
      }
      return acc;
    }, {});
    
    ctx.response.body = groupedCategories;
  } catch (error) {
    console.error("Get menu categories error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Get specific menu item
router.get("/api/menu/:id", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const itemId = ctx.params.id;
    
    const menuItem = await db.query(
      "SELECT * FROM menu_items WHERE id = $1 AND user_id = $2",
      [itemId, userId]
    );
    
    if (menuItem.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Menu item not found" };
      return;
    }
    
    ctx.response.body = menuItem[0];
  } catch (error) {
    console.error("Get menu item error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Create new menu item
router.post("/api/menu", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { 
      name, 
      description, 
      category, 
      subcategory, 
      price, 
      cost_price, 
      available = true, 
      preparation_time = 15,
      sort_order: initialSortOrder = 0
    } = body;
    
    // Validate required fields
    if (!name || !category || !price) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Name, category, and price are required" };
      return;
    }
    
    // Get next sort order if not provided
    let finalSortOrder = initialSortOrder;
    if (initialSortOrder === 0) {
      const maxSortOrder = await db.query(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM menu_items WHERE user_id = $1 AND category = $2",
        [userId, category]
      );
      finalSortOrder = maxSortOrder[0].next_order;
    }
    
    const result = await db.query(
      `INSERT INTO menu_items (
        user_id, name, description, category, subcategory, price, cost_price, 
        available, preparation_time, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [userId, name, description, category, subcategory, price, cost_price, available, preparation_time, finalSortOrder]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`menu:${userId}`);
    
    ctx.response.status = 201;
    ctx.response.body = { 
      message: "Menu item created successfully", 
      id: result[0].id 
    };
  } catch (error) {
    console.error("Create menu item error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Update menu item
router.put("/api/menu/:id", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const itemId = ctx.params.id;
    const body = await ctx.request.body().value;
    const { 
      name, 
      description, 
      category, 
      subcategory, 
      price, 
      cost_price, 
      available, 
      preparation_time,
      sort_order
    } = body;
    
    // Check if menu item exists and belongs to user
    const existingItem = await db.query(
      "SELECT id FROM menu_items WHERE id = $1 AND user_id = $2",
      [itemId, userId]
    );
    
    if (existingItem.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Menu item not found" };
      return;
    }
    
    await db.query(
      `UPDATE menu_items SET 
        name = $1, description = $2, category = $3, subcategory = $4, 
        price = $5, cost_price = $6, available = $7, preparation_time = $8,
        sort_order = $9, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $10 AND user_id = $11`,
      [name, description, category, subcategory, price, cost_price, available, preparation_time, sort_order, itemId, userId]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`menu:${userId}`);
    
    ctx.response.body = { message: "Menu item updated successfully" };
  } catch (error) {
    console.error("Update menu item error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Delete menu item
router.delete("/api/menu/:id", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const itemId = ctx.params.id;
    
    // Check if menu item exists and belongs to user
    const existingItem = await db.query(
      "SELECT id FROM menu_items WHERE id = $1 AND user_id = $2",
      [itemId, userId]
    );
    
    if (existingItem.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Menu item not found" };
      return;
    }
    
    await db.query(
      "DELETE FROM menu_items WHERE id = $1 AND user_id = $2",
      [itemId, userId]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`menu:${userId}`);
    
    ctx.response.body = { message: "Menu item deleted successfully" };
  } catch (error) {
    console.error("Delete menu item error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Toggle menu item availability
router.patch("/api/menu/:id/toggle", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const itemId = ctx.params.id;
    
    // Toggle availability
    await db.query(
      "UPDATE menu_items SET available = NOT available, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2",
      [itemId, userId]
    );
    
    // Get updated status
    const updatedItem = await db.query(
      "SELECT id, name, available FROM menu_items WHERE id = $1 AND user_id = $2",
      [itemId, userId]
    );
    
    if (updatedItem.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Menu item not found" };
      return;
    }
    
    // Invalidate cache
    await redis.invalidateCache(`menu:${userId}`);
    
    ctx.response.body = { 
      message: `Menu item ${updatedItem[0].available ? 'enabled' : 'disabled'} successfully`,
      available: updatedItem[0].available
    };
  } catch (error) {
    console.error("Toggle menu item error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Reorder menu items
router.put("/api/menu/reorder", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { items } = body; // Array of {id, sort_order}
    
    if (!items || !Array.isArray(items)) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Items array is required" };
      return;
    }
    
    // Update sort orders one by one
    for (const item of items) {
      await db.query(
        "UPDATE menu_items SET sort_order = COALESCE($1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3",
        [item.sort_order, item.id, userId]
      );
    }
    
    // Invalidate cache
    await redis.invalidateCache(`menu:${userId}`);
    
    ctx.response.body = { message: "Menu items reordered successfully" };
  } catch (error) {
    console.error("Reorder menu items error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});



// Bulk update menu items
router.put("/api/menu/bulk", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const body = await ctx.request.body().value;
    const { items } = body; // Array of menu items to update
    
    if (!items || !Array.isArray(items)) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Items array is required" };
      return;
    }
    
    // Update items one by one
    for (const item of items) {
              await db.query(
          `UPDATE menu_items SET 
            name = $1, description = $2, category = $3, subcategory = $4, 
            price = $5, cost_price = $6, available = $7, preparation_time = $8,
            sort_order = COALESCE($9, 0), updated_at = CURRENT_TIMESTAMP 
           WHERE id = $10 AND user_id = $11`,
          [item.name, item.description, item.category, item.subcategory, 
           item.price, item.cost_price, item.available, item.preparation_time, 
           item.sort_order, item.id, userId]
        );
    }
    
    // Invalidate cache
    await redis.invalidateCache(`menu:${userId}`);
    
    ctx.response.body = { message: "Menu items updated successfully" };
  } catch (error) {
    console.error("Bulk update menu items error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Business types route (public, with caching)
router.get("/api/business/types", async (ctx) => {
  try {
    // Try to get from cache first
    const cacheKey = "business_types";
    const cachedTypes = await redis.getCache(cacheKey);
    
    if (cachedTypes) {
      ctx.response.body = cachedTypes;
      return;
    }
    
    const types = await db.query("SELECT id, name, description, icon FROM business_types WHERE is_active = true ORDER BY name");
    
    // Cache for 1 hour
    await redis.setCache(cacheKey, types, 3600);
    
    ctx.response.body = types;
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
    const profile = await db.query("SELECT is_online FROM business_profiles WHERE user_id = $1", [userId]);
    
    if (profile.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Business profile not found" };
      return;
    }
    
    ctx.response.body = {
      is_online: profile[0].is_online
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
      "UPDATE business_profiles SET is_online = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2",
      [is_online, userId]
    );
    
    // Invalidate cache
    await redis.invalidateCache(`business_profile:${userId}`);
    
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

// Onboarding progress routes
router.get("/api/onboarding/progress", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    const user = await db.query("SELECT onboarding_step, onboarding_completed FROM users WHERE id = $1", [userId]);
    const progress = await db.query("SELECT * FROM onboarding_progress WHERE user_id = $1 ORDER BY step", [userId]);
    
    if (user.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "User not found" };
      return;
    }
    
    ctx.response.body = {
      current_step: user[0].onboarding_step || 1,
      completed: user[0].onboarding_completed || false,
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
    
    // Validate required fields
    if (step === undefined || step === null) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Step is required" };
      return;
    }
    
    // Ensure user exists in database
    const userCheck = await db.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userCheck.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "User not found" };
      return;
    }
    
    // Delete existing record for this step if it exists
    await db.query(
      "DELETE FROM onboarding_progress WHERE user_id = $1 AND step = $2",
      [userId, step]
    );
    
    // Insert new record
    await db.query(
      "INSERT INTO onboarding_progress (user_id, step, completed, data, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
      [userId, step, completed ? 1 : 0, JSON.stringify(data || {})]
    );
    
    // Update user's current step
    await db.query("UPDATE users SET onboarding_step = $1 WHERE id = $2", [step, userId]);
    
    // If this is the final step, mark onboarding as completed
    if (step >= 5) {
      await db.query("UPDATE users SET onboarding_completed = true WHERE id = $1", [userId]);
    }
    
    // Return updated user status
    const updatedUser = await db.query("SELECT onboarding_step, onboarding_completed FROM users WHERE id = $1", [userId]);
    
    ctx.response.body = { 
      message: "Progress saved successfully",
      onboarding_step: updatedUser[0].onboarding_step,
      onboarding_completed: updatedUser[0].onboarding_completed
    };
  } catch (error) {
    console.error("Save onboarding progress error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Complete onboarding endpoint
router.post("/api/onboarding/complete", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    
    // Mark onboarding as completed
    await db.query("UPDATE users SET onboarding_completed = true, onboarding_step = 5 WHERE id = $1", [userId]);
    
    ctx.response.body = { 
      message: "Onboarding completed successfully",
      onboarding_completed: true,
      onboarding_step: 5
    };
  } catch (error) {
    console.error("Complete onboarding error:", error);
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
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [userId]
    );
    
    const formattedActivities = activities.map((activity: any) => {
      const createdAt = new Date(activity.created_at);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));
      
      let timeAgo;
      if (diffMinutes < 1) timeAgo = 'just now';
      else if (diffMinutes < 60) timeAgo = `${diffMinutes}m ago`;
      else if (diffMinutes < 1440) timeAgo = `${Math.floor(diffMinutes / 60)}h ago`;
      else timeAgo = `${Math.floor(diffMinutes / 1440)}d ago`;
      
      return {
        time: timeAgo,
        action: activity.action,
        customer: activity.customer,
        amount: `$${parseFloat(activity.total).toFixed(2)}`,
        status: activity.status,
        orderId: activity.order_id
      };
    });
    
    ctx.response.body = formattedActivities;
  } catch (error) {
    console.error("Get activity error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Enhanced stats route with growth calculation
router.get("/api/stats", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.userId;
    
    // Try to get from cache first
    const cacheKey = `stats:${userId}`;
    const cachedStats = await redis.getCache(cacheKey);
    
    if (cachedStats) {
      ctx.response.body = cachedStats;
      return;
    }
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Today's stats
    const todayStats = await db.query(
      `SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as avg_order_value
       FROM orders 
       WHERE user_id = $1 
       AND DATE(created_at) = $2 
       AND status != 'cancelled'`,
      [userId, today]
    );
    
    // Past 7 days stats
    const weekStats = await db.query(
      `SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as avg_order_value
       FROM orders 
       WHERE user_id = $1 
       AND DATE(created_at) >= $2 
       AND status != 'cancelled'`,
      [userId, sevenDaysAgo]
    );
    
    // Past 30 days stats
    const monthStats = await db.query(
      `SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as avg_order_value
       FROM orders 
       WHERE user_id = $1 
       AND DATE(created_at) >= $2 
       AND status != 'cancelled'`,
      [userId, thirtyDaysAgo]
    );
    
    // All time stats
    const allTimeStats = await db.query(
      `SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as avg_order_value
       FROM orders 
       WHERE user_id = $1 
       AND status != 'cancelled'`,
      [userId]
    );
    
    // Calculate growth (compare this week to last week)
    const lastWeekStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const lastWeekEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const lastWeekRevenue = await db.query(
      `SELECT COALESCE(SUM(total), 0) as total FROM orders 
       WHERE user_id = $1 
       AND DATE(created_at) >= $2 
       AND DATE(created_at) < $3 
       AND status != 'cancelled'`,
      [userId, lastWeekStart, lastWeekEnd]
    );
    
    const currentWeekRevenue = parseFloat(weekStats[0].total_revenue) || 0;
    const lastWeekRevenueValue = parseFloat(lastWeekRevenue[0].total) || 0;
    const growthPercentage = lastWeekRevenueValue > 0 
      ? ((currentWeekRevenue - lastWeekRevenueValue) / lastWeekRevenueValue * 100).toFixed(1)
      : "0";
    
    // Top selling items (last 30 days) - Get all orders and process in JavaScript
    const allOrders = await db.query(
      `SELECT 
        items
       FROM orders 
       WHERE user_id = $1 
       AND status IN ('completed', 'preparing', 'ready')`,
      [userId]
    );
    
    // Process items in JavaScript to get individual item counts
    const itemCounts: { [key: string]: number } = {};
    
    allOrders.forEach((order: any) => {
      try {
        const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items);
        items.forEach((item: any) => {
          const itemName = item.name;
          itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;
        });
      } catch (error) {
        console.error('Error processing order items:', error);
      }
    });
    
    // Convert to array and sort by count
    const topItems = Object.entries(itemCounts)
      .map(([itemName, count]) => ({
        item_names: itemName,
        order_count: count
      }))
      .sort((a, b) => b.order_count - a.order_count)
      .slice(0, 5);
    
    // Busiest hours (last 30 days)
    const busyHours = await db.query(
      `SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as order_count
       FROM orders 
       WHERE user_id = $1 
       AND DATE(created_at) >= $2 
       AND status != 'cancelled'
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY order_count DESC
       LIMIT 5`,
      [userId, thirtyDaysAgo]
    );
    
    const stats = {
      today: {
        orders: parseInt(todayStats[0].order_count) || 0,
        revenue: parseFloat(todayStats[0].total_revenue) || 0,
        avgOrder: parseFloat(todayStats[0].avg_order_value) || 0
      },
      week: {
        orders: parseInt(weekStats[0].order_count) || 0,
        revenue: parseFloat(weekStats[0].total_revenue) || 0,
        avgOrder: parseFloat(weekStats[0].avg_order_value) || 0
      },
      month: {
        orders: parseInt(monthStats[0].order_count) || 0,
        revenue: parseFloat(monthStats[0].total_revenue) || 0,
        avgOrder: parseFloat(monthStats[0].avg_order_value) || 0
      },
      allTime: {
        orders: parseInt(allTimeStats[0].order_count) || 0,
        revenue: parseFloat(allTimeStats[0].total_revenue) || 0,
        avgOrder: parseFloat(allTimeStats[0].avg_order_value) || 0
      },
      growth: {
        percentage: parseFloat(growthPercentage),
        direction: parseFloat(growthPercentage) >= 0 ? 'up' : 'down'
      },
      topItems: topItems,
      busyHours: busyHours.map((hour: any) => ({
        hour: hour.hour.toString(),
        order_count: parseInt(hour.order_count)
      }))
    };
    
    // Cache for 5 minutes
    await redis.setCache(cacheKey, stats, 300);
    
    ctx.response.body = stats;
  } catch (error) {
    console.error("Get stats error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Internal server error" };
  }
});

// Health check endpoint
router.get("/api/health", async (ctx) => {
  try {
    // Check database connection
    const dbConnected = await db.testConnection();
    
    // Check Redis connection
    await redis.set("health_check", "ok", 10);
    const redisHealth = await redis.get("health_check");
    
    ctx.response.body = {
      status: dbConnected && redisHealth === "ok" ? "healthy" : "degraded",
      database: dbConnected ? "connected" : "disconnected",
      redis: redisHealth === "ok" ? "connected" : "disconnected",
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Health check error:", error);
    ctx.response.status = 503;
    ctx.response.body = {
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    };
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
  try {
    console.log("Starting application...");
    console.log("Configuration:", {
      database: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.username,
        maxConnections: config.database.maxConnections,
      },
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
      },
      server: {
        port: config.server.port,
      }
    });
    
    // Connect to Redis
    await redis.connect();
    console.log("Connected to Redis");
    
    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      throw new Error("Failed to connect to database");
    }
    console.log("Connected to PostgreSQL");
    
    // Run database migrations
    await runMigrations();
    console.log("Database initialized");
    
    const port = config.server.port;
    console.log(`Server running on http://localhost:${port}`);
    await app.listen({ port });
  } catch (error) {
    console.error("Failed to start server:", error);
    console.error("Please ensure PostgreSQL and Redis are running:");
    console.error("1. Start services: docker-compose up -d");
    console.error("2. Check services: docker-compose ps");
    console.error("3. Check logs: docker-compose logs");
    Deno.exit(1);
  }
}

// Graceful shutdown
Deno.addSignalListener("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await redis.close();
  await db.close();
  Deno.exit(0);
});

start().catch(console.error); 