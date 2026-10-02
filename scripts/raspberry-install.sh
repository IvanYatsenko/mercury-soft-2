#!/bin/sh
set -eu

project_directory="${MERCURY_PROJECT_DIRECTORY:-$HOME/mercury-v3}"
node_directory="$HOME/.local/share/node-v24.21.0-linux-arm64"
tools_directory="$HOME/.local/share/mercury-tools"

if [ "$(uname -m)" != aarch64 ]; then
  echo 'This installer requires a 64-bit ARM system.' >&2
  exit 1
fi

mkdir -p "$HOME/.local/share"
if [ ! -x "$node_directory/bin/node" ]; then
  download_directory="$(mktemp -d)"
  curl -fL --retry 3 https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-arm64.tar.xz \
    -o "$download_directory/node.tar.xz"
  printf '%s  %s\n' 6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2 "$download_directory/node.tar.xz" | sha256sum -c -
  tar -xJf "$download_directory/node.tar.xz" -C "$HOME/.local/share"
  rm "$download_directory/node.tar.xz"
  rmdir "$download_directory"
fi

export PATH="$node_directory/bin:$tools_directory/node_modules/.bin:$PATH"
if [ ! -x "$tools_directory/node_modules/.bin/pnpm" ]; then
  npm install --prefix "$tools_directory" pnpm@11.25.0
fi

cd "$project_directory"
pnpm install --frozen-lockfile
node apps/panel/node_modules/electron/install.js
pnpm -r --workspace-concurrency=1 build

if [ ! -f .env ]; then
  cat > .env <<'ENV'
MERCURY_CONTROLLER_MODE=simulation
MERCURY_SERIAL_PORT=/dev/serial0
MERCURY_API_PORT=3001
MERCURY_WEB_PORT=5173
MERCURY_PANEL_FULLSCREEN=true
MERCURY_PANEL_SOFTWARE_RENDERING=true
ENV
fi

echo "Build complete: $project_directory"
