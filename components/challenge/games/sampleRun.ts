import { sfx } from "../sfx";
import { cachedLayer, clamp, drawParticles, img, ready, stepParticles, VH, VW, type Game, type Input, type Particle, type Result } from "../engine";

/*
 * Sample Run: drive a solar-powered rover across Mars (the ground is a NASA HiRISE image of Jezero Crater).
 * ← → steer, ↑ faster, ↓ slower. Slow down over a glowing target to drill a sample. Rocks damage wheels,
 * soft sand bogs you down, and dust storms cut the sunlight that charges the battery. Speeds are sped up.
 */

interface Thing {
  kind: "rock" | "sand" | "target";
  x: number;
  y: number;
  r: number;
  done?: boolean;
  seed: number;
}

const ROVER_Y = 420;
const M_PER_PX = 0.05;

export function createSampleRun(): Game {
  const ground = img("/photos/sites/site-jezero.webp");
  let scroll = 0;
  let x = VW / 2;
  let vxs = 0;
  let speed = 70;
  let battery = 1;
  let wheels = 3;
  let samples = 0;
  let missed = 0;
  let drill = 0;
  let hurt = 0;
  let shake = 0;
  let inSand = false;
  let time = 0;
  let storm = 0; // 0..1 intensity
  let stormT = 22; // seconds until the next storm
  let stormLeft = 0;
  let nextSpawn = 0.6;
  let toast: { text: string; t: number } | null = null;
  const toastsShown = new Set<string>();
  let over = false;
  let endTimer = 0;
  let result: Result | null = null;
  const things: Thing[] = [];
  const ps: Particle[] = [];
  const tracks: { x: number; y: number }[] = [];
  const vignette: { c?: HTMLCanvasElement; s?: number } = {};

  const say = (key: string, text: string) => {
    if (toastsShown.has(key)) return;
    toastsShown.add(key);
    toast = { text, t: 5 };
  };

  const finish = (why: string) => {
    over = true;
    endTimer = 1.6;
    sfx.stopEngine();
    sfx.miss();
    const km = (scroll * M_PER_PX) / 1000;
    result = {
      won: samples > 0,
      title: samples > 0 ? `${samples} sample${samples === 1 ? "" : "s"} collected` : "No samples this time",
      detail: `${why} · ${km.toFixed(2)} km driven${missed ? ` · ${missed} target${missed === 1 ? "" : "s"} passed too fast` : ""}`,
      score: samples * 100 + Math.round(km * 40),
      facts: [
        { text: "On May 1, 2009, the rover Spirit became stuck in soft soil near Home Plate; its wheels could not get traction.", source: "Spirit · NASA Science", url: "https://science.nasa.gov/mission/mer-spirit/" },
        { text: "Solar rovers live on sunlight. Opportunity stopped communicating after a Mars-wide dust storm blanketed its location in June 2018.", source: "Opportunity · NASA Science", url: "https://science.nasa.gov/mission/mer-opportunity/" },
        { text: "Perseverance collects rock samples in Jezero Crater, looking for signs of ancient life.", source: "Mars 2020: Perseverance · NASA Science", url: "https://science.nasa.gov/mission/mars-2020-perseverance/" },
      ],
    };
  };

  const spawn = () => {
    const level = Math.min(1, time / 90);
    const roll = Math.random();
    const kind: Thing["kind"] = roll < 0.22 ? "target" : roll < 0.4 ? "sand" : "rock";
    const r = kind === "rock" ? 12 + Math.random() * (14 + level * 12) : kind === "sand" ? 50 + Math.random() * 40 : 22;
    let tx = 80 + Math.random() * (VW - 160);
    // Keep targets clear of rocks already queued at the same height.
    if (kind === "target" && things.some((t) => t.y < 0 && Math.abs(t.x - tx) < 60)) tx = (tx + VW / 2) % (VW - 160) + 80;
    things.push({ kind, x: tx, y: -r - 10, r, seed: Math.random() * 1000 });
    nextSpawn = (kind === "target" ? 1.4 : 0.55) * (1 - level * 0.4);
  };

  return {
    get result() {
      return over && endTimer <= 0 ? result : null;
    },
    update(dt: number, input: Input) {
      stepParticles(ps, dt);
      if (over) {
        endTimer -= dt;
        return;
      }
      time += dt;
      toast = toast && toast.t > 0 ? { ...toast, t: toast.t - dt } : null;
      hurt = Math.max(0, hurt - dt);
      shake = Math.max(0, shake - dt * 3);

      // Steering and throttle
      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      vxs += (steer * 260 - vxs) * Math.min(1, dt * 6);
      x = clamp(x + vxs * dt, 40, VW - 40);
      if (input.up || input.action) sfx.unlock();
      const target = input.up ? 230 : input.down ? 0 : speed > 120 ? speed : 110;
      speed += (target - speed) * Math.min(1, dt * (input.down ? 3 : 1.4));
      const cap = inSand ? 45 : 240;
      speed = Math.min(speed, cap);
      sfx.engine(clamp(speed / 240, 0.15, 1), "rover");

      // Dust storms come and go; they darken the sky and cut solar charging.
      stormT -= dt;
      if (stormT <= 0 && stormLeft <= 0) {
        stormLeft = 12;
        say("storm", "Dust storm! Less sunlight reaches the panels, so the battery charges slowly.");
      }
      if (stormLeft > 0) {
        stormLeft -= dt;
        storm = Math.min(1, storm + dt / 2);
        if (stormLeft <= 0) stormT = 26 + Math.random() * 10;
      } else storm = Math.max(0, storm - dt / 3);

      const charge = 0.022 * (1 - storm * 0.85);
      const drain = 0.012 + (speed / 240) * 0.03 + (inSand ? 0.03 : 0);
      battery = clamp(battery + (charge - drain) * dt, 0, 1);

      // World scrolls toward the rover
      const dy = speed * dt;
      scroll += dy;
      nextSpawn -= dt * (speed / 120);
      if (nextSpawn <= 0) spawn();
      inSand = false;
      for (let i = things.length - 1; i >= 0; i--) {
        const t = things[i];
        t.y += dy;
        if (t.y - t.r > VH) {
          if (t.kind === "target" && !t.done) missed++;
          things.splice(i, 1);
          continue;
        }
        const d = Math.hypot(t.x - x, t.y - ROVER_Y);
        if (t.kind === "rock" && d < t.r + 16 && hurt <= 0) {
          wheels--;
          hurt = 1.4;
          shake = 1;
          speed *= 0.3;
          sfx.boom(0.45);
          for (let k = 0; k < 18; k++) ps.push({ x, y: ROVER_Y - 14, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, life: 0.8, max: 0.8, size: 2, color: "#e2b48c", g: 160, drag: 1.5 });
          say("rock", "Rocks can puncture or bend a rover's wheels. Drivers on Earth plan routes around them.");
          if (wheels <= 0) finish("Wheels too damaged to drive");
        } else if (t.kind === "sand" && d < t.r * 0.9) {
          inSand = true;
          say("sand", "Soft sand! Spirit became stuck in soft soil in 2009. Steer out before you bog down.");
        } else if (t.kind === "target" && !t.done && d < t.r + 8) {
          // Drilling needs the rover nearly stopped over the rock.
          if (speed < 60) {
            drill += dt / 0.9;
            t.y -= dy; // hold the target under the rover while drilling
            if (drill >= 1) {
              t.done = true;
              drill = 0;
              samples++;
              sfx.chime();
              say("sample", "Sample sealed! Perseverance collects rock samples like this in Jezero Crater.");
            } else if (Math.random() < dt * 14) sfx.blip(420 + drill * 600, 0.04, "square", 0.08);
          } else say("slow", "Too fast to drill. Hold ↓ to stop over a target.");
        }
      }
      if (!things.some((t) => t.kind === "target" && !t.done && Math.hypot(t.x - x, t.y - ROVER_Y) < t.r + 8)) drill = Math.max(0, drill - dt);

      // Wheel tracks and dust kicked up behind
      tracks.push({ x, y: ROVER_Y + 18 });
      for (const tr of tracks) tr.y += dy;
      while (tracks.length && tracks[0].y > VH + 10) tracks.shift();
      if (Math.random() < speed / 300) ps.push({ x: x + (Math.random() - 0.5) * 30, y: ROVER_Y + 20, vx: (Math.random() - 0.5) * 30 + 30 * storm, vy: speed * 0.6, life: 0.7, max: 0.7, size: 2.5, color: "rgba(230,190,150,0.6)", g: 0, drag: 2 });

      if (battery <= 0) finish("Battery flat");
    },

    hud() {
      return [
        { label: "Samples", value: `${samples}`, tone: samples ? "ok" : "info" },
        { label: "Battery", value: `${Math.round(battery * 100)}%`, tone: battery > 0.4 ? "ok" : battery > 0.15 ? "warn" : "bad", meter: battery },
        { label: "Wheels", value: `${wheels}/3 healthy`, tone: wheels === 3 ? "ok" : wheels === 2 ? "warn" : "bad" },
        { label: "Speed", value: speed < 60 ? "Drill speed" : `${Math.round((speed / 240) * 100)}%`, tone: speed < 60 ? "ok" : "info", meter: speed / 240 },
        { label: "Sky", value: storm > 0.3 ? "Dust storm" : "Clear", tone: storm > 0.3 ? "warn" : "info" },
      ];
    },

    banner() {
      if (toast) return { text: toast.text, tone: toast.text.startsWith("Sample") ? "ok" : "warn" };
      if (time < 6) return { text: "← → steer · ↑ faster · ↓ slow down to drill the glowing targets", tone: "info" };
      return null;
    },

    draw(ctx: CanvasRenderingContext2D, t: number) {
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);

      // Scrolling HiRISE ground. Only the right part of the image is used (the left part carries a yellow
      // annotation circle from the source), and every other tile is mirrored so the seams match.
      if (ready(ground)) {
        const sx = ground.naturalWidth * 0.37;
        const sw = ground.naturalWidth - sx;
        const h = (VW * ground.naturalHeight) / sw;
        const off = scroll % (h * 2);
        for (let y = off - h * 2, i = 0; y < VH; y += h, i++) {
          if (y + h < 0) continue;
          if (i % 2 === 0) ctx.drawImage(ground, sx, 0, sw, ground.naturalHeight, 0, y, VW, h);
          else {
            ctx.save();
            ctx.translate(0, y + h);
            ctx.scale(1, -1);
            ctx.drawImage(ground, sx, 0, sw, ground.naturalHeight, 0, 0, VW, h);
            ctx.restore();
          }
        }
      } else {
        ctx.fillStyle = "#9c5b3c";
        ctx.fillRect(0, 0, VW, VH);
      }
      ctx.fillStyle = "rgba(60,25,10,0.18)";
      ctx.fillRect(0, 0, VW, VH);

      // Tracks
      ctx.strokeStyle = "rgba(60,30,15,0.35)";
      ctx.lineWidth = 3;
      for (const side of [-11, 11]) {
        ctx.beginPath();
        tracks.forEach((p, i) => (i ? ctx.lineTo(p.x + side, p.y) : ctx.moveTo(p.x + side, p.y)));
        ctx.stroke();
      }

      for (const th of things) drawThing(ctx, th, t);
      drawParticles(ctx, ps);
      drawRover(ctx, x, ROVER_Y, vxs / 900, hurt > 0 && Math.sin(t * 30) > 0, t);

      // Drill progress ring
      if (drill > 0) {
        ctx.strokeStyle = "#7fe3e0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, ROVER_Y, 30, -Math.PI / 2, -Math.PI / 2 + drill * Math.PI * 2);
        ctx.stroke();
      }

      // Dust storm: orange haze and reduced visibility around the rover
      if (storm > 0.01) {
        ctx.fillStyle = `rgba(190,120,70,${storm * 0.45})`;
        ctx.fillRect(0, 0, VW, VH);
        const fog = ctx.createRadialGradient(x, ROVER_Y - 80, 120, x, ROVER_Y - 80, 520);
        fog.addColorStop(0, "rgba(150,90,50,0)");
        fog.addColorStop(1, `rgba(150,90,50,${storm * 0.8})`);
        ctx.fillStyle = fog;
        ctx.fillRect(0, 0, VW, VH);
        ctx.fillStyle = `rgba(240,200,160,${storm * 0.5})`;
        for (let i = 0; i < 40; i++) {
          const px = ((i * 97 + t * 420) % (VW + 100)) - 50;
          const py = (i * 53 + t * 60 * (1 + (i % 3))) % VH;
          ctx.fillRect(px, py, 6, 1);
        }
      }
      // Vignette: a full-screen gradient, so it is painted once and copied.
      cachedLayer(ctx, vignette, (c) => {
        const v = c.createRadialGradient(VW / 2, VH / 2, 260, VW / 2, VH / 2, 640);
        v.addColorStop(0, "rgba(0,0,0,0)");
        v.addColorStop(1, "rgba(0,0,0,0.55)");
        c.fillStyle = v;
        c.fillRect(0, 0, VW, VH);
      });
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "10px ui-sans-serif, system-ui";
      ctx.fillText("Ground: NASA/JPL-Caltech/University of Arizona · HiRISE, Jezero Crater · speeds sped up", 16, VH - 14);
    },
  };
}

function drawThing(ctx: CanvasRenderingContext2D, th: Thing, t: number) {
  if (th.kind === "sand") {
    const g = ctx.createRadialGradient(th.x, th.y, 4, th.x, th.y, th.r);
    g.addColorStop(0, "rgba(240,205,160,0.75)");
    g.addColorStop(1, "rgba(240,205,160,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(th.x, th.y, th.r * 1.25, th.r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(170,120,80,0.35)";
    ctx.lineWidth = 1.2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(th.x, th.y + i * 7, th.r * 0.8, 3, 0, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
    return;
  }
  if (th.kind === "rock") {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(th.x + th.r * 0.35, th.y + th.r * 0.35, th.r, th.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = th.r * (0.78 + 0.22 * Math.sin(th.seed + i * 2.1));
      const px = th.x + Math.cos(a) * rr;
      const py = th.y + Math.sin(a) * rr * 0.85;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(th.x - th.r * 0.4, th.y - th.r * 0.4, 2, th.x, th.y, th.r * 1.1);
    g.addColorStop(0, "#c9a183");
    g.addColorStop(0.5, "#7a4e38");
    g.addColorStop(1, "#2e1a11");
    ctx.fillStyle = g;
    ctx.fill();
    // A dark outline and a lit upper-left rim keep rocks readable against the red ground.
    ctx.strokeStyle = "rgba(20,10,5,0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,230,205,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(th.x, th.y, th.r * 0.72, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
    return;
  }
  // Sample target: a pale rock in a pulsing scan ring
  const pulse = 0.5 + 0.5 * Math.sin(t * 4 + th.seed);
  ctx.strokeStyle = th.done ? "rgba(74,222,128,0.8)" : `rgba(127,227,224,${0.5 + pulse * 0.5})`;
  ctx.lineWidth = 2;
  ctx.setLineDash(th.done ? [] : [5, 4]);
  ctx.beginPath();
  ctx.arc(th.x, th.y, th.r + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = th.done ? "#4ade80" : "#e8d6c0";
  ctx.beginPath();
  ctx.arc(th.x, th.y, 7, 0, Math.PI * 2);
  ctx.fill();
  if (th.done) {
    ctx.fillStyle = "#0b1226";
    ctx.beginPath();
    ctx.arc(th.x, th.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Top-down solar rover: six wheels, a deck, solar wings and a camera mast. */
function drawRover(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, blink: boolean, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.globalAlpha = blink ? 0.4 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(-22, -20, 48, 46, 8);
  ctx.fill();
  // Wheels
  ctx.fillStyle = "#2a2d33";
  for (const wy of [-14, 0, 14]) for (const wx of [-21, 15]) ctx.fillRect(wx, wy - 5, 6, 10);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  const roll = (t * 40) % 10;
  for (const wy of [-14, 0, 14]) for (const wx of [-21, 15]) ctx.fillRect(wx, wy - 5 + roll * 0.8, 6, 1.5);
  // Solar wings
  ctx.fillStyle = "#1c3767";
  ctx.fillRect(-34, -10, 14, 22);
  ctx.fillRect(20, -10, 14, 22);
  ctx.strokeStyle = "rgba(127,180,255,0.35)";
  ctx.lineWidth = 1;
  for (const sx of [-34, 20]) for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(sx, -10 + i * 5.5);
    ctx.lineTo(sx + 14, -10 + i * 5.5);
    ctx.stroke();
  }
  // Deck
  ctx.fillStyle = "#e7eaf0";
  ctx.beginPath();
  ctx.roundRect(-14, -18, 28, 34, 5);
  ctx.fill();
  ctx.fillStyle = "#c9ced6";
  ctx.fillRect(-10, -6, 20, 14);
  // Mast and camera
  ctx.fillStyle = "#3b4048";
  ctx.beginPath();
  ctx.arc(0, -12, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7fe3e0";
  ctx.beginPath();
  ctx.arc(0, -14, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
