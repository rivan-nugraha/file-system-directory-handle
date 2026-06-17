# 🛒 POS — Point of Sale (Offline-Ready)

Aplikasi **Point of Sale** full-stack dengan kemampuan **offline-first**.  
Dibangun untuk mempelajari bagaimana web dapat mengakses folder di komputer pengguna melalui **File System Access API** dan **OPFS (Origin Private File System)**.

---

## ✨ Fitur Utama

- 📦 **Manajemen Barang** — CRUD data barang (kode, nama, harga beli/jual, stok, kategori)
- 🛍️ **Transaksi Penjualan** — Input kode manual atau scan barcode kamera, hitung total otomatis
- 📥 **Transaksi Pembelian** — Catat pembelian dari supplier, update stok & harga beli
- 📡 **Offline-First** — Aplikasi tetap berfungsi tanpa internet; data disimpan otomatis
- 🔄 **Auto-Sync** — Antrean transaksi offline otomatis terkirim saat backend online kembali
- ⚡ **Optimistic UI** — Hapus & edit langsung tampil di UI tanpa menunggu network
- 🔒 **Persistent Settings** — Folder kustom & preferensi bertahan meskipun hard refresh (IndexedDB + localStorage)
- 📱 **PWA** — Dapat di-install sebagai aplikasi desktop/mobile
- 📷 **Barcode Scanner** — Dukungan kamera untuk scan kode barang (via `html5-qrcode`)

---

## 🏗️ Arsitektur

```
┌────────────────────────────────────────────────────────────────┐
│                     Browser                                    │
│  ┌──────────┐   ┌────────────------─┐   ┌───────────────---─┐  │
│  │  React   │──▶│ offlineApi        │──▶│    localFs        │  │
│  │  (Vite)  │   │  (Axios)          │   │ ┌─────────---───┐ │  │
│  │          │   │                   │   │ │ OPFS (default)│ |  │
│  │          │   │ - GET interceptor │   | │ zero-click    │ |  │
│  │          │   │ - Write Queue     │   | ├──────────----─┤ │  │
│  │          │   │ - Auto-Sync       │   | │ Folder      │ │ |  │
│  │          │   │ - Optimistic UI   │   | │ Kustom      │ │ |  │
│  └──────────┘   └──────┬──────------┘   │ │ (opsional)  │ │ |  │
│                        │                | └───────────────┘ │  │
|                        |                |                   |  |
│               Service Worker (PWA)      └───────────────────┘  │
│                        │                  │                    │
│                        │        IndexedDB (handle)             │
│                        │        localStorage (mode)            │
└────────────────────────┼───────────────────────────────────────┘
                         │
┌────────────────────────┴──────────────────────────────────┐
│                  Backend (Express)                        │
│  ┌──────────────────────────────────────────────────┐     │
│  │  Routes: /api/barang | /api/jual | /api/beli     │     │
│  └──────────────────────┬───────────────────────────┘     │
│                         │                                 │
│                  MongoDB (Mongoose)                       │
└───────────────────────────────────────────────────────────┘
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

| Operasi | Backend Online | Backend Offline |
|---------|---------------|-----------------|
| **GET** | Network-first → cache ke localFs | LocalFs / cache → fallback empty |
| **POST** | Kirim ke server → reconcile local | Simpan ke localFs + write queue |
| **PUT** | Kirim ke server → reconcile local | Update localFs + write queue |
| **DELETE** | Kirim ke server → hapus dari localFs | **Optimistic**: hapus UI & localFs langsung + write queue |

### Write Queue & Auto-Sync

```
Backend offline:
  POST/PUT/DELETE → localFs (immediate) + write-queue.json (pending)

Backend online:
  health check → setBackendReachable(true) → syncWriteQueue()
  ├─ Kirim antrean satu per satu ke server
  ├─ Sukses → reconcileLocal + hapus dari antrean
  ├─ Terminal error (400/404/409) → hapus dari antrean, lanjut
  └─ Network error → stop, coba lagi nanti

Queue kosong → refreshCoreDataFromServer() → sync semua data
```

### Storage Offline (Hybrid)

Aplikasi mendukung **dua mode** penyimpanan, dengan prioritas:

```
resolveHandle()
  ├─ 1. Folder Kustom (IndexedDB) → 📁 jika user pernah pilih
  └─ 2. OPFS (default)            → 💾 zero-click, selalu siap
```

| Mode | Klik? | Persistensi | Keterangan |
|------|-------|-------------|------------|
| **OPFS** | ❌ Nol klik | Otomatis | Default — langsung siap saat app dibuka |
| **Folder Kustom** | ✅ 1× klik | IndexedDB + localStorage | Tahan hard refresh. User bisa lihat file langsung |

Data disimpan dalam file JSON di folder `POS-Offline`:
- `barang.json` — Master data barang
- `jual.json` — Riwayat penjualan
- `beli.json` — Riwayat pembelian
- `api-cache.json` — Cache response API
- `write-queue.json` — Antrean operasi tertunda

---

## 💾 Storage: OPFS + File System Access

### OPFS (Default — Zero-Click)

**Origin Private File System** — storage privat browser yang selalu tersedia tanpa izin user.

| Syarat | Keterangan |
|--------|------------|
| **Secure Context** | `https://` atau `localhost` |
| **Browser Chromium** | Chrome 86+, Edge 86+, Opera 72+ |
| **API** | `navigator.storage.getDirectory()` |

> ⚠️ **Firefox & Safari** tidak mendukung OPFS.

### Folder Kustom (Opsional)

User bisa memilih folder sendiri via `showDirectoryPicker()` — file bisa dilihat langsung di file manager.

| Tombol | Fungsi |
|--------|--------|
| **📁 Pilih Folder Kustom** | Buka dialog pilih folder (default: Downloads) |
| **💾 Kembali ke OPFS** | Switch balik ke OPFS |
| **🗑️ Hapus Semua Data Lokal** | Reset total — hapus semua data dari OPFS & folder kustom |

**Setting bertahan permanen** — mode & handle folder disimpan di `localStorage` + `IndexedDB`, tidak hilang meskipun hard refresh.

### Verifikasi di DevTools

**Chrome DevTools** → **Application** → **Origin Private File System**:

```
Origin Private File System
└── POS-Offline/
    ├── barang.json
    ├── jual.json
    ├── beli.json
    ├── api-cache.json
    └── write-queue.json
```

> 💡 **Tidak perlu package tambahan.** OPFS & File System Access adalah Web API bawaan browser.

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 18, Vite, React Router 6, Axios |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Offline Storage | OPFS (default), File System Access API (opsional) |
| Persistence | IndexedDB, localStorage |
| Scanner | html5-qrcode |
| PWA | Service Worker, Web App Manifest |

---

## 📝 Lisensi

Proyek ini dibuat untuk tujuan pembelajaran.
