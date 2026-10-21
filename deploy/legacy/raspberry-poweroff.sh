#!/bin/sh
set -eu
if [ "${1:-}" = "--dry-run" ]; then
  printf '%s\n' 'stop mercury-v2 user service -> bounded sync -> unmount USB -> board poweroff [5]'
  exit 0
fi
test "$(id -u)" = 0
runuser -u pi -- env XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop mercury-v2.service
timeout 8 sync || true
if mountpoint -q /media/flash; then
  timeout 5 umount /media/flash || true
fi
project_directory="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
runuser -u pi -- env MERCURY_CONFIG_PATH=/home/pi/.config/mercury-v3/config.json MERCURY_DATABASE_PATH=/home/pi/.config/mercury-v3/profiles.sqlite \
  "$project_directory/../runtime/bin/node" "$project_directory/apps/server/dist/shutdownBoard.js"
