import { sfx } from "../sfx";
import {
  cachedLayer,
  clamp,
  drawParticles,
  drawPlanet,
  drawStars,
  img,
  makeStars,
  ready,
  rng,
  stepParticles,
  VH,
  VW,
  type Game,
  type Input,
  type Particle,
  type Result,
} from "../engine";

/*
 * Touchdown: land on the Moon or Mars with real surface gravity. Mars adds a thin atmosphere (a little drag,
 * gusty wind) that the Moon does not have. ← → rotate, ↑ or Space fires the engine. Land on the lit pad,
 * upright, slower than the safe limits.
 */

export type LandWorld = "moon" | "mars";

const PX_PER_M = 0.9;
const SAFE_VY = 2.5;
const SAFE_VX = 1.5;
const SAFE_TILT = 10;

const WORLD = {
  moon: { name: "Moon", g: 1.62, thrust: 4.3, drag: 0, wind: 0, fuel: 100, burn: 7.5, vx0: 11, sky: ["#000000", "#05070d"], ground: "/textures/moon/color-1k.webp", tint: "#9a9a9e", dust: "#d6d6da" },
  mars: { name: "Mars", g: 3.71, thrust: 8.4, drag: 0.0009, wind: 0.9, fuel: 100, burn: 7.5, vx0: 14, sky: ["#6b4a37", "#d9b38c"], ground: "/textures/mars/color-1k.webp", tint: "#b5603a", dust: "#e8c4a0" },
} as const;

interface Terrain {
  pts: number[];
  padX: number;
  padW: number;
  padY: number;
}

function makeTerrain(world: LandWorld, seed: number): Terrain {
  const rand = rng(seed);
  const n = 97;
  const pts: number[] = [];
  const padW = 96;
  const padX = 160 + rand() * (VW - 320 - padW);
  let y = 455;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * VW;
    y += (rand() - 0.5) * (world === "moon" ? 22 : 16);
    y = clamp(y, 380, 505);
    // Moon: occasional crater bowls; Mars: smoother rolling ground.
    const crater = world === "moon" ? Math.max(0, 1 - Math.abs(Math.sin(x * 0.011 + seed)) * 1.6) * 26 : 0;
    pts.push(y + crater);
  }
  // Flatten the pad
  const padY = 470;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * VW;
    const d = x < padX ? padX - x : x > padX + padW ? x - padX - padW : 0;
    if (d < 70) pts[i] = d === 0 ? padY : padY + (pts[i] - padY) * (d / 70) ** 1.5;
  }
  return { pts, padX, padW, padY };
}

function groundAt(t: Terrain, x: number) {
  const n = t.pts.length - 1;
  const f = clamp((x / VW) * n, 0, n);
  const i = Math.floor(f);
  const k = f - i;
  return t.pts[i] * (1 - k) + t.pts[Math.min(n, i + 1)] * k;
}

export function createTouchdown(world: LandWorld): Game {
  const W = WORLD[world];
  const seed = Math.floor(Math.random() * 1e6);
  const terrain = makeTerrain(world, seed);
  const stars = makeStars(180, 3, 380);
  const groundImg = img(W.ground);
  const earthImg = img("/textures/earth/day-1k.webp");
  const scenery: { c?: HTMLCanvasElement; s?: number } = {};

  // State in metres and m/s (y measured down the screen, so positive vy is falling).
  let x = 120 + Math.random() * 120;
  let y = 70;
  // It starts on the left, drifting right: cancel the drift as well as the fall.
  let vx = W.vx0 * (0.5 + Math.random() * 0.5);
  let vy = 6;
  let angle = 0;
  let fuel: number = W.fuel;
  let thrusting = 0;
  let gust = 0;
  let windT = Math.random() * 10;
  let landed: "no" | "safe" | "crash" = "no";
  let endTimer = 0;
  let result: Result | null = null;
  const ps: Particle[] = [];
  const g = W.g * PX_PER_M;

  const altitude = () => Math.max(0, (groundAt(terrain, x) - (y + 14)) / PX_PER_M);

  const facts = () => [
    world === "moon"
      ? { text: "The Moon's gravity is about one-sixth of Earth's, and it has no air: a lander can only slow down with its rockets.", source: "Earth's Moon · NASA Science", url: "https://science.nasa.gov/moon/" }
      : { text: "Mars's gravity is about 38% of Earth's. Its air is under 1% as thick as ours: enough to heat a spacecraft and push it sideways, not enough to stop it.", source: "Mars Facts · NASA Science", url: "https://science.nasa.gov/mars/facts/" },
    world === "moon"
      ? { text: "With no air, dust kicked up by a lunar engine flies in clean arcs and falls straight back. Nothing slows it or carries it away.", source: "Earth's Moon · NASA Science", url: "https://science.nasa.gov/moon/" }
      : { text: "That is why real Mars landers like Perseverance use a heat shield, a parachute and then rockets for the last part of the descent.", source: "Mars 2020: Perseverance · NASA Science", url: "https://science.nasa.gov/mission/mars-2020-perseverance/" },
  ];

  const touchDown = () => {
    const onPad = x > terrain.padX + 4 && x < terrain.padX + terrain.padW - 4;
    const vyM = vy;
    const vxM = Math.abs(vx);
    const tilt = Math.abs(angle) * (180 / Math.PI);
    const safe = onPad && vyM <= SAFE_VY && vxM <= SAFE_VX && tilt <= SAFE_TILT;
    landed = safe ? "safe" : "crash";
    endTimer = safe ? 1.6 : 2;
    sfx.stopEngine();
    thrusting = 0;
    if (safe) {
      sfx.chime();
      const precision = 1 - Math.abs(x - (terrain.padX + terrain.padW / 2)) / (terrain.padW / 2);
      const score = Math.round(100 + fuel * 1.2 + precision * 40 + (SAFE_VY - vyM) * 10);
      result = { won: true, title: `Safe landing on the ${W.name}`, detail: `${vyM.toFixed(1)} m/s down · ${vxM.toFixed(1)} m/s sideways · ${Math.round(fuel)}% fuel left`, score, facts: facts() };
    } else {
      sfx.boom(1);
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 40 + Math.random() * 160;
        ps.push({ x, y: y + 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1 + Math.random(), max: 2, size: 2 + Math.random() * 3, color: i % 3 ? "#ffb35c" : W.dust, g, drag: W.drag ? 1.5 : 0 });
      }
      const why = !onPad ? "You came down off the pad, on rough ground." : vyM > SAFE_VY ? `Too fast: ${vyM.toFixed(1)} m/s down (safe is under ${SAFE_VY}).` : vxM > SAFE_VX ? `Sliding sideways at ${vxM.toFixed(1)} m/s (safe is under ${SAFE_VX}).` : `Tilted ${tilt.toFixed(0)}° (safe is under ${SAFE_TILT}°).`;
      result = { won: false, title: "Hard landing", detail: why, score: Math.round(fuel * 0.3), facts: facts() };
    }
  };

  return {
    get result() {
      return landed !== "no" && endTimer <= 0 ? result : null;
    },
    update(dt: number, input: Input) {
      stepParticles(ps, dt);
      if (landed !== "no") {
        endTimer -= dt;
        return;
      }
      if (input.left) angle -= 1.6 * dt;
      if (input.right) angle += 1.6 * dt;
      angle = clamp(angle, -1.4, 1.4);

      const want = (input.up || input.action) && fuel > 0 ? 1 : 0;
      if (want && !thrusting) sfx.unlock();
      thrusting += (want - thrusting) * Math.min(1, dt * 12);
      fuel = Math.max(0, fuel - W.burn * thrusting * dt);
      sfx.engine(thrusting);

      // Forces (m/s²): gravity, engine along the lander's axis, Mars drag and gusts.
      let ax = Math.sin(angle) * W.thrust * thrusting;
      let ay = W.g - Math.cos(angle) * W.thrust * thrusting;
      if (W.drag) {
        const sp = Math.hypot(vx, vy);
        ax -= W.drag * vx * sp;
        ay -= W.drag * vy * sp;
        windT += dt;
        gust = Math.sin(windT * 0.7) * 0.6 + Math.sin(windT * 2.3 + 1) * 0.4;
        ax += gust * W.wind;
      }
      vx += ax * dt;
      vy += ay * dt;
      x += vx * PX_PER_M * dt;
      y += vy * PX_PER_M * dt;
      if (x < 10 || x > VW - 10) {
        x = clamp(x, 10, VW - 10);
        vx *= -0.3;
      }

      // Exhaust, and dust where the plume hits the ground.
      if (thrusting > 0.1) {
        const ex = x - Math.sin(angle) * 14;
        const ey = y + Math.cos(angle) * 14;
        for (let i = 0; i < 3; i++) {
          const s = 120 + Math.random() * 80;
          const spread = (Math.random() - 0.5) * 0.5;
          ps.push({ x: ex, y: ey, vx: -Math.sin(angle + spread) * s + vx, vy: Math.cos(angle + spread) * s + vy, life: 0.35, max: 0.35, size: 2.2, color: i ? "#ffd59a" : "#ff8a3c", g: 0, drag: W.drag ? 3 : 0 });
        }
        const alt = altitude();
        if (alt < 70) {
          const gy = groundAt(terrain, x);
          for (let i = 0; i < 2; i++) {
            const dir = Math.random() < 0.5 ? -1 : 1;
            ps.push({ x: x + dir * Math.random() * 10, y: gy - 1, vx: dir * (60 + Math.random() * 120) + gust * 40, vy: -(30 + Math.random() * 80), life: 1.2, max: 1.2, size: 1.6, color: W.dust, g, drag: W.drag ? 2.2 : 0 });
          }
        }
      }

      if (y + 14 >= groundAt(terrain, x)) {
        y = groundAt(terrain, x) - 14;
        touchDown();
      }
    },

    hud() {
      const alt = altitude();
      return [
        { label: "Altitude", value: `${Math.round(alt)} m`, tone: "info" },
        { label: "Descent", value: `${vy.toFixed(1)} m/s`, tone: vy <= SAFE_VY ? "ok" : vy < 6 ? "warn" : "bad" },
        { label: "Drift", value: `${Math.abs(vx).toFixed(1)} m/s`, tone: Math.abs(vx) <= SAFE_VX ? "ok" : "warn" },
        { label: "Tilt", value: `${Math.round(angle * (180 / Math.PI))}°`, tone: Math.abs(angle * (180 / Math.PI)) <= SAFE_TILT ? "ok" : "warn" },
        { label: "Fuel", value: `${Math.round(fuel)}%`, tone: fuel > 30 ? "info" : fuel > 10 ? "warn" : "bad", meter: fuel / 100 },
        ...(W.drag ? [{ label: "Wind", value: `${gust > 0 ? "→" : "←"} ${Math.abs(gust * W.wind).toFixed(1)}`, tone: "info" as const }] : []),
      ];
    },

    banner() {
      if (landed === "safe") return { text: "Touchdown!", tone: "ok" };
      if (landed === "crash") return { text: "Impact", tone: "bad" };
      const alt = altitude();
      if (alt < 120 && vy > 6) return { text: "Too fast! Fire the engine", tone: "bad" };
      if (fuel <= 0) return { text: "Out of fuel", tone: "bad" };
      return { text: `← → tilt · ↑ or Space fires the engine · land on the lit pad under ${SAFE_VY} m/s`, tone: "info" };
    },

    draw(ctx: CanvasRenderingContext2D, t: number) {
      // Sky, terrain and the pad base never change during a descent: paint them once.
      cachedLayer(
        ctx,
        scenery,
        (c) => {
          const sky = c.createLinearGradient(0, 0, 0, VH);
          sky.addColorStop(0, W.sky[0]);
          sky.addColorStop(1, W.sky[1]);
          c.fillStyle = sky;
          c.fillRect(0, 0, VW, VH);
          if (world === "moon") {
            drawStars(c, stars, 0);
            drawPlanet(c, earthImg, 800, 90, 30, 0.3, { glow: "rgba(77,163,255,0.45)", fallback: "#2a64c4", light: -2.6 });
          } else {
            // A small, far Sun and dusty haze low in the sky
            c.fillStyle = "rgba(255,240,220,0.9)";
            c.beginPath();
            c.arc(820, 80, 12, 0, Math.PI * 2);
            c.fill();
            const h = c.createLinearGradient(0, 300, 0, VH);
            h.addColorStop(0, "rgba(230,190,150,0)");
            h.addColorStop(1, "rgba(230,190,150,0.3)");
            c.fillStyle = h;
            c.fillRect(0, 300, VW, VH - 300);
          }
          // Ground: the world's own NASA map as a pattern, with a lit rim.
          const pattern = ready(groundImg) ? c.createPattern(groundImg, "repeat") : null;
          // Line the map up so the ground (y ≈ 380–540) shows its equatorial band, not a polar ice cap.
          if (pattern && ready(groundImg)) pattern.setTransform(new DOMMatrix().translate(0, 400 - 0.42 * groundImg.naturalHeight * 0.9).scale(0.9));
          c.beginPath();
          c.moveTo(0, VH);
          terrain.pts.forEach((p, i) => c.lineTo((i / (terrain.pts.length - 1)) * VW, p));
          c.lineTo(VW, VH);
          c.closePath();
          c.fillStyle = pattern ?? W.tint;
          c.fill();
          const shade = c.createLinearGradient(0, 380, 0, VH);
          shade.addColorStop(0, "rgba(0,0,0,0)");
          shade.addColorStop(1, "rgba(0,0,0,0.55)");
          c.fillStyle = shade;
          c.fill();
          c.strokeStyle = "rgba(255,255,255,0.35)";
          c.lineWidth = 1.5;
          c.beginPath();
          terrain.pts.forEach((p, i) => (i ? c.lineTo((i / (terrain.pts.length - 1)) * VW, p) : c.moveTo(0, p)));
          c.stroke();
          c.fillStyle = "rgba(127,227,224,0.18)";
          c.fillRect(terrain.padX, terrain.padY - 2, terrain.padW, 4);
          c.fillStyle = "#7fe3e0";
          c.fillRect(terrain.padX, terrain.padY - 1, terrain.padW, 2);
        },
        ready(groundImg) && (world === "mars" || ready(earthImg)),
      );

      // Pad guide lights blink
      const blink = Math.sin(t * 6) > 0;
      for (const lx of [terrain.padX, terrain.padX + terrain.padW]) {
        ctx.fillStyle = blink ? "#7fe3e0" : "rgba(127,227,224,0.3)";
        ctx.beginPath();
        ctx.arc(lx, terrain.padY - 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      drawParticles(ctx, ps);
      if (landed !== "crash") drawLander(ctx, x, y, angle, thrusting, t);

      // Altitude guide line to the ground when low
      const alt = altitude();
      if (landed === "no" && alt < 160) {
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.moveTo(x, y + 16);
        ctx.lineTo(x, groundAt(terrain, x));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
  };
}

function drawLander(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, thrust: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (thrust > 0.05) {
    const len = 10 + thrust * 26 + Math.sin(t * 45) * 3;
    const g = ctx.createLinearGradient(0, 10, 0, 10 + len);
    g.addColorStop(0, "rgba(255,245,210,1)");
    g.addColorStop(0.4, "rgba(255,170,80,0.9)");
    g.addColorStop(1, "rgba(255,90,30,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5, 10);
    ctx.lineTo(0, 10 + len);
    ctx.lineTo(5, 10);
    ctx.fill();
  }
  // Legs
  ctx.strokeStyle = "#c9ced6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.lineTo(-14, 14);
  ctx.moveTo(8, 4);
  ctx.lineTo(14, 14);
  ctx.stroke();
  ctx.fillStyle = "#c9ced6";
  ctx.fillRect(-17, 13, 6, 2);
  ctx.fillRect(11, 13, 6, 2);
  // Descent stage (gold foil) and ascent stage
  ctx.fillStyle = "#d4a73a";
  ctx.fillRect(-10, -2, 20, 10);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(-10, -2, 20, 2);
  ctx.fillStyle = "#e7eaf0";
  ctx.beginPath();
  ctx.roundRect(-7, -12, 14, 11, 3);
  ctx.fill();
  ctx.fillStyle = "#1b2a4a";
  ctx.fillRect(-3, -9, 6, 4);
  ctx.fillStyle = "#3b4048";
  ctx.fillRect(-3, 8, 6, 3);
  ctx.restore();
}
