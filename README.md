# Marketplace Backend (Express + Prisma + PostgreSQL)

This backend is generated directly from the frontend’s real API usage in `app/src/services/api.ts` and the data shapes in `app/src/types/index.ts`.

- **Runtime**: Node.js + Express (JavaScript only)
- **DB**: PostgreSQL
- **ORM**: Prisma **5.10.0** (`prisma` + `@prisma/client` pinned)
- **Auth**: JWT (Bearer) + bcryptjs password hashing
- **Validation**: Joi
- **Security**: cors + helmet

## Quick start

### 1) Install

```bash
cd backend
npm install
```

### 2) Configure env

Create `backend/.env` (copy from `backend/.env.example`) and set:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN` (Vite default is `http://localhost:5173`)

### 3) Migrate + generate + seed

```bash
cd backend
npm run prisma:generate
npx prisma migrate dev --name init
npm run seed
```

### 4) Run API

```bash
cd backend
npm run dev
```

API base URL (matches frontend default): `http://localhost:5000/api`

Health check: `http://localhost:5000/health`

## Demo credentials (seeded)

These match the frontend login screen defaults:

- **Super Admin**: `super@divine.com` / `admin123`
- **Admin**: `admin@divine.com` / `admin123`
- **Seller**: `seller@divine.com` / `seller123`

## Auth flow

- Login: `POST /api/auth/login`
- The API returns `{ success, message, data: { user, token } }`
- The frontend stores `token` in `localStorage` and sends it as `Authorization: Bearer <token>`

## API routes (as called by the frontend)

All responses use the frontend envelope:

```json
{
  "success": true,
  "message": "string",
  "data": {},
  "meta": { "page": 1, "limit": 10, "total": 0, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "errors": [{ "field": "optional", "message": "string" }]
}
```

### Auth

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/profile`
- `POST /api/auth/change-password`

### Users

- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `POST /api/users/:id/toggle-status`

### Sellers

- `GET /api/sellers`
- `GET /api/sellers/:id`
- `POST /api/sellers`
- `PUT /api/sellers/:id`
- `DELETE /api/sellers/:id`
- `POST /api/sellers/:id/toggle-status`
- `GET /api/sellers/:id/products`
- `GET /api/sellers/:id/orders`
- `GET /api/sellers/:id/payouts`
- `GET /api/sellers/:id/stats`

### Products

- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/products/:id/approve`
- `POST /api/products/:id/reject`
- `POST /api/products/:id/stock`
- `GET /api/products/:id/inventory`
- `GET /api/products/low-stock`
- `GET /api/products/pending`

### Orders

- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `POST /api/orders/:id/cancel`
- `GET /api/orders/:id/timeline`
- `GET /api/orders/recent`

### Payouts

- `GET /api/payouts`
- `GET /api/payouts/:id`
- `POST /api/payouts`
- `POST /api/payouts/:id/process`
- `GET /api/payouts/pending`

### Coupons

- `GET /api/coupons`
- `GET /api/coupons/:id`
- `POST /api/coupons`
- `PUT /api/coupons/:id`
- `DELETE /api/coupons/:id`
- `POST /api/coupons/:id/toggle`
- `POST /api/coupons/validate`

### Dashboard

- `GET /api/dashboard/super-admin`
- `GET /api/dashboard/admin`
- `GET /api/dashboard/seller`
- `GET /api/dashboard/charts/revenue`
- `GET /api/dashboard/charts/orders`
- `GET /api/dashboard/charts/categories`
- `GET /api/dashboard/widgets/recent-orders`
- `GET /api/dashboard/widgets/pending-products`
- `GET /api/dashboard/widgets/pending-payouts`
- `GET /api/dashboard/widgets/open-queries`

### Support

- `GET /api/support/pages`
- `GET /api/support/pages/:slug`
- `PUT /api/support/pages/:slug`
- `GET /api/support/faqs`
- `GET /api/support/faqs/:id`
- `POST /api/support/faqs`
- `PUT /api/support/faqs/:id`
- `DELETE /api/support/faqs/:id`
- `GET /api/support/settings`
- `PUT /api/support/settings`

## Project structure

```
backend/
  prisma/
    schema.prisma
    seed.js
  src/
    config/
    controllers/
    middlewares/
    routes/
    serializers/
    utils/
    app.js
    server.js
```

## Frontend note (important)

The frontend currently has `USE_MOCK_AUTH = true` inside `app/src/services/api.ts`.
To use this real backend for authentication, set that flag to `false` (or refactor it to an env-based toggle).


