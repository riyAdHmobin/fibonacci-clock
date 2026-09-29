#!/usr/bin/env bash
# Remove the Fibonacci Clock screensaver extension.
#
#   ./uninstall.sh                 remove the extension (settings are kept)
#   ./uninstall.sh --legacy-only   only remove the older standalone daemon
set -euo pipefail

UUID="fibonacci-clock@deusexautomata.com"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

# Older standalone version: autostart daemon in ~/.local/share.
LEGACY="${XDG_DATA_HOME:-$HOME/.local/share}/fibonacci-screensaver"
pkill -f "$LEGACY/fibonacci-screensaver.py" 2>/dev/null || true
rm -rf "$LEGACY" "$HOME/.local/bin/fibonacci-screensaver" \
  "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/fibonacci-screensaver.desktop"
[[ "${1:-}" == "--legacy-only" ]] && exit 0

gnome-extensions disable "$UUID" 2>/dev/null || true
enabled="$(gsettings get org.gnome.shell enabled-extensions)"
if [[ "$enabled" == *"'$UUID'"* ]]; then
  cleaned="$(sed -e "s/'$UUID'//; s/\[, /[/; s/, ,/,/; s/, \]/]/" <<<"$enabled")"
  gsettings set org.gnome.shell enabled-extensions "$cleaned"
fi
pkill -f "$DEST/fibonacci-viewer.py" 2>/dev/null || true
rm -rf "$DEST"

echo "Uninstalled. Log out and back in if GNOME Shell still shows it."
