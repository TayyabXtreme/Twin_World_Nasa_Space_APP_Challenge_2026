import { daysSinceJ2000, earthAt, marsAt } from "@/lib/orbits";
import { sfx } from "../sfx";
import { cachedLayer, clamp, drawPlanet, drawStars, img, makeStars, ready, VH, VW, type Game, type HudItem, type Input, type Result } from "../engine";

/*
 * Launch Window: time an Earth → Mars Hohmann transfer. Planets start at today's real positions (JPL elements)
 * and then follow simplified circular orbits at their true periods. The ship flies the real transfer ellipse
 * (1 AU → 1.524 AU, solved with Kepler's equation). Hold ↑ to warp time, ↓ to slow it; Space to launch, then
 * Space again for the capture burn as you reach Mars.
 */

const AU_PX = 150;
const CX = VW / 2;
const CY = VH / 2 + 18;
const R_E = 1;
const R_M = 1.524;
const P_E = 365.256;
const P_M = 686.98;
const A_T = (R_E + R_M) / 2;
const ECC = (R_M - R_E) / (R_M + R_E);
const T_TRANSFER = (P_E * Math.sqrt(A_T ** 3)) / 2; // ≈ 259 days
const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
/** Mars must lead Earth by this much at launch (it moves 136° while the ship flies 180°). */
const IDEAL_LEAD = Math.PI - (TAU / P_M) * T_TRANSFER;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function trueAnomaly(meanAnomaly: number) {
  let E = meanAnomaly;
  for (let i = 0; i < 8; i++) E -= (E - ECC * Math.sin(E) - meanAnomaly) / (1 - ECC * Math.cos(E));
  return 2 * Math.atan2(Math.sqrt(1 + ECC) * Math.sin(E / 2), Math.sqrt(1 - ECC) * Math.cos(E / 2));
}
const transferR = (nu: number) => (A_T * (1 - ECC * ECC)) / (1 + ECC * Math.cos(nu));

export function createLaunchWindow(): Game {
  const today = new Date();
  const d0 = daysSinceJ2000(today);
  const e0 = earthAt(d0).lon;
  const m0 = marsAt(d0).lon;
  const stars = makeStars(220, 7);
  const earthMap = img("/textures/earth/day-1k.webp");
  const marsMap = img("/textures/mars/color-1k.webp");
  const sunMap = img("/textures/sky/sun-1k.webp");
  const backdrop: { c?: HTMLCanvasElement; s?: number } = {};

  let days = 0;
  let warp = 1;
  let phase: "wait" | "flight" | "orbit" | "done" = "wait";
  let launchDay = 0;
  let launchLon = 0;
  let captureMsg = "";
  let flash = 0;
  const trail: { x: number; y: number }[] = [];
  let result: Result | null = null;
  let endTimer = 0;

  const earthLon = (d: number) => e0 + (TAU / P_E) * d;
  // Days from today until Mars next leads Earth by the ideal angle (in this simplified model).
  const synodicRate = TAU / P_E - TAU / P_M;
  const daysToWindow = Math.round((((wrap(m0 - e0) - IDEAL_LEAD) % TAU) + TAU) % TAU / synodicRate);
  const marsLon = (d: number) => m0 + (TAU / P_M) * d;
  const lead = () => wrap(marsLon(days) - earthLon(days));
  const toXY = (lon: number, r: number) => ({ x: CX + Math.cos(lon) * r * AU_PX, y: CY - Math.sin(lon) * r * AU_PX });

  const shipState = () => {
    const tau = clamp((days - launchDay) / T_TRANSFER, 0, 1.15);
    const nu = trueAnomaly(Math.PI * tau);
    return { tau, lon: launchLon + nu, r: transferR(nu) };
  };

  const finish = (won: boolean, title: string, detail: string, score: number) => {
    phase = "done";
    endTimer = 1.4;
    result = {
      won,
      title,
      detail,
      score,
      facts: [
        {
          text: `Earth laps Mars about every ${Math.round(1 / (1 / P_E - 1 / P_M))} days (about 26 months), so a good launch window comes round only that often.`,
          source: "Approximate Positions of the Planets · NASA JPL",
          url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
        },
        {
          text: `The most fuel-efficient path is half an ellipse touching both orbits. It takes about ${Math.round(T_TRANSFER)} days, and Mars must be about ${Math.round(IDEAL_LEAD * DEG)}° ahead of Earth when you leave.`,
          source: "Computed in this game from the orbits",
          url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
        },
        {
          text: `From today's real planet positions, this simple model puts the next ideal launch about ${daysToWindow} days away, around ${new Date(today.getTime() + daysToWindow * 86400000).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}.`,
          source: "Approximate Positions of the Planets · NASA JPL",
          url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
        },
      ],
    };
  };

  return {
    get result() {
      return endTimer <= 0 ? result : null;
    },
    update(dt: number, input: Input) {
      flash = Math.max(0, flash - dt);
      if (phase === "done") {
        endTimer -= dt;
        days += dt * 20;
        return;
      }
      // Time warp: ↑ speeds the calendar up, ↓ slows it for a precise moment.
      const target = input.up ? 7 : input.down ? 0.25 : 1;
      warp += (target - warp) * Math.min(1, dt * 5);
      const rate = phase === "flight" ? 34 : 14;
      days += dt * rate * (phase === "flight" ? Math.max(0.5, warp) : warp);

      if (phase === "wait" && input.actionPressed) {
        sfx.unlock();
        sfx.launch();
        phase = "flight";
        launchDay = days;
        launchLon = earthLon(days);
        flash = 0.6;
        trail.length = 0;
      } else if (phase === "flight") {
        const s = shipState();
        const p = toXY(s.lon, s.r);
        if (!trail.length || Math.hypot(trail[trail.length - 1].x - p.x, trail[trail.length - 1].y - p.y) > 3) trail.push(p);
        const sep = Math.abs(wrap(marsLon(days) - s.lon)) * DEG;
        if (input.actionPressed && s.tau > 0.6) {
          sfx.unlock();
          if (sep < 7 && s.tau > 0.9) {
            sfx.chime();
            phase = "orbit";
            const err = Math.abs(wrap(marsLon(launchDay + T_TRANSFER) - (launchLon + Math.PI))) * DEG;
            captureMsg = "Captured into Mars orbit";
            const score = Math.round(clamp(100 - err * 9, 10, 100) + clamp(40 - sep * 5, 0, 40));
            finish(true, "Captured into Mars orbit", `Launch timing off by ${err.toFixed(1)}° · ${Math.round(s.tau * T_TRANSFER)} days in flight`, score);
          } else {
            sfx.miss();
            finish(false, "The burn missed Mars", sep >= 7 ? `Mars was ${sep.toFixed(0)}° away along its orbit when you fired.` : "Too early: wait until you reach Mars's orbit.", Math.round(clamp(30 - sep, 0, 30)));
          }
        } else if (s.tau >= 1.08) {
          sfx.miss();
          const err = Math.abs(wrap(marsLon(launchDay + T_TRANSFER) - (launchLon + Math.PI))) * DEG;
          finish(false, err < 7 ? "You drifted past Mars" : "Mars wasn't there", err < 7 ? "Your timing was good, but no capture burn was fired." : `Mars arrived ${err.toFixed(0)}° away from where your path met its orbit.`, Math.round(clamp(40 - err, 0, 40)));
        }
      }
    },

    hud() {
      const date = new Date(today.getTime() + days * 86400000);
      const items: HudItem[] = [
        { label: "Date", value: date.toLocaleDateString("en-GB", { month: "short", year: "numeric" }) },
        { label: "Time warp", value: `${warp.toFixed(1)}×`, tone: "info" as const },
      ];
      if (phase === "wait") {
        const l = lead() * DEG;
        const off = Math.abs(l - IDEAL_LEAD * DEG);
        items.push({ label: "Mars ahead of Earth", value: `${l.toFixed(1)}°`, tone: off < 2 ? ("ok" as const) : off < 8 ? ("warn" as const) : ("info" as const) });
        items.push({ label: "Ideal", value: `${(IDEAL_LEAD * DEG).toFixed(0)}°`, tone: "info" as const });
      } else {
        const s = shipState();
        items.push({ label: "Days in flight", value: `${Math.round(Math.min(s.tau, 1.08) * T_TRANSFER)}`, tone: "info" as const });
        items.push({ label: "Distance from Sun", value: `${s.r.toFixed(2)} AU`, tone: "info" as const });
      }
      return items;
    },

    banner() {
      if (phase === "wait") return { text: "Hold ↑ to speed up time · ↓ to slow it · Space to launch when the ghost Mars meets your arrival point", tone: "info" };
      if (phase === "flight") {
        const s = shipState();
        if (s.tau > 0.9) return { text: "Capture burn: press Space when you reach Mars!", tone: "warn" };
        return { text: "Coasting on the transfer orbit…", tone: "info" };
      }
      return captureMsg ? { text: captureMsg, tone: "ok" } : null;
    },

    draw(ctx: CanvasRenderingContext2D, t: number) {
      cachedLayer(
        ctx,
        backdrop,
        (c) => {
          const bg = c.createRadialGradient(CX, CY, 20, CX, CY, 620);
          bg.addColorStop(0, "#0b1226");
          bg.addColorStop(1, "#03050b");
          c.fillStyle = bg;
          c.fillRect(0, 0, VW, VH);
          drawStars(c, stars, 0);

          // Orbits
          c.lineWidth = 1;
          for (const [r, col] of [
            [R_E, "rgba(90,162,255,0.35)"],
            [R_M, "rgba(255,122,77,0.35)"],
          ] as const) {
            c.strokeStyle = col;
            c.beginPath();
            c.arc(CX, CY, r * AU_PX, 0, TAU);
            c.stroke();
          }

          // Sun
          const sg = c.createRadialGradient(CX, CY, 4, CX, CY, 46);
          sg.addColorStop(0, "rgba(255,220,150,0.9)");
          sg.addColorStop(1, "rgba(255,170,60,0)");
          c.fillStyle = sg;
          c.beginPath();
          c.arc(CX, CY, 46, 0, TAU);
          c.fill();
          drawPlanet(c, sunMap, CX, CY, 16, 0, { fallback: "#ffc46b", light: 0 });
        },
        ready(sunMap),
      );

      const eNow = earthLon(days);
      const mNow = marsLon(days);

      // Flight computer: the transfer you'd fly if you launched now, and where Mars will be when you arrive.
      if (phase === "wait") {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = "rgba(127,227,224,0.45)";
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const nu = (i / 60) * Math.PI;
          const p = toXY(eNow + nu, transferR(nu));
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        const arrive = toXY(eNow + Math.PI, R_M);
        const ghost = toXY(marsLon(days + T_TRANSFER), R_M);
        const close = Math.hypot(arrive.x - ghost.x, arrive.y - ghost.y) < 8;
        ctx.strokeStyle = close ? "rgba(74,222,128,0.95)" : "rgba(127,227,224,0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(arrive.x, arrive.y, 10 + Math.sin(t * 5) * 1.5, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.45;
        drawPlanet(ctx, marsMap, ghost.x, ghost.y, 7, 0, { fallback: "#c1440e" });
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(201,209,240,0.7)";
        ctx.font = "11px ui-sans-serif, system-ui";
        ctx.fillText("Mars on arrival", ghost.x + 10, ghost.y - 10);

        // Phase wedge between Earth and Mars
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.arc(CX, CY, 70, -eNow, -mNow, wrap(mNow - eNow) > 0);
        ctx.closePath();
        ctx.fill();
      }

      // Trail and ship
      if (trail.length > 1) {
        ctx.strokeStyle = "rgba(159,232,255,0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }

      const e = toXY(eNow, R_E);
      const m = toXY(mNow, R_M);
      drawPlanet(ctx, earthMap, e.x, e.y, 11, t * 0.1, { glow: "rgba(77,163,255,0.5)", fallback: "#2a64c4", light: Math.atan2(CY - e.y, CX - e.x) });
      drawPlanet(ctx, marsMap, m.x, m.y, 9, t * 0.08, { glow: "rgba(255,122,77,0.35)", fallback: "#c1440e", light: Math.atan2(CY - m.y, CX - m.x) });

      if (phase !== "wait") {
        let p: { x: number; y: number };
        let heading: number;
        if (phase === "orbit" || (phase === "done" && captureMsg)) {
          const a = t * 2.4;
          p = { x: m.x + Math.cos(a) * 18, y: m.y + Math.sin(a) * 18 };
          heading = a + Math.PI / 2;
        } else {
          const s = shipState();
          p = toXY(s.lon, s.r);
          const q = toXY(s.lon + 0.01, transferR(s.lon + 0.01 - launchLon));
          heading = Math.atan2(q.y - p.y, q.x - p.x);
        }
        drawShip(ctx, p.x, p.y, heading, phase === "flight" && shipState().tau < 0.08 ? 1 : 0.2, t);
      }

      ctx.fillStyle = "rgba(201,209,240,0.75)";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText("Earth", e.x + 14, e.y + 4);
      ctx.fillText("Mars", m.x + 12, m.y + 4);
      ctx.fillStyle = "rgba(201,209,240,0.45)";
      ctx.font = "10px ui-sans-serif, system-ui";
      ctx.fillText("Positions start from today · simplified circular orbits", 16, VH - 14);

      if (flash > 0) {
        ctx.fillStyle = `rgba(255,220,170,${flash * 0.35})`;
        ctx.fillRect(0, 0, VW, VH);
      }
    },
  };
}

/** A small crew ship: capsule and service module, with an exhaust flare scaled by thrust. */
export function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, thrust: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  if (thrust > 0.05) {
    const len = 6 + thrust * 14 + Math.sin(t * 40) * 2;
    const g = ctx.createLinearGradient(-5, 0, -5 - len, 0);
    g.addColorStop(0, "rgba(255,240,200,0.95)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5, -2.5);
    ctx.lineTo(-5 - len, 0);
    ctx.lineTo(-5, 2.5);
    ctx.fill();
  }
  ctx.fillStyle = "#1c3767";
  ctx.fillRect(-3, -9, 3, 18);
  ctx.fillStyle = "#d9dee6";
  ctx.fillRect(-6, -3, 7, 6);
  ctx.fillStyle = "#f4f6fa";
  ctx.beginPath();
  ctx.moveTo(1, -3);
  ctx.lineTo(6, -1.2);
  ctx.lineTo(6, 1.2);
  ctx.lineTo(1, 3);
  ctx.fill();
  ctx.restore();
}
