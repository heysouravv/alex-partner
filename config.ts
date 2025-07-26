export interface Config {
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    maxConnections: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  server: {
    port: number;
  };
  session: {
    secret: string;
    maxAge: number; // in seconds
  };
}

// Helper function to get environment variables
function getEnv(key: string, defaultValue: string): string {
  return (globalThis as any).Deno?.env?.get?.(key) || defaultValue;
}

export const config: Config = {
  database: {
    host: getEnv("DB_HOST", "localhost"),
    port: parseInt(getEnv("DB_PORT", "5432")),
    database: getEnv("DB_NAME", "cafe_orders"),
    username: getEnv("DB_USER", "postgres"),
    password: getEnv("DB_PASSWORD", "password"),
    maxConnections: parseInt(getEnv("DB_MAX_CONNECTIONS", "10")),
  },
  redis: {
    host: getEnv("REDIS_HOST", "localhost"),
    port: parseInt(getEnv("REDIS_PORT", "6379")),
    password: getEnv("REDIS_PASSWORD", ""),
    db: parseInt(getEnv("REDIS_DB", "0")),
  },
  server: {
    port: parseInt(getEnv("PORT", "8080")),
  },
  session: {
    secret: getEnv("SESSION_SECRET", "your-secret-key-change-in-production"),
    maxAge: parseInt(getEnv("SESSION_MAX_AGE", "86400")), // 24 hours
  },
}; 