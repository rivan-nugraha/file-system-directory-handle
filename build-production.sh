#!/bin/bash
# build-production.sh — Build & copy production-ready files
# Usage: bash build-production.sh
# Prasyarat: Node.js 18+ (nvm use 18)

set -e

# Load nvm jika ada
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm use 22.17

# Cek Node version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ diperlukan. Versi saat ini: $(node -v 2>/dev/null || echo 'tidak ada')"
  echo "   Jalankan: nvm use 18 (atau 20, 22)"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
PROD_FRONTEND="$ROOT_DIR/file-system-directory-handle-production"
PROD_BACKEND="$ROOT_DIR/file-system-directory-handle-api-production"

echo "============================================"
echo "  Build Production"
echo "============================================"

# ── Frontend ──────────────────────────────────────────────

echo ""
echo "📦 Building frontend..."
cd "$FRONTEND_DIR"
npm run build

echo ""
echo "📁 Copying frontend to $PROD_FRONTEND ..."
rm -rf "$PROD_FRONTEND"
cp -r dist "$PROD_FRONTEND"

echo "✅ Frontend production ready: $PROD_FRONTEND"
echo "   Serve with: npx serve file-system-directory-handle-production"
echo "   Or copy to nginx: cp -r file-system-directory-handle-production /var/www/pos"

# ── Backend ───────────────────────────────────────────────

echo ""
echo "📦 Copying backend to $PROD_BACKEND (without node_modules)..."
rm -rf "$PROD_BACKEND"
mkdir -p "$PROD_BACKEND"

# Copy everything except node_modules
rsync -av --exclude='node_modules' --exclude='.env' "$BACKEND_DIR/" "$PROD_BACKEND/"

# Copy .env.example as template
if [ -f "$BACKEND_DIR/.env.example" ]; then
  cp "$BACKEND_DIR/.env.example" "$PROD_BACKEND/"
fi

echo "✅ Backend production ready: $PROD_BACKEND"
echo "   Setup:  cd file-system-directory-handle-api-production"
echo "           cp .env.example .env   # edit MONGO_URI"
echo "           npm install --production"
echo "           npm start"

echo ""
echo "============================================"
echo "  Production build complete!"
echo "============================================"
echo ""
echo "  Frontend: $PROD_FRONTEND"
echo "  Backend:  $PROD_BACKEND"
echo ""
echo "  Deploy commands:"
echo "  ─────────────────────────────────"
echo "  # Serve frontend"
echo "  npx serve file-system-directory-handle-production"
echo ""
echo "  # Run backend"
echo "  cd file-system-directory-handle-api-production"
echo "  npm install --production"
echo "  npm start"
echo "  ─────────────────────────────────"
