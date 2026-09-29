# Fibonacci Clock screensaver for Ubuntu

GNOME Shell extension that shows the Fibonacci Clock full screen on every monitor after a period of inactivity. Any key, click, scroll, or mouse movement closes it. A settings window lets you change the idle time and every color and font of the clock.

Tested on Ubuntu 24.04 with GNOME 46 on Wayland. `metadata.json` also lists GNOME 45, 47 and 48, which use the same extension API but are untested.

## Install

```sh
./install.sh
```

Then log out and back in. A running Wayland session only discovers new extensions at login. After updates to an already loaded extension, logging out is also needed so GNOME Shell reloads `extension.js`.

The installer:

- installs `python3-gi`, `gir1.2-gtk-4.0` and `gir1.2-webkit-6.0` with `apt` if they are missing (this step asks for `sudo`);
- copies the extension plus `../fibonacci-clock.html`, `../style.css` and `../script.js` to `~/.local/share/gnome-shell/extensions/fibonacci-clock@deusexautomata.com/`;
- compiles the settings schema and enables the extension;
- removes the older standalone daemon version, if it is installed.

Run `./install.sh` again after you change the clock files, so the installed copy is updated.

## Settings

Open them from the Extensions app, or run:

```sh
gnome-extensions prefs fibonacci-clock@deusexautomata.com
```

- **General:** idle time, whether to show during video playback, a Preview button, and a reset for all colors, fonts and sizes.
- **Colors:** background, dial ring and ticks, hour hand, center dot, hour numbers, current hour number, hour tracks, current hour track, minute numbers, current minute number, minute tracks, current minute track, second numbers, current second number, second tracks, current second track, weekday names, current weekday name, weekday tracks, current weekday track, hour spiral, minute spiral, second spiral, weekday spiral, digital time, title, caption, Fibonacci numbers.
- **Fonts:** font face and size for the digital time, hour numbers, minute numbers, second numbers, weekday names, title, caption and Fibonacci numbers. Sizes are in SVG units; the portrait page is 600 units wide.

Title, caption and Fibonacci numbers settings only have an effect if that text is present in `fibonacci-clock.html`.

Changes apply the next time the clock shows.

## Uninstall

```sh
./uninstall.sh
```

Your settings stay in dconf under `/org/gnome/shell/extensions/fibonacci-clock/`.

## How it works

- `extension.js` runs inside GNOME Shell. It adds a Mutter idle watch for the configured time. When the watch fires, it starts `fibonacci-viewer.py`, unless the screen is locked or an app inhibits idle (for example a browser playing video).
- `fibonacci-viewer.py` opens one fullscreen WebKit window per monitor with the clock page and quits on any input. The extension also stops it through a Mutter user-active watch, in case the window did not get focus.
- `launcher.js` is shared by the extension and the settings window. It passes all `color-*`, `font-*` and `size-*` settings to the viewer as JSON.
- The viewer turns those settings into injected CSS. It also forces the dark theme, hides the cursor and the speed button, and loads `landscape.js`. On landscape screens, `landscape.js` widens the SVG viewBox around the dial and moves the text left of it. The web files stay unchanged.

GNOME's own screen blanking and lock screen still apply. If Settings > Power > Screen Blank is shorter than the idle time, the screen blanks before the clock shows.

