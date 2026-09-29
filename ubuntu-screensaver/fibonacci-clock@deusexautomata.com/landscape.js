// Landscape layout for the screensaver, injected after the page loads so
// the web files stay unchanged. On a wide screen the viewBox widens around
// the dial and the text moves into a column left of it. The dial, tracks
// and spiral keep their original coordinates (centre 300,560). Text
// elements missing from the page (e.g. commented out) are skipped.
(() => {
  const svg = document.getElementById("clock");
  if (!svg) return;

  // [selector, x, y] for each text element in the landscape layout.
  const LANDSCAPE_VIEWBOX = "-340 210 1280 720";
  const LANDSCAPE_TEXT = [
    [".title", -110, 500],
    ["#digital", -110, 572],
    [".caption", -110, 650],
    [".fib", -110, 700],
  ];

  const original = {
    viewBox: svg.getAttribute("viewBox"),
    text: LANDSCAPE_TEXT
      .map(([sel, lx, ly]) => [svg.querySelector(sel), lx, ly])
      .filter(([el]) => el)
      .map(([el, lx, ly]) => [el, el.getAttribute("x"), el.getAttribute("y"), lx, ly]),
  };

  function layout() {
    const wide = window.innerWidth > window.innerHeight;
    svg.setAttribute("viewBox", wide ? LANDSCAPE_VIEWBOX : original.viewBox);
    original.text.forEach(([el, x, y, lx, ly]) => {
      el.setAttribute("x", wide ? lx : x);
      el.setAttribute("y", wide ? ly : y);
    });
  }

  layout();
  window.addEventListener("resize", layout);
})();
