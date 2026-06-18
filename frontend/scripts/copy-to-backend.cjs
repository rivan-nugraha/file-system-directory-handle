// scripts/copy-to-backend.cjs — Copy hasil build Electron ke backend/public/downloads/
const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '../release');
const targetDir = path.join(__dirname, '../../backend/public/downloads');

// Pastikan folder target ada
fs.mkdirSync(targetDir, { recursive: true });

const pkg = require('../package.json');
const version = pkg.version;

// Mapping pola file → nama tujuan
const patterns = [
  { match: /\.exe$/, name: `POS-Setup-${version}.exe` },
  { match: /\.dmg$/, exclude: /\.blockmap$/, name: `POS-${version}.dmg` },
  { match: /\.AppImage$/, name: `POS-${version}.AppImage` },
];

const copied = [];

if (fs.existsSync(releaseDir)) {
  const files = fs.readdirSync(releaseDir);

  for (const file of files) {
    for (const pattern of patterns) {
      if (pattern.match.test(file)) {
        const src = path.join(releaseDir, file);
        const dest = path.join(targetDir, pattern.name);
        fs.copyFileSync(src, dest);
        copied.push(pattern.name);
        console.log(`✅ Copied: ${pattern.name}`);
      }
    }
  }
}

if (copied.length === 0) {
  console.log('⚠️  Tidak ada file build ditemukan di release/');
  console.log('   Jalankan: npm run electron:build dulu');
} else {
  console.log(`\n📦 ${copied.length} file dicopy ke backend/public/downloads/`);
  console.log('   Siap di-download user via web app!');
}
