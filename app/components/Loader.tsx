"use client";

import { useEffect, useRef, useState } from "react";
import BourdainMark from "./BourdainMark";
import type { PhotoMeta } from "../../lib/photo";
import { runOpening, type OpeningMode } from "../../lib/opening";
import s from "./home.module.css";

/* The loader.
 *
 * First paint is the whole viewport: BOURDAIN, huge, the O a window that
 * cycles portraits of him. Nothing else gets a vote until this finishes.
 * Then the curtain lifts into the film.
 *
 * Rendered server-side. Every dismissal read — sessionStorage, matchMedia,
 * the query string — happens in an effect, so first paint is identical on
 * server and client and there is no hydration mismatch.
 */

export type LoaderPhoto = { photo?: string; alt?: string; meta?: PhotoMeta };

const DURATION = 4000;   // 4s, or the object cycle cannot register
const HOLD = 1000;       // the man, alone, before the curtain
const WIPE = 1600;       // must match --t-signature: the curtain's CSS transition

/* easeInOutQuad — dwell at the ends, sprint through the middle. */
const ease = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/* Slow swaps at the start, fastest mid-count, slowing again at the end. */
const interval = (t: number) => 90 + 420 * (1 - Math.sin(Math.PI * t));

export default function Loader({
  objects, portrait, total,
}: {
  objects: LoaderPhoto[];
  portrait: LoaderPhoto | null;
  total: number;
}) {
  const [n, setN] = useState(0);
  const [idx, setIdx] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [phase, setPhase] = useState<"idle" | "run" | "wipe" | "done">("idle");
  const raf = useRef(0);
  const stopOpening = useRef<(() => void) | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("loader");
    const hold  = flag === "hold";   // freeze on the resolved frame
    const force = flag === "1";      // replay, ignoring sessionStorage
    const off   = flag === "off";    // settled at t=0, for tests
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try { seen = sessionStorage.getItem("wha:loader") === "1"; } catch {}

    // Reduced motion, or an explicit ?loader=off: nothing runs, everything
    // settled at t=0. Repeat visit: no loader, but the arrival still plays —
    // the site should never simply appear.
    const mode: OpeningMode = reduced || off
      ? "none"
      : seen && !hold && !force
        ? "arrival"
        : "full";

    // The timeline owns the curtain and everything after it, in every mode.
    // It has to start before any early return, or a repeat visit gets no
    // arrival at all.
    stopOpening.current = runOpening(hold ? "none" : mode);

    if (mode !== "full") { setPhase("done"); return; }
    if (!hold && !force) { try { sessionStorage.setItem("wha:loader", "1"); } catch {} }

    setPhase("run");

    const start = performance.now();
    let nextSwap = start + interval(0);
    let i = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      setN(Math.round(ease(t) * total));

      if (t < 1) {
        if (now >= nextSwap && objects.length > 1 && i < objects.length - 1) {
          i = i + 1;
          setIdx(i);
          nextSwap = now + interval(t);
        }
        raf.current = requestAnimationFrame(tick);
        return;
      }

      // Landed. Cycling stops; the O becomes the one photograph of him.
      setN(total);
      setResolved(true);
      if (hold) return;                       // freeze for screenshots
      // The curtain and everything after it belong to the shared opening
      // timeline, so the hero can start while this is still travelling.
      window.setTimeout(() => {
        setPhase("wipe");
        window.setTimeout(() => setPhase("done"), WIPE);
      }, HOLD);
    };

    raf.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf.current); stopOpening.current?.(); };
  }, [objects, portrait, total]);

  if (phase === "done" || phase === "idle") return null;

  const shown = resolved && portrait ? portrait : objects[idx] ?? objects[0];

  return (
    <div className={s.loader} data-phase={phase} data-resolved={resolved ? "true" : "false"} role="presentation">
      <div className={s.loaderInner}>
        <BourdainMark
          photo={shown?.photo}
          meta={shown?.meta}
          alt={shown?.alt}
          isFinal={resolved}
          huge
          probe
          sizes="clamp(160px, 22vw, 360px)"
        />
        <span className={s.loaderCount} data-loader-count="">
          <span className={s.loaderNum}>
            {n < 1000 ? String(n).padStart(4, "0") : n.toLocaleString("en-GB")}
          </span>
          <span className={s.loaderLabel}>places he ate</span>
        </span>
      </div>
    </div>
  );
}
