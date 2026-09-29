(() => {
  const NS = "http://www.w3.org/2000/svg";
  const CX = 300, CY = 560;
  const DIAL_R = 68;

  // Logarithmic spiral r = R0 * e^(B*t). Each hour step (30°) grows the
  // radius by 1.25, so the hour marks sit on one continuous spiral.
  const STEP = Math.PI / 6;
  const B = Math.log(1.25) / STEP;
  const R0 = 76;

  // Screen angle A is clockwise from 12 o'clock.
  const pt = (A, r) => [CX + r * Math.sin(A), CY - r * Math.cos(A)];

  const tracksG = document.getElementById("tracks");
  const labelsG = document.getElementById("labels");
  const dialG = document.getElementById("dial");
  const spiralEl = document.getElementById("spiral");
  const minuteSpiralEl = document.getElementById("minute-spiral");
  const secondSpiralEl = document.getElementById("second-spiral");
  const daySpiralEl = document.getElementById("day-spiral");
  const handEl = document.getElementById("hand");
  const digitalEl = document.getElementById("digital");
  const speedBtn = document.getElementById("speed");

  // A mark is a label at angle alpha, radius R, with a track arc on each
  // side. The arcs follow the spiral passing through the mark:
  // r(A) = R·e^(-B(A-α)). `gap` is the arc distance left clear for the label.
  function addMark(R, alpha, span, gap, cls, trackCls, text, dy) {
    const arc = (a0, a1) => {
      let d = "";
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const A = a0 + (a1 - a0) * (i / n);
        const r = R * Math.exp(-B * (A - alpha));
        const [x, y] = pt(A, r);
        d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
      }
      return d;
    };
    const g = document.createElementNS(NS, "path");
    g.setAttribute("class", trackCls);
    g.setAttribute("d", arc(alpha - span, alpha - gap / R) + arc(alpha + gap / R, alpha + span));
    tracksG.appendChild(g);

    const [lx, ly] = pt(alpha, R);
    const t = document.createElementNS(NS, "text");
    t.setAttribute("class", cls);
    t.setAttribute("x", lx.toFixed(2));
    t.setAttribute("y", (ly + dy).toFixed(2));
    t.setAttribute("text-anchor", "middle");
    t.textContent = text;
    labelsG.appendChild(t);

    return { track: g, label: t };
  }

  // ---- Mark sets: 12 marks on one diagonal/straight axis through the dial ----
  // Marks 1–6 stack outward at screen angle `axis`, marks 7–12 on the
  // opposite side (axis + π), at radius R0·scale·1.25^k. A spiral rotated by
  // (hand angle + offset(axis, scale)) passes exactly through the current
  // mark: `axis` turns the whole layout, and ln(scale)/B undoes the scale.
  const offset = (axis, scale) => axis + Math.log(scale) / B;
  function markSet(axis, scale, gap, cls, trackCls, value, dy) {
    const marks = [];
    for (let i = 1; i <= 12; i++) {
      const k = i <= 6 ? i : i - 6;                  // 1..6 outward
      const alpha = i <= 6 ? axis : axis + Math.PI;  // this side or opposite
      marks.push(addMark(R0 * scale * Math.pow(1.25, k), alpha, M_SPAN, gap, cls, trackCls, value(i), dy));
    }
    return marks;
  }

  // Hour, minute and second marks all sit on one family of 12 spiral curves,
  // 30° apart. Rows are 45° apart, so each track runs ±22.5° (M_SPAN) and
  // meets the next row's track end to end, forming continuous grey spirals.
  // This needs every row's (axis + ln(scale)/B) to differ by a multiple of
  // STEP: minutes are 1.5 steps round from hours, so M_SCALE = 1.25^-0.5.
  // The tracks stop 22.5° short of the vertical axis, which the weekday
  // labels use.
  const M_SPAN = Math.PI / 8;

  // Hours 1–6 up-right at 45°, 7–12 down-left at 225°.
  const H_AXIS = Math.PI / 4, H_SCALE = 1;
  const hours = markSet(H_AXIS, H_SCALE, 15, "hour", "track", i => i, 8);

  // Minutes 5–30 right at 90°, 35–60 left at 270°. Scaled down to join the
  // hour and second tracks (this also keeps the outer labels on the page).
  const M_AXIS = Math.PI / 2, M_SCALE = 1 / Math.sqrt(1.25);
  const minutes = markSet(M_AXIS, M_SCALE, 13, "minute", "minute-track", i => i * 5, 6);

  // Seconds 5–30 up-left at 315°, 35–60 down-right at 135°.
  const S_AXIS = 7 * Math.PI / 4, S_SCALE = 1;
  const seconds = markSet(S_AXIS, S_SCALE, 11, "second", "second-track", i => i * 5, 5);

  // ---- Weekday marks on the vertical axis, between the hour and second rows ----
  // The day spiral turns once a week, 2π/7 per day. Reduced mod π, the seven
  // day marks land 2π/14 apart along the spiral, alternating up (0) and down
  // (π): Mon–Thu stack upward, Fri–Sun downward. D_LO is the spiral parameter
  // of the innermost mark (Monday, just outside the dial).
  const D_STEP = 2 * Math.PI / 7;
  const D_LO = Math.log(90 / R0) / B;
  const dayName = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const days = [];
  for (let d = 0; d < 7; d++) {
    const t = d * D_STEP;
    const n = Math.floor(t / Math.PI);             // half-turns folded back
    const R = R0 * Math.exp(B * (D_LO + t - n * Math.PI));
    const label = dayName.format(new Date(2024, 0, 1 + d)); // 2024-01-01 is a Monday
    days.push(addMark(R, (n % 2) * Math.PI, 0.25, 20, "day", "day-track", label, 5));
  }

  // ---- Dial ----
  const ring = document.createElementNS(NS, "circle");
  ring.setAttribute("class", "dial-ring");
  ring.setAttribute("cx", CX); ring.setAttribute("cy", CY); ring.setAttribute("r", DIAL_R);
  dialG.appendChild(ring);
  for (let i = 0; i < 60; i++) {
    const A = i * Math.PI / 30;
    const major = i % 5 === 0;
    const len = major ? 9 : 4;
    const [x1, y1] = pt(A, DIAL_R + (major ? 1 : 0));
    const [x2, y2] = pt(A, DIAL_R - len);
    const l = document.createElementNS(NS, "line");
    l.setAttribute("class", major ? "tick major" : "tick");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    dialG.appendChild(l);
  }

  // ---- Spiral path for a given rotation ρ (the hour-hand angle) ----
  const T_MIN = Math.log(5 / R0) / B;    // tight curl inside the dial
  const T_MAX = Math.log(1500 / R0) / B; // sweeps off the page
  function spiralPath(rho) {
    let d = "";
    const dt = 0.025;
    for (let t = T_MIN, i = 0; t <= T_MAX; t += dt, i++) {
      const r = R0 * Math.exp(B * t);
      const [x, y] = pt(rho - t, r);
      d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return d;
  }

  // ---- Time source (live, or fast-forward) ----
  let speed = 1;
  let baseReal = Date.now();
  let baseClock = Date.now();
  const now = () => new Date(baseClock + (Date.now() - baseReal) * speed);

  speedBtn.addEventListener("click", () => {
    const current = now().getTime();
    if (speed === 1) {
      speed = 1440;
      baseClock = current;
      speedBtn.textContent = "Back to live time";
    } else {
      speed = 1;
      baseClock = Date.now();
      speedBtn.textContent = "Watch 12 hours in 30 seconds";
    }
    baseReal = Date.now();
  });

  // Light up mark n (1..12) of a set, only when it changes.
  const lit = new Map();
  function light(marks, n) {
    if (lit.get(marks) === n) return;
    marks.forEach((o, i) => {
      o.track.classList.toggle("now", i + 1 === n);
      o.label.classList.toggle("now", i + 1 === n);
    });
    lit.set(marks, n);
  }

  let lastText = "";
  function frame() {
    const d = now();
    const h24 = d.getHours(), m = d.getMinutes(), s = d.getSeconds() + d.getMilliseconds() / 1000;
    const h12 = h24 % 12 || 12;
    const rho = ((h24 % 12) + m / 60 + s / 3600) * STEP; // hour-hand angle

    const mu = (m + s / 60) * Math.PI / 30; // minute angle
    const sigma = s * Math.PI / 30;         // second angle
    spiralEl.setAttribute("d", spiralPath(rho + offset(H_AXIS, H_SCALE)));
    minuteSpiralEl.setAttribute("d", spiralPath(mu + offset(M_AXIS, M_SCALE)));
    secondSpiralEl.setAttribute("d", spiralPath(sigma + offset(S_AXIS, S_SCALE)));
    const wd = (d.getDay() + 6) % 7;        // Monday = 0
    const omega = (wd + (h24 + m / 60 + s / 3600) / 24) * D_STEP; // weekday angle
    daySpiralEl.setAttribute("d", spiralPath(omega + D_LO));

    const [hx, hy] = pt(rho, 56);
    handEl.setAttribute("x1", CX); handEl.setAttribute("y1", CY);
    handEl.setAttribute("x2", hx.toFixed(2)); handEl.setAttribute("y2", hy.toFixed(2));

    const text = String(h12).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    if (text !== lastText) { digitalEl.textContent = text; lastText = text; }

    // 5-minute and 5-second buckets 1..12; 0–4 light up 60.
    light(hours, h12);
    light(minutes, Math.floor(m / 5) || 12);
    light(seconds, Math.floor(s / 5) || 12);
    light(days, wd + 1);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
