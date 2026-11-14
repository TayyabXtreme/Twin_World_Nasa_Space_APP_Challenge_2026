"use client";

import { Radio, Scale } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { cn } from "@/lib/utils";
import { PlanetOrb } from "./PlanetOrb";

const EASE = [0.23, 1, 0.32, 1] as const;
const G_EARTH = 9.81;

const GRAVITY = [
  { id: "earth", name: "Earth", g: 9.81, texture: "/textures/earth/day-1k.webp", glow: "oklch(0.72 0.13 235)" },
  { id: "mars", name: "Mars", g: 3.71, texture: "/textures/mars/color-1k.webp", glow: "oklch(0.66 0.16 40)" },
  { id: "moon", name: "Moon", g: 1.62, texture: "/textures/moon/color-1k.webp", glow: "oklch(0.85 0.01 260)" },
];

function LabCard({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Scale;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-3xl glass p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="font-heading text-lg font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Drag your weight and see what the scale would read on each world, and how high a 50 cm jump would go. */
export function GravityLab() {
  const [kg, setKg] = useState(60);
  return (
    <LabCard
      icon={Scale}
      title="Step on the scales"
      hint="Move the slider to your weight. Your mass stays the same; the pull of each world does not."
    >
      <label className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">On Earth</span>
        <input
          type="range"
          min={20}
          max={150}
          value={kg}
          onChange={(e) => setKg(Number(e.target.value))}
          className="timeline-range flex-1"
          style={{ "--fill": `${((kg - 20) / 130) * 100}%` } as React.CSSProperties}
          aria-label="Your weight on Earth, kilograms"
        />
        <span className="w-16 text-end hud text-sm">{kg} kg</span>
      </label>
      <ul className="mt-6 flex flex-col gap-4">
        {GRAVITY.map((w) => {
          const ratio = w.g / G_EARTH;
          return (
            <li key={w.id} className="grid grid-cols-[2.5rem_1fr] items-center gap-3">
              <PlanetOrb texture={w.texture} glow={w.glow} spin="-12%" className="size-10" />
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{w.name}</span>
                  <span className="text-muted-foreground">
                    feels like{" "}
                    <AnimatedNumber value={kg * ratio} decimals={1} className="hud text-base text-foreground" /> kg
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/8">
                  <motion.div
                    className="h-full origin-left rounded-full"
                    style={{ background: w.glow }}
                    initial={false}
                    animate={{ scaleX: (kg * ratio) / 150 }}
                    transition={{ duration: 0.45, ease: EASE }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A 50 cm jump on Earth goes <span className="hud text-foreground">{(0.5 / ratio).toFixed(2)} m</span>{" "}
                  here
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto pt-5 text-[11px] leading-snug text-muted-foreground">
        Surface gravity 9.81, 3.71 and 1.62 m/s². Jump heights ignore a spacesuit, which on the Moon roughly doubles
        what you carry.
      </p>
    </LabCard>
  );
}

const C = 299_792.458;
const MARS = [
  { id: "close", label: "Closest", km: 54_600_000 },
  { id: "avg", label: "Average", km: 225_000_000 },
  { id: "far", label: "Farthest", km: 401_000_000 },
] as const;
const MOON_ONE_WAY = 384_400 / C;
/** Mars legs are sped up so one leg lasts this long on screen. */
const MARS_LEG_S = 3;

function formatElapsed(s: number) {
  if (s < 60) return `${s.toFixed(2)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(Math.floor(s % 60)).padStart(2, "0")} s`;
}

/**
 * Send a radio ping and watch it cross at light speed and come back. The Moon runs in real time; Mars is sped up
 * (and says by how much) while the clock shows the real elapsed time.
 */
export function SignalLab() {
  const reduce = useReducedMotion();
  const [target, setTarget] = useState<"moon" | "mars">("moon");
  const [mars, setMars] = useState<(typeof MARS)[number]["id"]>("avg");
  const [phase, setPhase] = useState<"ready" | "out" | "back" | "done">("ready");
  const [arrivals, setArrivals] = useState(0);
  const progress = useMotionValue(0); // 0 → 1 out, 1 → 2 back
  const oneWay = useMotionValue(MOON_ONE_WAY);
  const controls = useRef<AnimationPlaybackControls | null>(null);

  const km = target === "moon" ? 384_400 : MARS.find((m) => m.id === mars)!.km;
  const oneWayS = km / C;
  const legS = target === "moon" ? oneWayS : MARS_LEG_S;
  const speedUp = oneWayS / legS;

  const x = useTransform(progress, (v) => `${(v <= 1 ? v : 2 - v) * 100}%`);
  const elapsed = useTransform([progress, oneWay], ([v, o]: number[]) => formatElapsed(v * o));
  const phaseRef = useRef<typeof phase>("ready");
  useMotionValueEvent(progress, "change", (v) => {
    const next = v === 0 ? "ready" : v < 1 ? "out" : v < 2 ? "back" : "done";
    if (next === phaseRef.current) return;
    // The ping reached the far planet (not a reset back to the start): play the arrival ring.
    if (phaseRef.current === "out" && next !== "ready") setArrivals((a) => a + 1);
    phaseRef.current = next;
    setPhase(next);
  });

  useEffect(() => () => controls.current?.stop(), []);

  const reset = () => {
    controls.current?.stop();
    progress.set(0);
  };

  const ping = () => {
    controls.current?.stop();
    oneWay.set(oneWayS);
    progress.set(0);
    controls.current = animate(progress, 2, { duration: reduce ? 0 : legS * 2, ease: "linear" });
  };

  const pick = (t: "moon" | "mars") => {
    setTarget(t);
    reset();
  };

  const targetTexture = target === "moon" ? "/textures/moon/color-1k.webp" : "/textures/mars/color-1k.webp";
  const targetGlow = target === "moon" ? "oklch(0.85 0.01 260)" : "oklch(0.66 0.16 40)";

  return (
    <LabCard
      icon={Radio}
      title="Call a rover"
      hint="Radio travels at the speed of light, about 300,000 km every second. Send a ping and wait for the reply."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={target}
          onChange={pick}
          options={[
            { id: "moon", label: "Moon" },
            { id: "mars", label: "Mars" },
          ]}
        />
        {target === "mars" && (
          <Segmented
            value={mars}
            onChange={(v) => {
              setMars(v);
              reset();
            }}
            options={MARS.map((m) => ({ id: m.id, label: m.label }))}
            small
          />
        )}
      </div>

      <div className="relative mt-8 flex items-center gap-3">
        <PlanetOrb
          texture="/textures/earth/day-1k.webp"
          glow="oklch(0.72 0.13 235)"
          spin="-20%"
          className="size-12 shrink-0"
        />
        <div className="relative h-10 flex-1">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-white/25" />
          <motion.div className="absolute inset-y-0 left-0 w-full" style={{ x }} aria-hidden>
            <span
              className={cn(
                "absolute top-1/2 left-0 block size-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150",
                phase === "ready" || phase === "done" ? "opacity-0" : "opacity-100",
                phase === "back"
                  ? "bg-ok shadow-[0_0_14px_3px_var(--ok)]"
                  : "bg-primary shadow-[0_0_14px_3px_var(--primary)]",
              )}
            />
          </motion.div>
        </div>
        <div className="relative size-12 shrink-0">
          <PlanetOrb texture={targetTexture} glow={targetGlow} spin="-30%" className="size-12" />
          {arrivals > 0 && (
            <span
              key={arrivals}
              className="learn-arrive absolute inset-0 rounded-full border-2 border-primary"
              aria-hidden
            />
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Clock</p>
          <motion.p className="mt-0.5 hud text-2xl font-semibold">{elapsed}</motion.p>
        </div>
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Status</p>
          <p className="mt-1 text-sm" aria-live="polite">
            {phase === "ready" && "Ready to send"}
            {phase === "out" && "Signal on its way…"}
            {phase === "back" && "Rover heard you. Reply coming back…"}
            {phase === "done" && `Round trip: ${formatElapsed(oneWayS * 2)}`}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={ping}
        disabled={phase === "out" || phase === "back"}
        className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition-[background-color,scale,opacity] duration-150 ease-(--ease-out) hover:bg-primary/90 active:scale-[0.97] disabled:opacity-60"
      >
        <Radio className="size-4" aria-hidden />
        {phase === "done" ? "Ping again" : "Send ping"}
      </button>
      <p className="mt-auto pt-4 text-[11px] leading-snug text-muted-foreground">
        {target === "moon"
          ? "Real time: the Moon is about 384,400 km away, 1.28 light-seconds."
          : `Shown ${Math.round(speedUp)}× faster. Mars is ${(km / 1e6).toFixed(1)} million km away here, so one way takes ${formatElapsed(oneWayS)}.`}
      </p>
    </LabCard>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  small,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  small?: boolean;
}) {
  return (
    <div role="group" className="flex rounded-xl bg-white/5 p-0.5 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-lg transition-colors duration-150",
            small ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
            value === o.id ? "bg-white/12 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
