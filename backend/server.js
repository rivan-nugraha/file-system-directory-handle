require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { initSocket, emitBackendStatus } = require('./socket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// Routes
app.use('/api', require('./routes/health'));
app.use('/api/barang', require('./routes/barang'));
app.use('/api/jual', require('./routes/jual'));
app.use('/api/beli', require('./routes/beli'));

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'POS Backend API',
    endpoints: {
      barang: '/api/barang',
      jual: '/api/jual',
      beli: '/api/beli',
      health: '/api/health',
    },
  });
});

// Start server
connectDB().then(() => {
  initSocket(server);
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    emitBackendStatus();
  });
});
