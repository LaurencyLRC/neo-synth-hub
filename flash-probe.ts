// flash-probe.ts (v2): TEMPORARY diagnostic for the Pads <-> Sequencer flash. Delete it when done.
//
// Use: keep `import "./flash-probe";` in main.tsx, deploy, then open the site with ?probe in the URL.
// A green log appears at the bottom of the screen. Tap Sequencer / Pads and watch (or screenshot) it.
//
// The log is per frame, and a line only prints when something changed:
//   scope=<css height>  bmp=<canvas bitmap height in css px>  main=<land-main height>  top=<scroll offset>
//   "STALE-CANVAS" = the scope's bitmap is a different size from its box (it would be drawn stretched).
//   "MIXED"        = toggle, scope, keybed/roll and bar do not agree on the view.
//   "layout-shift" = the browser's own layout-shift report (Chrome only).
// Each DOM batch also prints what changed in it (first three kinds).
//
// &boxes adds coloured outlines (scope yellow, main area blue, roll scroller green, roll footer red) and the log
// then also prints scroll=<scroller height> foot=<footer height> rows=<footer row heights>. Use it together
// with the screenshot of the bad frame: the outlines show which box is the wrong size.
//
// Bisecting: add &fix=<letters> to the URL and tap the toggle a few times. If the flash is gone, that
// suspect matters. Try one letter at a time, then the combination:
//   fix=a    hide the scope canvas completely (is the canvas involved?)
//   fix=b    give the scope the same height in both views, so nothing on the page changes size or moves
//            on a switch except the keybed/roll content itself (does the layout shift matter?)
//   fix=b,e  like b, and the page itself cannot scroll (root overflow hidden)

const params = new URLSearchParams(window.location.search);

if (params.has("probe")) {
  const fixes = new Set((params.get("fix") || "").split(",").map(s => s.trim()).filter(Boolean));
  const CSS: Record<string, string> = {
    a: ".land-scope canvas{display:none!important}",
    b:
      "@media (max-width:767px){.land-scope{height:clamp(104px,calc(var(--app-h,100dvh)*0.14),220px)!important}" +
      ".land-legend{margin-top:.75rem!important;padding-top:.75rem!important}}",
    e: ".land-root{overflow-y:hidden!important}",
  };
  // &boxes outlines the boxes whose heights the log reports (outlines never affect layout):
  // scope = yellow, main area = blue, roll scroller = green, roll footer = red.
  if (params.has("boxes")) {
    const st = document.createElement("style");
    st.textContent =
      ".land-scope{outline:2px solid #fc0!important;outline-offset:-2px}" +
      ".land-main{outline:2px solid #39f!important;outline-offset:-2px}" +
      ".land-main .overflow-auto{outline:2px solid #3f3!important;outline-offset:-2px}" +
      ".land-main div.shrink-0.border-t{outline:2px solid #f33!important;outline-offset:-2px}";
    document.head.appendChild(st);
  }
  if (fixes.size) {
    const st = document.createElement("style");
    st.textContent = Array.from(fixes).map(k => CSS[k] || "").join("\n");
    document.head.appendChild(st);
  }

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

    const canvas = q(".land-scope canvas") as HTMLCanvasElement | null;
    const mainEl = q(".land-main");
    const root = q(".land-root");
    const cssH = canvas ? Math.round(canvas.getBoundingClientRect().height) : 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bmpH = canvas ? Math.round(canvas.height / dpr) : 0;
    const stale = !!canvas && canvas.style.display !== "none" && fixes.has("a") === false && Math.abs(bmpH - cssH) > 1.5;
    const hh = (e: Element | null) => (e ? Math.round(e.getBoundingClientRect().height) : "-");
    const scroller = q(".land-main .overflow-auto");
    const foot = q(".land-main div.shrink-0.border-t");
    const rows = foot ? getComputedStyle(foot).gridTemplateRows.replace(/\.\d+/g, "").replace(/px/g, "") : "-";
    const geo =
      `scope=${cssH} bmp=${bmpH} main=${hh(mainEl)} top=${root ? Math.round(root.scrollTop) : "?"} ` +
      `scroll=${hh(scroller)} foot=${hh(foot)} rows=${rows}`;
    return {
      text: `${toggle}/${scope}/${main}/${bar} ${geo}`,
      flags: (views.size > 1 ? "  <<< MIXED" : "") + (stale ? "  <<< STALE-CANVAS" : ""),
    };
  };

  let last = "";
  const frame = () => {
    const s = snap();
    if (s.text !== last) {
      last = s.text;
      log(`${T()} frame ${s.text}${s.flags}`);
    }
    requestAnimationFrame(frame);
  };

  const describe = (n: Node | null) => {
    if (!n) return "?";
    if (n.nodeType === 3) return "#text";
    const el = n as Element;
    const c = (el.getAttribute && el.getAttribute("class")) || "";
    return el.tagName.toLowerCase() + (c ? "." + c.split(/\s+/)[0] : "");
  };

  const start = () => {
    document.body.appendChild(box);
    log(`probe v2 fix=${Array.from(fixes).join(",") || "none"}`);
    log(`${window.innerWidth}x${window.innerHeight} dpr ${window.devicePixelRatio.toFixed(2)}`);
    const root = document.getElementById("root");
    if (root) {
      new MutationObserver(recs => {
        const kinds: Record<string, number> = {};
        recs.forEach(r => {
          const k = `${r.type === "attributes" ? r.attributeName : r.type}@${describe(r.target)}`;
          kinds[k] = (kinds[k] || 0) + 1;
        });
        const top = Object.entries(kinds)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${v}x${k}`)
          .join(" ");
        log(`${T()} DOM ${recs.length}: ${top}`);
      }).observe(root, { subtree: true, childList: true, attributes: true });
    }
    try {
      new PerformanceObserver(list => {
        list.getEntries().forEach(e => {
          const ls = e as unknown as { value: number; sources?: unknown[] };
          if (ls.value > 0) log(`${T()} layout-shift ${ls.value.toFixed(3)} (${ls.sources?.length ?? 0} nodes)`);
        });
      }).observe({ type: "layout-shift", buffered: false });
    } catch {
      /* not supported in this browser */
    }
    window.addEventListener("click", () => log(`${T()} click`), true);
    requestAnimationFrame(frame);
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
  else start();
}

export {};
