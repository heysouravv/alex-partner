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
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_id TEXT NOT NULL,
      customer TEXT NOT NULL,
      status TEXT NOT NULL,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      available BOOLEAN DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
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

// Auth routes
router.post("/api/auth/signup", async (ctx) => {
  try {
    const body = await ctx.request.body().value;
    const { name, email, password } = body;
    
    // Validate input
    if (!name || !email || !password) {
      ctx.response.status = 400;
      ctx.response.body = { message: "All fields are required" };
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
    const result = await db.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword]
    );
    
    ctx.response.status = 201;
    ctx.response.body = { message: "User created successfully" };
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
      }
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
    const { name, price, available } = body;
    
    await db.query(
      "UPDATE menu_items SET name = ?, price = ?, available = ? WHERE id = ? AND user_id = ?",
      [name, price, available ? 1 : 0, itemId, userId]
    );
    
    ctx.response.body = { message: "Menu item updated" };
  } catch (error) {
    console.error("Update menu item error:", error);
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
