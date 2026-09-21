"use client";

import { useEffect, useRef } from "react";
import { onScroll } from "../../lib/scroll";
import s from "./home.module.css";

/* Four magnitudes, one pinned frame.
 *
 * The number stays put and gets larger. Scroll is the only clock: --p runs
 * 0 → 1 across the pin, linear, on the shared Lenis frame. Easing belongs
 * to entrances; a scrub that eases feels like it missed your finger.
 *
 * Each beat is a held line — 10s, 100s, 1,000s, millions — crossfading at
 * the boundary and scaling up a little while it holds. Nothing else in the
 * frame translates. The London table is the next section, not a fifth beat.
 *
 * prefers-reduced-motion (and no JS) never pins. The four lines stack,
 * each larger than the last, which is the whole idea without the scrub.
 */

const BEATS = [
  { num: "10s", label: "leaders he sat with" },
  { num: "100s", label: "countries he crossed" },
  { num: "1,000s", label: "places he ate" },
  { num: "millions", label: "hearts he moved with his storytelling" },
] as const;

export default function ScaleSequence() {
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let active = false;
    let unsubscribe: (() => void) | null = null;

    // Same contract as the pull-back: read Lenis, not the native scroll
    // event, or the number judders behind the smoothing.
    const read = () => {
      const r = el.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      const p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 0;
      el.style.setProperty("--p", p.toFixed(4));
    };

    const sync = () => {
      const on = !reduced.matches;
      if (on === active) return;
      active = on;
      if (on) document.documentElement.dataset.scalePin = "1";
      else delete document.documentElement.dataset.scalePin;
      el.dataset.pinned = on ? "true" : "false";
      // Present only while the pin is live, so the pin census stays truthful
      // under reduced motion. The pull-back is the other one.
      el.toggleAttribute("data-pin", on);
      if (on) {
        unsubscribe = onScroll(read);
        window.addEventListener("resize", read, { passive: true });
      } else {
        unsubscribe?.();
        unsubscribe = null;
        window.removeEventListener("resize", read);
        el.style.removeProperty("--p");
      }
    };

    sync();
    reduced.addEventListener("change", sync);
    return () => {
      reduced.removeEventListener("change", sync);
      unsubscribe?.();
      window.removeEventListener("resize", read);
    };
  }, []);

  return (
    <section
      ref={wrap}
      className={s.scalePin}
      data-scale=""
      data-pinned="false"
      aria-label="What it added up to"
    >
      <div className={s.scaleStage}>
        <ol className={s.scaleSr}>
          {BEATS.map((b) => (
            <li key={b.num}>
              {b.num}, {b.label}
            </li>
          ))}
        </ol>

        <div className={s.scaleScrub} data-scale-scrub="" aria-hidden="true">
          {BEATS.map((b, i) => (
            <div key={b.num} className={`${s.scaleFade} ${s.scaleBeat}`} data-step={i}>
              <p className={s.scaleNum} data-scale-num="">
                {b.num}
              </p>
            </div>
          ))}
          {BEATS.map((b, i) => (
            <p
              key={b.label}
              className={`${s.scaleFade} ${s.scaleBeatLabel}`}
              data-step={i}
            >
              {b.label}
            </p>
          ))}
        </div>

        <ol className={s.scaleStack} data-scale-stack="">
          {BEATS.map((b, i) => (
            <li key={b.num} className={s.scaleStackItem} data-step={i}>
              <p className={s.scaleStackNum} data-scale-num="">
                {b.num}
              </p>
              <p className={s.scaleStackLabel}>{b.label}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
