// flash-probe.ts: TEMPORARY diagnostic for the Pads <-> Sequencer flash. Delete it when done.
//
// Use: add `import "./flash-probe";` to main.tsx, deploy, then open the site with ?probe in the URL
// (e.g. https://your.site/?probe). A green log appears at the bottom of the screen. Tap Sequencer / Pads,
// then screenshot the log.
//
// What it records: before every browser frame it reads which view the toggle, the scope, the main area and
// the control bar are in. It only prints a line when that combination changes, and marks a frame MIXED
// when they disagree. It also prints one "DOM batch" line per group of DOM changes React makes.
//   - A MIXED line means the page itself held a half-switched state for a frame (an app/React problem).
//   - No MIXED line but a mixed picture on screen means the browser painted it (a paint problem).

const params = new URLSearchParams(window.location.search);

if (params.has("probe")) {
  const lines: string[] = [];
  const box = document.createElement("pre");
  Object.assign(box.style, {
    position: "fixed",
    left: "0",
    right: "0",
    bottom: "0",
    margin: "0",
    padding: "6px 8px",
    zIndex: "2147483647",
    background: "rgba(0,0,0,0.88)",
    color: "#9f9",
    font: "10px/1.3 monospace",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    maxHeight: "42vh",
    overflow: "hidden",
  } as Partial<CSSStyleDeclaration>);

  const t0 = performance.now();
  const T = () => ((performance.now() - t0) / 1000).toFixed(3);
  const log = (s: string) => {
    lines.push(s);
    while (lines.length > 16) lines.shift();
    box.textContent = lines.join("\n");
  };

  const q = (s: string) => document.querySelector(s);
  const snap = () => {
    const pressed = Array.from(document.querySelectorAll('[aria-label="Surface"] .seg-item')).find(
      b => b.getAttribute("aria-pressed") === "true"
    );
    const label = pressed?.textContent?.trim();
    const toggle = label === "Sequencer" ? "roll" : label === "Pads" ? "pad" : "?";
    const scopeEl = q(".land-scope");
    const scope = !scopeEl ? "?" : scopeEl.className.includes("clamp(72px") ? "roll" : "pad";
    const main = q(".keybed") ? "pad" : q(".flex-col-reverse") ? "roll" : "?";
    const bar = !q(".land-ctl-bar") ? "?" : q('[aria-label="Hide muted pads"]') ? "pad" : "roll";
    const views = new Set([toggle, scope, main, bar]);
    views.delete("?");
    return { text: `toggle=${toggle} scope=${scope} main=${main} bar=${bar}`, mixed: views.size > 1 };
  };

  let last = "";
  const frame = () => {
    const s = snap();
    if (s.text !== last) {
      last = s.text;
      log(`${T()}s frame  ${s.text}${s.mixed ? "   <<< MIXED" : ""}`);
    }
    requestAnimationFrame(frame);
  };

  const start = () => {
    document.body.appendChild(box);
    log(`probe on. ${navigator.userAgent.slice(0, 70)}`);
    log(`viewport ${window.innerWidth}x${window.innerHeight} dpr ${window.devicePixelRatio}`);
    const root = document.getElementById("root");
    if (root) {
      new MutationObserver(recs => log(`${T()}s DOM batch  records=${recs.length}`)).observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    }
    window.addEventListener("click", () => log(`${T()}s click`), true);
    requestAnimationFrame(frame);
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
  else start();
}

export {};
