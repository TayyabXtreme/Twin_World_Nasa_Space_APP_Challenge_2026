"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { cn } from "@/lib/utils";
import type { World } from "@/lib/worlds";
import "./slider.css";

const G_EARTH = 9.81;
/** Take-off speed that gives a 0.5 m jump on Earth; the same push on other worlds. */
const V0 = Math.sqrt(2 * G_EARTH * 0.5);
const PX_PER_M = 62;
/** Time on the ground between jumps, long enough for the landing dust to play out. */
const REST = 0.95;
const EASE = [0.23, 1, 0.32, 1] as const;

interface WorldInfo {
  id: World;
  name: string;
  gravity: number;
  pressure: string;
  day: string;
  light: string;
  sky: string;
  texture: string;
  /** Apparent size of the Sun compared with Earth's sky. */
  sun: number;
}

const WORLDS: WorldInfo[] = [
  { id: "earth", name: "Earth", gravity: 9.81, pressure: "1,013 hPa", day: "24 hours", light: "—", sky: "Blue: air scatters blue sunlight", texture: "/textures/earth/day-1k.webp", sun: 1 },
  { id: "moon", name: "Moon", gravity: 1.62, pressure: "Near vacuum (exosphere)", day: "about 29.5 Earth days", light: "about 1.3 s", sky: "Black, even in daytime", texture: "/textures/moon/color-1k.webp", sun: 1 },
  { id: "mars", name: "Mars", gravity: 3.71, pressure: "about 6 hPa, under 1% of Earth's", day: "24 h 37 min", light: "3 to 22 min", sky: "Butterscotch by day, bluish at sunset", texture: "/textures/mars/color-1k.webp", sun: 0.66 },
];

const SKY: Record<World, string> = {
  earth: "linear-gradient(180deg, #1f58b8 0%, #5f9ae3 50%, #cfe3f7 100%)",
  moon: "linear-gradient(180deg, #000 0%, #03050b 100%)",
  mars: "linear-gradient(180deg, #6e4f3c 0%, #b88b67 48%, #e6c6a0 100%)",
};

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** A small astronaut, drawn to sit on the ground line at its feet (viewBox 40 × 64). */
function Astronaut() {
  return (
    <svg viewBox="0 0 40 64" className="h-16 w-10 drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]" aria-hidden>
      <rect x="8" y="17" width="9" height="20" rx="3" fill="#c9ced6" />
      <rect x="11" y="18" width="18" height="22" rx="7" fill="#f4f6fa" />
      <rect x="6" y="21" width="6" height="15" rx="3" fill="#e7eaf0" transform="rotate(14 9 21)" />
      <rect x="28" y="21" width="6" height="15" rx="3" fill="#e7eaf0" transform="rotate(-14 31 21)" />
      <rect x="13" y="38" width="6.5" height="22" rx="3" fill="#eef1f6" />
      <rect x="20.5" y="38" width="6.5" height="22" rx="3" fill="#eef1f6" />
      <rect x="12" y="57" width="8.5" height="5" rx="2" fill="#9aa3b2" />
      <rect x="19.5" y="57" width="8.5" height="5" rx="2" fill="#9aa3b2" />
      <circle cx="20" cy="11" r="9.5" fill="#f4f6fa" />
      <ellipse cx="21.5" cy="11" rx="6.2" ry="5" fill="#1b2a4a" />
      <ellipse cx="23" cy="9.3" rx="2.2" ry="1.3" fill="#ffffff" opacity="0.55" />
      <rect x="15" y="24" width="10" height="4" rx="1.5" fill="#3ff2e0" opacity="0.85" />
    </svg>
  );
}

/* ---------- One world's sky and ground ---------- */

function Sky({ world }: { world: World }) {
  if (world === "earth")
    return (
      <>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="sl-cloud absolute rounded-full bg-white/70"
            style={{ top: `${10 + i * 13}%`, left: "-20%", width: `${22 + i * 8}%`, height: `${6 + i * 2}%`, "--dur": `${55 + i * 18}s`, "--delay": `${-i * 21}s` } as Vars}
          />
        ))}
      </>
    );
  if (world === "moon")
    return (
      <>
        {Array.from({ length: 46 }, (_, i) => (
          <span
            key={i}
            className="sl-star absolute rounded-full bg-white"
            style={
              {
                left: `${rand(i, 1) * 100}%`,
                top: `${rand(i, 2) * 62}%`,
                width: rand(i, 3) > 0.85 ? 2 : 1,
                height: rand(i, 3) > 0.85 ? 2 : 1,
                "--dur": `${(2 + rand(i, 4) * 3).toFixed(2)}s`,
                "--delay": `${(-rand(i, 5) * 4).toFixed(2)}s`,
              } as Vars
            }
          />
        ))}
        {/* Earth hangs in the black lunar sky, turning slowly. */}
        <span
          className="sl-depth sl-globe absolute top-[17%] left-[14%] size-14 rounded-full"
          style={{ backgroundImage: "url(/textures/earth/day-1k.webp)", boxShadow: "inset -14px -6px 18px rgba(0,0,0,0.85), 0 0 18px rgba(77,163,255,0.5)", "--d": "10px" } as Vars}
        />
      </>
    );
  return (
    <>
      <span className="sl-haze absolute inset-x-0 top-[44%] h-[30%] bg-[radial-gradient(60%_100%_at_50%_100%,rgba(230,190,150,0.55),transparent)] opacity-30" />
      {/* Phobos, a small lumpy moon, crossing high in the Martian sky */}
      <span className="sl-phobos absolute top-[9%] h-2 w-2.5 rounded-[45%_55%_50%_50%] bg-[#8d8378] shadow-[inset_-1px_-1px_2px_rgba(0,0,0,0.6)]" />
    </>
  );
}

function WorldLayer({ info, origin }: { info: WorldInfo; origin: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="absolute inset-0"
      initial={reduce ? { opacity: 0 } : { clipPath: `circle(0% at ${origin})` }}
      animate={reduce ? { opacity: 1 } : { clipPath: `circle(150% at ${origin})` }}
      exit={{ opacity: 0.999, transition: { duration: 0.9 } }}
      transition={{ duration: reduce ? 0.3 : 0.95, ease: [0.65, 0, 0.35, 1] }}
    >
      <div className="sl-depth absolute -inset-4" style={{ background: SKY[info.id], "--d": "4px" } as Vars} />
      <div className="sl-depth absolute -inset-4" style={{ "--d": "7px" } as Vars}>
        <Sky world={info.id} />
      </div>
      {/* The Sun: two-thirds the size from Mars */}
      <div className="sl-depth absolute top-[11%] right-[14%]" style={{ "--d": "9px" } as Vars}>
        <span
          className="sl-sun block rounded-full bg-[#fff6dc]"
          style={{
            width: 46 * info.sun,
            height: 46 * info.sun,
            boxShadow: info.id === "earth" ? "0 0 60px 26px rgba(255,240,200,0.55)" : info.id === "mars" ? "0 0 40px 16px rgba(255,220,180,0.35)" : "0 0 50px 14px rgba(255,236,190,0.5)",
          }}
        />
      </div>
      {/* Ground: the world's own NASA surface map on a curved horizon */}
      <div
        // Centred with left instead of a translate, which the parallax layer owns.
        className="sl-depth absolute top-[70%] left-[-80%] aspect-square w-[260%] rounded-full"
        style={
          {
            backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.55) 18%), url(${info.texture})`,
            backgroundSize: "100% 100%, 60% 30%",
            // The visible strip of the disc maps to the equatorial band of the map (no polar ice bands).
            backgroundPosition: "center top, 42% -16%",
            "--d": "16px",
          } as Vars
        }
      />
      {info.id === "mars" &&
        Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="sl-dust absolute left-0 size-[3px] rounded-full bg-[#f1d2ad]"
            style={{ top: `${58 + rand(i, 6) * 30}%`, "--dur": `${(6 + rand(i, 7) * 6).toFixed(2)}s`, "--delay": `${(-rand(i, 8) * 10).toFixed(2)}s`, "--o": (0.35 + rand(i, 9) * 0.45).toFixed(2) } as Vars}
          />
        ))}
    </motion.div>
  );
}

/* ---------- The jump ---------- */

/**
 * The astronaut, its shadow and the landing dust share one timeline: take-off, a real projectile arc with this
 * world's hang time, landing, then a short rest. Dust follows the air: it puffs and fades on Earth, flies in
 * clean ballistic arcs on the airless Moon, and is carried off by the wind on Mars.
 */
function Jumper({ info, jumpM, hang }: { info: WorldInfo; jumpM: number; hang: number }) {
  const reduce = useReducedMotion();
  const cycle = hang + REST;
  const land = hang / cycle;
  const h = jumpM * PX_PER_M;
  const repeat = { duration: cycle, repeat: Infinity };

  const dust = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const dir = i % 2 ? 1 : -1;
        const spread = 0.4 + rand(i, 11) * 0.6;
        const settle = Math.min(0.99, land + 0.85 / cycle);
        if (info.id === "moon") {
          const up = (12 + rand(i, 12) * 26) * spread;
          const peak = land + (settle - land) * 0.45;
          return {
            x: [0, 0, dir * 20 * spread, dir * 48 * spread, dir * 48 * spread],
            y: [0, 0, -up, 0, 0],
            opacity: [0, 0, 0.95, 0.9, 0],
            scale: [1, 1, 1, 1, 1],
            times: [0, land, peak, settle, Math.min(1, settle + 0.005)],
          };
        }
        if (info.id === "mars")
          return {
            x: [0, 0, 18 + 40 * spread, 30 + 70 * spread],
            y: [0, 0, -8 - 10 * spread, -14 - 12 * spread],
            opacity: [0, 0, 0.75, 0],
            scale: [0.8, 0.8, 1.6, 2.4],
            times: [0, land, land + (settle - land) * 0.35, settle],
          };
        return {
          x: [0, 0, dir * (8 + 18 * spread), dir * (12 + 24 * spread)],
          y: [0, 0, -4 - 6 * spread, -8 - 8 * spread],
          opacity: [0, 0, 0.7, 0],
          scale: [0.6, 0.6, 1.5, 2.2],
          times: [0, land, land + (settle - land) * 0.3, settle],
        };
      }),
    [info.id, land, cycle],
  );

  if (reduce)
    return (
      <div className="absolute bottom-[30%] left-[38%]" style={{ transform: `translateY(${-h}px)` }}>
        <Astronaut />
      </div>
    );

  return (
    <div className="sl-depth absolute inset-0" style={{ "--d": "16px" } as Vars}>
      {/* Shadow shrinks and fades as the astronaut rises */}
      <motion.span
        className="absolute bottom-[calc(30%-5px)] left-[calc(38%+2px)] h-2.5 w-9 rounded-[50%] bg-black/45 blur-[2px]"
        animate={{ scaleX: [1, 0.45, 1, 1], opacity: [0.55, 0.15, 0.55, 0.55] }}
        transition={{ ...repeat, times: [0, land / 2, land, 1], ease: ["easeOut", "easeIn", "linear"] }}
      />
      {dust.map((d, i) => (
        <motion.span
          key={i}
          className={cn("absolute bottom-[30%] left-[calc(38%+18px)] size-1.5 rounded-full", info.id === "mars" ? "bg-[#e9c8a2]" : info.id === "moon" ? "bg-[#d9dade]" : "bg-[#c9b79c]")}
          animate={{ x: d.x, y: d.y, opacity: d.opacity, scale: d.scale }}
          transition={{
            ...repeat,
            times: d.times,
            // On the Moon the climb decelerates and the fall accelerates: a ballistic arc, with no air to slow it.
            y: { ...repeat, times: d.times, ease: info.id === "moon" ? ["linear", [0.33, 1, 0.68, 1], [0.32, 0, 0.67, 0], "linear"] : "easeOut" },
          }}
        />
      ))}
      <motion.div
        className="absolute bottom-[30%] left-[38%]"
        animate={{ y: [0, -h, 0, 0], scaleY: [0.92, 1, 0.9, 1, 1] }}
        transition={{
          y: { ...repeat, times: [0, land / 2, land, 1], ease: [[0.5, 1, 0.89, 1], [0.11, 0, 0.5, 0], "linear"] },
          scaleY: { ...repeat, times: [0, 0.06, land, Math.min(0.99, land + 0.08), 1] },
        }}
        style={{ originY: 1 }}
      >
        <Astronaut />
      </motion.div>
      {/* Apex marker */}
      {/* Full height from the first paint, revealed upward by a clip (animating height lagged on first load). */}
      <div className="sl-grow-up absolute bottom-[30%] left-[calc(38%+3.25rem)] w-px border-l border-dashed border-white/60" style={{ height: h + 64 }}>
        <span className="hud absolute -top-6 left-2 rounded-md bg-black/45 px-1.5 py-0.5 text-xs whitespace-nowrap text-white">
          <AnimatedNumber value={jumpM} decimals={1} /> m
        </span>
      </div>
    </div>
  );
}

/* ---------- Numbers ---------- */

function Stat({ label, children, note, i }: { label: string; children: React.ReactNode; note?: string; i: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-baseline gap-4 border-t border-white/[0.07] py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="sl-rise" style={{ "--i": i } as Vars}>
        <span className="text-[0.95rem] text-foreground">{children}</span>
        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}

function GravityBars({ world, onPick }: { world: World; onPick: (w: World) => void }) {
  return (
    <div className="mt-5 grid gap-2" role="group" aria-label="Gravity compared">
      {WORLDS.map((w) => {
        const on = w.id === world;
        return (
          <button key={w.id} type="button" onClick={() => onPick(w.id)} aria-pressed={on} className="group grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-3 text-start">
            <span className={cn("text-sm transition-colors", on ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{w.name}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.span
                className={cn("block h-full rounded-full", w.id === "earth" ? "bg-earth" : w.id === "moon" ? "bg-moon" : "bg-mars")}
                initial={{ width: 0 }}
                whileInView={{ width: `${(w.gravity / G_EARTH) * 100}%` }}
                viewport={{ once: true }}
                animate={{ opacity: on ? 1 : 0.35 }}
                transition={{ duration: 0.9, ease: EASE }}
              />
            </span>
            <span className="hud text-end text-xs text-muted-foreground">{w.gravity.toFixed(2)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function WorldScene() {
  const [world, setWorld] = useState<World>("moon");
  const [mass, setMass] = useState(60);
  const [origin, setOrigin] = useState("50% 60%");
  const scene = useRef<HTMLDivElement>(null);
  const info = WORLDS.find((w) => w.id === world)!;
  const jumpM = (V0 * V0) / (2 * info.gravity);
  const hang = (2 * V0) / info.gravity;
  const feelsKg = (mass * info.gravity) / G_EARTH;

  // The new world opens from the point you came from: the picker button's direction, or the scene centre.
  const travel = (w: World, from?: HTMLElement) => {
    if (w === world) return;
    const s = scene.current?.getBoundingClientRect();
    const b = from?.getBoundingClientRect();
    if (s && b) {
      const x = Math.min(100, Math.max(0, ((b.left + b.width / 2 - s.left) / s.width) * 100));
      setOrigin(`${x.toFixed(0)}% 0%`);
    } else setOrigin("50% 60%");
    setWorld(w);
  };
  const parallax = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    e.currentTarget.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };

  return (
    <section aria-labelledby="scene-title">
      <h2 id="scene-title" className="sr-only">
        Stand on each world
      </h2>

      <div role="radiogroup" aria-label="World" className="glass inline-flex rounded-2xl p-1.5">
        {WORLDS.map((w) => (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={world === w.id}
            onClick={(e) => travel(w.id, e.currentTarget)}
            className="relative flex items-center gap-2.5 rounded-xl px-4 py-2 text-sm"
          >
            {world === w.id && (
              <motion.span layoutId="world-pill" className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/15" transition={{ type: "spring", duration: 0.4, bounce: 0.15 }} />
            )}
            <span aria-hidden className="sl-pick-globe relative size-5 rounded-full" style={{ backgroundImage: `url(${w.texture})` }} />
            <span className={cn("relative transition-colors duration-150", world === w.id ? "text-foreground" : "text-muted-foreground")}>{w.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div
          ref={scene}
          onPointerMove={parallax}
          onPointerLeave={(e) => {
            e.currentTarget.style.setProperty("--px", "0");
            e.currentTarget.style.setProperty("--py", "0");
          }}
          className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
          aria-hidden
        >
          <AnimatePresence initial={false}>
            <WorldLayer key={world} info={info} origin={origin} />
          </AnimatePresence>
          <span key={`warp-${world}`} className="sl-warp pointer-events-none absolute inset-0" />
          <Jumper key={`jump-${world}`} info={info} jumpM={jumpM} hang={hang} />
          <p className="absolute bottom-3 left-4 text-xs text-white/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
            Same push-off on every world · hang time <AnimatedNumber value={hang} decimals={1} /> s
          </p>
        </div>

        <div>
          <h3 className="font-heading text-3xl font-semibold tracking-tight">
            Standing on{" "}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={info.name}
                className="inline-block"
                initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                {world === "moon" ? "the Moon" : info.name}
              </motion.span>
            </AnimatePresence>
          </h3>
          <GravityBars world={world} onPick={(w) => travel(w)} />
          <dl key={world} className="mt-5">
            <Stat i={0} label="Gravity" note={world === "earth" ? undefined : `${Math.round((info.gravity / G_EARTH) * 100)}% of Earth's`}>
              <span className="hud">
                <AnimatedNumber value={info.gravity} decimals={2} /> m/s²
              </span>
            </Stat>
            <Stat i={1} label="You would feel like">
              <span className="hud">
                <AnimatedNumber value={feelsKg} decimals={1} /> kg
              </span>
              <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                if you are
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={mass}
                  onChange={(e) => setMass(Math.min(200, Math.max(10, Number(e.target.value) || 0)))}
                  className="hud w-16 rounded-md border border-input bg-white/5 px-2 py-0.5 text-foreground"
                />
                kg on Earth
              </label>
            </Stat>
            <Stat i={2} label="Jump height" note="for a push that lifts you 0.5 m on Earth">
              <span className="hud">
                <AnimatedNumber value={jumpM} decimals={2} /> m
              </span>
            </Stat>
            <Stat i={3} label="Air pressure">{info.pressure}</Stat>
            <Stat i={4} label="Length of day">{info.day}</Stat>
            <Stat i={5} label="Light delay from Earth">{info.light}</Stat>
            <Stat i={6} label="Sky">{info.sky}</Stat>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Gravity, air and day length: NASA Science (Moon, Mars facts). Jumps use simple projectile physics, ignoring
            the weight of a real spacesuit.
          </p>
        </div>
      </div>
    </section>
  );
}
