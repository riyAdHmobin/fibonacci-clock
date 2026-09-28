#!/usr/bin/env python3
"""Fibonacci Clock screensaver for GNOME (Wayland and X11).

GNOME has no screensaver plugin API, so this runs as a small background
daemon. It asks Mutter's IdleMonitor to notify it after N seconds of no
input, then covers every monitor with a fullscreen WebKit view of the
clock. Any input closes it again. GNOME's own blanking and locking are
left alone and still apply on top.
"""

import argparse
import math
import signal
import sys
from pathlib import Path

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gdk, Gio, GLib, Gtk, WebKit  # noqa: E402

APP_ID = "com.deusexautomata.FibonacciScreensaver"
DEFAULT_WEB_DIR = Path(__file__).resolve().parent / "web"

# Session manager inhibit flag set by video players, browsers, etc.
INHIBIT_IDLE = 8

# Ignore input for this long after showing, so the pointer settling or a
# key release from the last keystroke does not close the saver at once.
GRACE_MS = 800
MOTION_THRESHOLD_PX = 12

# Screensaver look: force the dark theme, hide the page's speed button and
# the cursor, let the SVG fill wide screens, and switch to the landscape
# layout. Injected so the web files stay unchanged.
USER_CSS = ("#speed { display: none !important; } * { cursor: none !important; }"
            " svg { max-width: none !important; }")
USER_JS = "document.documentElement.dataset.theme = 'dark';"
LANDSCAPE_JS = (Path(__file__).resolve().parent / "landscape.js").read_text()


class Saver:
    """Fullscreen clock windows, one per monitor."""

    def __init__(self, app, web_dir, on_closed):
        self.app = app
        self.uri = (web_dir / "fibonacci-clock.html").as_uri()
        self.on_closed = on_closed
        self.windows = []
        self.armed = False
        self.origin = None

    @property
    def showing(self):
        return bool(self.windows)

    def show(self):
        if self.showing:
            return
        self.armed = False
        self.origin = None
        monitors = Gdk.Display.get_default().get_monitors()
        for i in range(monitors.get_n_items()):
            self.windows.append(self._make_window(monitors.get_item(i)))
        GLib.timeout_add(GRACE_MS, self._arm)

    def hide(self):
        if not self.showing:
            return
        windows, self.windows = self.windows, []
        for w in windows:
            w.destroy()
        self.on_closed()

    def _arm(self):
        self.armed = True
        return GLib.SOURCE_REMOVE

    def _make_window(self, monitor):
        win = Gtk.ApplicationWindow(application=self.app, title="Fibonacci Clock")
        win.set_decorated(False)
        win.set_cursor(Gdk.Cursor.new_from_name("none", None))

        ucm = WebKit.UserContentManager()
        ucm.add_style_sheet(WebKit.UserStyleSheet.new(
            USER_CSS, WebKit.UserContentInjectedFrames.ALL_FRAMES,
            WebKit.UserStyleLevel.USER, None, None))
        ucm.add_script(WebKit.UserScript.new(
            USER_JS, WebKit.UserContentInjectedFrames.ALL_FRAMES,
            WebKit.UserScriptInjectionTime.START, None, None))
        ucm.add_script(WebKit.UserScript.new(
            LANDSCAPE_JS, WebKit.UserContentInjectedFrames.TOP_FRAME,
            WebKit.UserScriptInjectionTime.END, None, None))
        view = WebKit.WebView(user_content_manager=ucm)
        black = Gdk.RGBA()
        black.parse("black")
        view.set_background_color(black)
        view.load_uri(self.uri)
        win.set_child(view)

        # Controllers go on the window in the capture phase so they see
        # input before the web view consumes it.
        key = Gtk.EventControllerKey(propagation_phase=Gtk.PropagationPhase.CAPTURE)
        key.connect("key-pressed", lambda *a: self._input())
        click = Gtk.GestureClick(button=0, propagation_phase=Gtk.PropagationPhase.CAPTURE)
        click.connect("pressed", lambda *a: self._input())
        scroll = Gtk.EventControllerScroll(
            flags=Gtk.EventControllerScrollFlags.BOTH_AXES,
            propagation_phase=Gtk.PropagationPhase.CAPTURE)
        scroll.connect("scroll", lambda *a: self._input() or True)
        motion = Gtk.EventControllerMotion(propagation_phase=Gtk.PropagationPhase.CAPTURE)
        motion.connect("motion", self._motion)
        for c in (key, click, scroll, motion):
            win.add_controller(c)
        win.connect("close-request", lambda *a: self.hide() or True)

        win.fullscreen_on_monitor(monitor)
        win.present()
        return win

    def _input(self):
        if self.armed:
            self.hide()

    def _motion(self, _ctrl, x, y):
        if self.origin is None or not self.armed:
            self.origin = (x, y)
            return
        if math.dist(self.origin, (x, y)) > MOTION_THRESHOLD_PX:
            self.hide()


class IdleWatcher:
    """Mutter IdleMonitor client: idle and user-active callbacks."""

    def __init__(self, timeout_ms, on_idle, on_active):
        self.on_idle = on_idle
        self.on_active = on_active
        self.active_watch = None
        self.monitor = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, None,
            "org.gnome.Mutter.IdleMonitor", "/org/gnome/Mutter/IdleMonitor/Core",
            "org.gnome.Mutter.IdleMonitor", None)
        self.monitor.connect("g-signal", self._signal)
        (self.idle_watch,) = self.monitor.call_sync(
            "AddIdleWatch", GLib.Variant("(t)", (timeout_ms,)),
            Gio.DBusCallFlags.NONE, -1, None).unpack()

    def watch_for_activity(self):
        # User-active watches are one-shot, so add one per saver showing.
        # This catches input even if the saver window did not get focus.
        if self.active_watch is None:
            (self.active_watch,) = self.monitor.call_sync(
                "AddUserActiveWatch", None, Gio.DBusCallFlags.NONE, -1, None).unpack()

    def stop_watching_activity(self):
        if self.active_watch is not None:
            watch, self.active_watch = self.active_watch, None
            try:
                self.monitor.call_sync("RemoveWatch", GLib.Variant("(u)", (watch,)),
                                       Gio.DBusCallFlags.NONE, -1, None)
            except GLib.Error:
                pass  # already fired and removed by Mutter

    def _signal(self, _proxy, _sender, name, params):
        if name != "WatchFired":
            return
        (watch,) = params.unpack()
        if watch == self.idle_watch:
            self.on_idle()
        elif watch == self.active_watch:
            self.active_watch = None
            self.on_active()


def idle_inhibited():
    """True when an app (e.g. a video player) asked the session not to idle."""
    try:
        result = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, None,
            "org.gnome.SessionManager", "/org/gnome/SessionManager",
            "org.gnome.SessionManager", None,
        ).call_sync("IsInhibited", GLib.Variant("(u)", (INHIBIT_IDLE,)),
                    Gio.DBusCallFlags.NONE, -1, None)
        return result.unpack()[0]
    except GLib.Error:
        return False


def parse_args():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--timeout", type=int, default=120,
                   help="seconds of inactivity before the clock shows (default: 120)")
    p.add_argument("--preview", action="store_true",
                   help="show the clock now, exit when dismissed")
    p.add_argument("--ignore-inhibitors", action="store_true",
                   help="show even while an app (e.g. video playback) inhibits idle")
    p.add_argument("--web-dir", type=Path, default=DEFAULT_WEB_DIR,
                   help="folder holding fibonacci-clock.html, style.css, script.js")
    return p.parse_args()


def main():
    args = parse_args()
    args.web_dir = args.web_dir.resolve()
    if not (args.web_dir / "fibonacci-clock.html").is_file():
        sys.exit(f"fibonacci-clock.html not found in {args.web_dir}")

    # Preview is a separate one-off instance; the daemon is single-instance.
    flags = Gio.ApplicationFlags.NON_UNIQUE if args.preview else Gio.ApplicationFlags.DEFAULT_FLAGS
    app = Gtk.Application(application_id=APP_ID, flags=flags)
    state = {}

    def on_activate(app):
        if state:
            return  # second launch of the daemon: already running
        if args.preview:
            saver = Saver(app, args.web_dir, on_closed=app.quit)
            state["saver"] = saver
            saver.show()
            return

        app.hold()  # keep running with no windows open

        def on_idle():
            if saver.showing:
                return
            if not args.ignore_inhibitors and idle_inhibited():
                return
            saver.show()
            watcher.watch_for_activity()

        saver = Saver(app, args.web_dir, on_closed=lambda: watcher.stop_watching_activity())
        watcher = IdleWatcher(args.timeout * 1000, on_idle, on_active=saver.hide)
        state["saver"] = saver

    app.connect("activate", on_activate)
    for sig in (signal.SIGINT, signal.SIGTERM):
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, sig, lambda: app.quit() or GLib.SOURCE_REMOVE)
    return app.run([sys.argv[0]])


if __name__ == "__main__":
    sys.exit(main())
