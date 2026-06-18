import axios from 'axios';
import {
  initStorage,
  isOpfsSupported,
  saveBarang,
  saveJual,
  saveBeli,
} from './localFs';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const OFFLINE_PREP_VERSION = 'v1';
const OFFLINE_PREP_KEY = `pos-offline-ready:${OFFLINE_PREP_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
  '/barang',
  '/jual',
  '/beli',
];

function canUseCacheStorage() {
  return 'caches' in window;
}

export function getOfflineReadyInfo() {
  try {
    return {
      ready: localStorage.getItem(OFFLINE_PREP_KEY) === 'true',
      version: OFFLINE_PREP_VERSION,
    };
  } catch {
    return {
      ready: false,
      version: OFFLINE_PREP_VERSION,
    };
  }
}

function markOfflineReady(value) {
  try {
    if (value) {
      localStorage.setItem(OFFLINE_PREP_KEY, 'true');
    } else {
      localStorage.removeItem(OFFLINE_PREP_KEY);
    }
  } catch {
    // ignore
  }
}

async function cacheStaticAssets() {
  if (!canUseCacheStorage()) return;

  const cache = await caches.open(`pos-manual-offline-${OFFLINE_PREP_VERSION}`);
  await cache.addAll(STATIC_ASSETS);
}

async function preloadCoreData() {
  const [barangRes, jualRes, beliRes] = await Promise.all([
    axios.get('/barang', { baseURL: API_BASE, params: { limit: 999 } }),
    axios.get('/jual', { baseURL: API_BASE, params: { limit: 999 } }),
    axios.get('/beli', { baseURL: API_BASE, params: { limit: 999 } }),
  ]);

  await Promise.all([
    saveBarang(barangRes.data?.data || []),
    saveJual(jualRes.data?.data || []),
    saveBeli(beliRes.data?.data || []),
  ]);
}

export async function prepareOfflineMode() {
  if (!navigator.onLine) {
    throw new Error('Persiapan offline harus dijalankan saat internet dan backend sedang aktif.');
  }

  if (!window.isSecureContext) {
    throw new Error('Mode offline butuh secure context. Buka app dari localhost atau HTTPS.');
  }

  if (!isOpfsSupported()) {
    throw new Error('OPFS tidak tersedia di browser ini.');
  }

  const ready = await initStorage();
  if (!ready) {
    throw new Error('Storage offline belum siap.');
  }

  await cacheStaticAssets();
  await preloadCoreData();
  markOfflineReady(true);

  return {
    ready: true,
    version: OFFLINE_PREP_VERSION,
  };
}

export function resetOfflineReadyFlag() {
  markOfflineReady(false);
}
