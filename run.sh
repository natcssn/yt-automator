#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"
ENV_FILE="$SERVER_DIR/.env"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but was not found in PATH."
  exit 1
fi

install_deps_if_needed() {
  local dir="$1"
  local name="$2"

  if [[ ! -d "$dir/node_modules" ]]; then
    echo "Installing $name dependencies..."
    npm --prefix "$dir" install
  fi
}

install_deps_if_needed "$SERVER_DIR" "server"
install_deps_if_needed "$CLIENT_DIR" "client"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Creating default .env from .env.example..."
  cp "$SERVER_DIR/.env.example" "$ENV_FILE"
fi

cleanup() {
  echo
  echo "Stopping services..."
  local pids
  pids="$(jobs -p)"
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:5000"
npm --prefix "$SERVER_DIR" run dev &
SERVER_PID=$!

echo "Starting frontend on http://localhost:5173"
npm --prefix "$CLIENT_DIR" run dev &
CLIENT_PID=$!

echo
echo "Both services are running. Press Ctrl+C to stop."

set +e
wait -n "$SERVER_PID" "$CLIENT_PID"
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -ne 0 ]]; then
  echo
  echo "A service exited with code $EXIT_CODE. Shutting down the other service..."
  exit $EXIT_CODE
fi
