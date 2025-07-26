import { DB } from "sqlite";
import { db as postgresDb } from "../services/database.ts";
import { redis } from "../services/redis.ts";

interface SqliteUser {
  id: number;
  name: string;
  email: string;
  password: string;
  onboarding_completed: number;
  onboarding_step: number;
  created_at: string;
}

interface SqliteBusinessProfile {
  id: number;
  user_id: number;
  business_name: string;
  business_type: string;
  description: string | null;
  timezone: string;
  logo_url: string | null;
  is_active: number;
  is_online: number;
  created_at: string;
  updated_at: string;
}

interface SqliteMenuItem {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price: number;
  cost_price: number | null;
  profit_margin: number | null;
  available: number;
  is_featured: number;
  preparation_time: number | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SqliteOrder {
  id: number;
  user_id: number;
  order_id: string;
  customer: string;
  customer_phone: string | null;
  status: string;
  items: string;
  total: number;
  agent_id: string | null;
  session_id: string | null;
  pickup_time: string | null;
  estimated_ready_time: string | null;
  cancellation_deadline: string | null;
  special_instructions: string | null;
  order_source: string;
  created_at: string;
}

async function migrateFromSqlite() {
  console.log("Starting migration from SQLite to PostgreSQL...");
  
  try {
    // Connect to Redis
    await redis.connect();
    console.log("Connected to Redis");
    
    // Open SQLite database
    const sqliteDb = new DB("cafe_orders.db");
    console.log("Connected to SQLite database");
    
    // Migrate users
    console.log("Migrating users...");
    const users = sqliteDb.query<SqliteUser>("SELECT * FROM users");
    for (const user of users) {
      try {
        await postgresDb.query(
          "INSERT INTO users (id, name, email, password, onboarding_completed, onboarding_step, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
          [
            user.id,
            user.name,
            user.email,
            user.password,
            user.onboarding_completed === 1,
            user.onboarding_step,
            user.created_at
          ]
        );
      } catch (error) {
        console.error(`Error migrating user ${user.id}:`, error);
      }
    }
    console.log(`Migrated ${users.length} users`);
    
    // Migrate business profiles
    console.log("Migrating business profiles...");
    const businessProfiles = sqliteDb.query<SqliteBusinessProfile>("SELECT * FROM business_profiles");
    for (const profile of businessProfiles) {
      try {
        await postgresDb.query(
          "INSERT INTO business_profiles (id, user_id, business_name, business_type, description, timezone, logo_url, is_active, is_online, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING",
          [
            profile.id,
            profile.user_id,
            profile.business_name,
            profile.business_type,
            profile.description,
            profile.timezone,
            profile.logo_url,
            profile.is_active === 1,
            profile.is_online === 1,
            profile.created_at,
            profile.updated_at
          ]
        );
      } catch (error) {
        console.error(`Error migrating business profile ${profile.id}:`, error);
      }
    }
    console.log(`Migrated ${businessProfiles.length} business profiles`);
    
    // Migrate menu items
    console.log("Migrating menu items...");
    const menuItems = sqliteDb.query<SqliteMenuItem>("SELECT * FROM menu_items");
    for (const item of menuItems) {
      try {
        await postgresDb.query(
          "INSERT INTO menu_items (id, user_id, name, description, category, subcategory, price, cost_price, profit_margin, available, is_featured, preparation_time, image_url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ON CONFLICT (id) DO NOTHING",
          [
            item.id,
            item.user_id,
            item.name,
            item.description,
            item.category,
            item.subcategory,
            item.price,
            item.cost_price,
            item.profit_margin,
            item.available === 1,
            item.is_featured === 1,
            item.preparation_time,
            item.image_url,
            item.created_at,
            item.updated_at
          ]
        );
      } catch (error) {
        console.error(`Error migrating menu item ${item.id}:`, error);
      }
    }
    console.log(`Migrated ${menuItems.length} menu items`);
    
    // Migrate orders
    console.log("Migrating orders...");
    const orders = sqliteDb.query<SqliteOrder>("SELECT * FROM orders");
    for (const order of orders) {
      try {
        await postgresDb.query(
          "INSERT INTO orders (id, user_id, order_id, customer, customer_phone, status, items, total, agent_id, session_id, pickup_time, estimated_ready_time, cancellation_deadline, special_instructions, order_source, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) ON CONFLICT (id) DO NOTHING",
          [
            order.id,
            order.user_id,
            order.order_id,
            order.customer,
            order.customer_phone,
            order.status,
            order.items,
            order.total,
            order.agent_id,
            order.session_id,
            order.pickup_time,
            order.estimated_ready_time,
            order.cancellation_deadline,
            order.special_instructions,
            order.order_source,
            order.created_at
          ]
        );
      } catch (error) {
        console.error(`Error migrating order ${order.id}:`, error);
      }
    }
    console.log(`Migrated ${orders.length} orders`);
    
    // Close SQLite database
    sqliteDb.close();
    
    console.log("Migration completed successfully!");
    
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await redis.close();
  }
}

// Run migration if this script is executed directly
if (import.meta.main) {
  migrateFromSqlite().catch(console.error);
} 