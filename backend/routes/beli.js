const express = require('express');
const router = express.Router();
const Beli = require('../models/Beli');
const Barang = require('../models/Barang');

const genNoTransaksi = (prefix = 'BEL') => {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${y}${m}${d}${rand}`;
};

// GET /api/beli — semua transaksi pembelian
router.get('/', async (req, res) => {
  try {
    const { tglMulai, tglAkhir, supplier, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (tglMulai || tglAkhir) {
      filter.tanggal = {};
      if (tglMulai) filter.tanggal.$gte = new Date(tglMulai);
      if (tglAkhir) filter.tanggal.$lte = new Date(tglAkhir);
    }
    if (supplier) filter.supplier = { $regex: supplier, $options: 'i' };

    const total = await Beli.countDocuments(filter);
    const data = await Beli.find(filter)
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    res.json({ total, page: +page, limit: +limit, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/beli/:id — satu transaksi
router.get('/:id', async (req, res) => {
  try {
    const beli = await Beli.findById(req.params.id);
    if (!beli) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json(beli);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/beli — buat transaksi pembelian
router.post('/', async (req, res) => {
  try {
    const { items, supplier, keterangan } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Minimal 1 item' });
    }

    let total = 0;
    const itemsPopulated = [];

    for (const item of items) {
      const barang = await Barang.findById(item.barang);
      if (!barang) {
        return res.status(404).json({ error: `Barang ID ${item.barang} tidak ditemukan` });
      }

      const subtotal = item.qty * item.harga;
      total += subtotal;

      itemsPopulated.push({
        barang: barang._id,
        nama: barang.nama,
        kode: barang.kode,
        qty: item.qty,
        harga: item.harga,
        subtotal,
      });
    }

    // Tambah stok (pembelian menambah stok)
    for (const item of itemsPopulated) {
      await Barang.findByIdAndUpdate(item.barang, {
        $inc: { stok: item.qty },
        // Update harga beli jika lebih baru
        $set: { harga_beli: item.harga },
      });
    }

    const beli = await Beli.create({
      no_transaksi: genNoTransaksi('BEL'),
      supplier: supplier || '',
      items: itemsPopulated,
      total,
      keterangan,
    });

    res.status(201).json(beli);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Nomor transaksi sudah digunakan' });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/beli/:id — edit keterangan & supplier saja
router.put('/:id', async (req, res) => {
  try {
    const { keterangan, supplier } = req.body;
    const update = {};
    if (keterangan !== undefined) update.keterangan = keterangan;
    if (supplier !== undefined) update.supplier = supplier;

    const beli = await Beli.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!beli) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json(beli);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/beli/:id — batalkan pembelian (kurangi stok)
router.delete('/:id', async (req, res) => {
  try {
    const beli = await Beli.findById(req.params.id);
    if (!beli) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    // Kurangi stok (batalkan pembelian)
    for (const item of beli.items) {
      await Barang.findByIdAndUpdate(item.barang, {
        $inc: { stok: -item.qty },
      });
    }

    await beli.deleteOne();
    res.json({ message: 'Pembelian dibatalkan, stok dikurangi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
