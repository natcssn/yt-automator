#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"
ENV_FILE="$SERVER_DIR/.env"

echo "====================================================="
echo "   ✨ Launching YT Automation Studio + AutoPilot AI   "
echo "====================================================="

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Error: npm is required but was not found in PATH."
  exit 1
fi

if [[ ! -d "$SERVER_DIR/node_modules" ]]; then
  echo "📦 Installing server dependencies..."
  (cd "$SERVER_DIR" && npm install)
fi

if [[ ! -d "$CLIENT_DIR/node_modules" ]]; then
  echo "📦 Installing client dependencies..."
  (cd "$CLIENT_DIR" && npm install)
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "⚙️ Creating server .env from .env.example..."
  cp "$SERVER_DIR/.env.example" "$ENV_FILE"
fi

cleanup() {
  echo ""
  echo "🛑 Stopping all running services..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo "🚀 Starting Express backend on http://localhost:5000..."
(cd "$SERVER_DIR" && npm start) &
SERVER_PID=$!

echo "⚡ Starting Vite frontend on http://localhost:5173..."
(cd "$CLIENT_DIR" && npm run dev) &
CLIENT_PID=$!

echo ""
echo "✅ Both services are up and running!"
echo "🌐 Open your browser at: http://localhost:5173"
echo "👉 Press Ctrl+C at any time to stop."
echo "====================================================="
echo ""

wait
