#!/usr/bin/env bash
# Install the Fibonacci Clock screensaver GNOME Shell extension for the
# current user. Run again after changing the clock's web files.
#
#   ./install.sh
#
# Copies the extension and the clock page into
# ~/.local/share/gnome-shell/extensions/, compiles its settings schema and
# enables it. No root needed, except to install missing packages.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_WEB="$(dirname "$HERE")"
UUID="fibonacci-clock@deusexautomata.com"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

case "${1:-}" in
  -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) echo "Unknown option: $1" >&2; exit 1 ;;
esac

command -v gnome-shell >/dev/null || { echo "GNOME Shell not found." >&2; exit 1; }

# Viewer dependencies: PyGObject with GTK 4 and WebKitGTK 6.0.
if ! /usr/bin/python3 - <<'EOF' 2>/dev/null
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

# Remove the earlier standalone daemon version, if installed.
"$HERE/uninstall.sh" --legacy-only

mkdir -p "$DEST/web" "$DEST/schemas"
install -m 644 "$HERE/$UUID"/{metadata.json,extension.js,prefs.js,launcher.js,landscape.js} "$DEST/"
install -m 755 "$HERE/$UUID/fibonacci-viewer.py" "$DEST/"
install -m 644 "$HERE/$UUID"/schemas/*.gschema.xml "$DEST/schemas/"
install -m 644 "$SRC_WEB"/{fibonacci-clock.html,style.css,script.js} "$DEST/web/"
glib-compile-schemas "$DEST/schemas"

# A running Wayland session only discovers new extensions at login, so
# `gnome-extensions enable` can fail the first time. Adding the UUID to
# the enabled list directly makes it start at the next login either way.
if gnome-extensions enable "$UUID" 2>/dev/null; then
  echo "Installed and enabled."
else
  enabled="$(gsettings get org.gnome.shell enabled-extensions)"
  if [[ "$enabled" != *"'$UUID'"* ]]; then
    if [[ "$enabled" == "@as []" || "$enabled" == "[]" ]]; then
      gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    else
      gsettings set org.gnome.shell enabled-extensions "${enabled%]}, '$UUID']"
    fi
  fi
  echo "Installed. Log out and back in to start it (GNOME loads new extensions at login)."
fi
echo "Settings: gnome-extensions prefs $UUID   (or the Extensions app)"

if [[ "$(gsettings get org.gnome.shell disable-user-extensions)" == "true" ]]; then
  echo "Note: user extensions are turned off. Turn them on in the Extensions app."
fi
