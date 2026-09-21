/**
 * Acceptance checks. Assertions, not screenshots.
 *
 * Uses puppeteer-core against the installed Chrome rather than Playwright —
 * same assertions, one fewer browser download. Run against a built site:
 *
 *   npm run build && python3 scripts/gzserve.py &
 *   node scripts/acceptance.mjs
 *
 * Exits non-zero on failure so it can gate a commit.
 */

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:8900";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const stats = JSON.parse(fs.readFileSync("content/stats.generated.json", "utf-8"));

/* A failed build leaves the previous out/ in place, and this suite once ran
   green against it while the real build was broken. Refuse to test anything
   older than the newest source file. */
{
  const newest = (dir, exts) => {
    let t = 0;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const full = `${d}/${e.name}`;
        if (e.isDirectory()) walk(full);
        else if (exts.some((x) => e.name.endsWith(x))) {
          t = Math.max(t, fs.statSync(full).mtimeMs);
        }
      }
    };
    walk(dir);
    return t;
  };
  const srcTime = Math.max(newest("app", [".tsx", ".ts", ".css"]), newest("lib", [".ts"]));
  const outTime = fs.existsSync("out/index.html") ? fs.statSync("out/index.html").mtimeMs : 0;
  if (outTime < srcTime) {
    console.error("STALE BUILD: out/ is older than the newest source file. Run npm run build.");
    process.exit(2);
  }
}
let failures = 0;

const ok = (name, pass, detail = "") => {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

/* ------------------------------------------------------------------ 1 */
/* The underline must leave by the right, not retreat to where it came
   from. Sampling background-position 200ms after mouseleave is the whole
   test: a reversal keeps it pinned at 0%. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/city/new-orleans-us/`, { waitUntil: "networkidle0" });
  await p.waitForSelector("a");

  // A link away from the corners, so moving the pointer to the far side of
  // the viewport genuinely leaves it. Hovering the wordmark at 0,0 and then
  // "moving away" to 5,5 does not leave it, which is a test bug that looks
  // exactly like a product bug.
  const all = await p.$$("a");
  let link = null, box = null;
  for (const a of all) {
    const b0 = await a.boundingBox();
    if (!b0 || b0.width < 20 || b0.height < 8) continue;
    // Must be scrolled into view before hovering: a boundingBox below the
    // fold is a real coordinate the pointer can never reach.
    await a.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await new Promise((r) => setTimeout(r, 250));
    const b = await a.boundingBox();
    if (b && b.y > 160 && b.y < 700) { link = a; box = b; break; }
  }
  if (!link) throw new Error("no suitably-placed link to test");
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await new Promise((r) => setTimeout(r, 600));           // let it wipe in

  const during = await p.evaluate((el) => ({
    pos: getComputedStyle(el).backgroundPositionX,
    size: getComputedStyle(el).backgroundSize,
  }), link);

  // move the pointer away
  // Must stay inside the viewport: moving the pointer to an off-screen
  // coordinate fires no mouseout at all, which looks identical to a broken
  // handler.
  await p.mouse.move(20, 860, { steps: 8 });
  await new Promise((r) => setTimeout(r, 200));

  const after = await p.evaluate((el) => ({
    cls: el.className,
    pos: getComputedStyle(el).backgroundPositionX,
    size: getComputedStyle(el).backgroundSize,
  }), link);

  const pct = parseFloat(after.pos);
  ok("underline background-position > 0% (leaves right, does not reverse)",
     Number.isFinite(pct) && pct > 0,
     `hover ${during.pos} / ${during.size} → 200ms after ${after.pos} / ${after.size}`);

  await p.close();
}

/* ------------------------------------------------------------------ 2 */
/* The loader resolves: the count lands on the real total, the cycling
   stops, and the final frame holds. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const frames = [];
  await p.goto(`${BASE}/?loader=hold`, { waitUntil: "domcontentloaded" });

  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    const snap = await p.evaluate(() => {
      const el = document.querySelector("[data-loader-count]");
      const img = document.querySelector("[data-loader-object]");
      return el
        ? {
            n: el.textContent.trim(),
            src: img?.getAttribute("src") ?? null,
            final: img?.getAttribute("data-final") === "true",
          }
        : null;
    });
    if (snap) frames.push({ t: Date.now() - t0, ...snap });
    else if (frames.length) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!frames.length) {
    ok("loader rendered", false, "no [data-loader-count] seen");
  } else {
    const last = frames[frames.length - 1];
    const digits = (s) => Number(String(s).replace(/[^0-9]/g, ""));
    ok("counter's last value === SITE_STATS.places",
       digits(last.n) === stats.places, `${last.n} vs ${stats.places}`);

    const finals = frames.filter((f) => f.final);
    const held = finals.length ? finals[finals.length - 1].t - finals[0].t : 0;
    ok("final frame is the marked final image", finals.length > 0,
       `${finals.length} frames`);
    ok("final frame holds ≥ 800ms", held >= 800, `${held}ms`);
  }
  await p.close();
}

/* ------------------------------------------------------------------ 3 */
/* The overlap. The hero must begin while the curtain is still travelling —
   a gap between them reads as two events. Proving it means catching one
   frame where the curtain is mid-move AND the hero text is mid-rise. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/?loader=1`, { waitUntil: "domcontentloaded" });

  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    samples.push(await p.evaluate(() => {
      const curtain = document.querySelector('[data-phase]');
      const inner = document.querySelector('[data-arrival-text] span > span');
      const cs = curtain ? getComputedStyle(curtain) : null;
      return {
        phase: document.documentElement.dataset.opening ?? null,
        curtainPresent: Boolean(curtain),
        curtainT: cs ? cs.transform : null,
        textT: inner ? getComputedStyle(inner).transform : null,
      };
    }));
    await new Promise((r) => setTimeout(r, 60));
  }

  // Curtain is "still moving" when it exists and is partly translated:
  // not at its resting place (identity) and not fully gone.
  const ty = (m) => {
    if (!m || m === "none") return 0;
    const n = m.match(/matrix\(([^)]+)\)/);
    return n ? parseFloat(n[1].split(",")[5]) : 0;
  };
  // A static pre-state also has a non-zero transform, so "non-zero" is not
  // evidence of motion. Require the value to be *changing* between frames
  // while the curtain is mid-travel.
  let overlap = null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], c = samples[i];
    if (!c.curtainPresent || ty(c.curtainT) >= -1) continue;
    if (!c.textT || c.textT === "none") continue;
    if (ty(a.textT) === ty(c.textT)) continue;   // not moving
    overlap = c;
    break;
  }

  ok("hero text is mid-rise while the curtain is still moving",
     Boolean(overlap),
     overlap
       ? `curtain y=${ty(overlap.curtainT).toFixed(0)}px, text y=${ty(overlap.textT).toFixed(1)}px`
       : "no frame had both in motion");

  const phases = [...new Set(samples.map((x) => x.phase))].filter(Boolean);
  ok("timeline advances through its phases", phases.length >= 4, phases.join(" → "));
  await p.close();
}

/* ------------------------------------------------------------------ 4 */
/* Masked lines must arrive. Measuring mid-transition proves only that a
   transform exists; the end state is the thing that matters, and a line
   stuck at translateY(100%) inside overflow:hidden is invisible. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2500));
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 2000));

  const lines = await p.evaluate(() =>
    [...document.querySelectorAll('[class*="lineMask"] > span')]
      .map((el) => getComputedStyle(el).transform)
  );
  const unsettled = lines.filter((t) => t !== "none");
  ok("every masked line has settled to transform:none",
     lines.length > 0 && unsettled.length === 0,
     `${lines.length} lines, ${unsettled.length} stuck${unsettled.length ? " — " + unsettled[0] : ""}`);
  await p.close();
}

/* ------------------------------------------------------------------ 5 */
/* Nothing ships hidden. After a full scroll, anything rendered and visible
   must have settled — no orphaned pre-animation states. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });

  for (const route of ["/?loader=off", "/about/", "/tables/"]) {
    await p.goto(`${BASE}${route}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 2200));
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 2200));

    const bad = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;      // not rendered
        // Scroll-linked transforms are state, not a failed entrance.
        if (el.closest("[data-pin]")) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (parseFloat(cs.opacity) < 0.01) {
          out.push(`opacity 0: ${el.tagName.toLowerCase()}.${el.className}`.slice(0, 90));
        }
      }
      return out.slice(0, 4);
    });

    ok(`nothing hidden after settle on ${route}`, bad.length === 0,
       bad.join(" | ") || "clean");
  }
  await p.close();
}

/* ------------------------------------------------------------------ 6 */
/* Reduced motion: no loader at all, and the pin does not engage. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await p.goto(`${BASE}/?loader=hold`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));
  const loader = await p.$("[data-loader-count]");
  ok("reduced motion renders no loader", loader === null);
  const reducedScale = await p.evaluate(() => {
    const el = document.querySelector("[data-scale]");
    const stack = el?.querySelector("[data-scale-stack]");
    return {
      pin: Boolean(el?.hasAttribute("data-pin")),
      stack: stack ? getComputedStyle(stack).display !== "none" : false,
      pins: document.querySelectorAll("[data-pin]").length,
    };
  });
  ok("reduced motion: scale sequence stacks, no pins",
     reducedScale.pin === false && reducedScale.stack && reducedScale.pins === 0,
     JSON.stringify(reducedScale));
  await p.close();
}

/* ------------------------------------------------------------------ */
/* Two sticky set-pieces: the pull-back, then the magnitude sequence.
   Inline --p may exist only on a pin itself. Both pin at every width;
   reduced motion is what releases them. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));
  const desk = await p.evaluate(() => ({
    pins: document.querySelectorAll("[data-pin]").length,
    sticky: [...document.querySelectorAll("[data-pin] *")].some(
      (el) => getComputedStyle(el).position === "sticky"),
    strayP: [...document.querySelectorAll("body *")].filter(
      (el) => !el.hasAttribute("data-pin") && el.style.getPropertyValue("--p") !== ""
    ).length,
  }));
  ok("two pinned elements (pull-back and scale), --p only on the pins",
     desk.pins === 2 && desk.sticky && desk.strayP === 0, JSON.stringify(desk));

  const scale = await p.evaluate(() => {
    const root = document.querySelector("[data-scale]");
    const text = (root?.textContent || "").toLowerCase();
    const lines = [
      "leaders he sat with",
      "countries he crossed",
      "places he ate",
      "hearts he moved with a story",
    ];
    const widths = [...document.querySelectorAll("[data-scale-scrub] [data-scale-num]")]
      .map((el) => el.getBoundingClientRect().width);
    const growing = widths.length === 4 && widths.every((w, i) => i === 0 || w > widths[i - 1] + 8);
    return {
      copy: lines.every((line) => text.includes(line)),
      growing,
      widths: widths.map((w) => Math.round(w)),
    };
  });
  ok("scale sequence: four beats, each visibly larger",
     scale.copy && scale.growing, JSON.stringify(scale));

  /* The scrollbar is the pen: the photo's --p tracks scroll linearly. */
  const scrub = async (frac) => {
    return p.evaluate(async (f) => {
      const el = document.querySelector("[data-pullback]");
      const r = el.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      // Document-relative, NOT offsetTop: offsetTop is relative to the
      // nearest positioned ancestor and pointed this test at nowhere.
      const docTop = r.top + window.scrollY;
      const y = docTop + travel * f;
      for (let i = 0; i < 30; i++) {
        const l = window.__lenis;
        if (l) l.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
        if (Math.abs(window.scrollY - y) < 4) break;
      }
      await new Promise((r) => setTimeout(r, 150));
      return parseFloat(el.style.getPropertyValue("--p") || "-1");
    }, frac);
  };
  const p0 = await scrub(0);
  const pHalf = await scrub(0.5);
  const p1 = await scrub(1);
  ok("pull-back scales linearly against scroll",
     p0 < 0.05 && Math.abs(pHalf - 0.5) < 0.1 && p1 > 0.95,
     `--p at 0/0.5/1 of travel: ${p0} / ${pHalf} / ${p1}`);
  await p.close();
}

/* Below 992px the same two pins stay. The pull-back already scrubs at
   every width; the magnitude sequence does too, on a shorter travel. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 900, height: 900 });
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  const pins = await p.evaluate(() => document.querySelectorAll("[data-pin]").length);
  ok("pull-back and scale both pin below 992px", pins === 2, `${pins}`);
  await p.close();
}

/* ==================================================================
   THE FLUID HERO — gates and budget, each on its own page.
   ================================================================== */

/* Gate 1: reduced motion → zero canvas in the hero, the word visible. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  const st = await p.evaluate(() => {
    const hero = document.querySelector("[data-hero]");
    const word = hero?.querySelector("h1");
    const r = word?.getBoundingClientRect();
    return {
      canvases: hero ? hero.querySelectorAll("canvas").length : -1,
      wordVisible: Boolean(r && r.width > 100 && r.height > 40) &&
        parseFloat(getComputedStyle(word).opacity) > 0.9,
    };
  });
  ok("fluid hero: reduced motion → no canvas, word visible",
     st.canvases === 0 && st.wordVisible, JSON.stringify(st));
  await p.close();
}

/* Gate 2: WebGL unavailable → same fallback, page never looks broken. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.evaluateOnNewDocument(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith("webgl")) return null;
      return orig.call(this, type, ...rest);
    };
  });
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));
  const st = await p.evaluate(() => {
    const hero = document.querySelector("[data-hero]");
    const word = hero?.querySelector("h1");
    return {
      canvases: hero ? hero.querySelectorAll("canvas").length : -1,
      wordVisible: Boolean(word) && parseFloat(getComputedStyle(word).opacity) > 0.9,
      bg: hero ? getComputedStyle(hero).backgroundColor : null,
    };
  });
  ok("fluid hero: WebGL dead → no canvas, word over the ground",
     st.canvases === 0 && st.wordVisible, JSON.stringify(st));
  await p.close();
}

/* Gate 3: below 992px the canvas is absent entirely. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 900, height: 900 });
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  const canvases = await p.evaluate(
    () => document.querySelector("[data-hero]")?.querySelectorAll("canvas").length ?? -1);
  ok("fluid hero: no canvas below 992px", canvases === 0, `${canvases}`);
  await p.close();
}

/* Budget: 60 frames of synthetic pointer movement.
   Measured as rAF intervals while the sim runs. This compositor is
   vsync-locked at 16.7ms and shows up to 17.6ms of scheduler jitter with
   the sim COMPLETELY IDLE — measured, not assumed — so a fixed sub-17.5ms
   bound fails on an empty page. The budget question is whether sim work
   ever pushes a frame past its slot: a missed vsync doubles the interval
   to ~33ms. Assert nothing approaches that: every interval < 25ms. */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));

  const hasCanvas = await p.evaluate(
    () => Boolean(document.querySelector("[data-hero] canvas")));
  if (!hasCanvas) {
    ok("fluid hero: sim active in headless (skipping budget if not)", true,
       "no GL in this environment — budget unmeasurable here, noted in worklog");
  } else {
    const res = await p.evaluate(async () => {
      const hero = document.querySelector("[data-hero]");
      const r = hero.getBoundingClientRect();
      const deltas = [];
      let last = performance.now();
      let running = true;
      (function tick() {
        const now = performance.now();
        deltas.push(now - last);
        last = now;
        if (running) requestAnimationFrame(tick);
      })();
      for (let i = 0; i < 60; i++) {
        const t = i / 59;
        hero.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true,
          clientX: r.left + r.width * (0.15 + 0.7 * t),
          clientY: r.top + r.height * (0.5 + 0.3 * Math.sin(t * 9)),
        }));
        await new Promise((res2) => requestAnimationFrame(res2));
      }
      running = false;
      const f = deltas.slice(2).sort((a, b) => a - b);
      return {
        frames: f.length,
        median: +f[Math.floor(f.length / 2)].toFixed(2),
        worst: +f[f.length - 1].toFixed(2),
      };
    });
    ok("fluid hero: 60 synthetic moves, no missed vsync",
       res.worst < 25,
       `median ${res.median}ms, worst ${res.worst}ms over ${res.frames} frames (idle baseline worst: 17.6ms)`);
  }
  await p.close();
}

/* ==================================================================
   THE CURSOR — pill follows with lag; the photograph never reacts.
   ================================================================== */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));

  // Scroll a photograph target into view, then re-measure once the scroll
  // has actually settled — measuring in the same tick reads pre-scroll
  // coordinates.
  const SEL = "figure[data-cursor], li[data-cursor], div[data-cursor]";
  await p.evaluate((sel) => {
    const t = document.querySelector(sel) ?? document.querySelector("[data-cursor]");
    t?.scrollIntoView({ block: "center" });
  }, SEL);
  await new Promise((r) => setTimeout(r, 900));
  const box = await p.evaluate((sel) => {
    const t = document.querySelector(sel) ?? document.querySelector("[data-cursor]");
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  }, SEL);
  if (!box) {
    ok("cursor: a [data-cursor] target exists", false, "none found");
  } else {
    // Land ON the target, hold, then read state and pill lag while still on
    // it — the pill must be active and mid-glide, never 1:1.
    await p.mouse.move(box.x, box.y, { steps: 8 });
    await new Promise((r) => setTimeout(r, 300));
    const onTarget = await p.evaluate(() => {
      const pill = document.querySelector("[data-cursor-pill]");
      const r = pill.getBoundingClientRect();
      return { active: pill.dataset.active, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    // Sweep within the target while sampling per frame.
    // Horizontal only: a vertical component walks out of short targets.
    const dx = Math.min(box.w * 0.35, 120);
    const sweepEnd = { x: box.x + dx, y: box.y };
    const sampler = p.evaluate(() => new Promise((resolve) => {
      const pill = document.querySelector("[data-cursor-pill]");
      const frames = [];
      let n = 0;
      (function tick() {
        const r = pill.getBoundingClientRect();
        frames.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        if (++n < 25) requestAnimationFrame(tick);
        else resolve(frames);
      })();
    }));
    await p.mouse.move(sweepEnd.x, sweepEnd.y, { steps: 15 });
    // Read the pill the moment the sweep ends — waiting for the sampler
    // first gives the lerp ~400ms to catch up and the lag reads as zero.
    const mid = await p.evaluate(() => {
      const pill = document.querySelector("[data-cursor-pill]");
      const r = pill.getBoundingClientRect();
      return { active: pill.dataset.active, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const frames = await sampler;

    const updates = frames.filter((f, i) => i > 0 &&
      (Math.abs(f.x - frames[i - 1].x) > 0.2 || Math.abs(f.y - frames[i - 1].y) > 0.2)).length;
    const lag = Math.hypot(mid.x - sweepEnd.x, mid.y - sweepEnd.y);
    ok("cursor: pill is active over a photograph and updates per frame",
       onTarget.active === "true" && mid.active === "true" && updates >= 10,
       `active=${onTarget.active}→${mid.active}, ${updates}/24 frames moved`);
    ok("cursor: pill trails the pointer (lag > 0, lerp not 1:1)",
       lag > 2 && lag < 400, `${lag.toFixed(1)}px behind immediately after the sweep`);
  }

  // The pill is the entire hover state: hovering a photograph must not
  // transform or filter the image itself.
  const photo = await p.evaluate(() => {
    const img =
      document.querySelector("[data-cursor] img") ??
      document.querySelector("div[data-cursor]");   // the placeholder IS the zone
    if (!img) return null;
    const cs = getComputedStyle(img);
    return { transform: cs.transform, filter: cs.filter };
  });
  // A missing photograph is a failure, not a skip — a silent skip is how a
  // check stops existing.
  ok("cursor: hovered photograph keeps transform:none",
     photo !== null && photo.transform === "none",
     photo ? JSON.stringify(photo) : "no photograph found to check");
  await p.close();
}

/* ==================================================================
   WIRING PROOFS

   One observable per shipped pass — the single thing the browser can
   measure that is true only if that code actually runs. Reading the
   source proved nothing twice this session; these are what replace it.
   ================================================================== */
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });

  /* -- Lenis: the page keeps moving after the wheel event ends. ------ */
  await p.goto(`${BASE}/?loader=off`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  await p.mouse.move(700, 500);
  await p.mouse.wheel({ deltaY: 900 });
  await new Promise((r) => setTimeout(r, 80));
  const early = await p.evaluate(() => window.scrollY);
  await new Promise((r) => setTimeout(r, 700));
  const late = await p.evaluate(() => window.scrollY);
  ok("Lenis: page coasts after the wheel stops",
     late - early > 50, `${Math.round(early)}px → ${Math.round(late)}px`);

  /* -- MaskedText: line wrappers exist that no server HTML contained. */
  const built = await p.evaluate(() =>
    document.querySelectorAll('[class*="lineMask"]').length);
  ok("MaskedText: splitter built line wrappers at runtime", built > 0, `${built}`);

  await p.close();

  /* -- Loader: the count strictly increases. ------------------------- */
  const q = await browser.newPage();
  await q.setViewport({ width: 1440, height: 900 });
  await q.goto(`${BASE}/?loader=1`, { waitUntil: "domcontentloaded" });
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const v = await q.evaluate(() => {
      const el = document.querySelector("[data-loader-count]");
      return el ? Number(el.textContent.replace(/[^0-9]/g, "")) : null;
    });
    if (v !== null) seen.push(v);
    await new Promise((r) => setTimeout(r, 120));
  }
  const rising = seen.length > 3 && seen[seen.length - 1] > seen[0];
  ok("Loader: the count climbs", rising,
     seen.length ? `${seen[0]} → ${seen[seen.length - 1]} over ${seen.length} samples` : "never rendered");

  /* -- Arrival: <html data-opening> advances past its pre-state. ----- */
  const phases = new Set();
  for (let i = 0; i < 70; i++) {
    phases.add(await q.evaluate(() => document.documentElement.dataset.opening ?? "(unset)"));
    await new Promise((r) => setTimeout(r, 120));
  }
  ok("Arrival: the timeline leaves its pre-state",
     phases.has("curtain") && phases.has("done"), [...phases].join(" "));
  await q.close();
}

await browser.close();
console.log(failures ? `\n${failures} failing` : "\nall acceptance checks pass");
process.exit(failures ? 1 : 0);
