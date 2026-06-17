const mongoose = require('mongoose');

const barangSchema = new mongoose.Schema(
  {
    kode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    nama: {
      type: String,
      required: true,
      trim: true,
    },
    harga_beli: {
      type: Number,
      required: true,
      min: 0,
    },
    harga_jual: {
      type: Number,
      required: true,
      min: 0,
    },
    stok: {
      type: Number,
      default: 0,
      min: 0,
    },
    kategori: {
      type: String,
      trim: true,
      default: 'Umum',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Barang', barangSchema);
