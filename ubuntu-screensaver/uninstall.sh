#!/usr/bin/env bash
# Remove the Fibonacci Clock screensaver installed by install.sh.
set -euo pipefail

NAME="fibonacci-screensaver"
SHARE="${XDG_DATA_HOME:-$HOME/.local/share}/$NAME"
BIN="$HOME/.local/bin/$NAME"
AUTOSTART="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/$NAME.desktop"

pkill -f "$SHARE/$NAME.py" 2>/dev/null || true
rm -f "$AUTOSTART" "$BIN"
rm -rf "$SHARE"

echo "Uninstalled."
