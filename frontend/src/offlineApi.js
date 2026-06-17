/**
 * offlineApi.js — Axios instance with offline support berbasis OPFS.
 *
 * Strategy:
 *   - GET  → local-first (OPFS), fallback network saat online
 *   - POST/PUT/DELETE offline → queue di OPFS → auto-sync saat online
 */
import axios from 'axios';
import {
  cacheApiResponse,
  getCachedApiResponse,
  addToWriteQueue,
  getWriteQueue,
  removeFromWriteQueue,
  getQueueCount,
} from './localFs';
import {
  saveBarang,
  loadBarang,
  saveJual,
  loadJual,
  saveBeli,
  loadBeli,
} from './localFs';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL: API_BASE });

let isOnline = navigator.onLine;
let backendReachable = true;
let syncing = false;
const onlineListeners = new Set();
const queueListeners = new Set();

async function notifyQueueListeners() {
  const count = await getQueueCount();
  queueListeners.forEach((fn) => fn(count));
}

export function onQueueChange(fn) {
  queueListeners.add(fn);
  getQueueCount().then(fn).catch(() => fn(0));
  return () => queueListeners.delete(fn);
}

export function onOnlineChange(fn) {
  onlineListeners.add(fn);
  fn(isOnline);
  return () => onlineListeners.delete(fn);
}

export function setBackendReachable(value) {
  backendReachable = Boolean(value);
}

export function getBackendReachable() {
  return backendReachable;
}

function notifyOnlineListeners() {
  onlineListeners.forEach((fn) => fn(isOnline));
}

window.addEventListener('online', () => {
  isOnline = true;
  notifyOnlineListeners();
  syncWriteQueue();
});

window.addEventListener('offline', () => {
  isOnline = false;
  notifyOnlineListeners();
});

const LOCAL_FS_MAP = {
  '/barang': { save: saveBarang, load: loadBarang },
  '/jual': { save: saveJual, load: loadJual },
  '/beli': { save: saveBeli, load: loadBeli },
};

function matchLocalFs(url) {
  for (const key of Object.keys(LOCAL_FS_MAP)) {
    if (url === key || url.startsWith(key + '?')) {
      return LOCAL_FS_MAP[key];
    }
  }
  return null;
}

function shouldSkipOfflineCache(config) {
  return Boolean(
    config?._skipLocal ||
    config?.noOfflineCache ||
    config?.noOfflineFallback ||
    config?.url === '/health'
  );
}

api.interceptors.request.use(async (config) => {
  if (config.method !== 'get' || !config.url || shouldSkipOfflineCache(config)) return config;

  const mapper = matchLocalFs(config.url);
  if (!mapper) return config;

  try {
    const localData = await mapper.load();
    if (localData && Array.isArray(localData) && localData.length > 0) {
      config.adapter = () => Promise.resolve({
        data: { total: localData.length, page: 1, limit: 999, data: localData },
        status: 200,
        statusText: 'OK (local)',
        headers: {},
        config,
        fromLocalFs: true,
      });
      return config;
    }
  } catch {
    // ignore
  }

  try {
    const cached = await getCachedApiResponse(buildCacheKey(config));
    if (cached) {
      config.adapter = () => Promise.resolve({
        data: cached,
        status: 200,
        statusText: 'OK (cache)',
        headers: {},
        config,
        fromCache: true,
      });
      return config;
    }
  } catch {
    // ignore
  }

  if (!navigator.onLine) {
    config.adapter = () => Promise.resolve({
      data: { total: 0, page: 1, limit: 50, data: [] },
      status: 200,
      statusText: 'OK (empty offline)',
      headers: {},
      config,
      fromEmpty: true,
    });
    return config;
  }

  return config;
});

api.interceptors.response.use(
  async (response) => {
    const { config } = response;
    if (
      config.method === 'get' &&
      config.url &&
      response.status < 400 &&
      !response.fromLocalFs &&
      !shouldSkipOfflineCache(config)
    ) {
      await cacheApiResponse(buildCacheKey(config), response.data);
      const mapper = matchLocalFs(config.url);
      if (mapper && response.data?.data) {
        try {
          const saved = await mapper.save(response.data.data);
          if (!saved) {
            console.warn('[offline] Gagal menyimpan data ke storage lokal untuk', config.url);
          }
        } catch {
          console.warn('[offline] Exception saat menyimpan data ke storage lokal untuk', config.url);
        }
      }
    }
    return response;
  },
  async (error) => {
    const { config } = error;

    if (config?.method === 'get' && config.url && !shouldSkipOfflineCache(config)) {
      const mapper = matchLocalFs(config.url);

      if (mapper) {
        try {
          const localData = await mapper.load();
          if (localData && Array.isArray(localData) && localData.length > 0) {
            return Promise.resolve({
              ...error,
              config,
              data: { total: localData.length, page: 1, limit: 999, data: localData },
              status: 200,
              statusText: 'OK (local)',
              headers: {},
              fromLocalFs: true,
            });
          }
        } catch {
          // ignore
        }
      }

      try {
        const cached = await getCachedApiResponse(buildCacheKey(config));
        if (cached) {
          return Promise.resolve({
            ...error,
            config,
            data: cached,
            status: 200,
            statusText: 'OK (cache)',
            headers: {},
            fromCache: true,
          });
        }
      } catch {
        // ignore
      }

      if (config.url.includes('/barang') || config.url.includes('/jual') || config.url.includes('/beli')) {
        return Promise.resolve({
          ...error,
          config,
          data: { total: 0, page: 1, limit: 50, data: [] },
          status: 200,
          statusText: 'OK (empty)',
          headers: {},
          fromEmpty: true,
        });
      }
    }

    return Promise.reject(error);
  }
);

function buildCacheKey(config) {
  const params = config.params
    ? '?' + new URLSearchParams(config.params).toString()
    : '';
  return `${config.method}:${config.url}${params}`;
}

export async function syncWriteQueue() {
  if (!isOnline || !backendReachable || syncing) return;

  syncing = true;
  const queue = await getWriteQueue();

  if (queue.length === 0) {
    syncing = false;
    await notifyQueueListeners();
    return;
  }

  for (const op of queue) {
    try {
      await axios({ method: op.method, url: op.url, data: op.data, baseURL: API_BASE });
      await removeFromWriteQueue(op.id);
      await notifyQueueListeners();
    } catch {
      break;
    }
  }

  const remainingQueue = await getWriteQueue();
  if (remainingQueue.length === 0) {
    await refreshCoreDataFromServer();
  }

  syncing = false;
}

async function refreshCoreDataFromServer() {
  try {
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
  } catch {
    // ignore background refresh failures
  }
}

const originalPost = api.post.bind(api);
const originalPut = api.put.bind(api);
const originalDelete = api.delete.bind(api);

function isOfflineOrNetworkError(err) {
  if (!navigator.onLine) return true;
  if (!backendReachable) return true;
  if (!err) return false;
  if (err.message?.startsWith('OFFLINE_QUEUED')) return true;
  if (err.code === 'ERR_NETWORK') return true;
  if (!err.response) return true;
  return false;
}

api.post = async function (url, data, config) {
  await saveToLocalFs('post', url, data);
  try {
    if (!isOnline) throw new Error('OFFLINE_QUEUED');
    return await originalPost(url, data, config);
  } catch (err) {
    if (!isOfflineOrNetworkError(err)) {
      throw err;
    }

    await addToWriteQueue({ method: 'post', url, data: JSON.parse(JSON.stringify(data)) });
    await notifyQueueListeners();
    throw new Error('OFFLINE_QUEUED');
  }
};

api.put = async function (url, data, config) {
  await saveToLocalFs('put', url, data);
  try {
    if (!isOnline) throw new Error('OFFLINE_QUEUED');
    return await originalPut(url, data, config);
  } catch (err) {
    if (!isOfflineOrNetworkError(err)) {
      throw err;
    }

    await addToWriteQueue({ method: 'put', url, data: JSON.parse(JSON.stringify(data)) });
    await notifyQueueListeners();
    throw new Error('OFFLINE_QUEUED');
  }
};

api.delete = async function (url, config) {
  await removeFromLocalFs(url);
  try {
    if (!isOnline) throw new Error('OFFLINE_QUEUED');
    return await originalDelete(url, config);
  } catch (err) {
    if (!isOfflineOrNetworkError(err)) {
      throw err;
    }

    await addToWriteQueue({ method: 'delete', url, data: null });
    await notifyQueueListeners();
    throw new Error('OFFLINE_QUEUED');
  }
};

async function saveToLocalFs(method, url, data) {
  const mapper = matchLocalFs(url);
  if (!mapper || !data) return;

  try {
    const existing = (await mapper.load()) || [];

    if (method === 'post' && url === '/barang' && data.nama) {
      const newItem = { ...data, _id: `local_${Date.now()}`, _local: true };
      existing.unshift(newItem);
      await mapper.save(existing);
      return;
    }

    if (method === 'post' && url === '/jual' && Array.isArray(data.items)) {
      const barangExisting = (await loadBarang()) || [];
      const itemsPopulated = data.items.map((item) => {
        const barang = barangExisting.find((entry) => entry._id === item.barang);
        return {
          barang: item.barang,
          nama: barang?.nama || 'Barang lokal',
          kode: barang?.kode || '-',
          qty: item.qty,
          harga: barang?.harga_jual || 0,
          subtotal: (barang?.harga_jual || 0) * item.qty,
        };
      });

      const total = itemsPopulated.reduce((sum, item) => sum + item.subtotal, 0);
      const localTransaksi = {
        _id: `local_jual_${Date.now()}`,
        _local: true,
        no_transaksi: `OFF-JUL-${Date.now()}`,
        tanggal: new Date().toISOString(),
        items: itemsPopulated,
        total,
        keterangan: data.keterangan || '',
      };

      const updatedBarang = barangExisting.map((barang) => {
        const foundItem = data.items.find((item) => item.barang === barang._id);
        if (!foundItem) return barang;
        return {
          ...barang,
          stok: Math.max(0, Number(barang.stok || 0) - Number(foundItem.qty || 0)),
        };
      });

      existing.unshift(localTransaksi);
      await mapper.save(existing);
      await saveBarang(updatedBarang);
      return;
    }

    if (method === 'post' && url === '/beli' && Array.isArray(data.items)) {
      const barangExisting = (await loadBarang()) || [];
      const itemsPopulated = data.items.map((item) => {
        const barang = barangExisting.find((entry) => entry._id === item.barang);
        return {
          barang: item.barang,
          nama: barang?.nama || 'Barang lokal',
          kode: barang?.kode || '-',
          qty: item.qty,
          harga: item.harga,
          subtotal: Number(item.harga || 0) * Number(item.qty || 0),
        };
      });

      const total = itemsPopulated.reduce((sum, item) => sum + item.subtotal, 0);
      const localTransaksi = {
        _id: `local_beli_${Date.now()}`,
        _local: true,
        no_transaksi: `OFF-BEL-${Date.now()}`,
        tanggal: new Date().toISOString(),
        supplier: data.supplier || '',
        items: itemsPopulated,
        total,
        keterangan: data.keterangan || '',
      };

      const updatedBarang = barangExisting.map((barang) => {
        const foundItem = data.items.find((item) => item.barang === barang._id);
        if (!foundItem) return barang;
        return {
          ...barang,
          stok: Number(barang.stok || 0) + Number(foundItem.qty || 0),
          harga_beli: Number(foundItem.harga || barang.harga_beli || 0),
        };
      });

      existing.unshift(localTransaksi);
      await mapper.save(existing);
      await saveBarang(updatedBarang);
      return;
    }

    if (method === 'put') {
      const id = extractId(url);
      if (!id) return;

      const idx = existing.findIndex((item) => item._id === id);
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...data };
        await mapper.save(existing);
      }
    }
  } catch {
    // ignore
  }
}

async function removeFromLocalFs(url) {
  const mapper = matchLocalFs(url);
  if (!mapper) return;

  try {
    const existing = (await mapper.load()) || [];
    const id = extractId(url);
    if (!id) return;

    if (url.startsWith('/jual/')) {
      const transaksi = existing.find((item) => item._id === id);
      if (transaksi) {
        const barangExisting = (await loadBarang()) || [];
        const updatedBarang = barangExisting.map((barang) => {
          const foundItem = transaksi.items?.find((item) => item.barang === barang._id);
          if (!foundItem) return barang;
          return {
            ...barang,
            stok: Number(barang.stok || 0) + Number(foundItem.qty || 0),
          };
        });
        await saveBarang(updatedBarang);
      }
    }

    if (url.startsWith('/beli/')) {
      const transaksi = existing.find((item) => item._id === id);
      if (transaksi) {
        const barangExisting = (await loadBarang()) || [];
        const updatedBarang = barangExisting.map((barang) => {
          const foundItem = transaksi.items?.find((item) => item.barang === barang._id);
          if (!foundItem) return barang;
          return {
            ...barang,
            stok: Math.max(0, Number(barang.stok || 0) - Number(foundItem.qty || 0)),
          };
        });
        await saveBarang(updatedBarang);
      }
    }

    const filtered = existing.filter((item) => item._id !== id);
    await mapper.save(filtered);
  } catch {
    // ignore
  }
}

function extractId(url) {
  const parts = url.split('/');
  const last = parts[parts.length - 1];
  if (last && !last.includes('?') && last.length > 5) {
    return last;
  }
  return null;
}

export function getOnlineStatus() {
  return isOnline;
}

export default api;
