#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_DIR="$REPO_ROOT/deploy/vps/interfaith-api"
TARGET_DIR="/opt/interfaith-api"

echo "[deploy] source: $SRC_DIR"
echo "[deploy] target: $TARGET_DIR"

mkdir -p "$TARGET_DIR"
cp "$SRC_DIR/server.js" "$TARGET_DIR/server.js"
cp "$SRC_DIR/package.json" "$TARGET_DIR/package.json"

cd "$TARGET_DIR"
npm install --omit=dev

systemctl restart interfaith-api
sleep 1
systemctl is-active interfaith-api
curl -fsS http://127.0.0.1:8787/api/health

echo "[deploy] interfaith-api deploy complete"
