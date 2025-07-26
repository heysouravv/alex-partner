# 🤖 AI Agent API Documentation

## Overview

The AI Agent API provides a comprehensive interface for AI agents to discover businesses, browse menus, place orders, track status, and provide feedback. This API is designed specifically for restaurant interfaces where AI agents act as customers.

## 🔐 Authentication

All AI agent API endpoints require authentication using the `Agent` header:

```
Authorization: Agent <agent-id>
```

**Example:**
```
Authorization: Agent my-ai-agent-123
```

## 📋 API Endpoints

### 1. Business Discovery Feed

**GET** `/api/v1/feed`

Discover available businesses that are online and accepting orders. Now supports location-based filtering.

**Query Parameters:**
- `limit` (optional): Number of businesses to return (default: 20)
- `offset` (optional): Pagination offset (default: 0)
- `business_type` (optional): Filter by business type (e.g., "cafe", "restaurant")
- `lat` (optional): Latitude for location-based filtering
- `lng` (optional): Longitude for location-based filtering
- `radius` (optional): Search radius in meters (default: 5000)

**Response:**
```json
{
  "businesses": [
    {
      "business_id": 3,
      "business_name": "AI Test Cafe",
      "business_type": "cafe",
      "description": "A cozy coffee shop",
      "is_online": true,
      "latitude": 19.0760,
      "longitude": 72.8777,
      "address": "123 Main Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "postal_code": "400001",
      "distance": 1200,
      "distance_unit": "m",
      "created_at": "2025-07-25 21:04:37",
      "owner_name": "AI Test Cafe",
      "menu_item_count": 3,
      "api_endpoint": "/api/v1/business/3/menu"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1
  }
}
```

**Example:**
```bash
# Get all businesses
curl -H "Authorization: Agent test-agent-123" \
  "http://localhost:8080/api/v1/feed"

# Get nearby cafes
curl -H "Authorization: Agent test-agent-123" \
  "http://localhost:8080/api/v1/feed?business_type=cafe&lat=19.0760&lng=72.8777&radius=2000"
```

### 2. Nearby Businesses

**GET** `/api/v1/businesses/nearby`

Find businesses within a specific radius of given coordinates.

**Query Parameters:**
- `lat` (required): Latitude
- `lng` (required): Longitude
- `radius` (optional): Search radius in meters (default: 5000)
- `limit` (optional): Number of businesses to return (default: 20)
- `business_type` (optional): Filter by business type

**Response:**
```json
{
  "businesses": [
    {
      "business_id": 3,
      "business_name": "AI Test Cafe",
      "business_type": "cafe",
      "description": "A cozy coffee shop",
      "is_online": true,
      "latitude": 19.0760,
      "longitude": 72.8777,
      "address": "123 Main Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "postal_code": "400001",
      "distance": 1200,
      "distance_unit": "m",
      "created_at": "2025-07-25 21:04:37",
      "owner_name": "AI Test Cafe",
      "menu_item_count": 3
    }
  ],
  "search_location": {
    "lat": 19.0760,
    "lng": 72.8777
  },
  "radius": 5000,
  "total": 1
}
```

**Example:**
```bash
curl -H "Authorization: Agent test-agent-123" \
  "http://localhost:8080/api/v1/businesses/nearby?lat=19.0760&lng=72.8777&radius=2000&business_type=restaurant"
```

### 3. Search Businesses

**GET** `/api/v1/businesses/search`

Search businesses by name, city, state, or address.

**Query Parameters:**
- `q` (required): Search query
- `business_type` (optional): Filter by business type
- `limit` (optional): Number of businesses to return (default: 20)

**Response:**
```json
{
  "businesses": [
    {
      "business_id": 3,
      "business_name": "AI Test Cafe",
      "business_type": "cafe",
      "description": "A cozy coffee shop",
      "is_online": true,
      "latitude": 19.0760,
      "longitude": 72.8777,
      "address": "123 Main Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "postal_code": "400001",
      "created_at": "2025-07-25 21:04:37",
      "owner_name": "AI Test Cafe",
      "menu_item_count": 3
    }
  ],
  "search_query": "Mumbai cafe",
  "total": 1
}
```

**Example:**
```bash
curl -H "Authorization: Agent test-agent-123" \
  "http://localhost:8080/api/v1/businesses/search?q=Mumbai&business_type=cafe"
```

### 4. Get Business Menu

**GET** `/api/v1/business/{businessId}/menu`

Get the complete menu for a specific business.

**Response:**
```json
{
  "business": {
    "business_id": 3,
    "business_name": "AI Test Cafe",
    "business_type": "cafe",
    "description": "A cozy coffee shop",
    "is_online": true,
    "latitude": 19.0760,
    "longitude": 72.8777,
    "address": "123 Main Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "owner_name": "AI Test Cafe"
  },
  "menu": [
    {
      "item_id": 3,
      "name": "Cappuccino",
      "description": "Rich espresso with steamed milk",
      "category": "Drinks",
      "subcategory": "Coffee",
      "price": 4.50,
      "preparation_time": 5,
      "image_url": "https://example.com/cappuccino.jpg"
    }
  ],
  "order_endpoint": "/api/v1/business/3/order"
}
```

**Example:**
```bash
curl -H "Authorization: Agent test-agent-123" \
  "http://localhost:8080/api/v1/business/3/menu"
```

### 5. Place Order

**POST** `/api/v1/business/{businessId}/order`

Place a new order with the business.

**Request Body:**
```json
{
  "customer_name": "John Doe",
  "customer_phone": "+1234567890",
  "items": [
    {
      "item_id": 3,
      "quantity": 2
    },
    {
      "item_id": 4,
      "quantity": 1
    }
  ],
  "special_instructions": "Extra hot cappuccino",
  "pickup_time": "2025-07-25T21:30:00Z"
}
```

**Response:**
```json
{
  "order_id": "ORD-1753477507473-9jd3ad6n9",
  "business_name": "AI Test Cafe",
  "customer_name": "John Doe",
  "items": [
    {
      "item_id": 3,
      "name": "Cappuccino",
      "price": 4.50,
      "quantity": 2,
      "subtotal": 9.00
    }
  ],
  "total": 12.50,
  "status": "new",
  "cancellation_deadline": "2025-07-25T21:06:07.473Z",
  "status_endpoint": "/api/v1/order/ORD-1753477507473-9jd3ad6n9/status",
  "cancel_endpoint": "/api/v1/order/ORD-1753477507473-9jd3ad6n9/cancel"
}
```

**Example:**
```bash
curl -X POST \
  -H "Authorization: Agent test-agent-123" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "John Doe",
    "customer_phone": "+1234567890",
    "items": [{"item_id": 3, "quantity": 2}],
    "special_instructions": "Extra hot"
  }' \
  "http://localhost:8080/api/v1/business/3/order"
```

### 6. Get Order Status

**GET** `/api/v1/order/{orderId}/status`

Check the current status of an order.

**Response:**
```json
{
  "order_id": "ORD-1753477507473-9jd3ad6n9",
  "business_name": "AI Test Cafe",
  "customer_name": "John Doe",
  "customer_phone": "+1234567890",
  "status": "preparing",
  "items": [
    {
      "item_id": 3,
      "name": "Cappuccino",
      "price": 4.50,
      "quantity": 2,
      "subtotal": 9.00
    }
  ],
  "total": 12.50,
  "special_instructions": "Extra hot cappuccino",
  "pickup_time": "2025-07-25T21:30:00Z",
  "estimated_ready_time": "2025-07-25T21:15:00Z",
  "cancellation_deadline": "2025-07-25T21:06:07.473Z",
  "created_at": "2025-07-25 21:05:07",
  "can_cancel": false
}
```

**Order Status Values:**
- `new`: Order received, waiting for acceptance
- `preparing`: Order accepted, being prepared
- `ready`: Order ready for pickup
- `completed`: Order picked up
- `cancelled`: Order cancelled

**Example:**
```bash
curl -H "Authorization: Agent test-agent-123" \
  "http://localhost:8080/api/v1/order/ORD-1753477507473-9jd3ad6n9/status"
```

### 7. Cancel Order

**POST** `/api/v1/order/{orderId}/cancel`

Cancel an order within 60 seconds of placement.

**Request Body:**
```json
{
  "reason": "Customer changed mind"
}
```

**Response:**
```json
{
  "order_id": "ORD-1753477507473-9jd3ad6n9",
  "status": "cancelled",
  "message": "Order cancelled successfully",
  "reason": "Customer changed mind"
}
```

**Cancellation Rules:**
- Orders can only be cancelled within 60 seconds of placement
- Orders cannot be cancelled if already being prepared (status != "new")
- Only the agent that placed the order can cancel it

**Example:**
```bash
curl -X POST \
  -H "Authorization: Agent test-agent-123" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Customer changed mind"}' \
  "http://localhost:8080/api/v1/order/ORD-1753477507473-9jd3ad6n9/cancel"
```

### 8. Submit Feedback

**POST** `/api/v1/order/{orderId}/feedback`

Submit feedback for an order.

**Request Body:**
```json
{
  "rating": 5,
  "comment": "Great service, fast response",
  "category": "service"
}
```

**Response:**
```json
{
  "order_id": "ORD-1753477507473-9jd3ad6n9",
  "feedback_id": "ORD-1753477507473-9jd3ad6n9",
  "rating": 5,
  "comment": "Great service, fast response",
  "category": "service",
  "message": "Feedback submitted successfully"
}
```

**Feedback Rules:**
- Rating must be between 1 and 5
- Only the agent that placed the order can submit feedback
- Order must exist and belong to the agent

**Example:**
```bash
curl -X POST \
  -H "Authorization: Agent test-agent-123" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "comment": "Great service, fast response",
    "category": "service"
  }' \
  "http://localhost:8080/api/v1/order/ORD-1753477507473-9jd3ad6n9/feedback"
```

### 9. Get Business Status

**GET** `/api/v1/business/{businessId}/status`

Get real-time status of a business.

**Response:**
```json
{
  "business_id": 3,
  "business_name": "AI Test Cafe",
  "business_type": "cafe",
  "is_online": true,
  "is_active": true,
  "current_order_count": 2,
  "owner_name": "AI Test Cafe",
  "last_updated": "2025-07-25 21:04:37"
}
```

**Example:**
```bash
curl -H "Authorization: Agent test-agent-123" \
  "http://localhost:8080/api/v1/business/3/status"
```

## 🔄 Typical AI Agent Workflow

### 1. Discover Businesses by Location
```bash
# Get nearby businesses
curl -H "Authorization: Agent my-agent" \
  "http://localhost:8080/api/v1/businesses/nearby?lat=19.0760&lng=72.8777&radius=2000&business_type=cafe"

# Search by area
curl -H "Authorization: Agent my-agent" \
  "http://localhost:8080/api/v1/businesses/search?q=Mumbai&business_type=restaurant"
```

### 2. Browse Menu
```bash
# Get menu for specific business
curl -H "Authorization: Agent my-agent" \
  "http://localhost:8080/api/v1/business/3/menu"
```

### 3. Place Order
```bash
# Place order
curl -X POST \
  -H "Authorization: Agent my-agent" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "John Doe",
    "items": [{"item_id": 3, "quantity": 2}]
  }' \
  "http://localhost:8080/api/v1/business/3/order"
```

### 4. Monitor Status
```bash
# Check order status
curl -H "Authorization: Agent my-agent" \
  "http://localhost:8080/api/v1/order/ORD-123/status"
```

### 5. Cancel if Needed (within 60 seconds)
```bash
# Cancel order
curl -X POST \
  -H "Authorization: Agent my-agent" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Customer changed mind"}' \
  "http://localhost:8080/api/v1/order/ORD-123/cancel"
```

### 6. Provide Feedback
```bash
# Submit feedback
curl -X POST \
  -H "Authorization: Agent my-agent" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "comment": "Great service"}' \
  "http://localhost:8080/api/v1/order/ORD-123/feedback"
```

## ⚠️ Error Handling

### Common Error Responses

**401 Unauthorized:**
```json
{
  "message": "Agent authentication required"
}
```

**404 Not Found:**
```json
{
  "message": "Business not found"
}
```

**400 Bad Request:**
```json
{
  "message": "Order cannot be cancelled after 60 seconds",
  "cancellation_deadline": "2025-07-25T21:06:07.473Z"
}
```

**500 Internal Server Error:**
```json
{
  "message": "Internal server error"
}
```

## 📊 Rate Limiting

- **Feed API**: 100 requests per minute per agent
- **Nearby/Search API**: 60 requests per minute per agent
- **Order API**: 10 orders per minute per agent
- **Status API**: 60 requests per minute per agent

## 🔒 Security Considerations

1. **Agent Authentication**: All requests must include valid agent ID
2. **Order Ownership**: Agents can only access orders they placed
3. **Cancellation Window**: 60-second limit prevents abuse
4. **Business Validation**: Orders only accepted from online businesses
5. **Input Validation**: All inputs are validated and sanitized
6. **Location Validation**: Coordinates are validated for realistic values

## 🚀 Best Practices

1. **Location-Based Discovery**: Use coordinates for precise business discovery
2. **Distance Calculation**: Consider distance when recommending businesses
3. **Polling**: Check order status every 30-60 seconds
4. **Error Handling**: Implement retry logic for transient errors
5. **Rate Limiting**: Respect API rate limits
6. **Logging**: Log all API interactions for debugging
7. **Validation**: Validate responses before processing

## 📝 Testing

Use the provided examples to test each endpoint. The API includes comprehensive error handling and validation to ensure reliable operation.

---

**Base URL:** `http://localhost:8080`  
**API Version:** `v1`  
**Last Updated:** December 2024 