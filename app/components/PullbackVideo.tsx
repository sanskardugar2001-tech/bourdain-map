"use client";

import { useEffect, useRef, useState } from "react";
import s from "./home.module.css";

/* The pull-back's content: a video where the photograph was.
 *
 * Two sources. `file` is a self-hosted clip in public/home/ — used with the
 * creator's written permission, credited like every photograph — played by
 * a native <video>, which gives mute control for free. `videoId` is a
 * YouTube embed via the IFrame API — the API and not a bare iframe because
 * mute control is the whole point. File wins when both are set.
 *
 * Shared behaviour, either source: autoplay with sound is blocked by every
 * browser, so the video arrives muted, plays only while the section is in
 * the viewport, pauses the moment it leaves, and the SOUND pill is the one
 * way to hear it. Muted is always the default — re-asserted on every
 * re-entry, so autoplay never fires with sound no matter what the visitor
 * did last pass.
 *
 * Two modes, decided by the same gate as the pin (reduced motion):
 *   auto   — chrome-less player scaling with the pull-back, sound pill in
 *            the stage corner. The pill does not shrink with the frame.
 *   static — no pin anywhere near this: a labelled frame with a play button,
 *            and player controls once started. Nothing autoplays.
 *
 * The wrapper carries data-video-state / data-video-muted for acceptance,
 * and the player is exposed as window.__whaPlayer — the YT player itself,
 * or a same-shaped shim over the <video> — so isMuted() itself can be
 * asserted rather than our mirror of it. */

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getPlayerState(): number;
  getDuration(): number;
  getCurrentTime(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: Element,
    opts: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    __whaPlayer?: YTPlayer;
  }
}

let ytLoading: Promise<void> | null = null;
function loadYT(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!ytLoading) {
    ytLoading = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.body.appendChild(tag);
    });
  }
  return ytLoading;
}

type Props = {
  file?: string;
  credit?: string;
  videoId?: string;
  start?: number;
  vertical?: boolean;
};

export default function PullbackVideo({ file, credit, videoId, start, vertical }: Props) {
  if (file) {
    return <LocalPullback file={file} credit={credit} start={start} vertical={vertical} />;
  }
  if (!videoId) return null; // the page renders the marked gap instead
  return <YouTubePullback videoId={videoId} start={start} vertical={vertical} />;
}

/* Both sources share the mode gate: mirrors HeroPullback's pin exactly. */
function usePinGate(): boolean {
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAuto(!reduced.matches);
    sync();
    reduced.addEventListener("change", sync);
    return () => {
      reduced.removeEventListener("change", sync);
    };
  }, []);
  return auto;
}

/* ------------------------------------------------------------------ */
/* The self-hosted clip. A native <video>: mute is a property, autoplay
   muted is allowed everywhere, and there is no third party to time out
   on — "blocked" only means the file itself failed to load. */
function LocalPullback({
  file,
  credit,
  start,
  vertical,
}: {
  file: string;
  credit?: string;
  start?: number;
  vertical?: boolean;
}) {
  const auto = usePinGate();
  const [started, setStarted] = useState(false); // static mode, after click
  const [state, setState] = useState<
    "none" | "ready" | "playing" | "paused" | "blocked"
  >("none");
  const [muted, setMuted] = useState(true);
  const [live, setLive] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const src = `/home/${file}`;

  useEffect(() => {
    if (!auto) return;
    const el = vid.current;
    const box = layer.current;
    if (!el || !box) return;

    // The same handle the YouTube path exposes, so acceptance asserts one
    // interface — isMuted() reads the element, not our mirror of it.
    window.__whaPlayer = {
      playVideo: () => void el.play().catch(() => setState("blocked")),
      pauseVideo: () => el.pause(),
      mute: () => { el.muted = true; },
      unMute: () => { el.muted = false; },
      isMuted: () => el.muted,
      getPlayerState: () => (el.ended ? 0 : el.paused ? 2 : 1),
      getDuration: () => el.duration || 0,
      getCurrentTime: () => el.currentTime || 0,
      destroy: () => {},
    };

    const io = new IntersectionObserver(
      (entries) => {
        const on = entries.some((e) => e.isIntersecting);
        setLive(on);
        if (on) {
          // Muted is the default on every arrival, not just the first.
          el.muted = true;
          setMuted(true);
          if (el.ended) {
            el.currentTime = start ?? 0;
          }
          void el.play().catch(() => setState("blocked"));
        } else {
          el.pause();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(box);
    return () => {
      io.disconnect();
      el.pause();
      delete window.__whaPlayer;
    };
    // file/start are baked at build time; auto is the only live input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const toggle = () => {
    const el = vid.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  const creditLine = credit?.trim() || "Clip used with permission";

  const videoEl = (controls: boolean) => (
    <video
      ref={vid}
      src={src}
      muted
      playsInline
      loop
      controls={controls}
      preload="metadata"
      onLoadedMetadata={() => {
        if (start && vid.current) vid.current.currentTime = start;
        setState((st) => (st === "none" ? "ready" : st));
      }}
      onPlaying={() => setState("playing")}
      onPause={() => setState("paused")}
      onEnded={() => setState("paused")}
      onError={() => setState("blocked")}
      className={
        controls
          ? `${s.videoBox} ${vertical ? s.videoBoxVertical : ""}`
          : undefined
      }
    />
  );

  const missingCard = (
    <div className={s.videoBlocked} data-video-blocked>
      <span className={s.videoBlockedTag}>Video file missing</span>
      <span className={s.videoBlockedNote}>
        <code>public/home/{file}</code> didn&rsquo;t load — is it there?
      </span>
    </div>
  );

  if (!auto) {
    return (
      <div className={s.videoStatic} data-video-static>
        <p className="label">watch</p>
        {state === "blocked" ? (
          missingCard
        ) : started ? (
          videoEl(true)
        ) : (
          <button
            type="button"
            className={`${s.videoPlay} ${vertical ? s.videoBoxVertical : ""}`}
            onClick={() => setStarted(true)}
            data-video-play
          >
            <span className={s.playTri} aria-hidden="true" />
            <span className="label">play</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={layer}
      className={s.videoLayer}
      data-video-state={state}
      data-video-muted={muted ? "true" : "false"}
      // On screen → pill. Not "once playing": the reference keeps it there
      // the whole time the video is, and only a blocked frame drops it.
      data-live={live && state !== "blocked" ? "true" : "false"}
    >
      <div className={s.videoScaled}>
        <div className={`${s.videoCover} ${vertical ? s.videoCoverVertical : ""}`}>
          {videoEl(false)}
        </div>
        {state === "blocked" && missingCard}
      </div>
      <button
        type="button"
        className={s.soundPill}
        data-sound-pill
        data-on={muted ? "false" : "true"}
        aria-pressed={!muted}
        onClick={toggle}
      >
        <span className={s.pillWord}>sound</span>
        <span className={s.pillTrack} aria-hidden="true">
          <span className={s.pillKnob} />
        </span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function YouTubePullback({
  videoId,
  start,
  vertical,
}: {
  videoId: string;
  start?: number;
  vertical?: boolean;
}) {
  // SSR renders the static frame; the effect below promotes to auto where
  // the pin is real. Same shape as the pin's own data-pinned flip.
  const [auto, setAuto] = useState(false);
  const [started, setStarted] = useState(false); // static mode, after click
  const [state, setState] = useState<
    "none" | "ready" | "playing" | "paused" | "blocked"
  >("none");
  const [muted, setMuted] = useState(true);
  const [live, setLive] = useState(false); // section in view, pill showable

  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const inView = useRef(false);
  const blocked = useRef(false);
  const everPlayed = useRef(false);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* Belt and braces around a flaky event: a video whose owner forbids
     embedding errors with code 150 — but the IFrame API does not reliably
     deliver onError in every context (verified: same video, same vars, the
     event arrives in an isolated harness and not in the full page). So every
     playVideo() we issue also arms a deadline: still not playing, paused or
     buffering after 12s → blocked. A late PLAYING un-blocks. */
  const graces = useRef(0);
  const armDeadline = () => {
    clearTimeout(deadline.current);
    deadline.current = setTimeout(() => {
      const st = player.current?.getPlayerState?.();
      if (st === 1 || st === 2) return; // playing / paused — alive
      // "Buffering" gets one grace period, not infinite ones — a blocked
      // video can sit in buffering forever in some contexts.
      if (st === 3 && graces.current < 1) {
        graces.current += 1;
        armDeadline();
        return;
      }
      blocked.current = true;
      setState("blocked");
    }, 12000);
  };

  /* Mode: mirrors HeroPullback's gate exactly. */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAuto(!reduced.matches);
    sync();
    reduced.addEventListener("change", sync);
    return () => {
      reduced.removeEventListener("change", sync);
    };
  }, []);

  const create = (el: Element, controls: 0 | 1) => {
    const YT = window.YT!;
    const p = new YT.Player(el, {
      videoId,
      playerVars: {
        autoplay: 0,
        controls,
        start: Math.max(0, Math.floor(start ?? 0)),
        playsinline: 1,
        rel: 0,
        mute: 1,
        disablekb: controls ? 0 : 1,
      },
      events: {
        onReady: () => {
          p.mute();
          setMuted(true);
          setState("ready");
          if (controls === 0 && inView.current) {
            p.playVideo();
            armDeadline();
          }
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            clearTimeout(deadline.current);
            blocked.current = false; // a late start beats a wrong verdict
            graces.current = 0;
            everPlayed.current = true;
            setState("playing");
          } else if (e.data === YT.PlayerState.PAUSED) {
            clearTimeout(deadline.current);
            // A trailing PAUSED after the instant ENDED of a restricted
            // video must not overwrite the blocked verdict (observed).
            if (!blocked.current) setState("paused");
          } else if (e.data === YT.PlayerState.ENDED) {
            clearTimeout(deadline.current);
            // A restricted (error-150) video "ends" instantly in-page: the
            // API can emit a momentary PLAYING, no onError, and even a real
            // duration (metadata survives the refusal — observed). The tell
            // that remains is the clock: a genuine finish ends at its
            // duration, a refusal ends at ~zero.
            const dur = p.getDuration?.() ?? 0;
            const ct = p.getCurrentTime?.() ?? 0;
            if (everPlayed.current && dur > 0 && ct > 1) {
              setState("paused");
            } else {
              blocked.current = true;
              setState("blocked");
            }
          }
        },
        // 101/150: the owner forbids embedded playback (usual on fan edits
        // with claimed music). 100: gone or private. Either way the frame
        // degrades to a marked card, never a black erroring player.
        onError: () => {
          clearTimeout(deadline.current);
          blocked.current = true;
          setState("blocked");
        },
      },
    });
    player.current = p;
    window.__whaPlayer = p;
    return p;
  };

  /* Auto mode: player + in-view driving. */
  useEffect(() => {
    if (!auto) return;
    const el = layer.current;
    if (!el) return;

    let cancelled = false;
    loadYT().then(() => {
      if (cancelled || player.current || !host.current) return;
      create(host.current, 0);
    });

    const io = new IntersectionObserver(
      (entries) => {
        const on = entries.some((e) => e.isIntersecting);
        inView.current = on;
        setLive(on);
        const p = player.current;
        if (!p || blocked.current) return;
        if (on) {
          // Muted is the default on every arrival, not just the first.
          p.mute();
          setMuted(true);
          p.playVideo();
          armDeadline();
        } else {
          clearTimeout(deadline.current);
          p.pauseVideo();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);

    return () => {
      cancelled = true;
      io.disconnect();
      clearTimeout(deadline.current);
      player.current?.destroy();
      player.current = null;
      delete window.__whaPlayer;
    };
    // videoId/start are baked at build time; auto is the only live input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const toggle = () => {
    const p = player.current;
    if (!p) return;
    if (p.isMuted()) {
      p.unMute();
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  };

  /* Static mode: nothing loads until asked. */
  const play = () => {
    setStarted(true);
    loadYT().then(() => {
      if (player.current || !host.current) return;
      create(host.current, 1);
    });
  };

  const blockedCard = (
    <div className={s.videoBlocked} data-video-blocked>
      <span className={s.videoBlockedTag}>This clip won&rsquo;t embed</span>
      <span className={s.videoBlockedNote}>
        Its owner doesn&rsquo;t allow playback outside YouTube.{" "}
        <a href={`https://www.youtube.com/watch?v=${videoId}`} rel="noopener" target="_blank">
          Watch it there
        </a>
      </span>
    </div>
  );

  if (!auto) {
    return (
      <div className={s.videoStatic} data-video-static>
        <p className="label">watch</p>
        {state === "blocked" ? (
          blockedCard
        ) : started ? (
          <div className={`${s.videoBox} ${vertical ? s.videoBoxVertical : ""}`}>
            <div ref={host} />
          </div>
        ) : (
          <button
            type="button"
            className={`${s.videoPlay} ${vertical ? s.videoBoxVertical : ""}`}
            onClick={play}
            data-video-play
          >
            <span className={s.playTri} aria-hidden="true" />
            <span className="label">play</span>
          </button>
        )}
        <noscript>
          <a href={`https://www.youtube.com/watch?v=${videoId}`} rel="noopener">
            Watch on YouTube
          </a>
        </noscript>
      </div>
    );
  }

  return (
    <div
      ref={layer}
      className={s.videoLayer}
      data-video-state={state}
      data-video-muted={muted ? "true" : "false"}
      data-live={live && state !== "blocked" ? "true" : "false"}
    >
      <div className={s.videoScaled}>
        {/* The cover stays mounted even when blocked — YT owns its iframe
            and unmounting mid-error risks a race; CSS hides it instead. */}
        <div className={`${s.videoCover} ${vertical ? s.videoCoverVertical : ""}`}>
          <div ref={host} />
        </div>
        {state === "blocked" && blockedCard}
      </div>
      <button
        type="button"
        className={s.soundPill}
        data-sound-pill
        data-on={muted ? "false" : "true"}
        aria-pressed={!muted}
        onClick={toggle}
      >
        <span className={s.pillWord}>sound</span>
        <span className={s.pillTrack} aria-hidden="true">
          <span className={s.pillKnob} />
        </span>
      </button>
    </div>
  );
}
