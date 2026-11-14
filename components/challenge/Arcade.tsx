"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { Morph } from "@/components/motion/PageTransition";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";
import { readBest, writeBest } from "./best";
import { createInput, renderOnce, runGame, type Game, type HudItem, type Result, type Tone } from "./engine";
import { createLaunchWindow } from "./games/launchWindow";
import { createSampleRun } from "./games/sampleRun";
import { createTouchdown, type LandWorld } from "./games/touchdown";
import { GuessGame } from "./GuessGame";
import { ScoutGame } from "./ScoutGame";
import { sfx } from "./sfx";
import { useRoviHandler } from "@/lib/rovi/handlers";
import "./challenge.css";

type GameId = "launch" | "land" | "rover";
type MissionId = "guess" | "scout" | GameId;

const GAMES: Record<
  GameId,
  {
    name: string;
    line: string;
    goal: string;
    controls: [string, string][];
    keys: ("left" | "right" | "up" | "down" | "action")[];
  }
> = {
  launch: {
    name: "Launch Window",
    line: "Fly a crew ship from Earth to Mars",
    goal: "Wait for the moment Mars is in the right place, launch, then fire your capture burn as you arrive.",
    controls: [
      ["↑ / ↓", "Speed up or slow down time"],
      ["Space", "Launch, then capture burn"],
    ],
    keys: ["up", "down", "action"],
  },
  land: {
    name: "Touchdown",
    line: "Land softly on the Moon or Mars",
    goal: "Cancel your fall and your drift, stay upright and set down on the lit pad slower than the safe limits.",
    controls: [
      ["← / →", "Tilt the lander"],
      ["↑ or Space", "Fire the engine"],
    ],
    keys: ["left", "right", "up"],
  },
  rover: {
    name: "Sample Run",
    line: "Drive a solar rover across Mars",
    goal: "Steer round rocks and soft sand, stop over glowing targets to drill samples, and keep the battery alive.",
    controls: [
      ["← / →", "Steer"],
      ["↑ / ↓", "Faster / slow down to drill"],
    ],
    keys: ["left", "right", "up", "down"],
  },
};

const TONE: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-destructive",
  info: "text-foreground",
};
const BAR: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-destructive", info: "bg-primary" };

function Hud({ items }: { items: HudItem[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap gap-1.5 sm:inset-x-3 sm:top-3 sm:gap-2">
      {items.map((h) => (
        <div key={h.label} className="rounded-lg glass px-2 py-1 sm:min-w-[5.5rem] sm:rounded-xl sm:px-3 sm:py-1.5">
          <div className="hidden text-[10px] tracking-wide text-muted-foreground sm:block">{h.label}</div>
          <div className={cn("hud text-[11px] leading-tight sm:text-sm", TONE[h.tone ?? "info"])}>
            <span className="text-muted-foreground sm:hidden">{h.label} </span>
            {h.value}
          </div>
          {h.meter !== undefined && (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn("h-full rounded-full transition-[width] duration-200", BAR[h.tone ?? "info"])}
                style={{ width: `${Math.max(0, Math.min(1, h.meter)) * 100}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type Key = (typeof GAMES)[GameId]["keys"][number];

function TouchPad({ keys, onKey }: { keys: Key[]; onKey: (k: Key, on: boolean) => void }) {
  const icon = { left: ArrowLeft, right: ArrowRight, up: ArrowUp, down: ArrowDown, action: Play };
  const btn = (k: Key) => {
    const Icon = icon[k];
    return (
      <button
        key={k}
        type="button"
        aria-label={k}
        className="flex size-11 items-center justify-center rounded-xl glass text-foreground active:scale-95 active:bg-white/15 sm:size-14 sm:rounded-2xl"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onKey(k, true);
        }}
        onPointerUp={() => onKey(k, false)}
        onPointerCancel={() => onKey(k, false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Icon className="size-6" aria-hidden />
      </button>
    );
  };
  const steer = keys.filter((k) => k === "left" || k === "right");
  const other = keys.filter((k) => k !== "left" && k !== "right");
  return (
    <div className="touch-pad pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between">
      <div className="pointer-events-auto flex gap-2">{steer.map(btn)}</div>
      <div className="pointer-events-auto flex gap-2">{other.map(btn)}</div>
    </div>
  );
}

/* ---------- Stage ---------- */

type Phase = "menu" | "playing" | "paused" | "over";

function Stage({ id, onNext }: { id: GameId; onNext: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const input = useRef(createInput());
  const [phase, setPhase] = useState<Phase>("menu");
  const [world, setWorld] = useState<LandWorld>("moon");
  const [hud, setHud] = useState<HudItem[]>([]);
  const [banner, setBanner] = useState<{ text: string; tone: Tone } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const soundOn = useExplorer((s) => s.soundOn);
  const toggleSound = useExplorer((s) => s.toggleSound);
  const meta = GAMES[id];

  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the stored record once per game, after hydration
  useEffect(() => setBest(readBest(id)), [id]);
  useEffect(() => input.current.attach(), []);

  const loop = useCallback(() => {
    const g = game.current;
    if (!g || !canvas.current) return;
    let tick = 0;
    stop.current = runGame(canvas.current, g, input.current, () => {
      // React only re-renders the HUD ~8 times a second; the canvas runs at full rate.
      if ((tick = (tick + 1) % 8) === 0) {
        setHud(g.hud());
        setBanner(g.banner());
      }
      const r = g.result;
      if (r) {
        sfx.stopEngine();
        setResult(r);
        setHud(g.hud());
        const prev = readBest(id);
        if (r.score > prev) writeBest(id, r.score);
        setNewBest(r.score > prev && prev > 0);
        setBest(Math.max(prev, r.score));
        setPhase("over");
      }
    });
  }, [id]);

  const start = useCallback(() => {
    sfx.unlock();
    stop.current?.();
    input.current.clear();
    game.current = id === "launch" ? createLaunchWindow() : id === "land" ? createTouchdown(world) : createSampleRun();
    setResult(null);
    setNewBest(false);
    setPhase("playing");
  }, [id, world]);

  // Behind the start screen: a still frame of the real game, so you see what you're about to fly.
  useEffect(() => {
    if (phase !== "menu" || !canvas.current) return;
    const preview = id === "launch" ? createLaunchWindow() : id === "land" ? createTouchdown(world) : createSampleRun();
    const el = canvas.current;
    const draw = () => renderOnce(el, preview);
    draw();
    // Textures arrive a moment later; redraw a few times, then on resize.
    const timers = [150, 500, 1200].map((ms) => window.setTimeout(draw, ms));
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => {
      timers.forEach(clearTimeout);
      ro.disconnect();
    };
  }, [phase, id, world]);

  // Start the loop once the canvas for the playing phase is mounted.
  useEffect(() => {
    if (phase === "playing") loop();
    return () => {
      if (phase === "playing") {
        stop.current?.();
        sfx.stopEngine();
      }
    };
  }, [phase, loop]);

  // Space starts from the menu or the results; P / Escape pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName)) return;
      if ((phase === "menu" || phase === "over") && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        start();
      } else if (phase === "playing" && (e.code === "KeyP" || e.code === "Escape")) setPhase("paused");
      else if (phase === "paused" && (e.code === "KeyP" || e.code === "Escape" || e.code === "Space")) {
        e.preventDefault();
        setPhase("playing");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, start]);

  // Leaving the page or switching games stops everything.
  useEffect(
    () => () => {
      stop.current?.();
      sfx.stopEngine();
    },
    [],
  );

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[1.75rem] bg-[#03050b] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)] ring-1 ring-white/10">
      <canvas ref={canvas} className="absolute inset-0 size-full" aria-label={`${meta.name} game`} />

      {(phase === "playing" || phase === "paused") && (
        <>
          <Hud items={hud} />
          <div className="absolute end-3 bottom-3 z-10 flex gap-2 sm:top-3 sm:bottom-auto">
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? "Mute" : "Sound on"}
              className="flex size-9 items-center justify-center rounded-xl glass"
            >
              {soundOn ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => setPhase(phase === "paused" ? "playing" : "paused")}
              aria-label={phase === "paused" ? "Resume" : "Pause"}
              className="flex size-9 items-center justify-center rounded-xl glass"
            >
              {phase === "paused" ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
            </button>
          </div>
          <AnimatePresence>
            {banner && phase === "playing" && (
              <motion.p
                key={banner.text}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className={cn(
                  "pointer-events-none absolute bottom-20 left-1/2 max-w-[90%] -translate-x-1/2 rounded-full glass px-4 py-1.5 text-center text-xs sm:bottom-5 sm:text-sm",
                  TONE[banner.tone],
                )}
                role="status"
              >
                {banner.text}
              </motion.p>
            )}
          </AnimatePresence>
          <TouchPad keys={meta.keys} onKey={(k, on) => input.current.set(k, on)} />
        </>
      )}

      <AnimatePresence>
        {phase === "menu" && (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,5,11,0.92)_0%,rgba(3,5,11,0.6)_42%,rgba(3,5,11,0.05)_75%)]" />
            <div className="relative flex h-full max-w-xl flex-col justify-center gap-4 p-6 sm:p-10">
              <h2 className="arcade-rise font-heading text-[clamp(1.8rem,4vw,3rem)] leading-none font-semibold tracking-tight">
                {meta.name}
              </h2>
              <p className="arcade-rise text-sm text-foreground/85 [--i:1] sm:text-base">{meta.goal}</p>
              {id === "land" && (
                <div role="radiogroup" aria-label="World" className="arcade-rise flex gap-2 [--i:2]">
                  {(["moon", "mars"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={world === w}
                      onClick={() => setWorld(w)}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-sm ring-1 transition-colors",
                        world === w
                          ? "bg-primary/15 text-primary ring-primary/50"
                          : "text-muted-foreground ring-white/15 hover:text-foreground",
                      )}
                    >
                      {w === "moon" ? "Moon · 1.62 m/s²" : "Mars · 3.71 m/s² + wind"}
                    </button>
                  ))}
                </div>
              )}
              <dl className="arcade-rise hidden gap-1.5 text-sm [--i:3] sm:grid">
                {meta.controls.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3">
                    <dt className="min-w-[5.5rem] rounded-md bg-white/10 px-2 py-0.5 text-center hud text-xs">{k}</dt>
                    <dd className="text-muted-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="arcade-rise mt-2 flex flex-wrap items-center gap-3 [--i:4]">
                <button
                  type="button"
                  onClick={start}
                  className="arcade-start flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-transform active:scale-[0.97]"
                >
                  <Play className="size-4" aria-hidden /> Start mission
                </button>
                {best > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Trophy className="size-4 text-warn" aria-hidden /> Best {best}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {phase === "paused" && (
          <motion.div
            key="paused"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/55 backdrop-blur-sm"
          >
            <p className="font-heading text-3xl font-semibold">Paused</p>
            <button
              type="button"
              onClick={() => setPhase("playing")}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-primary-foreground"
            >
              <Play className="size-4" aria-hidden /> Resume
            </button>
          </motion.div>
        )}

        {phase === "over" && result && (
          <motion.div
            key="over"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 overflow-y-auto bg-[rgba(3,5,11,0.82)] backdrop-blur-[6px]"
          >
            <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-4 p-6 sm:p-10">
              <div className="arcade-rise flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2
                  className={cn(
                    "font-heading text-[clamp(1.6rem,3.4vw,2.6rem)] leading-tight font-semibold tracking-tight",
                    result.won ? "text-ok" : "text-warn",
                  )}
                >
                  {result.title}
                </h2>
                <span className="hud text-2xl">{result.score}</span>
                {newBest && (
                  <span className="arcade-pop rounded-full bg-warn/15 px-2.5 py-0.5 text-xs text-warn ring-1 ring-warn/40">
                    New best
                  </span>
                )}
              </div>
              <p className="arcade-rise text-sm text-foreground/85 [--i:1]">{result.detail}</p>
              <div className="arcade-rise grid gap-2.5 [--i:2]">
                <p className="text-sm font-medium text-foreground/90">What just happened, for real</p>
                {result.facts.map((f) => (
                  <div key={f.text} className="rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/10">
                    <p className="text-sm leading-relaxed">{f.text}</p>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      {f.source} <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </div>
                ))}
              </div>
              <div className="arcade-rise mt-1 flex flex-wrap gap-3 [--i:3]">
                <button
                  type="button"
                  onClick={start}
                  className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground active:scale-[0.97]"
                >
                  <RotateCcw className="size-4" aria-hidden /> Fly again
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  className="rounded-full px-5 py-2.5 text-sm ring-1 ring-white/15 transition-colors hover:bg-white/5"
                >
                  Next game
                </button>
                {best > 0 && (
                  <span className="flex items-center gap-1.5 self-center text-sm text-muted-foreground">
                    <Trophy className="size-4 text-warn" aria-hidden /> Best {best}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Mission hub ---------- */

type Tag = "Analogues" | "Moon base" | "Mars" | "Spaceflight";
const TAG_STYLE: Record<Tag, string> = {
  Analogues: "bg-black/55 text-primary ring-primary/40",
  "Moon base": "bg-black/55 text-[var(--world-moon)] ring-[var(--world-moon)]/40",
  Mars: "bg-black/55 text-[var(--world-mars)] ring-[var(--world-mars)]/45",
  Spaceflight: "bg-black/55 text-[var(--world-earth)] ring-[var(--world-earth)]/40",
};

const MISSIONS: {
  id: MissionId;
  name: string;
  line: string;
  tag: Tag;
  minutes: number;
  image: string;
  isNew?: boolean;
  bestOf?: string;
}[] = [
  {
    id: "guess",
    name: "Earth or Elsewhere?",
    line: "Ten real photos. Earth, the Moon or Mars? Analogue sites are built to fool you.",
    tag: "Analogues",
    minutes: 2,
    image: "card-guess",
    isNew: true,
  },
  {
    id: "scout",
    name: "Moon Base Scout",
    line: "Pick base sites at the lunar south pole with real LRO data, three missions.",
    tag: "Moon base",
    minutes: 4,
    image: "card-scout",
    isNew: true,
    bestOf: " / 300",
  },
  {
    id: "land",
    name: "Touchdown",
    line: "Land softly on the Moon or on Mars, in real gravity and wind.",
    tag: "Moon base",
    minutes: 2,
    image: "card-touchdown",
  },
  {
    id: "rover",
    name: "Sample Run",
    line: "Drive a solar rover through rocks and dust, drill samples, save the battery.",
    tag: "Mars",
    minutes: 3,
    image: "card-rover",
  },
  {
    id: "launch",
    name: "Launch Window",
    line: "Time a crew launch to Mars and nail the capture burn.",
    tag: "Spaceflight",
    minutes: 3,
    image: "card-launch",
  },
];

function MissionCard({
  m,
  on,
  best,
  onPick,
  wide,
}: {
  m: (typeof MISSIONS)[number];
  on: boolean;
  best: number;
  onPick: () => void;
  wide: boolean;
}) {
  const photo = (
    <span className="absolute inset-0 -z-20 overflow-hidden">
      <Image
        src={`/photos/challenge/${m.image}.webp`}
        alt=""
        fill
        sizes={wide ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 33vw, 100vw"}
        className="object-cover transition-transform duration-[1200ms] ease-[var(--ease-out)] group-hover:scale-[1.06]"
      />
    </span>
  );
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn(
        "group relative isolate flex min-h-44 w-full flex-col justify-end overflow-hidden rounded-[1.4rem] p-4 text-start ring-1 transition-[box-shadow,transform] duration-300 active:scale-[0.985] sm:p-5",
        wide ? "sm:min-h-60" : "sm:min-h-52",
        on
          ? "shadow-[0_0_0_4px_oklch(0.85_0.14_190/0.12),0_30px_60px_-30px_oklch(0.6_0.15_200/0.6)] ring-2 ring-primary"
          : "ring-white/10 hover:ring-white/25",
      )}
    >
      {/* While this mission is not playing, its photo carries the morph name; picking it hands the name to the
          game stage, so the photo grows into the stage (Arcade below). */}
      {on ? photo : <Morph name={`mission-${m.id}`}>{photo}</Morph>}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(3_5_11/0.15)_0%,rgb(3_5_11/0.55)_45%,rgb(3_5_11/0.94)_100%)]"
      />
      <span className="absolute top-3 left-3 flex flex-wrap gap-1.5 sm:top-4 sm:left-4">
        <span
          className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 backdrop-blur-sm", TAG_STYLE[m.tag])}
        >
          {m.tag}
        </span>
        {m.isNew && (
          <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-warn ring-1 ring-warn/45 backdrop-blur-sm">
            New
          </span>
        )}
      </span>
      {on && (
        <span className="absolute top-3 right-3 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground sm:top-4 sm:right-4">
          Playing
        </span>
      )}
      <span className={cn("block font-heading font-semibold tracking-tight", wide ? "text-2xl" : "text-xl")}>
        {m.name}
      </span>
      <span className="mt-1 block max-w-[46ch] text-[13px] leading-snug text-foreground/80">{m.line}</span>
      <span className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3" aria-hidden /> {m.minutes} min
        </span>
        {best > 0 && (
          <span className="flex items-center gap-1">
            <Trophy className="size-3 text-warn" aria-hidden /> Best {best}
            {m.bestOf ?? ""}
          </span>
        )}
      </span>
    </button>
  );
}

const readAll = (): Record<MissionId, number> => ({
  guess: readBest("guess"),
  scout: readBest("scout"),
  land: readBest("land"),
  rover: readBest("rover"),
  launch: readBest("launch"),
});

export function Arcade() {
  const [id, setId] = useState<MissionId>("guess");
  const [bests, setBests] = useState<Record<MissionId, number>>({ guess: 0, scout: 0, land: 0, rover: 0, launch: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const order = MISSIONS.map((m) => m.id);

  // Records are per browser; refresh them whenever the player switches mission (a finished game may have set one).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read localStorage after hydration
  useEffect(() => setBests(readAll()), [id]);

  const pick = (m: MissionId) => {
    // A transition, so React runs the view transition: the card photo morphs into the stage.
    startTransition(() => setId(m));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Scroll once the morph has landed; scrolling under a running view transition makes the page jump at the end.
    window.setTimeout(() => stageRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), reduce ? 0 : 500);
  };
  const played = Object.values(bests).filter((b) => b > 0).length;

  // Rovi can pick a mission (it then presses Start itself); undo returns to the previous one, stopping the game.
  const [round, setRound] = useState(0);
  useRoviHandler("challenge", ({ mission }: { mission: MissionId }) => {
    const prev = id;
    if (mission !== id) pick(mission);
    else stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return () => {
      startTransition(() => {
        setId(prev);
        setRound((r) => r + 1);
      });
    };
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span>
          <span className="hud text-foreground">{played}</span> of {MISSIONS.length} missions flown
        </span>
        <span className="flex items-center gap-1.5">
          <Trophy className="size-3.5 text-warn" aria-hidden /> Best scores are saved in this browser
        </span>
      </div>
      <div role="radiogroup" aria-label="Choose a mission" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {MISSIONS.map((m, i) => (
          <div
            key={m.id}
            className={cn("flex", i < 2 ? "lg:col-span-3" : "lg:col-span-2", i === 4 && "sm:col-span-2 lg:col-span-2")}
          >
            <MissionCard m={m} on={m.id === id} best={bests[m.id]} onPick={() => pick(m.id)} wide={i < 2} />
          </div>
        ))}
      </div>

      <div ref={stageRef} id="challenge-stage" className="mt-8 scroll-mt-24">
        <Morph key={id} name={`mission-${id}`}>
          <div key={round}>
            {id === "guess" ? (
              <GuessGame />
            ) : id === "scout" ? (
              <ScoutGame />
            ) : (
              <>
                <Stage id={id} onNext={() => pick(order[(order.indexOf(id) + 1) % order.length])} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Keyboard: arrow keys or WASD, Space to act, P to pause. On a phone, use the on-screen buttons
                  <span className="sm:hidden"> and turn it sideways for a bigger view</span>. Turn sound on with the
                  speaker button.
                </p>
              </>
            )}
          </div>
        </Morph>
      </div>
    </div>
  );
}
