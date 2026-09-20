"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ReelEntry } from "../../lib/reels";
import { playEmbed, silenceSlide, stopEmbed } from "../../lib/reelPlayer";
import styles from "./NativeReels.module.css";

/* Sound prefers ON. Browsers may still block unmuted autoplay; after the
   first tap/scroll we keep later slides unmuted for the rest of the session. */
let preferSound = true;
let gestured = false;

function markGesture() {
  gestured = true;
  preferSound = true;
}

function LocalSlide({
  reel, active, unlocked,
}: {
  reel: ReelEntry; active: boolean; unlocked: boolean;
}) {
  const vid = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(!preferSound);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const el = vid.current;
    if (!el) return;
    if (!active) {
      el.pause();
      el.muted = true;
      return;
    }
    const wantSound = preferSound;
    el.muted = !wantSound;
    setMuted(el.muted);
    setBlocked(false);
    const tryPlay = () => {
      const p = el.play();
      if (!p) return;
      void p.catch(() => {
        if (!el.muted && wantSound) {
          el.muted = true;
          setMuted(true);
          setBlocked(true);
          void el.play().catch(() => {});
        }
      });
    };
    tryPlay();
    if (wantSound && (unlocked || gestured) && el.muted) {
      el.muted = false;
      setMuted(false);
      setBlocked(false);
      tryPlay();
    }
  }, [active, unlocked]);

  const unmute = () => {
    markGesture();
    const el = vid.current;
    if (!el) return;
    el.muted = false;
    setMuted(false);
    setBlocked(false);
    void el.play().catch(() => {});
  };

  const src = reel.file ? `/home/${reel.file}` : undefined;
  const still = reel.poster
    ? `/home/${reel.poster}`
    : reel.photo
      ? `/home/${reel.photo}`
      : undefined;

  return (
    <>
      {src ? (
        <video
          ref={vid}
          className={styles.media}
          src={src}
          poster={still}
          playsInline
          loop
          preload={active ? "auto" : "metadata"}
          onEnded={(e) => {
            const el = e.currentTarget;
            el.currentTime = 0;
            if (active) void el.play().catch(() => {});
          }}
        />
      ) : still ? (
        <img className={styles.media} src={still} alt="" />
      ) : (
        <div className={styles.media} />
      )}
      {src && (
        <button
          type="button"
          className={styles.sound}
          data-on={muted ? "false" : "true"}
          aria-pressed={!muted}
          onClick={() => {
            if (muted) unmute();
            else {
              const el = vid.current;
              if (!el) return;
              el.muted = true;
              setMuted(true);
              preferSound = false;
            }
          }}
        >
          {muted ? "sound off" : "sound on"}
        </button>
      )}
      {src && blocked && muted && active && (
        <button type="button" className={styles.unmute} onClick={unmute}>
          tap for sound
        </button>
      )}
    </>
  );
}

function EmbedSlide({
  reel, active, near, unlocked,
}: {
  reel: ReelEntry; active: boolean; near: boolean; unlocked: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [muted, setMuted] = useState(!preferSound);
  const [blocked, setBlocked] = useState(false);

  const src = (() => {
    if (!near || !reel.videoId) return null;
    if (reel.platform === "tiktok") {
      // Never autoplay a neighbour — that's the bleed. Active slide plays
      // via the embed API once the frame is up; mute=0 is the preference.
      const mute = active && preferSound ? 0 : 1;
      const autoplay = active ? 1 : 0;
      return `https://www.tiktok.com/player/v1/${reel.videoId}?music_info=0&description=0&rel=0&autoplay=${autoplay}&loop=1&mute=${mute}`;
    }
    if (reel.platform === "youtube") {
      const mute = active && preferSound && (unlocked || gestured) ? 0 : 1;
      const autoplay = active ? 1 : 0;
      return `https://www.youtube.com/embed/${reel.videoId}?autoplay=${autoplay}&mute=${mute}&playsinline=1&loop=1&playlist=${reel.videoId}&rel=0&modestbranding=1&controls=0&enablejsapi=1`;
    }
    return null;
  })();

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    if (!active) {
      stopEmbed(el);
      setMuted(true);
      return;
    }
    const withSound = preferSound;
    const kick = () => {
      playEmbed(el, withSound);
      setMuted(!withSound);
      if (withSound && !(unlocked || gestured)) setBlocked(true);
      else setBlocked(false);
    };
    kick();
    const t = window.setTimeout(kick, 400);
    return () => {
      window.clearTimeout(t);
      stopEmbed(el);
    };
  }, [active, unlocked, src]);

  useEffect(() => {
    if (!active) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (d && d["x-tiktok-player"] && d.type === "onPlayerReady") {
        playEmbed(frame.current, preferSound);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [active]);

  const unmute = () => {
    markGesture();
    preferSound = true;
    playEmbed(frame.current, true);
    setMuted(false);
    setBlocked(false);
  };

  if (!src) return <div className={styles.media} />;

  return (
    <>
      <iframe
        ref={frame}
        className={styles.embed}
        src={src}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
        title={reel.caption ?? "Reel"}
      />
      <button
        type="button"
        className={styles.sound}
        data-on={muted ? "false" : "true"}
        aria-pressed={!muted}
        onClick={() => {
          if (muted) unmute();
          else {
            playEmbed(frame.current, false);
            setMuted(true);
            preferSound = false;
          }
        }}
      >
        {muted ? "sound off" : "sound on"}
      </button>
      {blocked && muted && active && (
        <button type="button" className={styles.unmute} onClick={unmute}>
          tap for sound
        </button>
      )}
    </>
  );
}

function Slide({
  reel, active, near, index, total, unlocked,
}: {
  reel: ReelEntry; active: boolean; near: boolean; index: number; total: number;
  unlocked: boolean;
}) {
  return (
    <section
      className={styles.slide}
      data-reel-slide
      data-reel-active={active ? "true" : "false"}
    >
      <div className={styles.stage}>
        {reel.platform === "local"
          ? <LocalSlide reel={reel} active={active} unlocked={unlocked} />
          : <EmbedSlide reel={reel} active={active} near={near} unlocked={unlocked} />}
        <div className={styles.shade} />
        {reel.caption && <p className={styles.caption}>{reel.caption}</p>}
        {reel.credit && <p className={styles.credit}>{reel.credit}</p>}
        <p className={styles.index} aria-hidden="true">{index + 1}/{total}</p>
        {index === 0 && active && <p className={styles.swipe} aria-hidden="true">Swipe</p>}
      </div>
    </section>
  );
}

function realIndexOf(i: number, n: number) {
  if (n <= 1) return 0;
  if (i === 0) return n - 1;
  if (i === n + 1) return 0;
  return i - 1;
}

export default function NativeReels({
  reels,
  fullPage,
}: {
  reels: ReelEntry[];
  fullPage?: boolean;
}) {
  const deck = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [unlocked, setUnlocked] = useState(gestured);
  const activeRef = useRef(0);
  const n = reels.length;
  const looped = n > 1 ? [reels[n - 1], ...reels, reels[0]] : reels;
  const visual = n > 1 ? active + 1 : active;

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const root = deck.current;
    if (!root) return;
    const slides = [...root.querySelectorAll<HTMLElement>("[data-reel-slide]")];
    slides.forEach((el, i) => {
      if (i !== visual) silenceSlide(el);
    });
  }, [visual, n]);

  useEffect(() => {
    const root = deck.current;
    if (!root) return;
    const unlock = () => {
      markGesture();
      setUnlocked(true);
    };
    root.addEventListener("pointerdown", unlock, { passive: true });
    root.addEventListener("wheel", unlock, { passive: true });
    root.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      root.removeEventListener("pointerdown", unlock);
      root.removeEventListener("wheel", unlock);
      root.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const root = deck.current;
    if (!root) return;
    const slides = [...root.querySelectorAll<HTMLElement>("[data-reel-slide]")];
    const jump = (i: number) => {
      slides[i]?.scrollIntoView({ behavior: "auto", block: "start" });
    };
    if (n > 1) jump(1);

    const stopNeighbors = (keep: number) => {
      slides.forEach((el, i) => {
        if (i !== keep) silenceSlide(el);
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!hit) return;
        const i = slides.indexOf(hit.target as HTMLElement);
        if (i < 0) return;
        if (n > 1 && i === 0) {
          stopNeighbors(n);
          jump(n);
          setActive(n - 1);
          activeRef.current = n - 1;
          return;
        }
        if (n > 1 && i === n + 1) {
          stopNeighbors(1);
          jump(1);
          setActive(0);
          activeRef.current = 0;
          return;
        }
        stopNeighbors(i);
        const r = realIndexOf(i, n);
        setActive(r);
        activeRef.current = r;
      },
      { root, threshold: 0.65 }
    );
    slides.forEach((el) => io.observe(el));

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== " ") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      let next = activeRef.current + dir;
      if (n > 1) {
        if (next < 0) next = n - 1;
        if (next >= n) next = 0;
        jump(next + 1);
      } else {
        next = Math.min(slides.length - 1, Math.max(0, next));
        slides[next]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      io.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, [n]);

  if (!reels.length) return null;

  return (
    <div ref={deck} className={`${styles.deck} ${fullPage ? styles.full : ""}`} data-reels>
      {fullPage && (
        <Link href="/" className={styles.home}>Home</Link>
      )}
      {looped.map((reel, i) => (
        <Slide
          key={`${reel.id}-loop-${i}`}
          reel={reel}
          active={i === visual}
          near={Math.abs(i - visual) <= 1}
          index={realIndexOf(i, n)}
          total={n}
          unlocked={unlocked}
        />
      ))}
    </div>
  );
}
