# 🛒 POS — Point of Sale (Offline-Ready)

Aplikasi **Point of Sale** full-stack dengan kemampuan **offline-first**.  
Dibangun untuk mempelajari bagaimana web dapat mengakses folder di komputer pengguna melalui **File System Access API** dan **OPFS (Origin Private File System)**.

---

## ✨ Fitur Utama

- 📦 **Manajemen Barang** — CRUD data barang (kode, nama, harga beli/jual, stok, kategori)
- 🛍️ **Transaksi Penjualan** — Input kode manual atau scan barcode kamera, hitung total otomatis
- 📥 **Transaksi Pembelian** — Catat pembelian dari supplier, update stok & harga beli
- 📡 **Offline-First** — Aplikasi tetap berfungsi tanpa internet; data disimpan di OPFS / folder lokal
- 🔄 **Auto-Sync** — Antrean transaksi offline otomatis terkirim saat koneksi kembali
- 📱 **PWA** — Dapat di-install sebagai aplikasi desktop/mobile
- 📷 **Barcode Scanner** — Dukungan kamera untuk scan kode barang (via `html5-qrcode`)

---

## 🏗️ Arsitektur

```
┌──────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌──────────┐   ┌─────────────┐   ┌──────────┐   │
│  │  React   │──▶│ offlineApi  │──▶│ localFs  │   │
│  │  (Vite)  │   │  (Axios)    │   │ (OPFS /  │   │
│  │          │   │             │   │  Folder) │   │
│  └──────────┘   └──────┬──────┘   └──────────┘   │
│                        │                         │
│               Service Worker (PWA)               │
└────────────────────────┼────────────────────────-┘
                         │
┌────────────────────────┴────────────────────────-┐
│              Backend (Express)                   │
│  ┌──────────────────────────────────────────┐    │
│  │  Routes: /api/barang | /api/jual | /api/beli  │
│  └──────────────────┬───────────────────────┘    │
│                     │                            │
│              MongoDB (Mongoose)                  │
└──────────────────────────────────────────────────┘
```

---

## 🚀 Cara Menjalankan

### Prasyarat

- **Node.js** ≥ 18
- **MongoDB** (lokal atau [MongoDB Atlas](https://www.mongodb.com/atlas)) *Notes Untuk Database Itu Masing - Masing, cuman saya lebih nyaman ke MongoDB
- Browser berbasis Chromium (Chrome/Edge) untuk fitur File System Access API

### 1. Clone & Install

```bash
# Install backend
cd backend
cp .env.example .env    # lalu isi MONGO_URI
npm install

# Install frontend
cd ../frontend
npm install
```

### 2. Konfigurasi Environment

Buat file `backend/.env`:

```env
PORT=8000
MONGO_URI=mongodb://localhost:27017/pos_db
```

### 3. Jalankan

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Buka **http://localhost:5173** di browser.

---

## 📂 Struktur Proyek

```
file-system-directory-handle/
├── README.md
├── backend/
│   ├── package.json
│   ├── server.js              # Entry point Express
│   ├── config/
│   │   └── db.js              # Koneksi MongoDB
│   ├── models/
│   │   ├── index.js           # Barrel export
│   │   ├── Barang.js          # Model barang
│   │   ├── Jual.js            # Model penjualan
│   │   └── Beli.js            # Model pembelian
│   └── routes/
│       ├── health.js          # Health check
│       ├── barang.js          # CRUD barang
│       ├── jual.js            # Transaksi penjualan
│       └── beli.js            # Transaksi pembelian
└── frontend/
    ├── package.json
    ├── index.html
    ├── vite.config.js         # Proxy /api → backend
    ├── public/
    │   ├── manifest.json      # PWA manifest
    │   └── sw.js              # Service Worker
    └── src/
        ├── main.jsx           # Entry React + SW registration
        ├── App.jsx            # Router
        ├── index.css          # Styling global
        ├── localFs.js         # OPFS / File System Access engine
        ├── offlineApi.js      # Axios wrapper offline-first
        ├── components/
        │   ├── Layout.jsx     # Sidebar + status bar
        │   └── Scanner.jsx    # Barcode scanner (kamera)
        └── pages/
            ├── Barang.jsx     # Master data barang
            ├── Jual.jsx       # Transaksi penjualan
            └── Beli.jsx       # Transaksi pembelian
```

---

## 🔑 Konsep Kunci

### Offline-First Data Flow

| Kondisi | GET | POST / PUT / DELETE |
|---------|-----|---------------------|
| **Online** | Ambil dari server → simpan ke OPFS | Kirim langsung ke server |
| **Offline** | Ambil dari OPFS / cache lokal | Simpan ke antrean → auto-sync saat online |

### Storage Offline

Aplikasi mendukung dua mode penyimpanan:

1. **OPFS** (default) — Storage privat browser, otomatis tersedia
2. **Folder Kustom** — Pilih folder sendiri via `showDirectoryPicker()` (misal: folder Downloads)

Data disimpan dalam file JSON:
- `barang.json` — Master data barang
- `jual.json` — Riwayat penjualan
- `beli.json` — Riwayat pembelian
- `api-cache.json` — Cache response API
- `write-queue.json` — Antrean transaksi offline

---

## � Cara Mengaktifkan OPFS di Frontend

OPFS (**Origin Private File System**) adalah storage privat yang disediakan browser untuk setiap origin (domain).  
Data disimpan di filesystem lokal dan **tidak bisa diakses oleh origin lain**.

### Syarat OPFS

| Syarat | Keterangan |
|--------|------------|
| **Secure Context** | Halaman harus diakses via `https://` atau `localhost` |
| **Browser Chromium** | Chrome 86+, Edge 86+, Opera 72+ |
| **`navigator.storage.getDirectory()`** | API harus tersedia di browser |

> ⚠️ **Firefox & Safari** tidak mendukung OPFS. Gunakan fallback **Folder Kustom** (File System Access API) atau IndexedDB sebagai alternatif.

### Cara Kerja `localFs.js`

File `frontend/src/localFs.js` menangani semua logika penyimpanan offline. Berikut arsitektur internalnya:

```
┌─────────────────────────────────────────────────────┐
│                    localFs.js                       │
│                                                     │
│  resolveHandle()                                    │
│  ├── Cek folder kustom (user pilih manual)          │
│  └── Fallback ke OPFS (navigator.storage.getDir)    │
│                                                     │
│  saveCollection() / loadCollection()                │
│  ├── writeJson() → fileHandle.createWritable()      │
│  └── readJson()  → fileHandle.getFile()             │
│                                                     │
│  API Cache:  cacheApiResponse() / getCachedApiResp()│
│  Write Queue: addToWriteQueue() / getWriteQueue()   │
└─────────────────────────────────────────────────────┘
```

### Langkah Demi Langkah

#### 1. Pastikan Secure Context

Di `vite.config.js`, frontend sudah dijalankan di `localhost` (secure context otomatis):

```js
// frontend/vite.config.js
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8000' },
  },
})
```

#### 2. Cek Dukungan OPFS

Fungsi `isOpfsSupported()` di `localFs.js` mengecek apakah API tersedia:

```js
// frontend/src/localFs.js
export function isOpfsSupported() {
  return 'storage' in navigator && typeof navigator.storage.getDirectory === 'function';
}
```

#### 3. Minta Persistensi Storage

Agar data tidak dihapus otomatis oleh browser saat ruang penyimpanan penuh:

```js
// frontend/src/localFs.js — dalam requestOpfsAccess()
if (navigator.storage && typeof navigator.storage.persist === 'function') {
  await navigator.storage.persist(); // Minta persistent storage
}
```

#### 4. Buat Folder Aplikasi di OPFS

```js
// frontend/src/localFs.js
const root = await navigator.storage.getDirectory();        // Root OPFS
const appDir = await root.getDirectoryHandle('POS-Offline', { create: true }); // Folder app
```

#### 5. Baca & Tulis File JSON

```js
// Menulis data
const fileHandle = await appDir.getFileHandle('barang.json', { create: true });
const writable = await fileHandle.createWritable();
await writable.write(JSON.stringify(data, null, 2));
await writable.close();

// Membaca data
const fileHandle = await appDir.getFileHandle('barang.json', { create: false });
const file = await fileHandle.getFile();
const text = await file.text();
const data = JSON.parse(text);
```

#### 6. Mode Ganda: OPFS atau Folder Kustom

User bisa memilih mode penyimpanan melalui UI sidebar:

| Tombol | Fungsi |
|--------|--------|
| **Aktifkan OPFS** | Request persistent storage + buat folder `POS-Offline` di OPFS |
| **Pakai OPFS** | Kembali ke OPFS setelah pakai folder kustom |
| **Pilih Folder Download** | Buka `showDirectoryPicker()` — user pilih folder sendiri |

```js
// Contoh: user pilih folder sendiri
const handle = await window.showDirectoryPicker({
  id: 'pos-custom',
  mode: 'readwrite',
  startIn: 'downloads',
});
```

#### 7. Verifikasi di DevTools

Buka **Chrome DevTools** → **Application** → **Storage** → **Origin Private File System**  
Anda akan melihat folder `POS-Offline` dengan file-file JSON di dalamnya.

```
Origin Private File System
└── POS-Offline/
    ├── barang.json
    ├── jual.json
    ├── beli.json
    ├── api-cache.json
    └── write-queue.json
```

### Integrasi dengan `offlineApi.js`

File `offlineApi.js` menggunakan `localFs.js` melalui fungsi-fungsi ini:

```js
// frontend/src/offlineApi.js
import {
  saveBarang, loadBarang,     // Koleksi barang
  saveJual,   loadJual,       // Koleksi penjualan
  saveBeli,   loadBeli,       // Koleksi pembelian
  cacheApiResponse,           // Cache GET response
  getCachedApiResponse,       // Ambil cache
  addToWriteQueue,            // Antrean operasi tulis offline
  getWriteQueue,              // Baca antrean
  removeFromWriteQueue,       // Hapus dari antrean
  getQueueCount,              // Jumlah antrean
} from './localFs';
```

> 💡 **Tidak perlu install package tambahan.** OPFS adalah Web API bawaan browser — `localFs.js` langsung menggunakan `navigator.storage.getDirectory()` tanpa library eksternal.

---

## �🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 18, Vite, React Router 6, Axios |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Offline Storage | OPFS, File System Access API |
| Scanner | html5-qrcode |
| PWA | Service Worker, Web App Manifest |

---

## 📝 Lisensi

Proyek ini dibuat untuk tujuan pembelajaran.
