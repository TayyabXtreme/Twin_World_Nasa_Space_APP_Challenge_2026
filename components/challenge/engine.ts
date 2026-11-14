/**
 * A tiny canvas game engine shared by the three challenge games: a fixed 960 × 540 virtual screen scaled to
 * the canvas, a clamped rAF loop that pauses with the tab, unified keyboard/touch input, and a few drawing
 * helpers (stars, textured planets, particles). No dependencies, nothing heavy.
 */

export const VW = 960;
export const VH = 540;

export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Held: Space / Enter / the touch action button. */
  action: boolean;
  /** True for exactly one update after the action was pressed. */
  actionPressed: boolean;
}

export type Tone = "ok" | "warn" | "bad" | "info";
export interface HudItem {
  label: string;
  value: string;
  tone?: Tone;
  /** 0–1: drawn as a bar under the value. */
  meter?: number;
}

export interface Fact {
  text: string;
  source: string;
  url: string;
}
export interface Result {
  won: boolean;
  title: string;
  detail: string;
  score: number;
  facts: Fact[];
}

export interface Game {
  update(dt: number, input: Input): void;
  draw(ctx: CanvasRenderingContext2D, t: number): void;
  hud(): HudItem[];
  /** A short line shown over the game (instructions, warnings); null for none. */
  banner(): { text: string; tone: Tone } | null;
  result: Result | null;
}

/* ---------- Input ---------- */

const KEYMAP: Record<string, keyof Omit<Input, "actionPressed">> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "action",
  Enter: "action",
};

export function createInput() {
  const state: Input = { left: false, right: false, up: false, down: false, action: false, actionPressed: false };
  let pressed = false;
  const set = (key: keyof Omit<Input, "actionPressed">, on: boolean) => {
    if (key === "action" && on && !state.action) pressed = true;
    state[key] = on;
  };
  const onKey = (e: KeyboardEvent) => {
    const key = KEYMAP[e.code];
    if (!key) return;
    const t = e.target as HTMLElement | null;
    if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
    e.preventDefault();
    set(key, e.type === "keydown");
  };
  return {
    state,
    set,
    attach() {
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onKey);
      return () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
      };
    },
    /** Read once per update: latches actionPressed for a single step. */
    frame(): Input {
      state.actionPressed = pressed;
      pressed = false;
      return state;
    },
    clear() {
      state.left = state.right = state.up = state.down = state.action = state.actionPressed = false;
      pressed = false;
    },
  };
}
export type InputController = ReturnType<typeof createInput>;

/* ---------- Loop ---------- */

/** Runs `game` on `canvas` until stopped. The canvas keeps a 16:9 box; drawing uses virtual 960 × 540 units. */
export function runGame(canvas: HTMLCanvasElement, game: Game, input: InputController, onTick: () => void) {
  const ctx = canvas.getContext("2d")!;
  let raf = 0;
  let last = performance.now();
  let start = last;
  let scale = 1;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    scale = (r.width / VW) * dpr;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const frame = (now: number) => {
    // Long frames on slow devices are split into small physics steps, so the game keeps real time (no slow
    // motion) and the integration stays stable. A one-off pause beyond 0.25 s is simply skipped.
    let remaining = Math.min(0.25, (now - last) / 1000);
    last = now;
    const first = input.frame();
    let step = 0;
    while (remaining > 1e-4 && !game.result) {
      const dt = Math.min(remaining, 1 / 60);
      game.update(dt, step++ === 0 ? first : { ...first, actionPressed: false });
      remaining -= dt;
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    game.draw(ctx, (now - start) / 1000);
    onTick();
    if (!game.result) raf = requestAnimationFrame(frame);
  };
  const onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!game.result) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame((now) => {
    last = start = now;
    frame(now);
  });
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * Static scenery painted once into an offscreen canvas at the current pixel scale, then copied each frame.
 * Re-painted when the scale changes, or every frame until `ready` (e.g. textures still loading).
 */
export function cachedLayer(ctx: CanvasRenderingContext2D, cache: { c?: HTMLCanvasElement; s?: number }, paint: (c: CanvasRenderingContext2D) => void, ready = true) {
  const s = ctx.getTransform().a;
  if (!ready) {
    paint(ctx);
    return;
  }
  if (!cache.c || cache.s !== s) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(VW * s);
    c.height = Math.ceil(VH * s);
    const cx = c.getContext("2d")!;
    cx.setTransform(s, 0, 0, s, 0, 0);
    paint(cx);
    cache.c = c;
    cache.s = s;
  }
  ctx.drawImage(cache.c, 0, 0, VW, VH);
}

/** Draws a single still frame (used behind the start screen as a preview of the game). */
export function renderOnce(canvas: HTMLCanvasElement, game: Game) {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const ctx = canvas.getContext("2d")!;
  const scale = (r.width / VW) * dpr;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  game.draw(ctx, 0);
}

/* ---------- Helpers ---------- */

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Small seeded PRNG so levels are reproducible per world. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const images = new Map<string, HTMLImageElement>();
/** Cached image; draws once loaded (callers check `complete`). */
export function img(src: string) {
  let el = images.get(src);
  if (!el) {
    el = new Image();
    el.src = src;
    images.set(src, el);
  }
  return el;
}
export const ready = (el: HTMLImageElement) => el.complete && el.naturalWidth > 0;

export interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
}
export function makeStars(n: number, seed: number, h = VH): Star[] {
  const rand = rng(seed);
  return Array.from({ length: n }, () => ({ x: rand() * VW, y: rand() * h, r: rand() < 0.1 ? 1.4 : 0.8, a: 0.3 + rand() * 0.7, tw: rand() * 6 }));
}
export function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], t: number, drift = 0) {
  ctx.fillStyle = "#fff";
  for (const s of stars) {
    const x = (((s.x - drift * s.r * 12) % VW) + VW) % VW;
    ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(t * 1.6 + s.tw));
    ctx.fillRect(x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
}

/** A textured planet: equirectangular map scrolled behind a round clip, a terminator and a soft rim. */
export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  map: HTMLImageElement,
  x: number,
  y: number,
  r: number,
  spin: number,
  opts: { glow?: string; fallback?: string; light?: number } = {},
) {
  ctx.save();
  if (opts.glow) {
    const g = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.6);
    g.addColorStop(0, opts.glow);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  if (ready(map)) {
    const w = r * 4;
    const off = (((spin * w) % w) + w) % w;
    ctx.drawImage(map, x - r - off, y - r, w, r * 2);
    ctx.drawImage(map, x - r - off + w, y - r, w, r * 2);
  } else {
    ctx.fillStyle = opts.fallback ?? "#888";
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Night side away from the light direction (radians; default: lit from the upper left).
  const a = opts.light ?? -2.4;
  const sh = ctx.createLinearGradient(x + Math.cos(a) * r, y + Math.sin(a) * r, x - Math.cos(a) * r, y - Math.sin(a) * r);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(0.55, "rgba(0,0,0,0.15)");
  sh.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = sh;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  /** Downward acceleration (world gravity for dust; 0 for exhaust in vacuum). */
  g: number;
  /** Air drag per second (0 on the Moon). */
  drag: number;
}
export function stepParticles(ps: Particle[], dt: number) {
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) {
      ps.splice(i, 1);
      continue;
    }
    p.vy += p.g * dt;
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k;
    p.vy *= k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
export function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[]) {
  for (const p of ps) {
    const k = p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 1.4);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Rounded panel used for in-canvas labels. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
