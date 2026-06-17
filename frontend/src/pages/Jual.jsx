import { useState, useEffect, useCallback } from 'react';
import api from '../offlineApi';
import Scanner from '../components/Scanner';

export default function Jual() {
  const [transaksi, setTransaksi] = useState([]);
  const [barangList, setBarangList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [items, setItems] = useState([]);
  const [kodeInput, setKodeInput] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const fetchTransaksi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/jual');
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

  // Tambah barang ke list berdasarkan kode (manual input atau scan)
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
      setItems([...items, { barang: found._id, qty: 1 }]);
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
    if (qty <= 0) {
      newItems.splice(i, 1);
    } else {
      newItems[i] = { ...newItems[i], qty };
    }
    setItems(newItems);
  };

  const removeItem = (i) => {
    setItems(items.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validItems = items.filter((it) => it.barang && it.qty > 0);
    if (validItems.length === 0) {
      return setError('Pilih minimal 1 barang');
    }

    try {
      await api.post('/jual', { items: validItems, keterangan });
      setSuccess('Transaksi berhasil!');
      setShowForm(false);
      setItems([]);
      setKeterangan('');
      fetchTransaksi();
      fetchBarang(); // refresh stok
    } catch (err) {
      if (err.message?.startsWith('OFFLINE_QUEUED')) {
        setSuccess('Transaksi berhasil disimpan!');
        setShowForm(false);
        setItems([]);
        setKeterangan('');
      } else {
        setError(err.response?.data?.error || err.message);
      }
    }
  };

  const handleBatal = async (id) => {
    if (!confirm('Batalkan transaksi ini? Stok akan dikembalikan.')) return;
    try {
      await api.delete(`/jual/${id}`);
      fetchTransaksi();
      fetchBarang();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  // Handle hasil scan kamera
  const handleScan = (scannedCode) => {
    tambahByKode(scannedCode);
  };

  const getBarangInfo = (id) => barangList.find((b) => b._id === id);
  const formatRp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
  const formatTgl = (d) => new Date(d).toLocaleString('id-ID');

  return (
    <div>
      <div className="page-header">
        <h1>🛍️ Penjualan</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Transaksi Baru</button>
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>Transaksi Penjualan Baru</h2>

            <form onSubmit={handleSubmit}>
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
                        <th className="text-right">Harga</th>
                        <th className="text-center" style={{ width: 80 }}>Qty</th>
                        <th className="text-right">Subtotal</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => {
                        const info = getBarangInfo(item.barang);
                        const subtotal = (info?.harga_jual || 0) * item.qty;
                        return (
                          <tr key={i}>
                            <td><code>{info?.kode || '?'}</code></td>
                            <td>{info?.nama || '—'}</td>
                            <td className="text-right">{info ? formatRp(info.harga_jual) : '—'}</td>
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
                          {formatRp(items.reduce((sum, item) => {
                            const info = getBarangInfo(item.barang);
                            return sum + (info?.harga_jual || 0) * item.qty;
                          }, 0))}
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
                <th>Items</th>
                <th className="text-right">Total</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {transaksi.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted">Belum ada transaksi</td></tr>
              ) : (
                transaksi.map((trx) => (
                  <tr key={trx._id}>
                    <td><code>{trx.no_transaksi}</code></td>
                    <td>{formatTgl(trx.tanggal)}</td>
                    <td>
                      {trx.items.map((it, i) => (
                        <div key={i} className="item-line">
                          {it.nama} <span className="text-muted">x{it.qty}</span>
                        </div>
                      ))}
                    </td>
                    <td className="text-right"><strong>{formatRp(trx.total)}</strong></td>
                    <td className="text-center">
                      <button className="btn btn-sm btn-danger" onClick={() => handleBatal(trx._id)} title="Batalkan">↩️ Batal</button>
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
