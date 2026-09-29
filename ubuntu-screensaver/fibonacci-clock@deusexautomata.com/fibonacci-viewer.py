#!/usr/bin/env python3
"""Fibonacci Clock viewer: fullscreen clock on every monitor until input.

Started by the GNOME Shell extension (extension.js) when the session goes
idle, and by the settings window's Preview button. The look comes from the
extension settings, passed as JSON with --style and applied as injected CSS,
so the web files stay unchanged.
"""

import argparse
import json
import math
import re
import signal
import sys
from pathlib import Path

import gi


gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("Pango", "1.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gdk, Gio, GLib, Gtk, Pango, WebKit  # noqa: E402

HERE = Path(__file__).resolve().parent
APP_ID = "com.deusexautomata.FibonacciClockViewer"

# Ignore input for this long after showing, so the pointer settling or a
# key release from the last keystroke does not close the viewer at once.
GRACE_MS = 800
MOTION_THRESHOLD_PX = 12

# Always applied: force the dark theme (the fallback for anything not set
# by --style), hide the page's speed button and the cursor, let the SVG
# fill wide screens, and switch to the landscape layout on wide screens.
BASE_CSS = ("#speed { display: none !important; } * { cursor: none !important; }"
            " svg { max-width: none !important; }")
BASE_JS = "document.documentElement.dataset.theme = 'dark';"
LANDSCAPE_JS = (HERE / "landscape.js").read_text()

# Setting key -> CSS rules that take the color. Selectors match style.css.
COLOR_RULES = {
    "color-background": ["body { background: %s !important; }"],
    "color-title": [".title { fill: %s !important; }"],
    "color-digital": [".digital { fill: %s !important; }"],
    "color-hour": [".hour { fill: %s !important; }"],
    "color-hour-current": [".hour.now { fill: %s !important; }"],
    "color-track": [".track { stroke: %s !important; }"],
    "color-track-current": [".track.now { stroke: %s !important; }"],
    "color-minute": [".minute { fill: %s !important; }"],
    "color-minute-current": [".minute.now { fill: %s !important; }"],
    "color-minute-track": [".minute-track { stroke: %s !important; }"],
    "color-minute-track-current": [".minute-track.now { stroke: %s !important; }"],
    "color-second": [".second { fill: %s !important; }"],
    "color-second-current": [".second.now { fill: %s !important; }"],
    "color-second-track": [".second-track { stroke: %s !important; }"],
    "color-second-track-current": [".second-track.now { stroke: %s !important; }"],
    "color-day": [".day { fill: %s !important; }"],
    "color-day-current": [".day.now { fill: %s !important; }"],
    "color-day-track": [".day-track { stroke: %s !important; }"],
    "color-day-track-current": [".day-track.now { stroke: %s !important; }"],
    "color-spiral": [".spiral { stroke: %s !important; }"],
    "color-minute-spiral": [".minute-spiral { stroke: %s !important; }"],
    "color-second-spiral": [".second-spiral { stroke: %s !important; }"],
    "color-day-spiral": [".day-spiral { stroke: %s !important; }"],
    "color-dial": [".dial-ring, .tick { stroke: %s !important; }"],
    "color-hand": [".hand { stroke: %s !important; }"],
    "color-pivot": [".pivot { fill: %s !important; }"],
    "color-caption": [".caption { fill: %s !important; }"],
    "color-numbers": [".fib { fill: %s !important; }"],
}
# Setting key suffix -> selector, for the font-<x> and size-<x> keys.
FONT_TARGETS = {
    "title": ".title",
    "digital": ".digital",
    "hour": ".hour",
    "minute": ".minute",
    "second": ".second",
    "day": ".day",
    "caption": ".caption",
    "numbers": ".fib",
}
# Settings are the user's own, but they end up inside a style sheet, so
# only let through what a CSS color can contain.
SAFE_COLOR = re.compile(r"^[#\w(),.%\s]+$")

PANGO_STYLE = {Pango.Style.ITALIC: "italic", Pango.Style.OBLIQUE: "oblique"}


def font_css(selector, desc_str, size):
    rules = []
    if desc_str:
        desc = Pango.FontDescription.from_string(desc_str)
        families = [f.strip() for f in (desc.get_family() or "").split(",") if f.strip()]
        if families:
            quoted = ", ".join('"%s"' % f.replace("\\", "").replace('"', "") for f in families)
            rules.append(f"font-family: {quoted}, serif !important;")
        if desc.get_set_fields() & Pango.FontMask.WEIGHT:
            rules.append(f"font-weight: {int(desc.get_weight())} !important;")
        if desc.get_set_fields() & Pango.FontMask.STYLE:
            rules.append(f"font-style: {PANGO_STYLE.get(desc.get_style(), 'normal')} !important;")
    if isinstance(size, (int, float)) and size > 0:
        rules.append(f"font-size: {size:g}px !important;")
    return f"{selector} {{ {' '.join(rules)} }}" if rules else ""


def style_css(style):
    css = []
    for key, rules in COLOR_RULES.items():
        value = style.get(key)
        if isinstance(value, str) and SAFE_COLOR.match(value):
            css += [rule % value for rule in rules]
    for suffix, selector in FONT_TARGETS.items():
        css.append(font_css(selector, style.get(f"font-{suffix}"), style.get(f"size-{suffix}")))
    return "\n".join(c for c in css if c)


class Viewer:
    """Fullscreen clock windows, one per monitor."""

    def __init__(self, app, web_dir, style):
        self.app = app
        self.uri = (web_dir / "fibonacci-clock.html").as_uri()
        self.css = BASE_CSS + "\n" + style_css(style)
        self.background = Gdk.RGBA()
        if not self.background.parse(str(style.get("color-background", "black"))):
            self.background.parse("black")
        self.windows = []
        self.armed = False
        self.origin = None

    def show(self):
        monitors = Gdk.Display.get_default().get_monitors()
        for i in range(monitors.get_n_items()):
            self.windows.append(self._make_window(monitors.get_item(i)))
        GLib.timeout_add(GRACE_MS, self._arm)

    def close(self):
        for w in self.windows:
            w.destroy()
        self.windows = []
        self.app.quit()

    def _arm(self):
        self.armed = True
        return GLib.SOURCE_REMOVE

    def _make_window(self, monitor):
        win = Gtk.ApplicationWindow(application=self.app, title="Fibonacci Clock")
        win.set_decorated(False)
        win.set_cursor(Gdk.Cursor.new_from_name("none", None))

        ucm = WebKit.UserContentManager()
        ucm.add_style_sheet(WebKit.UserStyleSheet.new(
            self.css, WebKit.UserContentInjectedFrames.ALL_FRAMES,
            WebKit.UserStyleLevel.USER, None, None))
        ucm.add_script(WebKit.UserScript.new(
            BASE_JS, WebKit.UserContentInjectedFrames.ALL_FRAMES,
            WebKit.UserScriptInjectionTime.START, None, None))
        ucm.add_script(WebKit.UserScript.new(
            LANDSCAPE_JS, WebKit.UserContentInjectedFrames.TOP_FRAME,
            WebKit.UserScriptInjectionTime.END, None, None))
        view = WebKit.WebView(user_content_manager=ucm)
        view.set_background_color(self.background)
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
        win.connect("close-request", lambda *a: self.close() or True)

        win.fullscreen_on_monitor(monitor)
        win.present()
        return win

    def _input(self):
        if self.armed:
            self.close()

    def _motion(self, _ctrl, x, y):
        if self.origin is None or not self.armed:
            self.origin = (x, y)
            return
        if math.dist(self.origin, (x, y)) > MOTION_THRESHOLD_PX:
            self.close()


def parse_args():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--style", default="{}",
                   help="JSON object of color-*, font-* and size-* settings")
    p.add_argument("--web-dir", type=Path, default=HERE / "web",
                   help="folder holding fibonacci-clock.html, style.css, script.js")
    p.add_argument("--print-css", action="store_true",
                   help="print the CSS built from --style and exit")
    return p.parse_args()


def main():
    args = parse_args()
    try:
        style = json.loads(args.style)
        if not isinstance(style, dict):
            raise ValueError("not a JSON object")
    except ValueError as e:
        sys.exit(f"--style: {e}")
    if args.print_css:
        print(style_css(style))
        return 0

    web_dir = args.web_dir.resolve()
    if not (web_dir / "fibonacci-clock.html").is_file():
        sys.exit(f"fibonacci-clock.html not found in {web_dir}")

    app = Gtk.Application(application_id=APP_ID, flags=Gio.ApplicationFlags.NON_UNIQUE)
    app.connect("activate", lambda app: Viewer(app, web_dir, style).show())
    for sig in (signal.SIGINT, signal.SIGTERM):
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, sig, lambda: app.quit() or GLib.SOURCE_REMOVE)
    return app.run([sys.argv[0]])


if __name__ == "__main__":
    sys.exit(main())
