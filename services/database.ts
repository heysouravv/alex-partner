import { Pool } from "postgres";
import { config } from "../config.ts";

class DatabaseService {
  private pool: Pool;

  constructor() {
    console.log("Initializing database connection with config:", {
      hostname: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      max: config.database.maxConnections,
    });

    this.pool = new Pool({
      hostname: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      max: config.database.maxConnections,
      idle_timeout: 20,
      connection_timeout: 10,
    }, 10);
  }

  async query<T = any>(query: string, params?: any[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject<T>(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async execute(query: string, params?: any[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.queryObject(query, params);
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.queryObject("BEGIN");
      const result = await callback(client);
      await client.queryObject("COMMIT");
      return result;
    } catch (error) {
      await client.queryObject("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Test connection method
  async testConnection(): Promise<boolean> {
    try {
      await this.query("SELECT 1");
      return true;
    } catch (error) {
      console.error("Database connection test failed:", error);
      return false;
    }
  }
}

export const db = new DatabaseService(); 