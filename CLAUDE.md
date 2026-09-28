# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static, dependency-free web page: an analog "Fibonacci Clock" where the current hour is read off a rotating logarithmic spiral. No build step, package manager, linter, or tests.

Run it by opening `fibonacci-clock.html` directly in a browser, or serve the folder (e.g. `python3 -m http.server`) and open `/fibonacci-clock.html`. Use the on-page "Watch 12 hours in 30 seconds" button to check behavior across all hours quickly.

## Layout

- `fibonacci-clock.html`: markup only (the SVG skeleton and the speed button).
- `style.css`: all styles and theme tokens.
- `script.js`: one IIFE that builds the SVG content and runs the clock. It is loaded with a plain `<script>` at the end of `<body>` because it looks up SVG elements by id at startup. Keep it there, or add `defer` if you move it into `<head>`.
- `ubuntu-screensaver/`: GNOME screensaver wrapper (Python, GTK 4, WebKitGTK 6.0) plus `install.sh`/`uninstall.sh`. The installer copies the three root web files into `~/.local/share/fibonacci-screensaver/web/`, so rerun `./install.sh` after changing them. The screensaver injects its own CSS/JS (dark theme, hides `#speed` and the cursor) instead of editing the web files, so keep the `#speed` id and the `data-theme` hook working. Its `landscape.js` also assumes the dial center (300,560) and repositions the `.title`, `#digital`, `.caption` and `.fib` text elements by selector. See `ubuntu-screensaver/README.md`.
- Only external resource: Noto Serif from Google Fonts (with serif fallbacks).

## Geometry (the part that needs cross-reading to understand)

All drawing is in one SVG with `viewBox="0 0 600 1000"`. The dial center is `CX=300, CY=560`, and the static pivot `<circle>` in the markup hard-codes the same coordinates, so keep them in sync.

- Angles are screen angles measured clockwise from 12 o'clock; `pt(A, r)` converts to SVG x/y.
- The spiral is `r = R0 · e^(B·t)` with `B = ln(1.25) / (π/6)`: every 30° (one hour) the radius grows by 1.25×.
- Hour marks are not placed around a circle. Hours 1–6 stack upward from the dial at angle `0`, hours 7–12 stack downward at angle `π`, each at radius `R0 · 1.25^k` (`k` = 1..6).
- Each frame, the spiral is rotated by `rho` (the hour-hand angle, `hour12 · π/6` plus minute/second fraction). With this parameterization the spiral passes exactly through the current hour's mark. That is why the growth constant (1.25), `STEP`, and the mark radii must stay consistent: changing one without the others breaks the alignment.
- The grey "track" arcs next to each mark are short segments of the spiral as it will look when that hour is current (`r(A) = R · e^(-B(A-α))`).
- `T_MIN`/`T_MAX` bound the spiral from a tight curl inside the dial to off the page.

## Runtime behavior

- One `requestAnimationFrame` loop rebuilds the spiral path, updates the hand and digital time, and toggles the `.now` class on the active hour's track and label (only when the hour changes).
- Time comes from `now()`, which supports a fast-forward mode (`speed = 1440`, so 12 h in 30 s) by offsetting from `baseReal`/`baseClock`. Toggling back resets to real time.

## Theming

Colors are CSS custom properties on `:root`. Dark values are defined twice: under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]`. Update both blocks when changing a dark color. Safe-area insets are applied for notched phones.
