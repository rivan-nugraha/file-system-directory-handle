const mongoose = require('mongoose');

const itemBeliSchema = new mongoose.Schema(
  {
    barang: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barang',
      required: true,
    },
    nama: String,
    kode: String,
    qty: { type: Number, required: true, min: 1 },
    harga: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const beliSchema = new mongoose.Schema(
  {
    no_transaksi: {
      type: String,
      required: true,
      unique: true,
    },
    tanggal: {
      type: Date,
      default: Date.now,
    },
    supplier: {
      type: String,
      trim: true,
      default: '',
    },
    items: {
      type: [itemBeliSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Minimal 1 item',
      },
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    keterangan: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Beli', beliSchema);
