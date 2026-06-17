import { useState, useEffect, useCallback } from 'react';
import api from '../offlineApi';
import Scanner from '../components/Scanner';

export default function Beli() {
  const [transaksi, setTransaksi] = useState([]);
  const [barangList, setBarangList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [items, setItems] = useState([]);
  const [kodeInput, setKodeInput] = useState('');
  const [supplier, setSupplier] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const fetchTransaksi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/beli');
      setTransaksi(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBarang = useCallback(async () => {
    try {
      const res = await api.get('/barang', { params: { limit: 999 } });
      setBarangList(res.data.data);
    } catch (err) { /* ignore */ }
  }, []);

  useEffect(() => { fetchTransaksi(); fetchBarang(); }, [fetchTransaksi, fetchBarang]);

  // Tambah barang by kode
  const tambahByKode = (kode) => {
    const cleanKode = kode.trim().toUpperCase();
    if (!cleanKode) return;

    const found = barangList.find((b) => b.kode.toUpperCase() === cleanKode);
    if (!found) {
      setError(`Barang "${cleanKode}" tidak ditemukan`);
      return;
    }

    const existingIdx = items.findIndex((it) => it.barang === found._id);
    if (existingIdx >= 0) {
      const newItems = [...items];
      newItems[existingIdx] = {
        ...newItems[existingIdx],
        qty: newItems[existingIdx].qty + 1,
      };
      setItems(newItems);
    } else {
      setItems([...items, { barang: found._id, qty: 1, harga: found.harga_beli }]);
    }
    setError('');
    setKodeInput('');
  };

  const handleKodeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tambahByKode(kodeInput);
    }
  };

  const updateQty = (i, qty) => {
    const newItems = [...items];
    if (qty <= 0) newItems.splice(i, 1);
    else newItems[i] = { ...newItems[i], qty };
    setItems(newItems);
  };

  const updateHarga = (i, harga) => {
    const newItems = [...items];
    newItems[i] = { ...newItems[i], harga: Number(harga) || 0 };
    setItems(newItems);
  };

  const removeItem = (i) => {
    setItems(items.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validItems = items
      .filter((it) => it.barang && it.qty > 0 && it.harga > 0)
      .map((it) => ({ barang: it.barang, qty: it.qty, harga: Number(it.harga) }));

    if (validItems.length === 0) {
      return setError('Minimal 1 barang dengan qty & harga valid');
    }

    try {
      await api.post('/beli', { items: validItems, supplier, keterangan });
      setSuccess('Pembelian berhasil dicatat!');
      setShowForm(false);
      setItems([]);
      setSupplier('');
      setKeterangan('');
      fetchTransaksi();
      fetchBarang();
    } catch (err) {
      if (err.message?.startsWith('OFFLINE_QUEUED')) {
        setSuccess('Pembelian berhasil disimpan!');
        setShowForm(false);
        setItems([]);
        setSupplier('');
        setKeterangan('');
        fetchTransaksi();
        fetchBarang();
      } else {
        setError(err.response?.data?.error || err.message);
      }
    }
  };

  const handleBatal = async (id) => {
    if (!confirm('Batalkan pembelian ini? Stok akan dikurangi.')) return;
    // Optimistic: hapus dari UI langsung
    setTransaksi((prev) => prev.filter((item) => item._id !== id));
    try {
      await api.delete(`/beli/${id}`);
      fetchTransaksi();
      fetchBarang();
    } catch (err) {
      if (err.message?.startsWith('OFFLINE_QUEUED')) {
        // Sudah dihapus lokal, tidak perlu fetch ulang
      } else {
        setError(err.response?.data?.error || err.message);
        fetchTransaksi();
        fetchBarang();
      }
    }
  };

  // Handle scan hasil
  const handleScan = (scannedCode) => {
    tambahByKode(scannedCode);
  };

  const formatRp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
  const formatTgl = (d) => new Date(d).toLocaleString('id-ID');
  const renderSyncMeta = (trx) => {
    if (trx.sync_status === 'pending') return 'Pending sinkronisasi';
    if (trx.sync_status === 'conflict') return trx.sync_error || 'Konflik saat sinkronisasi';
    if (trx.sync_status === 'rejected') return trx.sync_error || 'Transaksi ditolak backend';
    if (trx.sync_status === 'synced') return 'Sudah sinkron';
    return null;
  };

  return (
    <div>
      <div className="page-header">
        <h1>📥 Pembelian</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Pembelian Baru</button>
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>Pembelian Baru</h2>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Supplier</label>
                <input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Nama supplier (opsional)"
                />
              </div>

              {/* Input Kode Barcode */}
              <div className="barcode-input-row">
                <input
                  className="barcode-input"
                  type="text"
                  placeholder="Ketik kode barang lalu ENTER..."
                  value={kodeInput}
                  onChange={(e) => setKodeInput(e.target.value)}
                  onKeyDown={handleKodeKeyDown}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary barcode-scan-btn"
                  onClick={() => setShowScanner(true)}
                  title="Scan barcode dengan kamera"
                >
                  📷
                </button>
              </div>

              {/* Daftar Item */}
              {items.length > 0 ? (
                <div className="cart-items">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Kode</th>
                        <th>Nama Barang</th>
                        <th className="text-right">Harga Beli</th>
                        <th className="text-center" style={{ width: 60 }}>Qty</th>
                        <th className="text-right">Subtotal</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => {
                        const info = barangList.find((b) => b._id === item.barang);
                        const subtotal = item.qty * (item.harga || 0);
                        return (
                          <tr key={i}>
                            <td><code>{info?.kode || '?'}</code></td>
                            <td>{info?.nama || '—'}</td>
                            <td className="text-right">
                              <input
                                type="number"
                                className="qty-input"
                                min="0"
                                value={item.harga}
                                onChange={(e) => updateHarga(i, e.target.value)}
                                style={{ width: 100, textAlign: 'right' }}
                              />
                            </td>
                            <td className="text-center">
                              <input
                                type="number"
                                className="qty-input"
                                min="1"
                                value={item.qty}
                                onChange={(e) => updateQty(i, parseInt(e.target.value) || 0)}
                              />
                            </td>
                            <td className="text-right">{formatRp(subtotal)}</td>
                            <td className="text-center">
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="text-right"><strong>Total</strong></td>
                        <td className="text-right" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                          {formatRp(items.reduce((sum, item) => sum + item.qty * (item.harga || 0), 0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="cart-empty">
                  <p>🛒 Belum ada item</p>
                  <p className="text-muted">Ketik kode barang atau scan barcode</p>
                </div>
              )}

              <div className="form-group">
                <label>Keterangan</label>
                <input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Opsional..." />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setItems([]); setError(''); }}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={items.length === 0}>
                  💾 Simpan ({items.length} item)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      {showScanner && (
        <Scanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {loading ? (
        <p className="text-muted">Memuat...</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>No Transaksi</th>
                <th>Tanggal</th>
                <th>Supplier</th>
                <th>Items</th>
                <th className="text-right">Total</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {transaksi.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted">Belum ada transaksi</td></tr>
              ) : (
                transaksi.map((trx) => (
                  <tr key={trx._id}>
                    <td>
                      <code>{trx.no_transaksi || 'Menunggu Sync'}</code>
                      {renderSyncMeta(trx) ? (
                        <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          {renderSyncMeta(trx)}
                        </div>
                      ) : null}
                    </td>
                    <td>{formatTgl(trx.tanggal)}</td>
                    <td>{trx.supplier || '-'}</td>
                    <td>
                      {trx.items.map((it, i) => (
                        <div key={i} className="item-line">
                          {it.nama} <span className="text-muted">x{it.qty} @{formatRp(it.harga)}</span>
                        </div>
                      ))}
                    </td>
                    <td className="text-right"><strong>{formatRp(trx.total)}</strong></td>
                    <td className="text-center">
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleBatal(trx._id)}
                        title="Batalkan"
                        disabled={trx.sync_status === 'conflict' || trx.sync_status === 'rejected'}
                      >
                        ↩️ Batal
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
