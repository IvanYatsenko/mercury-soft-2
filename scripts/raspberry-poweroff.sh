#!/bin/sh
set -eu

# Runs as a separate root systemd unit, outside mercury-v3's process group.
if [ "${1:-}" = "--dry-run" ]; then
  printf '%s\n' 'stop mercury-v3 user service -> bounded sync -> unmount USB -> board poweroff [5]'
  exit 0
fi
test "$(id -u)" = 0
runuser -u pi -- env XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop mercury-v3.service
timeout 8 sync || true
if mountpoint -q /media/flash; then
  timeout 5 umount /media/flash || true
fi
project_directory="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
runuser -u pi -- /home/pi/.local/share/node-v24.21.0-linux-arm64/bin/node "$project_directory/apps/server/dist/shutdownBoard.js"
