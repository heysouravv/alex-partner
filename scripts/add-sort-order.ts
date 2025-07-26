import { db } from "../services/database.ts";

async function addSortOrderColumn() {
  try {
    console.log("Adding sort_order column to menu_items table...");
    
    // Add sort_order column if it doesn't exist
    await db.execute(`
      ALTER TABLE menu_items 
      ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0
    `);
    
    // Create index for sort_order
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_menu_items_sort_order 
      ON menu_items(sort_order)
    `);
    
    // Update existing menu items with sequential sort_order
    await db.execute(`
      UPDATE menu_items 
      SET sort_order = subquery.row_num 
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, category ORDER BY name) as row_num 
        FROM menu_items
      ) as subquery 
      WHERE menu_items.id = subquery.id
    `);
    
    console.log("✅ sort_order column added successfully!");
    console.log("✅ sort_order index created successfully!");
    console.log("✅ Existing menu items updated with sequential sort_order!");
    
  } catch (error) {
    console.error("❌ Error adding sort_order column:", error);
  } finally {
    await db.close();
  }
}

if (import.meta.main) {
  addSortOrderColumn().catch(console.error);
} 