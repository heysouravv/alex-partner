import { Context, Next } from "oak";
import { redis } from "../services/redis.ts";

// Generate session ID
export function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Authentication middleware
export async function authMiddleware(ctx: Context, next: Next) {
  const sessionId = ctx.request.headers.get("Authorization")?.replace("Bearer ", "");
  
  if (!sessionId) {
    ctx.response.status = 401;
    ctx.response.body = { message: "No session token provided" };
    return;
  }
  
  try {
    const session = await redis.getSession(sessionId);
    
    if (!session) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Invalid or expired session" };
      return;
    }
    
    // Extend session
    await redis.setSession(sessionId, session);
    
    ctx.state.user = session;
    await next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    ctx.response.status = 500;
    ctx.response.body = { message: "Authentication error" };
  }
}

// Agent authentication middleware
export async function agentAuthMiddleware(ctx: Context, next: Next) {
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

// Rate limiting middleware
export function createRateLimiter(maxRequests: number = 100, windowMs: number = 60000) {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return async (ctx: Context, next: Next) => {
    const ip = ctx.request.ip || 'unknown';
    const now = Date.now();
    
    const userRequests = requests.get(ip);
    
    if (!userRequests || now > userRequests.resetTime) {
      requests.set(ip, { count: 1, resetTime: now + windowMs });
    } else {
      userRequests.count++;
      
      if (userRequests.count > maxRequests) {
        ctx.response.status = 429;
        ctx.response.body = { message: "Too many requests" };
        return;
      }
    }
    
    await next();
  };
} 