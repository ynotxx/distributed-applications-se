# Frontend Integration - Uni-Blog

This React frontend is fully integrated with the backend API. It uses:
- **Auth Context**: Manages token and user state globally
- **Login/Register**: Dedicated auth flows (no action-based endpoints)
- **Posts CRUD**: Full create, read, update, delete on posts
- **Token Storage**: LocalStorage for persistence across sessions
- **Bearer Token Auth**: All API calls include `Authorization: Bearer <token>` header

## Quick Start

### Prerequisites
- Node.js / npm or pnpm installed
- Backend running at `http://localhost/uni-api`

### Setup

```bash
cd c:\Users\Tony\Desktop\uni-project\my-frontend

# Install dependencies
npm install
# or
pnpm install

# Start dev server
npm run dev
# or
pnpm dev
```

The frontend will be available at `http://localhost:5173` (default Vite port).

### Usage Flow

1. **Register** — create a new account with username, email, password (8+ chars, must include uppercase & digit).
2. **Login** — enter username/email and password.
3. **Posts** — view, create, edit, delete posts; like posts.
4. **Logout** — revokes token and clears local auth state.

### API Endpoints Called

- `POST /auth/register.php` — public registration
- `POST /auth/login.php` — login
- `POST /auth/logout.php` — logout (revoke token)
- `GET /posts.php` — fetch posts (pagination + sorting + search)
- `POST /posts.php` — create post
- `PUT /posts.php` — update post
- `DELETE /posts.php?id=<id>` — delete post
- `POST /likes.php` — like/unlike post
- `GET /likes.php` — list likes

### Components

- **AuthContext** (`src/AuthContext.jsx`) — auth state and API calls
- **LoginRegister** (`src/components/LoginRegister.jsx`) — login/register UI
- **PostsList** (`src/components/Posts.jsx`) — posts CRUD UI
- **App** (`src/App.jsx`) — root component, routing logic

### Build for Production

```bash
npm run build
```

Output will be in `dist/` folder. Deploy to a web server.
