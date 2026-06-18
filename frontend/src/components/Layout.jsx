import { NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api, { onOnlineChange, onQueueChange, setBackendReachable, syncWriteQueue } from '../offlineApi';
import { subscribeBackendSocket } from '../backendSocket';
import { getStorageInfo, onStorageChange, pickFolder, initStorage, useOpfsStorage, deleteAllLocalData } from '../localFs';
import { getOfflineReadyInfo, prepareOfflineMode, resetOfflineReadyFlag } from '../offlinePrep';

export default function Layout() {
  const [dbStatus, setDbStatus] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [storageInfo, setStorageInfo] = useState({
    ready: false,
    mode: 'loading',
    label: 'Memeriksa storage...',
    customSelected: false,
    canPickFolder: false,
    folderPickerSupported: false,
    lastError: '',
    isSecureContext: true,
  });
  const [storageError, setStorageError] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia?.('(display-mode: standalone)')?.matches || false
  );
  const [socketConnected, setSocketConnected] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null); // null | 'available' | 'downloaded' | 'error'
  const [appVersion] = useState(
    window.electronAPI?.version || import.meta.env.PACKAGE_VERSION || '0.1.0'
  );
  const [offlineReady, setOfflineReady] = useState(getOfflineReadyInfo().ready);
  const [preparingOffline, setPreparingOffline] = useState(false);

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

    // Auto-init storage: OPFS selalu siap (zero-click).
    // Folder kustom di-restore dari IndexedDB jika ada.
    initStorage().then(() => refreshStorage());

    const unsub = onStorageChange(refreshStorage);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onQueueChange(setQueueCount);
    return unsub;
  }, []);

  // Listen update status dari Electron
  useEffect(() => {
    if (window.electronAPI?.onUpdateStatus) {
      window.electronAPI.onUpdateStatus((status) => {
        setUpdateStatus(status);
      });
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeBackendSocket({
      onConnect: () => setSocketConnected(true),
      onDisconnect: () => {
        setSocketConnected(false);
        setDbStatus('offline');
        setBackendReachable(false);
      },
      onBackendStatus: (payload) => {
        setSocketConnected(true);
        setDbStatus(payload?.database || 'offline');
        setBackendReachable(payload?.database === 'connected');
        if (payload?.database === 'connected') {
          syncWriteQueue();
        }
      },
    });

    return unsub;
  }, []);

  useEffect(() => {
    if (isOnline) {
      api.get('/health', { _skipLocal: true, noOfflineCache: true, noOfflineFallback: true })
        .then((r) => {
          const connected = r.data.database === 'connected';
          setDbStatus(r.data.database);
          setBackendReachable(connected);
          if (connected) syncWriteQueue(); // sync SETELAH konfirmasi backend online
        })
        .catch(() => {
          setDbStatus('offline');
          setBackendReachable(false);
        });
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

  const handleDeleteAllData = async () => {
    if (!confirm('HAPUS SEMUA DATA LOKAL?\n\nData barang, penjualan, pembelian, dan cache akan dihapus permanen.\n\nData di server (MongoDB) tidak terpengaruh.')) return;
    await deleteAllLocalData();
    resetOfflineReadyFlag();
    location.reload();
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

  const handlePrepareOffline = async () => {
    setStorageError('');
    setPreparingOffline(true);
    try {
      await prepareOfflineMode();
      setOfflineReady(true);
    } catch (err) {
      setStorageError(err.message || 'Gagal menyiapkan mode offline.');
      setOfflineReady(false);
    } finally {
      setPreparingOffline(false);
    }
  };

  const linkClass = ({ isActive }) =>
    `nav-link ${isActive ? 'active' : ''}`;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>🛒 POS</h2>
          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>
            v{appVersion}
          </span>
          <span className={`badge ${isOnline && dbStatus === 'connected' ? 'badge-green' : 'badge-red'}`}>
            {!isOnline
              ? '⚡ Browser Offline'
              : dbStatus === 'connected'
                ? '● Backend Online'
                : '○ Backend Offline'}
          </span>
          {updateStatus === 'downloaded' && (
            <span
              className="badge badge-green"
              style={{ cursor: 'pointer', marginTop: '0.3rem', display: 'block' }}
              onClick={() => window.electronAPI?.installUpdate()}
              title="Klik untuk restart & install update"
            >
              🔄 Update siap — klik restart
            </span>
          )}
          {updateStatus === 'available' && (
            <span className="badge" style={{ background: '#1e3a5f', color: '#93c5fd', marginTop: '0.3rem', display: 'block' }}>
              ⬇ Mendownload update...
            </span>
          )}
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
              <span>✅ PWA sudah terpasang</span>
            </div>
          ) : installPrompt ? (
            <button className="btn btn-primary folder-btn" style={{ marginBottom: '0.75rem' }} onClick={handleInstallApp}>
              📲 Install App
            </button>
          ) : null}

          {offlineReady ? (
            <div className="folder-status" style={{ marginBottom: '0.75rem' }}>
              <span>✅ App siap offline</span>
            </div>
          ) : (
            <button
              className="btn btn-primary folder-btn"
              style={{ marginBottom: '0.75rem' }}
              onClick={handlePrepareOffline}
              disabled={preparingOffline || !isOnline || dbStatus !== 'connected'}
            >
              {preparingOffline ? 'Menyiapkan Offline...' : '⚙️ Siapkan Offline'}
            </button>
          )}

          <button className="btn btn-outline folder-btn" onClick={handlePickFolder}>
            {storageInfo.customSelected ? '📁 Ganti Folder' : '📁 Pilih Folder Kustom'}
          </button>

          {storageInfo.customSelected && (
            <button className="btn btn-outline folder-btn" style={{ marginTop: '0.4rem' }} onClick={async () => {
              await useOpfsStorage();
            }}>
              💾 Kembali ke OPFS
            </button>
          )}

          <button
            className="btn btn-danger folder-btn"
            style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}
            onClick={handleDeleteAllData}
          >
            🗑️ Hapus Semua Data Lokal
          </button>

          <button
            className="btn btn-primary folder-btn"
            style={{ marginTop: '0.5rem' }}
            onClick={() => {
              // Arahkan ke GitHub Releases (selalu tersedia semua platform)
              const releaseUrl = 'https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/releases/latest';
              window.open(releaseUrl, '_blank');
            }}
          >
            💻 Download Desktop App
          </button>

          <div className="folder-status" style={{ marginTop: '0.5rem' }}>
            <span>{storageInfo.ready ? '✅' : '⚠️'} {storageInfo.label}</span>
            {storageInfo.customSelected && (
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginTop: '0.15rem' }}>
                🔒 Disimpan permanen (tahan refresh)
              </span>
            )}
          </div>

          {!storageInfo.opfsSupported && !storageInfo.folderPickerSupported && (
            <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#fca5a5' }}>
              Browser tidak mendukung storage offline.
            </p>
          )}

          <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
            {socketConnected ? '🟢 Socket realtime terhubung' : '🔴 Socket realtime terputus'}
          </p>

          {!offlineReady ? (
            <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
              Offline first-run aman setelah `Siapkan Offline` selesai.
            </p>
          ) : null}

          {storageError ? (
            <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#fca5a5' }}>
              {storageError}
            </p>
          ) : null}

          {storageInfo.lastError ? (
            <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#fca5a5' }}>
              Error: {storageInfo.lastError}
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
