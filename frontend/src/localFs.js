/**
 * localFs.js — Penyimpanan hybrid: OPFS (default zero-click) + File System Access (opsional).
 *
 * Default:
 *   - OPFS — zero-click, selalu tersedia, tidak perlu izin user.
 *
 * Opsional:
 *   - User bisa pilih folder sendiri via showDirectoryPicker().
 *   - Folder kustom menggantikan OPFS jika dipilih.
 *   - Handle folder kustom dipersist di IndexedDB.
 *
 * Semua data disimpan sebagai file JSON di folder "POS-Offline".
 */

const APP_DIR_NAME = 'POS-Offline';
const API_CACHE_FILE = 'api-cache.json';
const WRITE_QUEUE_FILE = 'write-queue.json';
const IDB_DB_NAME = 'pos-fs-handle';
const IDB_STORE_NAME = 'handles';
const STORAGE_MODE_KEY = 'pos-storage-mode'; // 'opfs' | 'custom'

let customHandle = null;
const storageListeners = new Set();
let lastStorageError = '';

function notifyStorageListeners() {
  storageListeners.forEach((fn) => fn());
}

export function onStorageChange(fn) {
  storageListeners.add(fn);
  return () => storageListeners.delete(fn);
}

function setLastStorageError(message) {
  const nextMessage = message || '';
  if (lastStorageError === nextMessage) return;
  lastStorageError = nextMessage;
  notifyStorageListeners();
}

function clearLastStorageError() {
  if (!lastStorageError) return;
  lastStorageError = '';
  notifyStorageListeners();
}

async function ensureAppDirectory(rootHandle) {
  if (!rootHandle) return null;
  try {
    const dir = await rootHandle.getDirectoryHandle(APP_DIR_NAME, { create: true });
    clearLastStorageError();
    return dir;
  } catch (err) {
    setLastStorageError(err?.message || `Gagal membuat folder ${APP_DIR_NAME}.`);
    return null;
  }
}

async function getFile(handle, filename, create = true) {
  return await handle.getFileHandle(filename, { create });
}

async function writeJson(handle, filename, data) {
  const fileHandle = await getFile(handle, filename, true);
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function readJson(handle, filename, fallback = null) {
  try {
    const fileHandle = await getFile(handle, filename, false);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// ── OPFS (zero-click default) ───────────────────────────────

async function getOpfsAppDir() {
  try {
    if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
      return null;
    }
    const root = await navigator.storage.getDirectory();
    return await ensureAppDirectory(root);
  } catch {
    return null;
  }
}

// ── Custom folder (File System Access API) ──────────────────

async function getCustomAppDirectory() {
  if (!customHandle) return null;
  try {
    const opts = { mode: 'readwrite' };
    let permission = await customHandle.queryPermission(opts);
    if (permission !== 'granted') {
      permission = await customHandle.requestPermission(opts);
    }
    if (permission !== 'granted') {
      customHandle = null;
      return null;
    }
    return await ensureAppDirectory(customHandle);
  } catch {
    customHandle = null;
    return null;
  }
}

// ── Resolve: custom folder > OPFS ───────────────────────────

async function resolveHandle() {
  // 1. Coba folder kustom (jika user sudah pilih)
  const customDir = await getCustomAppDirectory();
  if (customDir) {
    return { handle: customDir, mode: 'custom', label: `📁 Folder pilihan /${APP_DIR_NAME}` };
  }

  // 2. Fallback ke OPFS (selalu tersedia, zero-click)
  const opfsDir = await getOpfsAppDir();
  if (opfsDir) {
    return { handle: opfsDir, mode: 'opfs', label: `💾 OPFS /${APP_DIR_NAME}` };
  }

  return { handle: null, mode: 'unavailable', label: 'Storage tidak tersedia' };
}

// ── IndexedDB: persist directory handle ─────────────────────

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandleToIdb(handle) {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).put(handle, 'dirHandle');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB tidak tersedia — abaikan
  }
}

async function loadHandleFromIdb() {
  try {
    const db = await openIdb();
    const handle = await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE_NAME, 'readonly')
        .objectStore(IDB_STORE_NAME)
        .get('dirHandle');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle || null;
  } catch {
    return null;
  }
}

async function clearHandleFromIdb() {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).delete('dirHandle');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // abaikan
  }
}

// ── Public API ──────────────────────────────────────────────

function getStorageMode() {
  try { return localStorage.getItem(STORAGE_MODE_KEY) || 'opfs'; } catch { return 'opfs'; }
}

function setStorageMode(mode) {
  try { localStorage.setItem(STORAGE_MODE_KEY, mode); } catch {}
}

/**
 * Inisialisasi storage (dipanggil saat app start).
 * OPFS selalu tersedia → selalu return true.
 * Jika user sebelumnya memilih folder kustom, restore dari IndexedDB.
 */
export async function initStorage() {
  const mode = getStorageMode();

  // Jika user sebelumnya pakai folder kustom, coba restore dari IndexedDB
  if (mode === 'custom') {
    const saved = await loadHandleFromIdb();
    if (saved) {
      try {
        const perm = await saved.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          customHandle = saved;
          await ensureAppDirectory(saved);
        } else {
          // Permission expired — fallback ke OPFS
          setStorageMode('opfs');
        }
      } catch {
        setStorageMode('opfs');
      }
    } else {
      // Handle tidak ditemukan di IndexedDB — fallback ke OPFS
      setStorageMode('opfs');
    }
  }

  const { handle } = await resolveHandle();
  if (!handle) {
    setLastStorageError('OPFS tidak tersedia. Gunakan browser Chromium (Chrome/Edge).');
  } else {
    clearLastStorageError();
  }

  notifyStorageListeners();
  return handle !== null;
}

/**
 * Pilih folder kustom via showDirectoryPicker().
 * Setting disimpan ke localStorage + handle ke IndexedDB —
 * bertahan meskipun hard refresh.
 */
export async function pickFolder() {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('showDirectoryPicker tidak didukung browser ini.');
  }

  const handle = await window.showDirectoryPicker({
    id: 'pos-storage',
    mode: 'readwrite',
    startIn: 'downloads',
  });

  const opts = { mode: 'readwrite' };
  const permission = await handle.requestPermission(opts);
  if (permission !== 'granted') {
    throw new Error('Izin akses folder tidak diberikan.');
  }

  customHandle = handle;
  await ensureAppDirectory(handle);
  await saveHandleToIdb(handle);
  setStorageMode('custom');
  clearLastStorageError();
  notifyStorageListeners();

  return handle;
}

/** Kembali ke OPFS — hapus referensi folder kustom. */
export async function useOpfsStorage() {
  customHandle = null;
  await clearHandleFromIdb();
  setStorageMode('opfs');
  clearLastStorageError();
  notifyStorageListeners();
}

/** Reset storage. */
export async function clearStorage() {
  customHandle = null;
  await clearHandleFromIdb();
  setStorageMode('opfs');
  clearLastStorageError();
  notifyStorageListeners();
}

/**
 * Hapus SEMUA data dari OPFS & folder kustom.
 * Reset total — seperti pertama kali buka app.
 */
export async function deleteAllLocalData() {
  // Hapus dari folder kustom (jika ada)
  if (customHandle) {
    try {
      await customHandle.removeEntry(APP_DIR_NAME, { recursive: true });
    } catch { /* abaikan */ }
  }

  // Hapus dari OPFS
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(APP_DIR_NAME, { recursive: true });
  } catch { /* abaikan */ }

  await clearStorage();
  notifyStorageListeners();
}

/** Cek apakah storage siap. */
export async function isFolderReady() {
  const { handle } = await resolveHandle();
  return handle !== null;
}

/** Cek File System Access API support. */
export function isSupported() {
  return 'showDirectoryPicker' in window;
}

/** Cek OPFS support. */
export function isOpfsSupported() {
  return 'storage' in navigator && typeof navigator.storage.getDirectory === 'function';
}

/** Info status storage. */
export async function getStorageInfo() {
  const { handle, mode, label } = await resolveHandle();

  return {
    ready: handle !== null,
    mode,
    label,
    preferredMode: getStorageMode(),
    customSelected: mode === 'custom',
    canPickFolder: isSupported(),
    folderPickerSupported: isSupported(),
    opfsSupported: isOpfsSupported(),
    lastError: lastStorageError,
    isSecureContext: window.isSecureContext,
  };
}

async function saveCollection(filename, data) {
  const { handle } = await resolveHandle();
  if (!handle) return false;
  try {
    await writeJson(handle, filename, data);
    clearLastStorageError();
    return true;
  } catch (err) {
    setLastStorageError(err?.message || `Gagal menyimpan ${filename}.`);
    return false;
  }
}

async function loadCollection(filename) {
  const { handle } = await resolveHandle();
  if (!handle) return null;
  try {
    const result = await readJson(handle, filename, null);
    clearLastStorageError();
    return result;
  } catch (err) {
    setLastStorageError(err?.message || `Gagal membaca ${filename}.`);
    return null;
  }
}

export async function saveBarang(data) {
  return await saveCollection('barang.json', data);
}

export async function loadBarang() {
  return await loadCollection('barang.json');
}

export async function saveJual(data) {
  return await saveCollection('jual.json', data);
}

export async function loadJual() {
  return await loadCollection('jual.json');
}

export async function saveBeli(data) {
  return await saveCollection('beli.json', data);
}

export async function loadBeli() {
  return await loadCollection('beli.json');
}

async function readApiCache() {
  const { handle } = await resolveHandle();
  if (!handle) return {};
  return await readJson(handle, API_CACHE_FILE, {});
}

async function writeApiCache(cache) {
  const { handle } = await resolveHandle();
  if (!handle) return false;
  try {
    await writeJson(handle, API_CACHE_FILE, cache);
    clearLastStorageError();
    return true;
  } catch (err) {
    setLastStorageError(err?.message || 'Gagal menyimpan cache API offline.');
    return false;
  }
}

export async function cacheApiResponse(url, data) {
  const cache = await readApiCache();
  cache[url] = { data, timestamp: Date.now() };
  await writeApiCache(cache);
}

export async function getCachedApiResponse(url) {
  const cache = await readApiCache();
  return cache[url]?.data ?? null;
}

async function readWriteQueue() {
  const { handle } = await resolveHandle();
  if (!handle) return [];
  try {
    const result = await readJson(handle, WRITE_QUEUE_FILE, []);
    clearLastStorageError();
    return result;
  } catch (err) {
    setLastStorageError(err?.message || 'Gagal membaca antrean sinkronisasi.');
    return [];
  }
}

async function writeWriteQueue(queue) {
  const { handle } = await resolveHandle();
  if (!handle) return false;
  try {
    await writeJson(handle, WRITE_QUEUE_FILE, queue);
    clearLastStorageError();
    notifyStorageListeners();
    return true;
  } catch (err) {
    setLastStorageError(err?.message || 'Gagal menyimpan antrean sinkronisasi.');
    return false;
  }
}

export async function addToWriteQueue(operation) {
  const queue = await readWriteQueue();
  queue.push({
    ...operation,
    id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  });
  queue.sort((a, b) => a.timestamp - b.timestamp);
  await writeWriteQueue(queue);
}

export async function getWriteQueue() {
  const queue = await readWriteQueue();
  return queue.sort((a, b) => a.timestamp - b.timestamp);
}

export async function removeFromWriteQueue(id) {
  const queue = await readWriteQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await writeWriteQueue(filtered);
}

export async function getQueueCount() {
  const queue = await getWriteQueue();
  return queue.length;
}
