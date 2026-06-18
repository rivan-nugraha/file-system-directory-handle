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

// Static files — serve installer downloads
app.use('/downloads', express.static('public/downloads'));

// Routes
app.use('/api', require('./routes/health'));
app.use('/api/barang', require('./routes/barang'));
app.use('/api/jual', require('./routes/jual'));
app.use('/api/beli', require('./routes/beli'));

// Download page — auto-detect OS
app.get('/download', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isWin = /windows/i.test(userAgent);
  const isMac = /macintosh|mac os x/i.test(userAgent);
  const isLinux = /linux/i.test(userAgent);

  let downloadUrl = '/downloads/';
  let osLabel = '';

  if (isWin) {
    downloadUrl += 'POS-Setup.exe';
    osLabel = 'Windows';
  } else if (isMac) {
    downloadUrl += 'POS.dmg';
    osLabel = 'macOS';
  } else if (isLinux) {
    downloadUrl += 'POS.AppImage';
    osLabel = 'Linux';
  } else {
    downloadUrl = null;
  }

  res.json({
    title: 'Download POS Desktop App',
    description: 'Aplikasi Point of Sale offline-ready untuk desktop.',
    autoDetected: osLabel || 'Tidak terdeteksi',
    downloadUrl: downloadUrl
      ? `${req.protocol}://${req.get('host')}${downloadUrl}`
      : null,
    allDownloads: {
      windows: `${req.protocol}://${req.get('host')}/downloads/POS-Setup.exe`,
      macos: `${req.protocol}://${req.get('host')}/downloads/POS.dmg`,
      linux: `${req.protocol}://${req.get('host')}/downloads/POS.AppImage`,
    },
  });
});

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
