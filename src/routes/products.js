const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /products?limit=20&cursor=xxx&category=Electronics
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const category = req.query.category || null;

    // The cursor encodes the last item the client saw.
    // It's a base64-encoded JSON: { created_at, id }
    let cursorData = null;
    if (req.query.cursor) {
      try {
        cursorData = JSON.parse(
          Buffer.from(req.query.cursor, 'base64').toString('utf8')
        );
      } catch {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
    }

    // Build query dynamically depending on whether we have a cursor and/or category.
    let query;
    let params;
    const queryStart = Date.now();

    if (!cursorData && !category) {
      // First page, no filter
      query = `
        SELECT id, name, category, price, created_at, updated_at
        FROM products
        ORDER BY created_at DESC, id DESC
        LIMIT $1
      `;
      params = [limit + 1]; // fetch one extra to know if there's a next page
    } else if (!cursorData && category) {
      // First page, with category filter
      query = `
        SELECT id, name, category, price, created_at, updated_at
        FROM products
        WHERE category = $2
        ORDER BY created_at DESC, id DESC
        LIMIT $1
      `;
      params = [limit + 1, category];
    } else if (cursorData && !category) {
      // Subsequent page, no filter
      query = `
        SELECT id, name, category, price, created_at, updated_at
        FROM products
        WHERE (created_at, id) < ($2, $3)
        ORDER BY created_at DESC, id DESC
        LIMIT $1
      `;
      params = [limit + 1, cursorData.created_at, cursorData.id];
    } else {
      // Subsequent page, with category filter
      query = `
        SELECT id, name, category, price, created_at, updated_at
        FROM products
        WHERE category = $4
          AND (created_at, id) < ($2, $3)
        ORDER BY created_at DESC, id DESC
        LIMIT $1
      `;
      params = [limit + 1, cursorData.created_at, cursorData.id, category];
    }

    const result = await db.query(query, params);
    const rows = result.rows;
    const queryTimeMs = Date.now() - queryStart;

    // If we got limit+1 rows back, there is a next page.
    const hasNext = rows.length > limit;
    const products = hasNext ? rows.slice(0, limit) : rows;

    // Build the next cursor from the last item we're returning
    let nextCursor = null;
    if (hasNext) {
      const last = products[products.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ created_at: last.created_at, id: last.id })
      ).toString('base64');
    }

    res.json({
      products,
      pagination: {
        has_next: hasNext,
        next_cursor: nextCursor,
        limit,
      },
      stats: {
        query_time_ms: queryTimeMs
      }
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /products/categories — return all distinct categories
router.get('/categories', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT DISTINCT category FROM products ORDER BY category'
    );
    res.json({ categories: result.rows.map(r => r.category) });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
