# Migration to PostgreSQL and Redis

This document outlines the migration from SQLite to PostgreSQL and the addition of Redis for session management and caching.

## Architecture Changes

### Before (SQLite + In-Memory Sessions)
- Single SQLite database file
- In-memory session storage (`Map<string, any>`)
- No connection pooling
- No caching layer
- Limited concurrent access

### After (PostgreSQL + Redis)
- PostgreSQL with connection pooling
- Redis for session management and caching
- Proper indexing for performance
- Horizontal scaling capability
- Rate limiting and error handling

## Setup Instructions

### 1. Install Dependencies

Make sure you have Docker and Docker Compose installed.

### 2. Start Infrastructure Services

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 3. Environment Variables

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cafe_orders
DB_USER=postgres
DB_PASSWORD=password
DB_MAX_CONNECTIONS=10

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Server Configuration
PORT=8080

# Session Configuration
SESSION_SECRET=your-secret-key-change-in-production
SESSION_MAX_AGE=86400
```

### 4. Run the New Application

```bash
# Start the new application
deno task start
```

The application will automatically:
- Connect to PostgreSQL and Redis
- Run database migrations
- Create indexes for performance
- Insert default data

## Key Improvements

### 1. Database Performance
- **Connection Pooling**: Handles multiple concurrent connections efficiently
- **Indexes**: Optimized queries for frequently accessed data
- **JSONB**: Better performance for JSON data storage
- **Constraints**: Data integrity with proper foreign keys and checks

### 2. Session Management
- **Redis Sessions**: Persistent across server restarts
- **Session Expiration**: Automatic cleanup of expired sessions
- **Horizontal Scaling**: Sessions shared across multiple server instances

### 3. Caching Layer
- **Menu Items**: Cached for 10 minutes
- **Business Profiles**: Cached for 30 minutes
- **Business Types**: Cached for 1 hour
- **Orders**: Cached for 5 minutes
- **Stats**: Cached for 5 minutes

### 4. Security & Performance
- **Rate Limiting**: 100 requests per minute per IP
- **Error Handling**: Comprehensive error handling middleware
- **Health Checks**: Monitor service health
- **Graceful Shutdown**: Proper cleanup on server shutdown

## API Changes

### Authentication
- Sessions now stored in Redis instead of memory
- Session tokens automatically extended on use
- Proper session cleanup on logout

### Database Queries
- Changed from SQLite syntax to PostgreSQL
- Parameterized queries with `$1, $2, ...` instead of `?`
- Better error handling for database operations

### Caching
- Automatic cache invalidation when data changes
- Configurable TTL for different types of data
- Fallback to database when cache misses

## Monitoring

### Health Check Endpoint
```bash
curl http://localhost:8080/api/health
```

Response:
```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Database Monitoring
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Redis Monitoring
```bash
# Connect to Redis CLI
docker exec -it cafe_orders_redis redis-cli

# Check memory usage
INFO memory

# Check connected clients
INFO clients

# Monitor commands in real-time
MONITOR
```

## Migration Checklist

- [ ] Start PostgreSQL and Redis containers
- [ ] Set up environment variables
- [ ] Run database migrations
- [ ] Test authentication flow
- [ ] Verify caching is working
- [ ] Test rate limiting
- [ ] Check health endpoint
- [ ] Monitor performance metrics

## Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Connect to database
docker exec -it cafe_orders_postgres psql -U postgres -d cafe_orders
```

### Redis Connection Issues
```bash
# Check if Redis is running
docker-compose ps redis

# Check logs
docker-compose logs redis

# Test Redis connection
docker exec -it cafe_orders_redis redis-cli ping
```

### Application Issues
```bash
# Check application logs
deno task start

# Test health endpoint
curl http://localhost:8080/api/health
```

## Performance Expectations

With the new architecture, you should see:
- **10x+ concurrent users**: PostgreSQL connection pooling
- **Faster response times**: Redis caching layer
- **Better reliability**: Persistent sessions and proper error handling
- **Scalability**: Horizontal scaling capability with load balancers

## Next Steps

1. **Production Deployment**: Set up proper environment variables for production
2. **Monitoring**: Add application performance monitoring (APM)
3. **Backup Strategy**: Implement database and Redis backup procedures
4. **Load Testing**: Test with realistic load scenarios
5. **Security Hardening**: Implement additional security measures 