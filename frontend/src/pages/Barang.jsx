import { useState, useEffect, useCallback } from 'react';
import api from '../offlineApi';
import { getStorageInfo, onStorageChange } from '../localFs';

const emptyForm = { kode: '', nama: '', harga_beli: '', harga_jual: '', stok: '', kategori: '' };

export default function Barang() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [storageInfo, setStorageInfo] = useState({
    ready: false,
    lastError: '',
  });

  useEffect(() => {
    const refreshStorage = () => {
      getStorageInfo()
        .then(setStorageInfo)
        .catch(() => {
          setStorageInfo({ ready: false, lastError: 'Storage offline tidak bisa diperiksa.' });
        });
    };

    refreshStorage();
    const unsub = onStorageChange(refreshStorage);
    return unsub;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? { search } : {};
      const res = await api.get('/barang', { params });
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditId(item._id);
    setForm({
      kode: item.kode,
      nama: item.nama,
      harga_beli: item.harga_beli,
      harga_jual: item.harga_jual,
      stok: item.stok,
      kategori: item.kategori,
    });
    setShowForm(true);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      harga_beli: Number(form.harga_beli),
      harga_jual: Number(form.harga_jual),
      stok: Number(form.stok),
    };

    try {
      if (editId) {
        await api.put(`/barang/${editId}`, payload);
      } else {
        await api.post('/barang', payload);
      }
      setShowForm(false);
      fetchData();
    } catch (err) {
      if (err.message?.startsWith('OFFLINE_QUEUED')) {
        setShowForm(false);
        fetchData();
        // Tidak ada pesan error — data sudah tersimpan lokal
      } else {
        setError(err.response?.data?.error || err.message);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus barang ini?')) return;
    // Optimistic delete: hapus dari UI langsung, jangan nunggu network
    setData((prev) => prev.filter((item) => item._id !== id));
    try {
      await api.delete(`/barang/${id}`);
      fetchData(); // refresh dari server kalau online
    } catch (err) {
      if (err.message?.startsWith('OFFLINE_QUEUED')) {
        // Sudah dihapus dari localFs & UI, tidak perlu fetch ulang
      } else {
        setError(err.response?.data?.error || err.message);
        fetchData(); // rollback dari server/local
      }
    }
  };

  const formatRp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

  return (
    <div>
      <div className="page-header">
        <h1>📦 Data Barang</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Tambah Barang</button>
      </div>

      <div className="toolbar">
        <input
          className="input-search"
          placeholder="Cari nama atau kode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!navigator.onLine && data.length === 0 ? (
        <div className="offline-banner">
          {!storageInfo.ready
            ? 'Mode offline aktif, tapi cache lokal belum tersedia. Buka data ini saat online setelah storage lokal aktif.'
            : 'Mode offline aktif. Jika data kosong, berarti barang belum sempat tersimpan ke cache lokal.'}
        </div>
      ) : null}

      {storageInfo.lastError ? (
        <div className="alert alert-error">
          Cache offline bermasalah: {storageInfo.lastError}
        </div>
      ) : null}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="text-muted">Memuat...</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama</th>
                <th>Kategori</th>
                <th className="text-right">Harga Beli</th>
                <th className="text-right">Harga Jual</th>
                <th className="text-center">Stok</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted">Belum ada data barang</td></tr>
              ) : (
                data.map((item) => (
                  <tr key={item._id}>
                    <td><code>{item.kode}</code></td>
                    <td>{item.nama}</td>
                    <td>{item.kategori}</td>
                    <td className="text-right">{formatRp(item.harga_beli)}</td>
                    <td className="text-right">{formatRp(item.harga_jual)}</td>
                    <td className="text-center">
                      <span className={`stok-badge ${item.stok === 0 ? 'stok-habis' : item.stok < 5 ? 'stok-tipis' : ''}`}>
                        {item.stok}
                      </span>
                    </td>
                    <td className="text-center">
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(item)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(item._id)}>🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editId ? 'Edit Barang' : 'Tambah Barang'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Kode</label>
                  <input name="kode" value={form.kode} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Nama</label>
                  <input name="nama" value={form.nama} onChange={handleChange} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Harga Beli</label>
                  <input name="harga_beli" type="number" value={form.harga_beli} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Harga Jual</label>
                  <input name="harga_jual" type="number" value={form.harga_jual} onChange={handleChange} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Stok Awal</label>
                  <input name="stok" type="number" value={form.stok} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label>Kategori</label>
                  <input name="kategori" value={form.kategori} onChange={handleChange} />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">{editId ? 'Simpan' : 'Tambah'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
