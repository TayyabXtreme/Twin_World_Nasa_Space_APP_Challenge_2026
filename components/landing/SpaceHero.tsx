"use client";

import { ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  AU_KM,
  dateFromDays,
  daysSinceJ2000,
  earthAt,
  formatLightTime,
  LIGHT_SECONDS_PER_AU,
  marsAt,
} from "@/lib/orbits";
import { useBootTask } from "@/lib/boot";
import { solarClock, useSolar } from "@/lib/solar";
import { useExplorer } from "@/lib/store";
import { useQualityTier } from "@/lib/useQualityTier";
import { cn } from "@/lib/utils";
import { SlideWords } from "./Reveal";
import { SolarLabels } from "./SolarLabels";

// three.js loads after the page paints; the same chunk is then cached for the Explore screens.
const SolarScene = dynamic(() => import("./SolarScene"), { ssr: false });

let webglCache: boolean | null = null;
function detectWebGL() {
  if (webglCache === null) {
    try {
      const c = document.createElement("canvas");
      webglCache = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webglCache = false;
    }
  }
  return webglCache;
}
const noopSubscribe = () => () => {};

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Live readings, refreshed a few times a second from the simulation clock (no per-frame renders). */
function TimeHud({ sceneRef }: { sceneRef: React.RefObject<HTMLDivElement | null> }) {
  const running = useSolar((s) => s.running);
  const setRunning = useSolar((s) => s.setRunning);
  const date = useRef<HTMLSpanElement>(null);
  const auEl = useRef<HTMLSpanElement>(null);
  const km = useRef<HTMLSpanElement>(null);
  const light = useRef<HTMLSpanElement>(null);
  const [offToday, setOffToday] = useState(false);

  useEffect(() => {
    const update = () => {
      const d = solarClock.days;
      const e = earthAt(d);
      const m = marsAt(d);
      const au = Math.hypot(m.x - e.x, m.y - e.y);
      const when = dateFmt.format(dateFromDays(d));
      const lt = formatLightTime(au * LIGHT_SECONDS_PER_AU);
      if (date.current) date.current.textContent = when;
      if (auEl.current) auEl.current.textContent = `${au.toFixed(2)} AU`;
      if (km.current) km.current.textContent = `${Math.round((au * AU_KM) / 1e6)}M km`;
      if (light.current) light.current.textContent = lt;
      sceneRef.current?.setAttribute(
        "aria-valuetext",
        `${when}. Earth to Mars ${au.toFixed(2)} AU; light takes ${lt}.`,
      );
      const off = Math.abs(d - solarClock.today) > 0.5;
      setOffToday((prev) => (prev === off ? prev : off));
    };
    update();
    const id = window.setInterval(update, 150);
    return () => window.clearInterval(id);
  }, [sceneRef]);

  // Phones: a small card (three labelled stats, then two full-width buttons). sm and up: one line, as before.
  const label = "text-[9.5px] tracking-[0.14em] text-muted-foreground/80 uppercase sm:sr-only";
  const button =
    "flex h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-foreground ring-1 ring-white/10 transition-[background-color,color,opacity] duration-150 hover:bg-white/10 sm:h-auto sm:rounded-md sm:px-1.5 sm:py-1 sm:ring-0";
  return (
    <div className="pointer-events-auto flex w-full max-w-[24rem] flex-col gap-3 rounded-2xl glass px-3.5 py-3 hud text-xs text-muted-foreground sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-2">
      <dl className="grid grid-cols-3 gap-2 text-center sm:flex sm:items-center sm:gap-4 sm:text-start">
        <div className="flex flex-col gap-1 sm:block">
          <dt className={label}>Date</dt>
          <dd ref={date} className="text-[13px] text-foreground sm:text-xs" />
        </div>
        <div className="flex flex-col gap-1 border-x border-white/10 sm:block sm:border-0">
          <dt className={label}>Earth → Mars</dt>
          <dd>
            <span className="max-sm:hidden">Earth → Mars </span>
            <span ref={auEl} className="text-[13px] text-foreground sm:text-xs" />
            <span className="block text-[10.5px] sm:inline sm:text-xs">
              <span className="max-sm:hidden"> · </span>
              <span ref={km} className="sm:text-foreground" />
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-1 sm:block">
          <dt className={label}>Light delay</dt>
          <dd>
            <span className="max-sm:hidden">light </span>
            <span ref={light} className="text-[13px] text-primary sm:text-xs" />
          </dd>
        </div>
      </dl>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-1 sm:border-s sm:border-border sm:ps-3">
        <button
          type="button"
          onClick={() => setRunning(!running)}
          aria-pressed={running}
          className={cn(button, "max-sm:bg-primary/15 max-sm:text-primary max-sm:ring-primary/30")}
        >
          {running ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          {running ? "Pause" : "Run a year"}
        </button>
        <button
          type="button"
          disabled={!offToday}
          onClick={() => {
            setRunning(false);
            solarClock.days = solarClock.today;
          }}
          className={cn(button, "disabled:opacity-35 max-sm:bg-white/[0.04]")}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Today
        </button>
      </div>
    </div>
  );
}

const EASE = [0.22, 1, 0.36, 1] as const;
const TWIN_WORDS = [
  { word: "Moon", color: "var(--world-moon)" },
  { word: "Mars", color: "var(--world-mars)" },
];

/** "Find the Moon on Earth." with the world word sliding between Moon and Mars; the rest rises in word by word. */
function HeroTitle() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % TWIN_WORDS.length), 2800);
    return () => window.clearInterval(id);
  }, [reduce]);
  const w = TWIN_WORDS[i];
  return (
    <h1
      id="hero-title"
      className="font-heading text-[clamp(2.3rem,10vw,3.2rem)] leading-[1.02] font-semibold tracking-tight lg:text-[clamp(2.8rem,5.8vw,5.4rem)] lg:leading-[0.98]"
    >
      <span className="sr-only">Find the Moon and Mars on Earth.</span>
      <span aria-hidden className="block">
        <SlideWords text="Find the" onMount delay={0.1} />{" "}
        <span className="-mb-[0.12em] inline-grid overflow-hidden pb-[0.12em] align-bottom">
          <AnimatePresence initial={!reduce}>
            <motion.span
              key={w.word}
              className="col-start-1 row-start-1 inline-block"
              style={{ color: w.color, textShadow: `0 0 40px color-mix(in oklch, ${w.color} 45%, transparent)` }}
              initial={{ y: "105%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "-105%", opacity: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: i === 0 ? 0.25 : 0 }}
            >
              {w.word}
            </motion.span>
          </AnimatePresence>
        </span>
        <br />
        <SlideWords text="on Earth." onMount delay={0.35} />
      </span>
    </h1>
  );
}

/** Rises in after the headline (first paint only). */
function Rise({ delay, children, className }: { delay: number; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function SpaceHero() {
  useQualityTier();
  const quality = useExplorer((s) => s.quality);
  const webgl = useSyncExternalStore(noopSubscribe, detectWebGL, () => true);
  const flyTo = useSolar((s) => s.flyTo);
  const setRunning = useSolar((s) => s.setRunning);
  const sceneReady = useSolar((s) => s.ready);
  const sceneProgress = useSolar((s) => s.progress);
  // The launch screen (first visit) and its cover (later visits) wait for the solar system's textures.
  useBootTask("scene", sceneProgress, sceneReady || !webgl, true);
  const sectionRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  // Scrolling away: the headline lifts and fades, the solar system dims behind the next section.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], [0, -180]);
  const textO = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const dim = useTransform(scrollYProgress, [0, 1], [0, 0.7]);
  const cueO = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  // Narrow screens stack the text above the solar system: the scene (and its labels) start where the text ends.
  useEffect(() => {
    const text = textRef.current;
    const section = sectionRef.current;
    if (!text || !section) return;
    const ro = new ResizeObserver(() =>
      section.style.setProperty("--scene-top", `${text.offsetTop + text.offsetHeight - 24}px`),
    );
    ro.observe(text);
    return () => ro.disconnect();
  }, []);

  // Start from today; pause rendering when the hero scrolls out of view.
  useEffect(() => {
    // Coming back from a world: clear the finished flight and wait for the scene again.
    useSolar.setState({ flyTo: null, hovered: null, running: false, ready: false, progress: 0 });
    solarClock.today = daysSinceJ2000(new Date());
    solarClock.days = solarClock.today;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting));
    if (sectionRef.current) io.observe(sectionRef.current);
    return () => io.disconnect();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: 30,
      PageDown: -30,
    };
    if (e.key === "Home") {
      e.preventDefault();
      setRunning(false);
      solarClock.days = solarClock.today;
    } else if (e.key in moves) {
      e.preventDefault();
      setRunning(false);
      solarClock.days += moves[e.key];
    }
  };

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative isolate h-[100svh] min-h-[640px] overflow-hidden bg-[#03050b] lg:min-h-[600px]"
      aria-labelledby="hero-title"
    >
      {/* The 3D solar system (keyboard: arrow keys move through time) */}
      <div
        ref={sceneRef}
        className="absolute inset-0 max-lg:top-[var(--scene-top,0px)] max-lg:bottom-36 sm:max-lg:bottom-24"
        role="slider"
        tabIndex={0}
        aria-label="Solar system. Use the arrow keys to move the planets through time; click a planet label to fly in."
        aria-valuemin={-36525}
        aria-valuemax={36525}
        aria-valuenow={0}
        onKeyDown={onKeyDown}
      >
        {webgl ? (
          <SolarScene quality={quality} active={active} />
        ) : (
          <div
            aria-hidden
            className="size-full bg-cover bg-center opacity-70"
            style={{ backgroundImage: "url(/textures/sky/milky-way-2k.webp)" }}
          />
        )}
      </div>

      {webgl && <SolarLabels hidden={Boolean(flyTo)} />}

      {/* Legibility scrim behind the headline (no panel) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(90deg,rgb(3_5_11/0.85)_0%,rgb(3_5_11/0.45)_32%,transparent_58%)] max-lg:bottom-auto max-lg:h-[calc(var(--scene-top,40%)+4rem)] max-lg:bg-[linear-gradient(180deg,#03050b_0%,#03050b_70%,transparent_100%)]"
      />

      {/* Top bar, same chrome as the Explore screens */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="pointer-events-auto flex items-center gap-2 rounded-xl glass px-3 py-2 font-heading text-sm font-semibold tracking-tight"
        >
          <span className="relative flex size-4 items-center justify-center" aria-hidden>
            <span className="absolute size-4 rounded-full border border-primary/60" />
            <span className="size-1.5 rounded-full bg-primary" />
          </span>
          TwinWorlds
        </Link>
        <nav aria-label="Main" className="pointer-events-auto flex items-center gap-1 rounded-xl glass p-1 text-sm">
          {[
            { href: "/finder", label: "Finder" },
            { href: "/bases", label: "Bases" },
            { href: "/compare", label: "Compare", wide: true },
            { href: "/data", label: "Data Lab", wide: true },
            { href: "/about", label: "About", wide: true },
          ].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              transitionTypes={["warp"]}
              className={cn(
                "rounded-lg px-3 py-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground",
                n.wide && "max-md:hidden",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Headline: text on space, left on wide screens, top on narrow ones */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-20 flex flex-col px-6 transition-opacity duration-500 ease-(--ease-out) sm:px-10 lg:justify-center lg:px-16",
          "pt-24 lg:pt-0",
          flyTo && "opacity-0",
        )}
      >
        <motion.div ref={textRef} className="max-w-2xl" style={{ y: textY, opacity: textO }}>
          <Rise delay={0}>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-muted-foreground ring-1 ring-white/10 backdrop-blur-sm sm:mb-6 sm:text-xs">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                <span className="relative size-2 rounded-full bg-primary" />
              </span>
              <span className="max-sm:hidden">NASA Space Apps 2026 · Moon base &amp; Mars analogues</span>
              <span className="sm:hidden">Space Apps 2026 · Moon &amp; Mars analogues</span>
            </p>
          </Rise>
          <HeroTitle />
          <Rise delay={0.55}>
            <p className="mt-4 max-w-[34rem] text-[0.98rem] leading-relaxed text-pretty text-muted-foreground sm:mt-6 sm:text-lg">
              <span className="max-sm:hidden">
                NASA tests rovers and trains crews in deserts, dry valleys and lava fields that resemble other
                worlds.{" "}
              </span>
              TwinWorlds searches all of Earth for the next Moon and Mars analogue, with real mission data.{" "}
              <span className="text-foreground max-lg:hidden">Click a planet to fly in.</span>
            </p>
          </Rise>
          <Rise delay={0.7} className="pointer-events-auto mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
            <Button asChild size="lg" className="h-12 rounded-xl px-6 shadow-[0_0_40px_-8px_var(--primary)]">
              <Link href="/finder" transitionTypes={["warp"]}>
                Find Earth&apos;s twin <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="h-12 rounded-xl bg-white/[0.05] px-5 text-foreground ring-1 ring-white/15 backdrop-blur-sm hover:bg-white/10 max-sm:hidden"
            >
              <a href="#journey">See where to go</a>
            </Button>
          </Rise>
        </motion.div>
      </div>

      {/* Dims the solar system as the hero scrolls away. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[25] bg-[#03050b]"
        style={{ opacity: dim }}
      />

      {/* Scroll cue (wide screens; phones have the time controls there). */}
      <motion.a
        href="#journey"
        style={{ opacity: cueO }}
        className={cn(
          "absolute end-8 bottom-8 z-30 hidden flex-col items-center gap-2.5 text-[11px] tracking-[0.18em] text-muted-foreground uppercase no-underline transition-colors hover:text-foreground lg:flex",
          flyTo && "pointer-events-none opacity-0",
        )}
      >
        <span className="flex h-9 w-5.5 justify-center rounded-full border border-white/30 pt-1.5" aria-hidden>
          <span className="hero-cue-dot block size-1 rounded-full bg-primary" />
        </span>
        Scroll
      </motion.a>

      {/* Time controls */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-3 transition-opacity duration-500",
          flyTo && "opacity-0",
        )}
      >
        <TimeHud sceneRef={sceneRef} />
      </div>
    </section>
  );
}
