const express = require('express');
const router = express.Router();
const Barang = require('../models/Barang');

// GET /api/barang — semua barang
router.get('/', async (req, res) => {
  try {
    const { kategori, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (kategori) filter.kategori = kategori;
    if (search) {
      filter.$or = [
        { nama: { $regex: search, $options: 'i' } },
        { kode: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Barang.countDocuments(filter);
    const data = await Barang.find(filter)
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    res.json({ total, page: +page, limit: +limit, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/barang/:id — satu barang
router.get('/:id', async (req, res) => {
  try {
    const barang = await Barang.findById(req.params.id);
    if (!barang) return res.status(404).json({ error: 'Barang tidak ditemukan' });
    res.json(barang);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/barang — tambah barang
router.post('/', async (req, res) => {
  try {
    const barang = await Barang.create(req.body);
    res.status(201).json(barang);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Kode barang sudah digunakan' });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/barang/:id — edit barang
router.put('/:id', async (req, res) => {
  try {
    const barang = await Barang.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!barang) return res.status(404).json({ error: 'Barang tidak ditemukan' });
    res.json(barang);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/barang/:id — hapus barang
router.delete('/:id', async (req, res) => {
  try {
    const barang = await Barang.findByIdAndDelete(req.params.id);
    if (!barang) return res.status(404).json({ error: 'Barang tidak ditemukan' });
    res.json({ message: 'Barang dihapus', barang });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
