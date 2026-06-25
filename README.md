# ⚡ High-Performance Products Catalog API & Dashboard

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Neon](https://img.shields.io/badge/Neon-00e599?style=flat&logo=neon&logoColor=black)](https://neon.tech/)
[![Render](https://img.shields.io/badge/Render-46E3B7?style=flat&logo=render&logoColor=white)](https://render.com/)

A product-browsing REST API and single-page dashboard serving **200,000 products** with stable, high-performance **cursor-based pagination**. Built to satisfy two production constraints:
1. **Pagination Speed**: Remains constant ($O(\log n)$ index seek) regardless of how deep a user scrolls.
2. **Consistency**: Prevents duplicated or skipped records when products are added or deleted during active browsing.

---

## 🌟 Live Demo & Preview

* **API Base URL**: `https://codevector-assignment-esrq.onrender.com/`
* **Dashboard Front-end**: Served statically from root `/` on the live instance.
* **Database Size**: `200,000` rows of realistic mock data.

---

## 📐 Architecture & Logic

### Why Cursor-Based Seek instead of `OFFSET`?

#### 1. The Bottleneck of `OFFSET`
In standard offset pagination:
```sql
SELECT * FROM products ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 10000;
```
Postgres cannot jump directly to row `10,000`. It must scan through `10,020` records, throw away the first `10,000`, and return the last `20`. On 200,000 rows, queries on deep pages trigger full table scans, taking hundreds of milliseconds and hogging server memory.

#### 2. The Data Shifting Bug
If 10 new products are inserted while a user is reading Page 1, all existing products are shifted back. When the user requests Page 2 (`OFFSET 20`), the last 10 products from Page 1 are shifted into Page 2, causing the user to see duplicates. If rows are deleted, pages shift forward, causing the user to miss items entirely.

---

### The Cursor Solution
Instead of a row offset number, we pass an **opaque cursor** representing the bookmark of the last-seen item (`created_at` timestamp and `id` tiebreaker).

```sql
SELECT * FROM products
WHERE (created_at, id) < ('2026-06-25 10:30:00', 'uuid-of-last-item')
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

#### How it works:
1. **Row Comparison**: `(created_at, id) < ($2, $3)` is a clean PostgreSQL shorthand for:
   `WHERE created_at < $2 OR (created_at = $2 AND id < $3)`
2. **Index Seek**: PostgreSQL uses the B-Tree composite index `(created_at DESC, id DESC)` to skip directly to the target record. This operation is $O(\log n)$ instead of $O(n)$ scan.
3. **Immutability**: Since pagination is anchored to a specific row value, new records inserted at the top do not shift the cursor's absolute location. No duplicates, no skipped items.
4. **ID Tiebreaker**: Because timestamps (`created_at`) might match (e.g. multi-row seeding or bulk operations), we sort and filter by `id` as a second criteria to keep the ordering stable.

---

## 💾 Database Schema & Indexes

Our table and index schema are optimized for fast seek operations and filtering:

```sql
-- Main Products Table
CREATE TABLE products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  price       NUMERIC(10, 2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index 1: Fast pagination seek without category filter
CREATE INDEX idx_products_cursor ON products (created_at DESC, id DESC);

-- Index 2: Fast filtering by category
CREATE INDEX idx_products_category ON products (category);

-- Index 3: Optimized compound index to filter by category and paginate in a single step
CREATE INDEX idx_products_category_cursor ON products (category, created_at DESC, id DESC);
```

---

## 🛠️ Local Setup Guide

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+ recommended, v22 used)
* A PostgreSQL Database (Neon serverless database recommended)

### 1. Clone & Install
```bash
git clone https://github.com/mehulpal12/codeVector-assignment.git
cd codeVector-assignment
npm install
```

### 2. Configure Environment variables
Create a `.env` file in the root directory:
```env
PORT=3000
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
```

> 💡 **Mock Database Fallback**: If you set `DATABASE_URL=mock` or leave it empty, the application automatically boots up using a file-based JSON database fallback (`mock-products.json`). This lets you test the app immediately without a live PostgreSQL instance.

### 3. Seed the Database
Run the seed script to automatically run database DDL setup (tables and indexes) and batch insert 200,000 rows in seconds:
```bash
npm run seed
```

### 4. Start the Application
Start the development server with hot-reload (nodemon):
```bash
npm run dev
```
Open `http://localhost:3000` in your web browser to view the interactive dashboard.

---

## 📡 API Endpoints Documentation

### 1. `GET /products`
Fetches a list of products, sorted newest first. Supports pagination and category filtering.

#### Query Parameters:
* `limit` (Integer, Optional, Default: `20`, Max: `100`): Items per page.
* `category` (String, Optional): Filter by exact category.
* `cursor` (String, Optional): Base64-encoded cursor returned from the previous page's `pagination.next_cursor`.

#### Example Request:
```bash
curl -s "http://localhost:3000/products?limit=2&category=Electronics"
```

#### Example Response:
```json
{
  "products": [
    {
      "id": "2d8f99e4-e0e6-42d4-9d54-8c887cd1b00e",
      "name": "Product 105 - Electronics",
      "category": "Electronics",
      "price": "439.50",
      "created_at": "2026-06-25T10:14:02.120Z",
      "updated_at": "2026-06-25T10:14:02.120Z"
    },
    {
      "id": "e932b13c-74a6-4449-b0cc-a0ffcd0b2d6a",
      "name": "Product 101 - Electronics",
      "category": "Electronics",
      "price": "1299.99",
      "created_at": "2026-06-25T10:10:15.405Z",
      "updated_at": "2026-06-25T10:10:15.405Z"
    }
  ],
  "pagination": {
    "has_next": true,
    "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0wNi0yNVQxMDoxMDoxNS40MDVaIiwiaWQiOiJlOTMyYjEzYy03NGE2LTQ0NDktYjBjYy1hMGZmY2QwYjJkNmEifQ==",
    "limit": 2
  },
  "stats": {
    "query_time_ms": 2
  }
}
```

---

### 2. `GET /products/categories`
Retrieves a list of all distinct product categories.

#### Example Request:
```bash
curl -s "http://localhost:3000/products/categories"
```

#### Example Response:
```json
{
  "categories": [
    "Automotive",
    "Books",
    "Clothing",
    "Electronics",
    "Food",
    "Health",
    "Home & Garden",
    "Office",
    "Sports",
    "Toys"
  ]
}
```

---

## 🖥️ Client Dashboard UI

A dashboard is built into the frontend directory (`public/`) serving:
- **Product Cards**: Sleek animations showing details, tags, and prices.
- **Copyable UUIDs**: Quick buttons to copy product IDs.
- **Bi-directional Navigation**: Prev/Next buttons utilizing a client-side stack to support backwards traversal.
- **Live Speed Stats**: Monitors execution latency directly from the API.

---

## 🚀 Deploy to Render

1. Create a new **Web Service** on **Render.com**.
2. Connect your GitHub repository.
3. Configure the settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Go to **Environment** settings and add the environment variables:
   - `DATABASE_URL`: *Your Neon connection string*
   - `PORT`: `3000`
5. Click **Deploy**.
