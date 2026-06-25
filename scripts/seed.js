const pool = require('../src/db');
const { v4: uuidv4 } = require('uuid');

const CATEGORIES = [
  'Electronics', 'Clothing', 'Books', 'Home & Garden',
  'Sports', 'Toys', 'Automotive', 'Health', 'Food', 'Office'
];

const TOTAL = 200_000;
const BATCH_SIZE = 1000; // rows per INSERT statement

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomDateInPastYear() {
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  return new Date(randomBetween(oneYearAgo, now)).toISOString();
}

async function ensureSchema() {
  if (pool.isMock) {
    console.log('Mock database mode: skipping physical table and index creation.');
    return;
  }
  
  console.log('Ensuring database schema and indexes exist...');
  
  // Create table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT        NOT NULL,
      category    TEXT        NOT NULL,
      price       NUMERIC(10, 2) NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('  Table "products" is ready.');
  
  // Create indexes if they don't exist
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_products_cursor ON products (created_at DESC, id DESC);
  `);
  console.log('  Index "idx_products_cursor" is ready.');
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
  `);
  console.log('  Index "idx_products_category" is ready.');
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_products_category_cursor ON products (category, created_at DESC, id DESC);
  `);
  console.log('  Index "idx_products_category_cursor" is ready.');
}

async function seed() {
  // First, ensure tables and indexes are ready if running on a real DB
  await ensureSchema();
  
  // In mock mode, we want to clear any existing products before seeding a fresh batch
  if (pool.isMock) {
    global.mockProducts = [];
  } else {
    // Optional: Clear existing products in real DB? 
    // Usually it's better to let the user decide, but since this is a seed script for a clean run,
    // let's truncate the table.
    console.log('Truncating products table for clean seed...');
    await pool.query('TRUNCATE TABLE products');
  }

  console.log(`Seeding ${TOTAL} products in batches of ${BATCH_SIZE}...`);
  const start = Date.now();

  for (let offset = 0; offset < TOTAL; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, TOTAL - offset);
    const values = [];
    const placeholders = [];

    for (let i = 0; i < batchCount; i++) {
      const idx = offset + i;
      const category = CATEGORIES[idx % CATEGORIES.length];
      const price = randomBetween(1, 10000).toFixed(2);
      const createdAt = randomDateInPastYear();
      const name = `Product ${idx + 1} - ${category}`;

      // Parameterized to prevent injection and allow pg to batch efficiently
      const base = i * 6; // 6 parameters per row
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
      );
      values.push(uuidv4(), name, category, price, createdAt, createdAt);
    }

    await pool.query(
      `INSERT INTO products (id, name, category, price, created_at, updated_at)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    if ((offset / BATCH_SIZE) % 20 === 0) {
      console.log(`  Processed ${offset + batchCount} / ${TOTAL} products`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done. Seeded ${TOTAL} products in ${elapsed}s.`);
  await pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
