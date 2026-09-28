#!/usr/bin/env bash
# Install the Fibonacci Clock screensaver for the current user.
#
#   ./install.sh [--timeout SECONDS] [--ignore-inhibitors]
#
# Copies the clock page and the daemon into ~/.local/share, adds a
# launcher in ~/.local/bin, registers a GNOME autostart entry, and starts
# the daemon now. No root needed, except to install missing packages.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_WEB="$(dirname "$HERE")"

NAME="fibonacci-screensaver"
SHARE="${XDG_DATA_HOME:-$HOME/.local/share}/$NAME"
BIN="$HOME/.local/bin/$NAME"
AUTOSTART="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/$NAME.desktop"

timeout=120
extra_args=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) timeout="${2:?--timeout needs a value}"; shift 2 ;;
    --ignore-inhibitors) extra_args=" --ignore-inhibitors"; shift ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
[[ "$timeout" =~ ^[0-9]+$ && "$timeout" -gt 0 ]] || { echo "--timeout must be a positive integer" >&2; exit 1; }

# Runtime dependencies: PyGObject with GTK 4 and WebKitGTK 6.0.
if ! python3 - <<'EOF' 2>/dev/null
import gi
gi.require_version("Gtk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gtk, WebKit
EOF
then
  pkgs="python3-gi gir1.2-gtk-4.0 gir1.2-webkit-6.0"
  echo "Missing dependencies. Installing: $pkgs"
  sudo apt-get install -y $pkgs
fi

for f in fibonacci-clock.html style.css script.js; do
  [[ -f "$SRC_WEB/$f" ]] || { echo "Missing $SRC_WEB/$f" >&2; exit 1; }
done

# Stop a running copy before replacing its files.
pkill -f "$SHARE/$NAME.py" 2>/dev/null || true

mkdir -p "$SHARE/web" "$(dirname "$BIN")" "$(dirname "$AUTOSTART")"
install -m 644 "$SRC_WEB/fibonacci-clock.html" "$SRC_WEB/style.css" "$SRC_WEB/script.js" "$SHARE/web/"
install -m 755 "$HERE/$NAME.py" "$SHARE/$NAME.py"
install -m 644 "$HERE/landscape.js" "$SHARE/landscape.js"

cat > "$BIN" <<EOF
#!/bin/bash
# Undo environment overrides leaked by snap apps (e.g. a VS Code snap
# terminal). They point GTK and WebKit at the snap's libraries and crash
# WebKit's helper processes.
for orig in \$(compgen -v | grep '_VSCODE_SNAP_ORIG\$'); do
  var="\${orig%_VSCODE_SNAP_ORIG}"
  if [[ -n "\${!orig}" ]]; then export "\$var=\${!orig}"; else unset "\$var"; fi
  unset "\$orig"
done
exec /usr/bin/python3 "$SHARE/$NAME.py" "\$@"
EOF
chmod 755 "$BIN"

cat > "$AUTOSTART" <<EOF
[Desktop Entry]
Type=Application
Name=Fibonacci Clock Screensaver
Comment=Shows the Fibonacci Clock after ${timeout}s of inactivity
Exec=$BIN --timeout $timeout$extra_args
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF

setsid "$BIN" --timeout "$timeout"$extra_args >/dev/null 2>&1 < /dev/null &

echo "Installed. The clock appears after ${timeout}s of inactivity and starts at every login."
echo "Preview now:  $BIN --preview"

# GNOME blanks the screen on its own schedule; warn if that comes first.
delay="$(gsettings get org.gnome.desktop.session idle-delay 2>/dev/null | awk '{print $NF}')"
if [[ -n "$delay" && "$delay" -ne 0 && "$delay" -le "$timeout" ]]; then
  echo "Note: GNOME blanks the screen after ${delay}s, before the clock can show."
  echo "      Raise Settings > Power > Screen Blank, or reinstall with a smaller --timeout."
fi
