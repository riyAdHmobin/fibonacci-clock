# Fibonacci Clock screensaver for Ubuntu

Shows the Fibonacci Clock full screen on every monitor after a period of inactivity. Any key, click, scroll, or mouse movement closes it.

Tested on Ubuntu 24.04 with GNOME 46 on Wayland. It should also work on GNOME with X11.

## Install

```sh
./install.sh                    # clock shows after 120 s idle
./install.sh --timeout 300      # custom idle time in seconds
./install.sh --ignore-inhibitors
```

The installer:

- installs `python3-gi`, `gir1.2-gtk-4.0` and `gir1.2-webkit-6.0` with `apt` if they are missing (this step asks for `sudo`);
- copies `../fibonacci-clock.html`, `../style.css` and `../script.js` plus the daemon into `~/.local/share/fibonacci-screensaver/`;
- adds the `~/.local/bin/fibonacci-screensaver` launcher;
- adds `~/.config/autostart/fibonacci-screensaver.desktop` so the daemon starts at login;
- starts the daemon now.

Run `./install.sh` again after you change the clock files, so the installed copy is updated.

## Use

```sh
fibonacci-screensaver --preview   # show the clock now
./uninstall.sh                    # stop and remove everything
```

## How it works

GNOME has no screensaver plugin API, and xscreensaver does not work on Wayland. So `fibonacci-screensaver.py` runs as a small GTK 4 background app:

- It registers an idle watch with Mutter (`org.gnome.Mutter.IdleMonitor`). When that fires, it opens one fullscreen WebKit window per monitor with the clock page.
- It closes the windows on any input. A Mutter user-active watch also closes them if the windows did not get keyboard focus.
- It skips showing while an app inhibits idle through `org.gnome.SessionManager`, for example a browser playing video. Use `--ignore-inhibitors` to change this.
- It injects CSS and JS into the page to force the dark theme and hide the cursor and the speed button. On landscape screens, `landscape.js` widens the SVG viewBox around the dial and moves the text left of it. Portrait screens keep the original layout. The web files stay unchanged.

GNOME's own screen blanking and lock screen still apply. If Settings > Power > Screen Blank is shorter than the timeout, the screen blanks before the clock shows. The installer warns about this.
