import { useLayoutEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function Scanner({ onScan, onClose }) {
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [error, setError] = useState('');
  const containerRef = useRef(null);
  const scannerRef = useRef(null);

  // Dapatkan daftar kamera
  useLayoutEffect(() => {
    let cancelled = false;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled) return;
        setCameras(devices);
        if (devices.length > 0) {
          const back = devices.find((d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('belakang') ||
            d.label.toLowerCase().includes('environment')
          );
          setCameraId(back ? back.id : devices[0].id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError('Tidak bisa mengakses kamera: ' + err.message);
      });
    return () => { cancelled = true; };
  }, []);

  // Mulai dan stop scanner — useLayoutEffect cleanup runs BEFORE DOM removal
  useLayoutEffect(() => {
    if (!cameraId || !containerRef.current) return;

    // Buat element scanner manual, di luar React DOM
    const el = document.createElement('div');
    el.id = 'scanner-reader-' + Date.now();
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(el);

    let active = true;
    const scanner = new Html5Qrcode(el.id);
    scannerRef.current = scanner;

    scanner
      .start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText) => {
          if (!active) return;
          active = false;
          onScan(decodedText);
          // Stop — api bisa return promise rejected, tangkap semua
          const p = scanner.stop();
          if (p && typeof p.catch === 'function') p.catch(() => {});
          onClose();
        },
        () => {}
      )
      .catch(() => {});

    return () => {
      active = false;
      // Hapus element dari DOM DULUAN, baru stop
      if (containerRef.current) containerRef.current.innerHTML = '';
      try { scanner.stop()?.catch?.(() => {}); } catch {}
    };
  }, [cameraId]);

  const handleStop = () => {
    onClose();
  };

  if (error) {
    return (
      <div className="modal-overlay" onClick={handleStop}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>📷 Scan Error</h2>
          <p className="text-muted" style={{ marginBottom: '1rem' }}>{error}</p>
          <div className="form-actions">
            <button className="btn btn-outline" onClick={handleStop}>Tutup</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={handleStop}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>📷 Scan Kode Barang</h2>
          {cameras.length > 1 && (
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              style={{
                padding: '0.35rem 0.5rem',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#e2e8f0',
                fontSize: '0.8rem',
              }}
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `Camera ${cam.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
        </div>

        <div
          ref={containerRef}
          style={{ width: '100%', minHeight: 300, borderRadius: '8px', overflow: 'hidden' }}
        />

        <p className="text-muted" style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '0.85rem' }}>
          Arahkan kamera ke barcode / QR code barang
        </p>

        <div className="form-actions">
          <button className="btn btn-outline" onClick={handleStop}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
