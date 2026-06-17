const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

  res.json({
    status: 'ok',
    message: 'POS Backend is running',
    database: dbStates[dbState] || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
