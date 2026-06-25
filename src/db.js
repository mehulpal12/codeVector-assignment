const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const isMock = process.env.DATABASE_URL === 'mock' || !process.env.DATABASE_URL;
const MOCK_FILE_PATH = path.join(__dirname, '..', 'mock-products.json');

let pool;

if (!isMock) {
  const connectionString = process.env.DATABASE_URL;
  const isNeon = connectionString.includes('neon.tech');
  
  pool = new Pool({
    connectionString,
    ssl: isNeon ? { rejectUnauthorized: false } : false
  });
} else {
  console.log('⚠️ DATABASE_URL is set to "mock" or is empty. Using persistent JSON mock database.');
  
  // Load mock data on demand
  const loadMockData = () => {
    if (global.mockProducts) return global.mockProducts;
    
    if (fs.existsSync(MOCK_FILE_PATH)) {
      try {
        console.log('Loading mock database from file...');
        const raw = fs.readFileSync(MOCK_FILE_PATH, 'utf8');
        global.mockProducts = JSON.parse(raw);
        console.log(`Loaded ${global.mockProducts.length} mock products.`);
      } catch (err) {
        console.error('Failed to read mock file, initializing empty array:', err);
        global.mockProducts = [];
      }
    } else {
      global.mockProducts = [];
    }
    return global.mockProducts;
  };

  pool = {
    isMock: true,
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      const products = loadMockData();
      
      // 1. Categories query: SELECT DISTINCT category FROM products ORDER BY category
      if (sql.includes('SELECT DISTINCT category FROM products')) {
        const categories = [...new Set(products.map(p => p.category))].sort();
        return {
          rows: categories.map(cat => ({ category: cat }))
        };
      }
      
      // 2. Insert query (seeding): INSERT INTO products (id, name, category, price, created_at, updated_at) VALUES ...
      if (sql.startsWith('INSERT INTO products')) {
        // We support 6 parameters: id, name, category, price, created_at, updated_at
        const numFields = 6;
        const rowCount = params.length / numFields;
        for (let i = 0; i < rowCount; i++) {
          const baseIndex = i * numFields;
          products.push({
            id: params[baseIndex],
            name: params[baseIndex + 1],
            category: params[baseIndex + 2],
            price: params[baseIndex + 3],
            created_at: new Date(params[baseIndex + 4]).toISOString(),
            updated_at: new Date(params[baseIndex + 5]).toISOString()
          });
        }
        return { rowCount };
      }
      
      // 3. Products retrieval query
      if (sql.includes('FROM products')) {
        let list = [...products];
        
        // LIMIT is always parameter $1
        const limit = params[0];
        
        let category = null;
        let cursorTime = null;
        let cursorId = null;
        
        const hasCategoryFilter = sql.includes('category =');
        const hasCursorFilter = sql.includes('(created_at, id) <');
        
        if (hasCategoryFilter && hasCursorFilter) {
          cursorTime = params[1];
          cursorId = params[2];
          category = params[3];
        } else if (hasCursorFilter) {
          cursorTime = params[1];
          cursorId = params[2];
        } else if (hasCategoryFilter) {
          category = params[1];
        }
        
        // Filter by category
        if (category) {
          list = list.filter(p => p.category === category);
        }
        
        // Sort: created_at DESC, id DESC
        list.sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          if (timeB !== timeA) {
            return timeB - timeA;
          }
          return b.id.localeCompare(a.id);
        });
        
        // Filter by cursor: (created_at, id) < (cursorTime, cursorId)
        if (cursorTime && cursorId) {
          const cutTime = new Date(cursorTime).getTime();
          const cutId = cursorId;
          
          list = list.filter(p => {
            const pTime = new Date(p.created_at).getTime();
            if (pTime < cutTime) return true;
            if (pTime === cutTime) {
              return p.id.localeCompare(cutId) < 0;
            }
            return false;
          });
        }
        
        // Slice to limit
        const sliced = list.slice(0, limit);
        return {
          rows: sliced
        };
      }
      
      throw new Error(`Mock DB does not support this query: ${text}`);
    },
    async end() {
      if (global.mockProducts && global.mockProducts.length > 0) {
        console.log('Saving mock database to file...');
        try {
          fs.writeFileSync(MOCK_FILE_PATH, JSON.stringify(global.mockProducts), 'utf8');
          console.log(`Saved ${global.mockProducts.length} mock products to ${MOCK_FILE_PATH}`);
        } catch (err) {
          console.error('Failed to save mock data to file:', err);
        }
      }
    }
  };
}

module.exports = pool;
