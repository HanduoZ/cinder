#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BIN_DIR="$HOME/.local/bin"

echo "Installing Cinder from $ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required. Install Node.js first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install npm first." >&2
  exit 1
fi

mkdir -p "$BIN_DIR"
npm install --prefix "$ROOT_DIR"
chmod +x "$ROOT_DIR/bin/cinder.js"
ln -sf "$ROOT_DIR/bin/cinder.js" "$BIN_DIR/cinder"
mkdir -p "$HOME/.cinder"

echo
echo "Cinder installed."
echo "Run: cinder doctor"
echo "Run: cinder"
echo "Phone/iPad on same Wi-Fi: cinder host --lan"
