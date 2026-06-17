import { NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api, { onOnlineChange, onQueueChange, setBackendReachable, syncWriteQueue } from '../offlineApi';
import { getStorageInfo, onStorageChange, pickFolder, requestOpfsAccess, useOpfsStorage } from '../localFs';

export default function Layout() {
  const [dbStatus, setDbStatus] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [storageInfo, setStorageInfo] = useState({
    ready: false,
    mode: 'loading',
    label: 'Memeriksa storage...',
    preferredMode: 'opfs',
    customSelected: false,
    canPickFolder: false,
    folderPickerSupported: false,
    opfsSupported: false,
    lastError: '',
    isSecureContext: true,
  });
  const [storageError, setStorageError] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia?.('(display-mode: standalone)')?.matches || false
  );

  useEffect(() => {
    const unsub = onOnlineChange(setIsOnline);
    return unsub;
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    const refreshStorage = () => {
      getStorageInfo()
        .then(setStorageInfo)
        .catch(() => {
          setStorageInfo((prev) => ({
            ...prev,
            ready: false,
            label: 'Storage tidak tersedia',
            mode: 'unavailable',
          }));
        });
    };

    refreshStorage();
    const unsub = onStorageChange(refreshStorage);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onQueueChange(setQueueCount);
    return unsub;
  }, []);

  useEffect(() => {
    if (isOnline) {
      api.get('/health', { _skipLocal: true, noOfflineCache: true, noOfflineFallback: true })
        .then((r) => {
          setDbStatus(r.data.database);
          setBackendReachable(r.data.database === 'connected');
        })
        .catch(() => {
          setDbStatus('offline');
          setBackendReachable(false);
        });
      syncWriteQueue();
    } else {
      setDbStatus('offline');
      setBackendReachable(false);
    }
  }, [isOnline]);

  const handlePickFolder = async () => {
    setStorageError('');
    try {
      await pickFolder();
    } catch (err) {
      setStorageError(err.message || 'Gagal memilih folder.');
    }
  };

  const handleUseOpfs = () => {
    setStorageError('');
    useOpfsStorage();
  };

  const handleActivateOpfs = async () => {
    setStorageError('');
    try {
      await requestOpfsAccess();
    } catch (err) {
      setStorageError(err.message || 'Gagal mengaktifkan OPFS.');
    }
  };

  const handleInstallApp = async () => {
    if (!installPrompt) return;

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } catch (err) {
      setStorageError(err.message || 'Gagal membuka prompt install app.');
    }
  };

  const linkClass = ({ isActive }) =>
    `nav-link ${isActive ? 'active' : ''}`;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>🛒 POS</h2>
          <span className={`badge ${isOnline && dbStatus === 'connected' ? 'badge-green' : 'badge-red'}`}>
            {!isOnline
              ? '⚡ Browser Offline'
              : dbStatus === 'connected'
                ? '● Backend Online'
                : '○ Backend Offline'}
          </span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/barang" className={linkClass}>
            📦 Barang
          </NavLink>
          <NavLink to="/jual" className={linkClass}>
            🛍️ Penjualan
          </NavLink>
          <NavLink to="/beli" className={linkClass}>
            📥 Pembelian
          </NavLink>
        </nav>

        <div className="folder-section">
          {isInstalled ? (
            <div className="folder-status" style={{ marginBottom: '0.75rem' }}>
              <span>PWA sudah terpasang</span>
            </div>
          ) : installPrompt ? (
            <button className="btn btn-primary folder-btn" style={{ marginBottom: '0.75rem' }} onClick={handleInstallApp}>
              Install App
            </button>
          ) : null}

          <button className="btn btn-outline folder-btn" onClick={handlePickFolder}>
            {storageInfo.customSelected ? 'Ganti Folder' : 'Pilih Folder Download'}
          </button>

          <div className="folder-status" style={{ marginTop: '0.5rem' }}>
            <span>{storageInfo.label}</span>
          </div>

          <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
            {storageInfo.opfsSupported ? 'OPFS siap dicek' : 'OPFS tidak aktif di browser ini'}
          </p>

          <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
            {storageInfo.folderPickerSupported ? 'Folder picker tersedia' : 'Folder picker tidak tersedia'}
          </p>

          {!storageInfo.isSecureContext ? (
            <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#fcd34d' }}>
              Halaman ini tidak berjalan di secure context, jadi File System API bisa gagal.
            </p>
          ) : null}

          <button className="btn btn-outline folder-btn" style={{ marginTop: '0.5rem' }} onClick={handleActivateOpfs}>
            Aktifkan OPFS
          </button>

          {storageInfo.mode !== 'opfs' ? (
            <button className="btn btn-outline folder-btn" style={{ marginTop: '0.5rem' }} onClick={handleUseOpfs}>
              Pakai OPFS
            </button>
          ) : null}

          {storageInfo.preferredMode === 'custom' && !storageInfo.customSelected ? (
            <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
              Folder custom perlu dipilih ulang setelah reload browser.
            </p>
          ) : null}

          {storageError ? (
            <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#fca5a5' }}>
              {storageError}
            </p>
          ) : null}

          {storageInfo.lastError ? (
            <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#fca5a5' }}>
              Cache offline gagal: {storageInfo.lastError}
            </p>
          ) : null}
        </div>

        <div className="queue-indicator">
          {queueCount > 0
            ? `${queueCount} data menunggu sinkron`
            : 'Tidak ada antrean sinkronisasi'}
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
