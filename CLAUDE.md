# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static, dependency-free web page: an analog "Fibonacci Clock" where the current hour is read off a rotating logarithmic spiral. No build step, package manager, linter, or tests.

Run it by opening `fibonacci-clock.html` directly in a browser, or serve the folder (e.g. `python3 -m http.server`) and open `/fibonacci-clock.html`. Use the on-page "Watch 12 hours in 30 seconds" button to check behavior across all hours quickly.

## Layout

- `fibonacci-clock.html`: markup only (the SVG skeleton and the speed button).
- `style.css`: all styles and theme tokens.
- `script.js`: one IIFE that builds the SVG content and runs the clock. It is loaded with a plain `<script>` at the end of `<body>` because it looks up SVG elements by id at startup. Keep it there, or add `defer` if you move it into `<head>`.
- `ubuntu-screensaver/`: GNOME Shell extension (`fibonacci-clock@deusexautomata.com/`) plus `install.sh`/`uninstall.sh`. `extension.js` watches idle in the shell and spawns `fibonacci-viewer.py` (Python, GTK 4, WebKitGTK 6.0), which shows the page fullscreen. `prefs.js` is the settings window. The installer copies the three root web files into the installed extension's `web/`, so rerun `./install.sh` after changing them; changes to `extension.js` need a logout on Wayland. See `ubuntu-screensaver/README.md`.
- The screensaver never edits the web files; it injects CSS/JS. So these hooks must keep working: the `#speed` id, the `data-theme` attribute, the CSS class selectors mapped in `COLOR_RULES`/`FONT_TARGETS` in `fibonacci-viewer.py`, and the dial center (300,560) and `.title`/`#digital`/`.caption`/`.fib` selectors used by `landscape.js`. Adding a setting means adding a key to the gschema (a `color-`/`font-`/`size-` prefix is passed to the viewer automatically), a row in `prefs.js`, and a rule in `fibonacci-viewer.py`. See `ubuntu-screensaver/README.md`.
- Only external resource: Noto Serif from Google Fonts (with serif fallbacks).

## Geometry (the part that needs cross-reading to understand)

All drawing is in one SVG with `viewBox="0 0 600 1000"`. The dial center is `CX=300, CY=560`, and the static pivot `<circle>` in the markup hard-codes the same coordinates, so keep them in sync.

- Angles are screen angles measured clockwise from 12 o'clock; `pt(A, r)` converts to SVG x/y.
- The spiral is `r = R0 · e^(B·t)` with `B = ln(1.25) / (π/6)`: every 30° (one hour) the radius grows by 1.25×.
- Marks are not placed around a circle. `markSet()` stacks 12 marks along one axis through the dial: marks 1–6 outward at angle `axis`, 7–12 at `axis + π`, each at radius `R0 · scale · 1.25^k` (`k` = 1..6). Hours use axis 45° (1–6 up-right), minutes 90° (5–30 right, scale `1.25^-0.5`), seconds 315° (5–30 up-left). One mark per hour, per 5 minutes, per 5 seconds.
- Three spirals share the same curve. Each frame, each is rotated by its hand angle (hour `rho`, minute `mu`, second `sigma`) plus `offset(axis, scale) = axis + ln(scale)/B`. With this parameterization each spiral passes exactly through its current mark. The hour hand line still points at the true hour angle `rho`.
- A fourth, weekday spiral turns once a week (`omega`, 2π/7 per day, Monday = 0) and is rotated by `D_LO`. Its seven day labels sit on the vertical axis: folding each day's spiral parameter mod π puts Mon–Thu upward (angle `0`) and Fri–Sun downward (`π`), at radii from 90 outward in steps of `e^(B·π/7)`. That is why the growth constant (1.25), `STEP`, and the mark radii must stay consistent: changing one without the others breaks the alignment.
- Hour, minute and second marks all lie on one family of 12 spiral curves 30° apart, because each row's `offset(axis, scale)` differs by a multiple of `STEP` (that is why the minute scale is `1.25^-0.5`). Each track spans ±22.5° (`M_SPAN`), so tracks of neighbouring rows meet end to end as continuous spirals. They stop short of the vertical axis, where the weekday labels are; weekday tracks are separate short arcs.
- The grey "track" arcs next to each mark are short segments of the spiral as it will look when that hour is current (`r(A) = R · e^(-B(A-α))`).
- `T_MIN`/`T_MAX` bound the spiral from a tight curl inside the dial to off the page.

## Runtime behavior

- One `requestAnimationFrame` loop rebuilds the spiral path, updates the hand and digital time, and toggles the `.now` class on the active hour, 5-minute, 5-second and weekday track and label via `light()` (only when the mark changes).
- Time comes from `now()`, which supports a fast-forward mode (`speed = 1440`, so 12 h in 30 s) by offsetting from `baseReal`/`baseClock`. Toggling back resets to real time.

## Theming

Colors are CSS custom properties on `:root`. Dark values are defined twice: under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]`. Update both blocks when changing a dark color. Safe-area insets are applied for notched phones.
