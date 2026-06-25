const express = require('express');
const cors = require('cors');
require('dotenv').config();

const productsRouter = require('./routes/products');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves the frontend files from public/

app.use('/products', productsRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
