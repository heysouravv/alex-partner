# Cafe Orders App with Authentication

A simple cafe order management system built with Deno, featuring user authentication and order management.

## Features

- **User Authentication**: Sign up and login with email/password
- **Order Management**: View, accept, reject, and manage orders
- **Menu Management**: Add/edit menu items and toggle availability
- **Real-time Updates**: Simulated new orders with sound notifications
- **Responsive Design**: Mobile-friendly interface

## Setup

1. **Install Deno** (if not already installed):
   ```bash
   curl -fsSL https://deno.land/x/install/install.sh | sh
   ```

2. **Clone and navigate to the project**:
   ```bash
   cd alex-patners
   ```

3. **Run the development server**:
   ```bash
   deno task dev
   ```

   Or run directly:
   ```bash
   deno run --allow-net --allow-read --allow-write --allow-env --watch main.ts
   ```

4. **Open your browser** and go to `http://localhost:8000`

## Usage

### First Time Setup

1. Visit `http://localhost:8000`
2. You'll be redirected to the login page
3. Click "Create Account" to sign up
4. Enter your cafe name, email, and password
5. After successful signup, you'll be redirected to login
6. Sign in with your credentials

### Managing Orders

- **View Orders**: See all incoming orders with customer details
- **Accept Orders**: Click "Accept" to start preparing an order
- **Mark Ready**: Click "Ready for Pickup" when order is complete
- **Complete Orders**: Click "Picked Up" when customer collects order
- **Reject Orders**: Click "Decline" to reject orders

### Managing Menu

- **View Menu**: Switch to the "Menu" tab to see all items
- **Toggle Availability**: Click the toggle switch to make items available/unavailable
- **Add Items**: Click "+ Add New Item" to add new menu items

### Settings

- **Online/Offline**: Toggle your cafe's online status
- **Sound Notifications**: Toggle sound alerts for new orders
- **Logout**: Click the logout button to sign out

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Sign in

### Protected Routes (require authentication)
- `GET /api/user/profile` - Get user profile
- `GET /api/orders` - Get user's orders
- `POST /api/orders` - Create new order
- `PUT /api/orders/:orderId/status` - Update order status
- `GET /api/menu` - Get user's menu items
- `POST /api/menu` - Add menu item
- `PUT /api/menu/:id` - Update menu item

## Database

The app uses SQLite for data storage. The database file (`cafe_orders.db`) will be created automatically when you first run the server.

### Tables
- `users` - User accounts and authentication
- `orders` - Order data linked to users
- `menu_items` - Menu items linked to users

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- Input validation
- SQL injection protection
- CORS enabled

## Development

### Project Structure
```
alex-patners/
├── main.ts              # Server entry point
├── deno.json            # Deno configuration
├── deno.lock            # Dependency lock file
├── public/              # Static files
│   ├── index.html       # Main app (with auth)
│   ├── login.html       # Login page
│   └── signup.html      # Signup page
├── db/                  # Database files
│   └── cafe_orders.db   # SQLite database
└── README.md           # This file
```

### Available Tasks
- `deno task dev` - Run development server with hot reload
- `deno task start` - Run production server
- `deno task db:init` - Initialize database (runs automatically)

## Notes

- The app includes demo data for testing
- New orders are simulated every minute when online
- Sessions are stored in memory (restart server to clear)
- All data is stored locally in SQLite
- The app is designed for single-cafe use

## Troubleshooting

If you encounter issues:

1. **Port already in use**: Change the port in `main.ts` (line 320)
2. **Database errors**: Delete `cafe_orders.db` and restart the server
3. **Module not found**: Run `deno cache main.ts` to download dependencies
4. **Permission errors**: Ensure you're running with the correct permissions

## License

This is a demo project for educational purposes. 