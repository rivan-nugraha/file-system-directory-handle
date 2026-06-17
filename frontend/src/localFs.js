/**
 * localFs.js — Penyimpanan lokal berbasis OPFS / File System Access.
 *
 * Default:
 *   - Gunakan OPFS dan otomatis buat folder app "POS-Offline".
 *
 * Opsional:
 *   - User bisa pilih folder sendiri via showDirectoryPicker().
 *   - App akan membuat subfolder "POS-Offline" di dalam folder yang dipilih.
 *
 * Catatan:
 *   - Handle folder kustom tidak dipersist permanen tanpa IndexedDB.
 *   - Setelah reload, app kembali ke OPFS sampai user pilih folder lagi.
 */

const APP_DIR_NAME = 'POS-Offline';
const API_CACHE_FILE = 'api-cache.json';
const WRITE_QUEUE_FILE = 'write-queue.json';
const CUSTOM_FOLDER_PREF_KEY = 'pos-storage-preference';

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

function getPreferredMode() {
  try {
    return localStorage.getItem(CUSTOM_FOLDER_PREF_KEY) || 'opfs';
  } catch {
    return 'opfs';
  }
}

function setPreferredMode(mode) {
  try {
    localStorage.setItem(CUSTOM_FOLDER_PREF_KEY, mode);
  } catch {
    // ignore
  }
}

async function getOpfsRoot() {
  try {
    if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
      setLastStorageError('OPFS tidak tersedia di environment browser ini.');
      return null;
    }
    const handle = await navigator.storage.getDirectory();
    clearLastStorageError();
    return handle;
  } catch (err) {
    setLastStorageError(err?.message || 'Gagal mengakses OPFS.');
    return null;
  }
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
      setLastStorageError('Izin folder custom tidak diberikan.');
      return null;
    }
    const dir = await ensureAppDirectory(customHandle);
    if (dir) clearLastStorageError();
    return dir;
  } catch (err) {
    customHandle = null;
    setLastStorageError(err?.message || 'Gagal mengakses folder custom.');
    return null;
  }
}

async function resolveHandle() {
  const customDir = await getCustomAppDirectory();
  if (customDir) {
    return { handle: customDir, mode: 'custom', label: `Folder pilihan /${APP_DIR_NAME}` };
  }

  const opfsRoot = await getOpfsRoot();
  const opfsDir = await ensureAppDirectory(opfsRoot);
  if (!opfsDir) {
    return { handle: null, mode: 'unavailable', label: 'Storage offline tidak tersedia' };
  }

  clearLastStorageError();
  return { handle: opfsDir, mode: 'opfs', label: `OPFS /${APP_DIR_NAME}` };
}

export async function pickFolder() {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('showDirectoryPicker tidak didukung browser ini.');
  }

  const handle = await window.showDirectoryPicker({
    id: 'pos-custom',
    mode: 'readwrite',
    startIn: 'downloads',
  });

  const opts = { mode: 'readwrite' };
  const permission = await handle.requestPermission(opts);
  if (permission !== 'granted') {
    throw new Error('Izin akses folder tidak diberikan.');
  }

  customHandle = handle;
  setPreferredMode('custom');
  await ensureAppDirectory(handle);
  clearLastStorageError();
  notifyStorageListeners();

  return handle;
}

export async function requestOpfsAccess() {
  if (!window.isSecureContext) {
    throw new Error('OPFS butuh secure context. Buka app dari localhost atau HTTPS.');
  }

  if (!isOpfsSupported()) {
    throw new Error('OPFS tidak tersedia di environment browser ini.');
  }

  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      await navigator.storage.persist();
    }

    const root = await navigator.storage.getDirectory();
    const appDir = await ensureAppDirectory(root);
    if (!appDir) {
      throw new Error(`Gagal membuat folder ${APP_DIR_NAME} di OPFS.`);
    }

    setPreferredMode('opfs');
    clearLastStorageError();
    notifyStorageListeners();

    return {
      ok: true,
      label: `OPFS /${APP_DIR_NAME}`,
    };
  } catch (err) {
    setLastStorageError(err?.message || 'Gagal mengaktifkan OPFS.');
    throw err;
  }
}

export function useOpfsStorage() {
  customHandle = null;
  setPreferredMode('opfs');
  clearLastStorageError();
  notifyStorageListeners();
}

export async function isFolderReady() {
  const { handle } = await resolveHandle();
  return handle !== null;
}

export function isSupported() {
  return 'showDirectoryPicker' in window;
}

export function isOpfsSupported() {
  return 'storage' in navigator && typeof navigator.storage.getDirectory === 'function';
}

export async function getStorageInfo() {
  const { handle, mode, label } = await resolveHandle();
  const folderPickerSupported = isSupported();
  const opfsSupported = isOpfsSupported();

  return {
    ready: handle !== null,
    mode,
    label,
    preferredMode: getPreferredMode(),
    customSelected: mode === 'custom',
    canPickFolder: folderPickerSupported,
    folderPickerSupported,
    opfsSupported,
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
