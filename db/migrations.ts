import { db } from "../services/database.ts";

export async function runMigrations(): Promise<void> {
  console.log("Running database migrations...");

  // Users table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      onboarding_completed BOOLEAN DEFAULT FALSE,
      onboarding_step INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Business profiles table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS business_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_name VARCHAR(255) NOT NULL,
      business_type VARCHAR(100) NOT NULL,
      description TEXT,
      timezone VARCHAR(50) DEFAULT 'UTC',
      logo_url TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      is_online BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Business hours table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS business_hours (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
      open_time TIME,
      close_time TIME,
      is_open BOOLEAN DEFAULT TRUE
    )
  `);

  // Business types table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS business_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      icon VARCHAR(10),
      is_active BOOLEAN DEFAULT TRUE
    )
  `);

  // Menu items table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100) NOT NULL,
      subcategory VARCHAR(100),
      price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
      cost_price DECIMAL(10,2) CHECK (cost_price >= 0),
      profit_margin DECIMAL(5,2),
      available BOOLEAN DEFAULT TRUE,
      is_featured BOOLEAN DEFAULT FALSE,
      preparation_time INTEGER CHECK (preparation_time >= 0),
      sort_order INTEGER DEFAULT 0,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Menu templates table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      business_type VARCHAR(100) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Menu template items table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_template_items (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES menu_templates(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100) NOT NULL,
      subcategory VARCHAR(100),
      suggested_price DECIMAL(10,2) NOT NULL CHECK (suggested_price >= 0),
      preparation_time INTEGER CHECK (preparation_time >= 0)
    )
  `);

  // Onboarding progress table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS onboarding_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      step INTEGER NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, step)
    )
  `);

  // Orders table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id VARCHAR(100) NOT NULL UNIQUE,
      customer VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(20),
      status VARCHAR(50) NOT NULL DEFAULT 'new',
      items JSONB NOT NULL,
      total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
      agent_id VARCHAR(100),
      session_id VARCHAR(100),
      pickup_time TIMESTAMP,
      estimated_ready_time TIMESTAMP,
      cancellation_deadline TIMESTAMP,
      special_instructions TEXT,
      order_source VARCHAR(50) DEFAULT 'ai_agent',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Order feedback table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_feedback (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(100) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
      agent_id VARCHAR(100) NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      category VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for better performance
  await createIndexes();

  // Insert default data
  await insertDefaultData();

  console.log("Database migrations completed successfully!");
}

async function createIndexes(): Promise<void> {
  console.log("Creating database indexes...");

  // Users indexes
  await db.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_completed, onboarding_step)");

  // Business profiles indexes
  await db.execute("CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_business_profiles_type ON business_profiles(business_type)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_business_profiles_online ON business_profiles(is_online, is_active)");

  // Menu items indexes
  await db.execute("CREATE INDEX IF NOT EXISTS idx_menu_items_user_id ON menu_items(user_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(available)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_menu_items_sort_order ON menu_items(sort_order)");

  // Orders indexes
  await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_agent_id ON orders(agent_id)");

  // Onboarding progress indexes
  await db.execute("CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user_id ON onboarding_progress(user_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_onboarding_progress_step ON onboarding_progress(step)");

  console.log("Database indexes created successfully!");
}

async function insertDefaultData(): Promise<void> {
  console.log("Inserting default data...");

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
    ON CONFLICT (name) DO NOTHING
  `);

  // Insert default menu templates
  await insertDefaultMenuTemplates();

  console.log("Default data inserted successfully!");
}

async function insertDefaultMenuTemplates(): Promise<void> {
  // Clear existing templates to prevent duplicates
  await db.execute("DELETE FROM menu_template_items");
  await db.execute("DELETE FROM menu_templates");
  
  // Cafe template
  const cafeTemplate = await db.query(
    "INSERT INTO menu_templates (name, description, business_type) VALUES ($1, $2, $3) RETURNING id",
    ["Cafe Essentials", "Perfect starter menu for coffee shops", "cafe"]
  );

  if (cafeTemplate.length > 0) {
    const templateId = cafeTemplate[0].id;
    const cafeItems = [
      ["Espresso", "Single shot of espresso", "drinks", "coffee", 2.50, 5],
      ["Americano", "Espresso with hot water", "drinks", "coffee", 3.00, 5],
      ["Cappuccino", "Espresso with steamed milk", "drinks", "coffee", 4.00, 5],
      ["Latte", "Espresso with steamed milk and foam", "drinks", "coffee", 4.20, 5],
      ["Croissant", "Buttery French pastry", "food", "pastries", 3.20, 2],
      ["Blueberry Muffin", "Fresh baked muffin", "food", "pastries", 2.80, 2]
    ];

    for (const item of cafeItems) {
      await db.execute(
        "INSERT INTO menu_template_items (template_id, name, description, category, subcategory, suggested_price, preparation_time) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [templateId, ...item]
      );
    }
  }

  // Restaurant template
  const restaurantTemplate = await db.query(
    "INSERT INTO menu_templates (name, description, business_type) VALUES ($1, $2, $3) RETURNING id",
    ["Restaurant Classics", "Essential dishes for restaurants", "restaurant"]
  );

  if (restaurantTemplate.length > 0) {
    const templateId = restaurantTemplate[0].id;
    const restaurantItems = [
      ["Caesar Salad", "Fresh romaine with caesar dressing", "food", "salads", 8.50, 10],
      ["Grilled Chicken", "Herb-marinated chicken breast", "food", "mains", 15.00, 20],
      ["Pasta Carbonara", "Creamy pasta with bacon", "food", "mains", 12.00, 15],
      ["Chocolate Cake", "Rich chocolate layer cake", "food", "desserts", 6.00, 5],
      ["Soft Drinks", "Coca-Cola, Sprite, Fanta", "drinks", "beverages", 2.50, 2]
    ];

    for (const item of restaurantItems) {
      await db.execute(
        "INSERT INTO menu_template_items (template_id, name, description, category, subcategory, suggested_price, preparation_time) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [templateId, ...item]
      );
    }
  }

  // Bakery template
  const bakeryTemplate = await db.query(
    "INSERT INTO menu_templates (name, description, business_type) VALUES ($1, $2, $3) RETURNING id",
    ["Bakery Essentials", "Perfect starter menu for bakeries", "bakery"]
  );

  if (bakeryTemplate.length > 0) {
    const templateId = bakeryTemplate[0].id;
    const bakeryItems = [
      ["Sourdough Bread", "Traditional sourdough loaf", "bread", "artisan", 4.50, 5],
      ["Croissant", "Buttery French croissant", "pastries", "viennoiserie", 3.20, 2],
      ["Chocolate Chip Cookie", "Fresh baked cookie", "cookies", "classic", 2.00, 2],
      ["Blueberry Muffin", "Fresh baked muffin", "pastries", "muffins", 2.80, 2],
      ["Cake Slice", "Assorted cake slices", "cakes", "slices", 4.50, 1],
      ["Coffee", "Fresh brewed coffee", "drinks", "hot", 2.50, 2]
    ];

    for (const item of bakeryItems) {
      await db.execute(
        "INSERT INTO menu_template_items (template_id, name, description, category, subcategory, suggested_price, preparation_time) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [templateId, ...item]
      );
    }
  }
} 