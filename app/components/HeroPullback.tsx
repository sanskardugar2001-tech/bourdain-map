"use client";

import { useEffect, useRef, useState } from "react";
import { onScroll } from "../../lib/scroll";
import PullbackVideo from "./PullbackVideo";
import s from "./home.module.css";

/* One plate, then the whole life.
 *
 * Opens full bleed on the frame's content — a muted video where the manifest
 * supplies one, the marked gap where it doesn't. Scrolling pulls it back
 * until it is one pin among two thousand on a world map, while the room
 * photograph behind scales the opposite way (1.05 → 1), so the shrink reads
 * as a dolly-out. It explains the site with no copy and hands you into /map.
 *
 * The scale is LINEAR in scroll. Easing belongs to entrances; anything tied
 * to the scrollbar has to track the finger, and an eased scrub feels broken.
 *
 * One passive listener, rAF-throttled, one getBoundingClientRect, writing
 * only custom properties that feed transform and opacity. Nothing reads
 * layout per frame.
 *
 * The scroll journey runs on every width. Reduced motion settles it. The
 * world-dot canvas hides on small screens; the film and the table stay.
 */

type Props = {
  /** Real coordinates for the photographed place, so the pin lands where it
   *  actually is. Null means we don't know, and we say so instead of faking. */
  target: { lon: number; lat: number } | null;
  /** The video that fills the shrinking frame — a self-hosted file (wins)
   *  or a YouTube id. Null → children (the marked gap) fill it instead,
   *  exactly as the photograph used to. */
  video?: {
    file?: string;
    credit?: string;
    videoId?: string;
    start?: number;
    vertical?: boolean;
  } | null;
  /** Full-bleed photograph of the room behind the frame. It scales 1.05 → 1
   *  against the same scroll, opposite the frame, so the shrink reads as a
   *  dolly-out rather than a zoom on a flat card. */
  background?: React.ReactNode;
  invite?: React.ReactNode;
  children?: React.ReactNode;
};

export default function HeroPullback({ target, video, background, invite, children }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pts, setPts] = useState<[number, number][]>([]);

  useEffect(() => {
    fetch("/data/world.json")
      .then((r) => r.json())
      .then(setPts)
      .catch(() => setPts([]));
  }, []);

  /* ---- the scroll driver ------------------------------------------- */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let active = false;
    let unsubscribe: (() => void) | null = null;

    // Driven by the shared Lenis frame. A native scroll listener fires
    // against the real position while Lenis is still interpolating toward
    // it, which makes the pull-back judder against the smoothing.
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
      el.dataset.pinned = on ? "true" : "false";
      // The attribute IS the pin census: the exactly-one-pin acceptance
      // counts [data-pin], so it must exist only while the pin is real.
      el.toggleAttribute("data-pin", on);
      if (on) {
        unsubscribe = onScroll(read);
        window.addEventListener("resize", read, { passive: true });
      } else {
        unsubscribe?.(); unsubscribe = null;
        window.removeEventListener("resize", read);
        el.style.setProperty("--p", "0");   // settled
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

  /* ---- the world it lands in --------------------------------------- */
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || pts.length === 0) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--accent").trim() || "#B8342A";

    const draw = () => {
      const r = cv.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);

      // Equirectangular, cropped to inhabited latitudes.
      const project = (lon: number, lat: number): [number, number] => [
        ((lon + 180) / 360) * r.width,
        ((78 - lat) / 140) * r.height,
      ];

      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.55;
      for (const [lon, lat] of pts) {
        const [x, y] = project(lon, lat);
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      if (target) {
        const [x, y] = project(target.lon, target.lat);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [pts, target]);

  return (
    // data-pin is toggled by sync(): present only while the pin is live, so
    // the pin census stays truthful below 992px and under reduced motion.
    // The scroll cue is NOT here any more — FluidHero owns it now.
    <section ref={wrap} className={s.pullback} data-pullback="" data-pinned="false">
      <div className={s.pullStage}>
        {background && (
          <div className={s.pullRoom} aria-hidden="true">
            {background}
          </div>
        )}
        <div className={s.pullWorld} aria-hidden="true">
          <canvas ref={canvas} />
        </div>
        {video && (video.file || video.videoId) ? (
          <PullbackVideo
            file={video.file}
            credit={video.credit}
            videoId={video.videoId}
            start={video.start}
            vertical={video.vertical}
          />
        ) : (
          <div className={s.pullPhoto}>{children}</div>
        )}
        {invite && <div className={s.pullInvite}>{invite}</div>}
      </div>
    </section>
  );
}
