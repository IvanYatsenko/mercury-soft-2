#!/bin/sh
set -eu

export PATH="$HOME/.local/share/node-v24.21.0-linux-arm64/bin:$HOME/.local/share/mercury-tools/node_modules/.bin:$PATH"
project_directory="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$project_directory"
exec pnpm start
