const { Server } = require('socket.io');
const mongoose = require('mongoose');

let ioInstance = null;
let statusInterval = null;

function currentBackendStatus() {
  const dbState = mongoose.connection.readyState;
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

  return {
    backendReachable: true,
    database: dbStates[dbState] || 'unknown',
    timestamp: new Date().toISOString(),
  };
}

function emitBackendStatus() {
  if (!ioInstance) return;
  ioInstance.emit('backend:status', currentBackendStatus());
}

function initSocket(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  ioInstance.on('connection', (socket) => {
    socket.emit('backend:status', currentBackendStatus());
  });

  if (statusInterval) clearInterval(statusInterval);
  statusInterval = setInterval(emitBackendStatus, 5000);

  return ioInstance;
}

function getIO() {
  return ioInstance;
}

function emitSyncEvent(eventName, payload) {
  if (!ioInstance) return;
  ioInstance.emit(eventName, payload);
}

module.exports = {
  initSocket,
  getIO,
  emitBackendStatus,
  emitSyncEvent,
};
