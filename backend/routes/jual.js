const express = require('express');
const router = express.Router();
const Jual = require('../models/Jual');
const Barang = require('../models/Barang');

// Helper: generate nomor transaksi
const genNoTransaksi = (prefix = 'JUL') => {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${y}${m}${d}${rand}`;
};

// GET /api/jual — semua transaksi
router.get('/', async (req, res) => {
  try {
    const { tglMulai, tglAkhir, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (tglMulai || tglAkhir) {
      filter.tanggal = {};
      if (tglMulai) filter.tanggal.$gte = new Date(tglMulai);
      if (tglAkhir) filter.tanggal.$lte = new Date(tglAkhir);
    }

    const total = await Jual.countDocuments(filter);
    const data = await Jual.find(filter)
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    res.json({ total, page: +page, limit: +limit, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jual/:id — satu transaksi
router.get('/:id', async (req, res) => {
  try {
    const jual = await Jual.findById(req.params.id);
    if (!jual) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json(jual);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jual — buat transaksi penjualan
router.post('/', async (req, res) => {
  try {
    const { items, keterangan } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Minimal 1 item' });
    }

    let total = 0;
    const itemsPopulated = [];

    // Validasi stok & hitung subtotal
    for (const item of items) {
      const barang = await Barang.findById(item.barang);
      if (!barang) {
        return res.status(404).json({ error: `Barang ID ${item.barang} tidak ditemukan` });
      }
      if (barang.stok < item.qty) {
        return res.status(400).json({
          error: `Stok ${barang.nama} tidak cukup (tersedia: ${barang.stok})`,
        });
      }

      const subtotal = item.qty * barang.harga_jual;
      total += subtotal;

      itemsPopulated.push({
        barang: barang._id,
        nama: barang.nama,
        kode: barang.kode,
        qty: item.qty,
        harga: barang.harga_jual,
        subtotal,
      });
    }

    // Kurangi stok
    for (const item of itemsPopulated) {
      await Barang.findByIdAndUpdate(item.barang, {
        $inc: { stok: -item.qty },
      });
    }

    const jual = await Jual.create({
      no_transaksi: genNoTransaksi('JUL'),
      items: itemsPopulated,
      total,
      keterangan,
    });

    res.status(201).json(jual);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Nomor transaksi sudah digunakan' });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/jual/:id — edit transaksi (keterangan saja, tidak ubah items)
router.put('/:id', async (req, res) => {
  try {
    const { keterangan } = req.body;
    const jual = await Jual.findByIdAndUpdate(
      req.params.id,
      { keterangan },
      { new: true }
    );
    if (!jual) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json(jual);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/jual/:id — batalkan transaksi (kembalikan stok)
router.delete('/:id', async (req, res) => {
  try {
    const jual = await Jual.findById(req.params.id);
    if (!jual) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    // Kembalikan stok
    for (const item of jual.items) {
      await Barang.findByIdAndUpdate(item.barang, {
        $inc: { stok: item.qty },
      });
    }

    await jual.deleteOne();
    res.json({ message: 'Transaksi dibatalkan, stok dikembalikan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
