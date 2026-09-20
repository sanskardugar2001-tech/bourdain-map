"use client";

import { useEffect, useRef, useState } from "react";
import { onFrame } from "../../lib/scroll";
import s from "./home.module.css";

/* The hero. BOURDAIN set very large over a canvas.
 *
 * Two layers: the ground colour on top, and beneath it the pre-rendered
 * world-map image — one static PNG generated at build time, never a live
 * map. Between them sits a fluid simulation: moving the pointer stirs a
 * velocity field, the field carries ink, and the map bleeds through where
 * the ink went. The ink outlives the motion (dye dissipates slower than
 * velocity), keeps drifting after the pointer stops, then thins and the
 * ground heals shut.
 *
 * The type never moves, is never masked, never distorted. It sits above
 * everything and stays put.
 *
 * Gating, all client-side so SSR renders the fallback:
 *   - min-width 992px AND pointer:fine
 *   - no reduced motion
 *   - WebGL2 with renderable half-float, or nothing
 *   - context loss tears back down to the static hero
 * The fallback is the word over the ground colour — a finished frame, not a
 * degraded one. The idle state of the live sim looks identical to it.
 *
 * Simulation: classic stable fluids. Velocity dissipation 0.962, dye
 * dissipation 0.988 (the ink must outlive the motion), 20 pressure
 * iterations, curl 0 — ink in still water, not smoke. Simulated at low
 * resolution and upscaled; the display pass runs at canvas resolution.
 */

const VEL_DISSIPATION = 0.962;
const DYE_DISSIPATION = 0.988;
const PRESSURE_ITERATIONS = 20;
const SIM_W = 160;            // velocity/pressure grid width
const DYE_W = 640;            // ink grid width
const SPLAT_RADIUS = 0.16;    // thin trail, not a smoke plume
const EDGE = 0.06;            // where the mask starts
const SOFT = 0.5;             // edge softness

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const ADVECT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uVelocity, uSource;
uniform vec2 uTexel;
uniform float uDt, uDissipation;
void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
  o = uDissipation * texture(uSource, coord);
}`;

const SPLAT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius, uAspect;
void main() {
  vec2 d = vUv - uPoint;
  d.x *= uAspect;
  float g = exp(-dot(d, d) / uRadius);
  o = texture(uTarget, vUv) + vec4(uValue, 0.0) * g;
}`;

const DIVERGENCE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  o = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}`;

const PRESSURE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPressure, uDivergence;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  o = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPressure, uVelocity;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(r - l, t - b) * 0.5;
  o = vec4(v, 0.0, 1.0);
}`;

const DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uDye, uMap;
uniform vec3 uGround;
uniform float uEdge, uSoft;
uniform float uVideoAspect, uCanvasAspect;
void main() {
  float ink = texture(uDye, vUv).x;
  float m = smoothstep(uEdge, uEdge + uSoft * 0.4, ink);
  vec3 mapCol = uGround;
  if (uVideoAspect > 0.0 && uCanvasAspect > 0.0) {
    float w = uVideoAspect / uCanvasAspect;
    if (w <= 1.0) {
      float x0 = (1.0 - w) * 0.5;
      if (vUv.x >= x0 && vUv.x <= x0 + w) {
        float vx = (vUv.x - x0) / w;
        mapCol = texture(uMap, vec2(vx, 1.0 - vUv.y)).rgb;
      }
    } else {
      float h = uCanvasAspect / uVideoAspect;
      float y0 = (1.0 - h) * 0.5;
      if (vUv.y >= y0 && vUv.y <= y0 + h) {
        float vy = (vUv.y - y0) / h;
        mapCol = texture(uMap, vec2(vUv.x, 1.0 - vy)).rgb;
      }
    }
  } else {
    mapCol = texture(uMap, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  }
  o = vec4(mix(uGround, mapCol, m), 1.0);
}`;

type FBO = { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };
type Pair = { read: FBO; write: FBO; swap: () => void };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number, number, number,
  ];
}

export default function FluidHero({
  video,
  poster,
  vertical,
}: {
  video?: string;
  poster?: string;
  vertical?: boolean;
}) {
  const stage = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const footageRef = useRef<HTMLVideoElement>(null);
  const stillRef = useRef<HTMLImageElement>(null);
  const [live, setLive] = useState(false);
  const [brush, setBrush] = useState(false);

  /* WebGL fluid on wide fine pointers — except when the splash is a
     9:16 film. That clip fills the stage with object-fit: cover; the
     sim would smear it. */
  useEffect(() => {
    if (vertical) {
      setLive(false);
      setBrush(false);
      return;
    }
    const wide = window.matchMedia("(min-width: 992px)");
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const ok = wide.matches && fine.matches && !reduced.matches;
      setLive(ok);
      setBrush(!ok && !reduced.matches);
    };
    sync();
    for (const m of [wide, fine, reduced]) m.addEventListener("change", sync);
    return () => {
      for (const m of [wide, fine, reduced]) m.removeEventListener("change", sync);
    };
  }, [vertical]);

  /* The simulation. Everything in here fails toward the static hero. */
  useEffect(() => {
    if (!live) return;
    const canvas = canvasRef.current;
    const host = stage.current;
    if (!canvas || !host) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) { setLive(false); return; }
    if (!gl.getExtension("EXT_color_buffer_float") &&
        !gl.getExtension("EXT_color_buffer_half_float")) {
      setLive(false);
      return;
    }

    let dead = false;
    const onLost = (e: Event) => {
      e.preventDefault();
      dead = true;
      setLive(false);   // context loss: back to the static hero, no wreckage
    };
    canvas.addEventListener("webglcontextlost", onLost);

    /* ---- boilerplate ------------------------------------------------ */
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
      }
      return sh;
    };
    const program = (frag: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p) ?? "link");
      }
      return p;
    };

    let progs: Record<string, WebGLProgram>;
    try {
      progs = {
        advect: program(ADVECT),
        splat: program(SPLAT),
        divergence: program(DIVERGENCE),
        pressure: program(PRESSURE),
        gradient: program(GRADIENT),
        display: program(DISPLAY),
      };
    } catch {
      setLive(false);
      return;
    }

    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const fbo = (w: number, h: number): FBO => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { fb, tex, w, h };
    };
    const pair = (w: number, h: number): Pair => {
      let a = fbo(w, h), b = fbo(w, h);
      return {
        get read() { return a; },
        get write() { return b; },
        swap() { [a, b] = [b, a]; },
      } as Pair;
    };

    const aspect = host.clientWidth / Math.max(1, host.clientHeight);
    const simW = SIM_W, simH = Math.max(2, Math.round(SIM_W / aspect));
    const dyeW = DYE_W, dyeH = Math.max(2, Math.round(DYE_W / aspect));

    const velocity = pair(simW, simH);
    const dye = pair(dyeW, dyeH);
    const pressure = pair(simW, simH);
    const divergence = fbo(simW, simH);

    /* the map, uploaded once */
    const mapTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, mapTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([230, 230, 225, 255]));
    const img = new Image();
    img.onload = () => {
      if (dead) return;
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };
    const still = stillRef.current;
    if (still?.complete && still.naturalWidth) {
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, still);
    }
    img.src = poster || "/data/world-map.png";

    const ground = hexToRgb(
      getComputedStyle(document.documentElement).getPropertyValue("--ground") || "#E6E6E1"
    );

    const u = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
    const bindTex = (tex: WebGLTexture, unit: number) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      return unit;
    };
    const blit = (target: FBO | null) => {
      if (target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
        gl.viewport(0, 0, target.w, target.h);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    /* ---- pointer ----------------------------------------------------- */
    const pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false, known: false };
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = 1 - (e.clientY - r.top) / r.height;
      if (pointer.known) {
        pointer.dx = (x - pointer.x) * 6;
        pointer.dy = (y - pointer.y) * 6;
        pointer.moved = Math.abs(pointer.dx) + Math.abs(pointer.dy) > 0;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.known = true;
    };
    host.addEventListener("pointermove", onMove, { passive: true });

    /* One slow stroke so the film shows itself before anyone moves. */
    let stroke = 0;
    const intro = window.setInterval(() => {
      stroke += 1;
      const t = stroke / 14;
      if (t > 1) { window.clearInterval(intro); return; }
      pointer.x = 0.18 + t * 0.62;
      pointer.y = 0.5;
      pointer.dx = 0.35;
      pointer.dy = 0;
      pointer.moved = true;
      pointer.known = true;
    }, 45);

    /* Pause when the hero is off-screen — no reason to simulate under the
       colophon. */
    let onScreen = true;
    const io = new IntersectionObserver(
      (es) => { onScreen = es.some((e) => e.isIntersecting); });
    io.observe(host);

    /* ---- sizing ------------------------------------------------------ */
    const size = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(host.clientWidth * dpr);
      canvas.height = Math.round(host.clientHeight * dpr);
    };
    size();
    window.addEventListener("resize", size);

    /* ---- frame ------------------------------------------------------- */
    // Ink exists → keep simulating even after the pointer stops, so the
    // trail drifts, thins and heals. This flag lets a fully-healed, untouched
    // hero cost nothing per frame.
    let inkAlive = false;
    let last = performance.now();

    const stopFrame = onFrame(() => {
      if (dead || !onScreen) return;
      const now = performance.now();
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;

      const footage = footageRef.current;
      if (footage && footage.readyState >= 2) {
        // Same upload path as the still: the display shader already flips Y.
        // UNPACK_FLIP_Y here double-flipped the film and stood it on its head.
        gl.bindTexture(gl.TEXTURE_2D, mapTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, footage);
      }

      if (pointer.moved) {
        inkAlive = true;
        // stir the water
        gl.useProgram(progs.splat);
        gl.uniform1i(u(progs.splat, "uTarget"), bindTex(velocity.read.tex, 0));
        gl.uniform2f(u(progs.splat, "uPoint"), pointer.x, pointer.y);
        gl.uniform3f(u(progs.splat, "uValue"), pointer.dx * simW, pointer.dy * simH, 0);
        gl.uniform1f(u(progs.splat, "uRadius"), (SPLAT_RADIUS / 100) * aspect);
        gl.uniform1f(u(progs.splat, "uAspect"), aspect);
        blit(velocity.write); velocity.swap();
        // drop the ink
        gl.uniform1i(u(progs.splat, "uTarget"), bindTex(dye.read.tex, 0));
        gl.uniform3f(u(progs.splat, "uValue"), 0.6, 0, 0);
        blit(dye.write); dye.swap();
        pointer.moved = false;
      }

      if (inkAlive) {
        // pressure projection: divergence → jacobi ×20 → subtract gradient
        gl.useProgram(progs.divergence);
        gl.uniform1i(u(progs.divergence, "uVelocity"), bindTex(velocity.read.tex, 0));
        gl.uniform2f(u(progs.divergence, "uTexel"), 1 / simW, 1 / simH);
        blit(divergence);

        gl.useProgram(progs.pressure);
        gl.uniform2f(u(progs.pressure, "uTexel"), 1 / simW, 1 / simH);
        gl.uniform1i(u(progs.pressure, "uDivergence"), bindTex(divergence.tex, 1));
        for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
          gl.uniform1i(u(progs.pressure, "uPressure"), bindTex(pressure.read.tex, 0));
          blit(pressure.write); pressure.swap();
        }

        gl.useProgram(progs.gradient);
        gl.uniform2f(u(progs.gradient, "uTexel"), 1 / simW, 1 / simH);
        gl.uniform1i(u(progs.gradient, "uPressure"), bindTex(pressure.read.tex, 0));
        gl.uniform1i(u(progs.gradient, "uVelocity"), bindTex(velocity.read.tex, 1));
        blit(velocity.write); velocity.swap();

        // advect velocity through itself, then the ink through the water
        gl.useProgram(progs.advect);
        gl.uniform2f(u(progs.advect, "uTexel"), 1 / simW, 1 / simH);
        gl.uniform1f(u(progs.advect, "uDt"), dt * 60);
        gl.uniform1f(u(progs.advect, "uDissipation"), VEL_DISSIPATION);
        gl.uniform1i(u(progs.advect, "uVelocity"), bindTex(velocity.read.tex, 0));
        gl.uniform1i(u(progs.advect, "uSource"), bindTex(velocity.read.tex, 0));
        blit(velocity.write); velocity.swap();

        gl.uniform1f(u(progs.advect, "uDissipation"), DYE_DISSIPATION);
        gl.uniform1i(u(progs.advect, "uVelocity"), bindTex(velocity.read.tex, 0));
        gl.uniform1i(u(progs.advect, "uSource"), bindTex(dye.read.tex, 1));
        blit(dye.write); dye.swap();
      }

      gl.useProgram(progs.display);
      gl.uniform1i(u(progs.display, "uDye"), bindTex(dye.read.tex, 0));
      gl.uniform1i(u(progs.display, "uMap"), bindTex(mapTex, 1));
      gl.uniform3f(u(progs.display, "uGround"), ground[0], ground[1], ground[2]);
      gl.uniform1f(u(progs.display, "uEdge"), EDGE);
      gl.uniform1f(u(progs.display, "uSoft"), SOFT);
      const vAspect = (vertical && footage && footage.readyState >= 2)
        ? 9 / 16
        : (!vertical && footage && footage.videoWidth > 0
          ? footage.videoWidth / footage.videoHeight
          : 0);
      const cAspect = host.clientWidth / Math.max(1, host.clientHeight);
      gl.uniform1f(u(progs.display, "uVideoAspect"), vAspect);
      gl.uniform1f(u(progs.display, "uCanvasAspect"), cAspect);
      blit(null);
    });

    return () => {
      dead = true;
      window.clearInterval(intro);
      stopFrame();
      io.disconnect();
      host.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", size);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [live, poster, vertical]);

  /* Soft 2D reveal when WebGL is gated off — still footage, still a gesture. */
  useEffect(() => {
    if (live || !brush) return;
    const host = stage.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(host.clientWidth * dpr);
      canvas.height = Math.round(host.clientHeight * dpr);
    };
    size();
    const trails: { x: number; y: number; life: number }[] = [];
    for (let i = 0; i < 10; i++) {
      trails.push({
        x: canvas.width * (0.2 + i * 0.06),
        y: canvas.height * 0.5,
        life: 0.9,
      });
    }
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      trails.push({
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height,
        life: 1,
      });
    };
    host.addEventListener("pointermove", onMove, { passive: true });
    const stop = onFrame(() => {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--ground") || "#E6E6E1";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "destination-out";
      for (let i = trails.length - 1; i >= 0; i--) {
        const t = trails[i];
        t.life -= 0.012;
        if (t.life <= 0) { trails.splice(i, 1); continue; }
        const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 90 * t.life);
        g.addColorStop(0, `rgba(0,0,0,${0.55 * t.life})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 90 * t.life, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    window.addEventListener("resize", size);
    return () => {
      stop();
      host.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", size);
    };
  }, [live, brush]);

  const letters = ["B", "O", "U", "R", "D", "A", "I", "N"];

  return (
    <section
      ref={stage}
      className={s.fluidHero}
      data-hero
      data-live={live}
      data-vertical={vertical ? "true" : "false"}
      data-journey="film"
    >
      {video && (
        <video
          ref={footageRef}
          className={s.heroFootage}
          src={video}
          poster={poster}
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
        />
      )}
      {poster && (
        <img
          ref={stillRef}
          className={s.heroFootage}
          src={poster}
          alt=""
          hidden={Boolean(video)}
        />
      )}
      {(live || brush) && <canvas ref={canvasRef} className={s.fluidCanvas} data-fluid="" />}
      <h1 className={s.heroWord} aria-label="Bourdain">
        {letters.map((ch, i) => (
          <span key={ch + i} className={s.heroLetter} style={{ ["--i" as string]: i }}>
            <span>{ch}</span>
          </span>
        ))}
      </h1>
      <p className={`${s.heroSupport} arrival-text`} data-arrival-text>
        Follow his footsteps. Share a table.
      </p>
      <a className={`${s.heroCta} arrival-text`} data-arrival-text href="#london" data-cursor="table">
        Hear about the first London dinner
      </a>
      <p className={`${s.scrollCue} arrival-cue`} aria-hidden="true">
        <span className="label">scroll</span>
      </p>
    </section>
  );
}
