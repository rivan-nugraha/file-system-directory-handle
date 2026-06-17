import { io } from 'socket.io-client';

let socket;

function resolveSocketUrl() {
  if (import.meta.env.DEV) {
    return window.location.origin;
  }

  return import.meta.env.VITE_API_SOCKET_URL || window.location.origin;
}

export function getBackendSocket() {
  if (socket) return socket;

  socket = io(resolveSocketUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return socket;
}

export function subscribeBackendSocket(handlers = {}) {
  const activeSocket = getBackendSocket();
  const {
    onConnect,
    onDisconnect,
    onBackendStatus,
    onJualAccepted,
  } = handlers;

  if (onConnect) activeSocket.on('connect', onConnect);
  if (onDisconnect) activeSocket.on('disconnect', onDisconnect);
  if (onBackendStatus) activeSocket.on('backend:status', onBackendStatus);
  if (onJualAccepted) activeSocket.on('sync:jual:accepted', onJualAccepted);

  return () => {
    if (onConnect) activeSocket.off('connect', onConnect);
    if (onDisconnect) activeSocket.off('disconnect', onDisconnect);
    if (onBackendStatus) activeSocket.off('backend:status', onBackendStatus);
    if (onJualAccepted) activeSocket.off('sync:jual:accepted', onJualAccepted);
  };
}
