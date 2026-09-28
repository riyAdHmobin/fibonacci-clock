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
  const handEl = document.getElementById("hand");
  const digitalEl = document.getElementById("digital");
  const speedBtn = document.getElementById("speed");

  // ---- Hour marks: 1–6 stacked above the dial, 7–12 below ----
  const hours = [];
  for (let h = 1; h <= 12; h++) {
    const k = h <= 6 ? h : h - 6;          // 1..6 outward
    const alpha = h <= 6 ? 0 : Math.PI;     // up or down
    const R = R0 * Math.pow(1.25, k);

    // Track arcs follow the spiral passing through this mark: r(A) = R·e^(-B(A-α))
    const span = 0.5 + 0.03 * k;
    const gap = 17 / R;
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
    g.setAttribute("class", "track");
    g.setAttribute("d", arc(alpha - span, alpha - gap) + arc(alpha + gap, alpha + span));
    tracksG.appendChild(g);

    const [lx, ly] = pt(alpha, R);
    const t = document.createElementNS(NS, "text");
    t.setAttribute("class", "hour");
    t.setAttribute("x", lx.toFixed(2));
    t.setAttribute("y", (ly + 8).toFixed(2));
    t.setAttribute("text-anchor", "middle");
    t.textContent = h;
    labelsG.appendChild(t);

    hours.push({ track: g, label: t });
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

  let lastHour = -1, lastText = "";
  function frame() {
    const d = now();
    const h24 = d.getHours(), m = d.getMinutes(), s = d.getSeconds() + d.getMilliseconds() / 1000;
    const h12 = h24 % 12 || 12;
    const rho = ((h24 % 12) + m / 60 + s / 3600) * STEP; // hour-hand angle

    spiralEl.setAttribute("d", spiralPath(rho));

    const [hx, hy] = pt(rho, 56);
    handEl.setAttribute("x1", CX); handEl.setAttribute("y1", CY);
    handEl.setAttribute("x2", hx.toFixed(2)); handEl.setAttribute("y2", hy.toFixed(2));

    const text = String(h12).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    if (text !== lastText) { digitalEl.textContent = text; lastText = text; }

    if (h12 !== lastHour) {
      hours.forEach((o, i) => {
        const on = i + 1 === h12;
        o.track.classList.toggle("now", on);
        o.label.classList.toggle("now", on);
      });
      lastHour = h12;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
