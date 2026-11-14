"use client";

import { ArrowRight, Flag, Loader2, MapPin, Play, RotateCcw, ScanLine, Star, Trophy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { DATA_BASE, loadGrid, loadManifest, toFloat } from "@/lib/moonbase/grids";
import { cellAt, cellCentre, distKm, HALF_W_KM } from "@/lib/moonbase/projection";
import { ARTEMIS_REGIONS } from "@/lib/moonbase/regions";
import {
  breakdownAt,
  computeSuitability,
  FACTORS,
  topSpots,
  type FactorId,
  type Weights,
} from "@/lib/moonbase/suitability";
import { cn } from "@/lib/utils";
import { readBest, writeBest } from "./best";
import { sfx } from "./sfx";

/**
 * Moon Base Scout: three missions at the lunar south pole. Read the brief, spend a couple of data scans, drop your
 * base, and see how it scores against the best spot in the real LOLA / Diviner / Mini-RF grids, using the same
 * scoring rules as the Moon Base Map.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const VIEW_KM = 300; // the map shows ±300 km around the pole, where the Diviner ice and temperature model has data
const NEEDED = [...new Set(FACTORS.map((f) => f.layer))];
const SCANS_PER_MISSION = 2;

const ZERO: Weights = { gentle: 0, smooth: 0, ice: 0, sun: 0, high: 0, radar: 0 };

interface Mission {
  title: string;
  brief: string;
  weights: Weights;
}

const MISSIONS: Mission[] = [
  {
    title: "First landing",
    brief:
      "Set down the first crew lander. Safety first: gentle, even ground, with enough sunlight to keep the batteries charged.",
    weights: { ...ZERO, gentle: 4, smooth: 2, sun: 2, radar: 1 },
  },
  {
    title: "Ice prospector",
    brief:
      "Build a mining outpost within driving distance of a permanently shadowed cold trap, where water ice can survive. It still has to land safely.",
    weights: { ...ZERO, ice: 4, gentle: 2, smooth: 1, sun: 1 },
  },
  {
    title: "Permanent base",
    brief:
      "The big one: a base people live in for months. Balance everything: safe ground, sunlight for power, ice for water, and high ground that stays lit.",
    weights: { ...ZERO, gentle: 3, smooth: 1, ice: 3, sun: 3, high: 2, radar: 0.5 },
  },
];

const LENSES = [
  { id: "slope", label: "Slope", image: "slope.webp", hint: "Steep crater walls show in warm colours" },
  { id: "tavg", label: "Sunlight", image: "tavg.webp", hint: "Warmer average = more sunlight over a year" },
  { id: "coldtrap", label: "Cold traps", image: "coldtrap.webp", hint: "Never-sunlit ground where ice can survive" },
  { id: "lend", label: "Hydrogen", image: "lend.webp", hint: "LEND neutrons: blue = more hydrogen" },
] as const;
type LensId = (typeof LENSES)[number]["id"];

const FACTOR_SHORT: Record<FactorId, string> = {
  gentle: "Slope",
  smooth: "Even",
  ice: "Ice",
  sun: "Sun",
  high: "High",
  radar: "Rocks",
};

type Data = { size: number; layers: Record<string, Float32Array> };
type Placed = { x: number; y: number; index: number | null };
type Result = {
  points: number;
  score: number;
  best: { x: number; y: number; score: number };
  region: { name: string; km: number };
};

let dataPromise: Promise<Data> | null = null;
function loadData() {
  dataPromise ??= loadManifest().then(async (m) => {
    const layers: Record<string, Float32Array> = {};
    let size = 0;
    await Promise.all(
      NEEDED.map(async (id) => {
        const meta = m.layers.find((l) => l.id === id && l.status === "ready" && l.grid);
        if (!meta) return;
        const g = await loadGrid(meta);
        size = g.size;
        layers[id] = toFloat(g);
      }),
    );
    return { size, layers };
  });
  dataPromise.catch(() => (dataPromise = null));
  return dataPromise;
}

/** Map km (polar stereographic) <-> percent position inside the ±VIEW_KM square. */
const toPct = (x: number, y: number) => ({
  left: `${((x + VIEW_KM) / (2 * VIEW_KM)) * 100}%`,
  top: `${((VIEW_KM - y) / (2 * VIEW_KM)) * 100}%`,
});
const IMG_SCALE = `${(HALF_W_KM / VIEW_KM) * 100}%`;

export function ScoutGame() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"intro" | "loading" | "play" | "done">("intro");
  const [mission, setMission] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [lens, setLens] = useState<LensId | null>(null);
  const [usedLenses, setUsedLenses] = useState<LensId[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the stored record once, after hydration
  useEffect(() => setBest(readBest("scout")), []);

  const m = MISSIONS[mission];
  const suit = useMemo(() => (data ? computeSuitability(data.layers, m.weights, data.size) : null), [data, m]);
  const bestSpot = useMemo(() => {
    if (!data || !suit) return null;
    // Search a little inside the frame (the model's outer edge is its least reliable part) so the star stays visible.
    const inner = suit.scores.slice();
    const px = (2 * HALF_W_KM) / data.size;
    const lim = VIEW_KM - 20;
    for (let i = 0; i < inner.length; i++) {
      const x = -HALF_W_KM + ((i % data.size) + 0.5) * px;
      const y = HALF_W_KM - (Math.floor(i / data.size) + 0.5) * px;
      if (Math.abs(x) > lim || Math.abs(y) > lim) inner[i] = NaN;
    }
    const top = topSpots(inner, data.size, px, 1)[0];
    if (!top) return null;
    const [x, y] = cellCentre(top.row, top.col, data.size);
    return { x, y, score: top.score };
  }, [data, suit]);

  const start = useCallback(() => {
    sfx.unlock();
    setMission(0);
    setScores([]);
    setPlaced(null);
    setResult(null);
    setLens(null);
    setUsedLenses([]);
    setNewBest(false);
    setError(null);
    setPhase("loading");
    loadData()
      .then((d) => {
        setData(d);
        setPhase("play");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const onMap = (e: PointerEvent<HTMLDivElement>) => {
    if (result || !data) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 * VIEW_KM - VIEW_KM;
    const y = VIEW_KM - ((e.clientY - r.top) / r.height) * 2 * VIEW_KM;
    const c = cellAt(x, y, data.size);
    const index = c ? c.row * data.size + c.col : null;
    const ok = index !== null && suit && !Number.isNaN(suit.scores[index]);
    setPlaced({ x, y, index: ok ? index : null });
    sfx.blip(ok ? 660 : 220, 0.06);
  };

  const scan = (id: LensId) => {
    if (usedLenses.includes(id)) {
      setLens(lens === id ? null : id);
      return;
    }
    if (usedLenses.length >= SCANS_PER_MISSION || result) return;
    setUsedLenses((u) => [...u, id]);
    setLens(id);
    sfx.blip(990, 0.08, "triangle");
  };

  const confirm = () => {
    if (!placed || placed.index === null || !suit || !bestSpot) return;
    const score = suit.scores[placed.index];
    const points = Math.round(100 * Math.min(1, score / bestSpot.score));
    const near = ARTEMIS_REGIONS.map((r) => ({ name: r.name, km: distKm([r.x, r.y], [placed.x, placed.y]) })).sort(
      (a, b) => a.km - b.km,
    )[0];
    setResult({ points, score, best: bestSpot, region: near });
    setScores((s) => [...s, points]);
    if (points >= 80) sfx.chime();
    else sfx.blip(440, 0.12);
  };

  const nextMission = () => {
    if (mission + 1 >= MISSIONS.length) {
      const total = scores.reduce((a, b) => a + b, 0);
      const prev = readBest("scout");
      if (total > prev) writeBest("scout", total);
      setNewBest(total > prev && prev > 0);
      setBest(Math.max(prev, total));
      setPhase("done");
      return;
    }
    setMission((i) => i + 1);
    setPlaced(null);
    setResult(null);
    setLens(null);
    setUsedLenses([]);
  };

  const breakdown = result && placed?.index != null && data ? breakdownAt(data.layers, m.weights, placed.index) : [];
  const weightTotal = Object.values(m.weights).reduce((a, b) => a + b, 0);

  /* ------------------------------------------------------------------ intro */
  if (phase === "intro" || phase === "loading") {
    return (
      <div className="relative overflow-hidden rounded-[1.75rem] ring-1 ring-white/10">
        <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
          <Image
            src="/photos/challenge/card-scout.webp"
            alt="The lunar south pole: LOLA shaded relief with cold traps"
            fill
            sizes="(min-width: 1280px) 1200px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(3_5_11/0.94)_0%,rgb(3_5_11/0.7)_45%,rgb(3_5_11/0.15)_85%)]" />
          <div className="absolute inset-0 flex max-w-xl flex-col justify-center gap-4 p-6 sm:p-10">
            <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">
              Moon base challenge · 3 missions
            </p>
            <h2 className="font-heading text-[clamp(1.8rem,4vw,3rem)] leading-none font-semibold tracking-tight">
              Moon Base Scout
            </h2>
            <p className="max-w-[46ch] text-sm leading-relaxed text-foreground/85 sm:text-base">
              Pick where to build at the lunar south pole. Each mission has different priorities and only{" "}
              {SCANS_PER_MISSION} data scans. Your site is scored with real NASA LRO data against the best spot on the
              map.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={start}
                disabled={phase === "loading"}
                className="arcade-start flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-transform active:scale-[0.97] disabled:opacity-70"
              >
                {phase === "loading" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="size-4" aria-hidden />
                )}
                {phase === "loading" ? "Loading lunar data…" : "Start"}
              </button>
              {best > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Trophy className="size-4 text-warn" aria-hidden /> Best {best} / 300
                </span>
              )}
            </div>
            {error && (
              <p className="text-sm text-destructive">
                Could not load the Moon data ({error}). Check your connection and try again.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ done */
  if (phase === "done") {
    const total = scores.reduce((a, b) => a + b, 0);
    const title =
      total >= 260
        ? "Mission architect"
        : total >= 200
          ? "Lead site planner"
          : total >= 140
            ? "Landing site analyst"
            : "Junior scout";
    return (
      <div className="rounded-[1.75rem] bg-white/[0.03] p-5 ring-1 ring-white/10 sm:p-8">
        <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">Campaign complete</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-heading text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold tracking-tight">{title}</h2>
          <p className="hud text-3xl">
            {total}
            <span className="text-base text-muted-foreground"> / 300</span>
            {newBest && (
              <span className="arcade-pop ms-3 rounded-full bg-warn/15 px-2.5 py-0.5 align-middle text-xs text-warn ring-1 ring-warn/40">
                New best
              </span>
            )}
          </p>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {MISSIONS.map((ms, i) => (
            <li key={ms.title} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
              <p className="text-xs text-muted-foreground">Mission {i + 1}</p>
              <p className="font-heading text-lg font-semibold">{ms.title}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full origin-left rounded-full bg-primary"
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={{ scaleX: (scores[i] ?? 0) / 100 }}
                  transition={{ duration: 0.8, delay: i * 0.15, ease: EASE }}
                />
              </div>
              <p className="mt-1.5 hud text-sm">{scores[i] ?? 0} / 100</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          NASA weighed the same things (slope, sunlight, nearby cold traps, communication with Earth) when it named nine
          Artemis III candidate regions in 2024. Explore every layer yourself, and tune your own weights, on the Moon
          Base Map.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground active:scale-[0.97]"
          >
            <RotateCcw className="size-4" aria-hidden /> Play again
          </button>
          <Link
            href="/bases"
            className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm ring-1 ring-white/15 transition-colors hover:bg-white/5"
          >
            Open the Base Maps <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ play */
  const lensMeta = LENSES.find((l) => l.id === lens);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="relative mx-auto aspect-square w-full max-w-[min(100%,44rem)] overflow-hidden rounded-[1.75rem] bg-[#05070d] ring-1 ring-white/10">
        <div
          ref={mapRef}
          className={cn("absolute inset-0 touch-none", result ? "cursor-default" : "cursor-crosshair")}
          onPointerDown={onMap}
        >
          {/* the source images span ±457 km; scale them so ±300 km fills the frame */}
          {/* eslint-disable-next-line @next/next/no-img-element -- large data image with a computed size */}
          <img
            src="/landing/moon-pole.webp"
            alt="Lunar south pole, shaded relief with cold traps"
            draggable={false}
            className="pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
            style={{ width: IMG_SCALE, height: IMG_SCALE }}
          />
          <AnimatePresence>
            {lensMeta && (
              <motion.img
                key={lensMeta.id}
                src={`${DATA_BASE}/${lensMeta.image}`}
                alt={`${lensMeta.label} data layer`}
                draggable={false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
                style={{ width: IMG_SCALE, height: IMG_SCALE }}
              />
            )}
          </AnimatePresence>
          {lens && !reduce && <span className="scout-sweep pointer-events-none absolute inset-0" aria-hidden />}

          {/* Artemis regions and the best spot appear after you commit */}
          {result &&
            ARTEMIS_REGIONS.map((r) => (
              <span
                key={r.id}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={toPct(r.x, r.y)}
              >
                <span className="block size-2 rounded-full bg-white/80 ring-2 ring-black/60" />
                <span className="absolute top-2.5 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1 font-mono text-[9px] text-white/85">
                  {r.short}
                </span>
              </span>
            ))}
          {result && (
            <>
              <svg
                className="pointer-events-none absolute inset-0 size-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                <motion.line
                  x1={((placed!.x + VIEW_KM) / (2 * VIEW_KM)) * 100}
                  y1={((VIEW_KM - placed!.y) / (2 * VIEW_KM)) * 100}
                  x2={((result.best.x + VIEW_KM) / (2 * VIEW_KM)) * 100}
                  y2={((VIEW_KM - result.best.y) / (2 * VIEW_KM)) * 100}
                  stroke="#fde68a"
                  strokeWidth={0.4}
                  strokeDasharray="1.2 1"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, ease: EASE }}
                />
              </svg>
              <motion.span
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={toPct(result.best.x, result.best.y)}
                initial={reduce ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: "spring", stiffness: 300, damping: 18 }}
              >
                <Star
                  className="size-6 fill-amber-300 text-amber-200 drop-shadow-[0_0_8px_rgb(252_211_77)]"
                  aria-label="Best spot for this mission"
                />
              </motion.span>
            </>
          )}
          {placed && (
            <motion.span
              key={`${placed.x},${placed.y}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
              style={toPct(placed.x, placed.y)}
              initial={reduce ? false : { y: -14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
            >
              <Flag
                className={cn(
                  "size-7 drop-shadow-[0_2px_6px_black]",
                  placed.index === null ? "text-destructive" : "text-primary",
                )}
                fill="currentColor"
                aria-label="Your base"
              />
            </motion.span>
          )}
        </div>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
          0° ↑ · 600 km across
        </span>
        {lensMeta && (
          <span className="pointer-events-none absolute top-3 right-3 max-w-[70%] rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] text-white/85">
            {lensMeta.hint}
          </span>
        )}
        {placed && placed.index === null && !result && (
          <span className="pointer-events-none absolute inset-x-3 top-10 rounded-lg bg-destructive/85 px-3 py-1.5 text-center text-xs text-white">
            No data here. Move inside the area the Diviner model covers.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <ol className="flex gap-1.5" aria-label="Missions">
          {MISSIONS.map((ms, i) => (
            <li
              key={ms.title}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i < mission || (i === mission && result) ? "bg-primary" : i === mission ? "bg-white/50" : "bg-white/15",
              )}
            />
          ))}
        </ol>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mission}
            className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10"
            initial={reduce ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <p className="text-xs text-muted-foreground">
              Mission {mission + 1} of {MISSIONS.length}
            </p>
            <h3 className="font-heading text-xl font-semibold tracking-tight">{m.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{m.brief}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FACTORS.filter((f) => m.weights[f.id] > 0)
                .sort((a, b) => m.weights[b.id] - m.weights[a.id])
                .map((f) => (
                  <span
                    key={f.id}
                    className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-foreground/85 ring-1 ring-white/10"
                  >
                    {f.label}{" "}
                    <span className="text-primary">{"●".repeat(Math.max(1, Math.round(m.weights[f.id])))}</span>
                  </span>
                ))}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
          <p className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ScanLine className="size-3.5" aria-hidden /> Data scans
            </span>
            <span className="hud">
              {SCANS_PER_MISSION - usedLenses.length} of {SCANS_PER_MISSION} left
            </span>
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {LENSES.map((l) => {
              const used = usedLenses.includes(l.id);
              const locked = !used && (usedLenses.length >= SCANS_PER_MISSION || !!result);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => scan(l.id)}
                  disabled={locked}
                  aria-pressed={lens === l.id}
                  className={cn(
                    "rounded-xl px-3 py-2 text-start text-sm ring-1 transition-[background-color,box-shadow,opacity] duration-150",
                    lens === l.id
                      ? "bg-primary/15 text-primary ring-primary/40"
                      : used
                        ? "bg-white/[0.05] ring-white/15"
                        : "ring-white/10 hover:bg-white/[0.06]",
                    locked && "opacity-35",
                  )}
                >
                  {l.label}
                  <span className="block text-[10px] text-muted-foreground">
                    {used ? (lens === l.id ? "showing" : "scanned · tap to show") : "use a scan"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {!result ? (
            <motion.div
              key="place"
              className="flex flex-col gap-2"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />{" "}
                {placed ? "Move the flag or confirm your site." : "Tap the map to place your base."}
              </p>
              <button
                type="button"
                onClick={confirm}
                disabled={!placed || placed.index === null}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity active:scale-[0.98] disabled:opacity-40"
              >
                <Flag className="size-4" aria-hidden /> Build here
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <div className="flex items-baseline justify-between">
                <p
                  className={cn(
                    "font-heading text-xl font-semibold",
                    result.points >= 80 ? "text-ok" : result.points >= 50 ? "text-foreground" : "text-warn",
                  )}
                >
                  {result.points >= 90
                    ? "Excellent site"
                    : result.points >= 70
                      ? "Strong site"
                      : result.points >= 50
                        ? "Workable site"
                        : "Risky site"}
                </p>
                <p className="hud text-2xl">
                  {result.points}
                  <span className="text-sm text-muted-foreground">/100</span>
                </p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Compared with the best spot for this mission (★). Nearest Artemis III region: {result.region.name},{" "}
                {Math.round(result.region.km)} km away.
              </p>
              <ul className="mt-3 grid gap-1.5">
                {breakdown.map(({ factor, score }) => (
                  <li key={factor.id} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{FACTOR_SHORT[factor.id]}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.span
                        className="block h-full origin-left rounded-full bg-primary"
                        initial={reduce ? false : { scaleX: 0 }}
                        animate={{ scaleX: score ?? 0 }}
                        transition={{ duration: 0.6, ease: EASE }}
                      />
                    </span>
                    <span className="text-end hud text-foreground/85">
                      {score === null ? "—" : Math.round(score * 100)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Weighted by this mission ({weightTotal.toFixed(1)} points of priority). Same rules as the Moon Base Map.
              </p>
              <button
                type="button"
                onClick={nextMission}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground active:scale-[0.98]"
              >
                {mission + 1 >= MISSIONS.length ? "Finish campaign" : "Next mission"}{" "}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
