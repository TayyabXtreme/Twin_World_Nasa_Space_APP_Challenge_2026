"use client";

import { ArrowLeftRight, ArrowRight, Check, ChevronsLeftRight, ExternalLink, Hand, Rocket, ScanSearch, TriangleAlert } from "lucide-react";
import { animate, motionValue, useInView as useMotionInView, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EvidenceTag } from "@/components/site/EvidenceTag";
import { Conditions } from "./Conditions";
import { MissionScore } from "@/components/score/MissionScore";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select";
import { playCue } from "@/lib/audio";
import landing from "@/lib/data/landing.generated.json";
import { hardwareForPair } from "@/lib/data/hardware";
import { SITES, siteById } from "@/lib/data/sites";
import { sourceById } from "@/lib/data/sources";
import { tagLabel, tagOverlap } from "@/lib/data/tags";
import { NASA_TWINS, TWINS } from "@/lib/data/twins";
import type { Site, TwinLink } from "@/lib/data/types";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";
import { WORLD_CONFIG, type World } from "@/lib/worlds";
import "./compare.css";
import { Morph } from "@/components/motion/PageTransition";

const EARTH_SITES = SITES.filter((s) => s.world === "earth");
const OTHER_SITES = SITES.filter((s) => s.world !== "earth");
const DOT: Record<World, string> = { earth: "bg-earth", moon: "bg-moon", mars: "bg-mars" };
const TEXT: Record<World, string> = { earth: "text-earth", moon: "text-moon", mars: "text-mars" };
const TINT: Record<World, string> = { earth: "#5aa2ff", moon: "#cfd6e2", mars: "#ff8a5c" };

const texture = (w: World) => (w === "earth" ? "/textures/earth/day-1k.webp" : `/textures/${w}/color-1k.webp`);

/** Small round picture of a site: its photo thumbnail, or a textured globe of its world when we have no photo. */
function SiteThumb({ site, sizes, className }: { site: Site; sizes: string; className?: string }) {
  return (
    <span className={cn("relative block overflow-hidden bg-white/5", className)}>
      {site.image ? (
        <Image
          src={site.image.src.replace(/\.webp$/, ".thumb.webp")}
          alt=""
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <span
          className="css-planet absolute inset-[12%] rounded-full"
          style={{ backgroundImage: `url(${texture(site.world)})` }}
        />
      )}
    </span>
  );
}

// three.js loads only after first paint; the CSS planets hold the stage until then (and stay if WebGL is missing).
const TransferStage = dynamic(() => import("./TransferStage"), { ssr: false, loading: () => null });
const HardwareViewer = dynamic(() => import("./HardwareViewer"), { ssr: false, loading: () => null });

function useInView<T extends Element>(rootMargin = "0px", once = false) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, once]);
  return [ref, inView] as const;
}

let webglSupport: boolean | undefined;
function probeWebGL() {
  if (webglSupport === undefined) {
    try {
      const c = document.createElement("canvas");
      webglSupport = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}
const noSubscribe = () => () => {};
/** null on the server and during hydration, then whether this browser can draw WebGL. */
const useWebGL = () => useSyncExternalStore<boolean | null>(noSubscribe, probeWebGL, () => null);

/* ---------- Pair strip ---------- */

function PairStrip({ a, b, onPick }: { a: Site; b: Site; onPick: (earthId: string, otherId: string) => void }) {
  return (
    <nav
      aria-label="NASA analogue pairs"
      className="compare-strip -mx-4 mt-7 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0"
    >
      <ul className="flex w-max gap-2.5">
        {NASA_TWINS.map((t) => {
          const e = siteById(t.earthId)!;
          const o = siteById(t.otherId)!;
          const active = t.earthId === a.id && t.otherId === b.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.earthId, t.otherId)}
                aria-pressed={active}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl py-2 ps-2 pe-4 text-start ring-1 transition-[background-color,box-shadow,transform] duration-200 ease-[var(--ease-out)] active:scale-[0.97]",
                  active
                    ? "bg-primary/10 ring-primary/55"
                    : "bg-white/[0.035] ring-white/10 hover:bg-white/[0.07] hover:ring-white/20",
                )}
              >
                <span className="flex shrink-0" aria-hidden>
                  {[e, o].map((s, i) => (
                    <SiteThumb
                      key={s.id}
                      site={s}
                      sizes="36px"
                      className={cn("size-9 rounded-full ring-2 ring-background", i === 1 && "-ms-3")}
                    />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm leading-tight font-medium">{e.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ArrowLeftRight className="size-3" aria-hidden />
                    <span className={cn("size-1.5 rounded-full", DOT[o.world])} aria-hidden />
                    {o.name}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---------- Transfer stage ---------- */

function CssPlanet({ world, className }: { world: World; className: string }) {
  return (
    <span
      aria-hidden
      className={cn("css-planet absolute rounded-full", `css-planet-${world}`, className)}
      style={{ backgroundImage: `url(${texture(world)})` }}
    />
  );
}

function Stage({ a, b, twin, overlapPct }: { a: Site; b: Site; twin?: TwinLink; overlapPct: number }) {
  const [ref, inView] = useInView<HTMLDivElement>("100px");
  const webgl = useWebGL();
  const [sceneReady, setSceneReady] = useState(false);
  const target = b.world as "moon" | "mars";
  const pairKey = `${a.id}:${b.id}`;

  return (
    <section aria-labelledby="pair-title" className="relative mt-5">
      <div
        ref={ref}
        className="compare-stage relative h-[15.5rem] overflow-hidden rounded-[2rem] ring-1 ring-white/10 sm:h-[22rem] md:h-[clamp(25rem,44vw,36rem)]"
      >
        {/* CSS planets hold the stage until the 3D textures are in (and stay when WebGL is missing). */}
        <div aria-hidden className={cn("absolute inset-0 transition-opacity duration-700", sceneReady && "opacity-0")}>
          <CssPlanet world="earth" className="top-[57%] left-[17%] aspect-square h-[50%] -translate-1/2" />
          <CssPlanet
            world={b.world}
            className={cn(
              "top-[57%] left-[83%] aspect-square -translate-1/2",
              b.world === "moon" ? "h-[31%]" : "h-[38%]",
            )}
          />
        </div>
        {webgl && (
          <div
            className={cn("absolute inset-0 transition-opacity duration-700", sceneReady ? "opacity-100" : "opacity-0")}
          >
            <TransferStage target={target} flightKey={pairKey} active={inView} onReady={() => setSceneReady(true)} />
          </div>
        )}

        {/* World labels under each body */}
        {[a, b].map((s, i) => (
          <p
            key={s.world}
            className={cn(
              "pointer-events-none absolute bottom-3 w-[34%] -translate-x-1/2 text-center sm:bottom-5",
              i === 0 ? "left-[17%]" : "left-[83%]",
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center gap-1.5 text-[11px] font-medium tracking-wide uppercase sm:text-xs",
                TEXT[s.world],
              )}
            >
              <span className={cn("size-1.5 rounded-full", DOT[s.world])} aria-hidden />
              {WORLD_CONFIG[s.world].name}
            </span>
            <span key={s.id} className="compare-rise mt-0.5 block truncate text-xs text-foreground/80 sm:text-sm">
              {s.name}
            </span>
          </p>
        ))}
        <p className="pointer-events-none absolute end-4 top-3.5 text-[11px] text-muted-foreground">
          Sizes and distances not to scale
        </p>
      </div>

      {/* The shared feature: centred between the planets on wide screens, under the stage on phones. */}
      <div
        key={pairKey}
        className="mt-5 text-center md:pointer-events-none md:absolute md:inset-x-0 md:top-[57%] md:mt-0 md:-translate-y-1/2"
      >
        <div className="mx-auto max-w-md px-2 md:max-w-[min(30rem,38%)]">
          <h2
            id="pair-title"
            className="compare-rise font-heading text-[clamp(1.4rem,2.3vw,2.15rem)] leading-[1.12] font-semibold tracking-tight text-balance"
          >
            {twin ? twin.feature : "A pair NASA does not name"}
          </h2>
          <p className="compare-rise mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground [--d:90ms] md:pointer-events-auto">
            <EvidenceTag evidence={twin ? "confirmed" : "estimate"} />
            <span>{twin ? "NASA-named analogue pair" : "Matched on shared features only"}</span>
            {overlapPct > 0 && <span className="hud text-foreground">{overlapPct}% feature overlap</span>}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Site wipe ---------- */

function SitePicker({
  site,
  options,
  onChange,
  label,
  align,
}: {
  site: Site;
  options: Site[];
  onChange: (id: string) => void;
  label: string;
  align: "start" | "end";
}) {
  const groups = (["earth", "moon", "mars"] as const).filter((w) => options.some((o) => o.world === w));
  return (
    <div className={cn("flex min-w-0 items-center gap-3", align === "end" && "flex-row-reverse")}>
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <span className={cn("size-2 shrink-0 rounded-full", DOT[site.world])} aria-hidden />
        <span className="truncate">
          <span className="font-medium text-foreground">{WORLD_CONFIG[site.world].name}</span> · {label}
        </span>
      </span>
      <Select value={site.id} onValueChange={onChange}>
        <SelectTrigger
          aria-label={`${label}: ${site.name}. Choose another`}
          className="h-9! shrink-0 gap-2 rounded-xl border-white/12 bg-white/[0.05] ps-3 pe-2.5 text-[13px] font-medium text-foreground transition-[background-color,border-color,scale] duration-150 ease-out hover:border-white/25 hover:bg-white/[0.09] motion-safe:active:scale-[0.96]"
        >
          <ArrowLeftRight className="size-3.5" aria-hidden />
          Change
        </SelectTrigger>
        <SelectContent position="popper" align={align}>
          {groups.map((w) => (
            <SelectGroup key={w}>
              <SelectLabel>{WORLD_CONFIG[w].name}</SelectLabel>
              {options
                .filter((o) => o.world === w)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A site's photo filling its layer, or its world's surface map when we have no photo yet. */
function SitePhoto({ site }: { site: Site }) {
  return site.image ? (
    <Image
      key={`photo-${site.id}`}
      src={site.image.src}
      alt={site.image.alt}
      fill
      sizes="(min-width: 1280px) 1200px, 100vw"
      draggable={false}
      className="compare-reveal object-cover"
    />
  ) : (
    <div
      key={`map-${site.id}`}
      aria-hidden
      className="compare-reveal absolute inset-0 bg-cover bg-center opacity-50"
      style={{ backgroundImage: `url(${texture(site.world)})` }}
    />
  );
}

/** Drag the divider to reveal the Earth site over its Moon or Mars twin. Works with pointer and arrow keys. */
function SiteWipe({ a, b, onA, onB }: { a: Site; b: Site; onA: (id: string) => void; onB: (id: string) => void }) {
  const [pos, setPos] = useState(50);
  const [dragged, setDragged] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const inView = useMotionInView(frame, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();

  // A new pair starts centred again.
  const pairKey = `${a.id}:${b.id}`;
  const [shownPair, setShownPair] = useState(pairKey);
  if (shownPair !== pairKey) {
    setShownPair(pairKey);
    setPos(50);
  }

  // First time the frame is properly on screen, the divider sweeps once to show it can be dragged.
  useEffect(() => {
    if (!inView || reduce || dragged) return;
    const mv = motionValue(50);
    const off = mv.on("change", (v) => setPos(v));
    const c = animate(mv, [50, 28, 72, 50], { duration: 2.2, ease: "easeInOut" });
    return () => {
      c.stop();
      off();
    };
  }, [inView, reduce, dragged]);

  const moveTo = (clientX: number) => {
    // Grabbing the frame ends the hint sweep (the effect's cleanup runs once `dragged` is set below).
    const r = frame.current!.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
    setDragged(true);
  };

  const caption = "compare-rise font-heading text-[clamp(1.15rem,2.4vw,2.1rem)] leading-tight font-semibold tracking-tight";
  const noPhoto = "pointer-events-none absolute top-3 rounded-full glass px-3 py-1 text-xs text-muted-foreground transition-opacity duration-200";

  return (
    <article className="mt-8 overflow-hidden rounded-[1.6rem] bg-white/[0.03] ring-1 ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-white/[0.07] px-4 py-3">
        <SitePicker site={a} options={EARTH_SITES} onChange={onA} label="Analogue site" align="start" />
        <SitePicker site={b} options={OTHER_SITES} onChange={onB} label="Target site" align="end" />
      </div>

      <div
        ref={frame}
        className="relative aspect-[4/3] touch-pan-y overflow-hidden bg-white/5 select-none sm:aspect-[16/9]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && moveTo(e.clientX)}
      >
        <div className="absolute inset-0">
          <SitePhoto site={b} />
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <SitePhoto site={a} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,oklch(0.1_0.015_265/0.9),oklch(0.1_0.015_265/0.15)_38%,transparent_60%)]"
        />

        <div
          key={`cap-a-${a.id}`}
          className="pointer-events-none absolute bottom-0 left-0 max-w-[48%] p-4 transition-opacity duration-200 sm:p-5"
          style={{ opacity: pos < 18 ? 0 : 1 }}
        >
          <h3 className={caption}>{a.name}</h3>
          <p className="compare-rise mt-0.5 text-xs text-foreground/75 [--d:60ms] sm:text-sm">{a.region}</p>
        </div>
        <div
          key={`cap-b-${b.id}`}
          className="pointer-events-none absolute right-0 bottom-0 max-w-[48%] p-4 text-end transition-opacity duration-200 sm:p-5"
          style={{ opacity: pos > 82 ? 0 : 1 }}
        >
          <h3 className={caption}>{b.name}</h3>
          <p className="compare-rise mt-0.5 text-xs text-foreground/75 [--d:60ms] sm:text-sm">{b.region}</p>
        </div>

        {!a.image && (
          <p className={cn(noPhoto, "left-3")} style={{ opacity: pos < 30 ? 0 : 1 }}>
            No site photo yet · {WORLD_CONFIG[a.world].name} surface map
          </p>
        )}
        {!b.image && (
          <p className={cn(noPhoto, "right-3")} style={{ opacity: pos > 70 ? 0 : 1 }}>
            No site photo yet · {WORLD_CONFIG[b.world].name} surface map
          </p>
        )}

        {/* Divider: a lit seam with a handle that pings until someone drags it */}
        <div className="absolute inset-y-0 w-px bg-white shadow-[0_0_14px_2px_rgba(127,227,224,0.55)]" style={{ left: `${pos}%` }}>
          <button
            type="button"
            role="slider"
            aria-label={`Reveal ${a.name} or ${b.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
              if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
              setDragged(true);
            }}
            className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-[#05070d] shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-transform duration-150 active:scale-95"
          >
            {!dragged && <span aria-hidden className="compare-handle-ring absolute inset-0 rounded-full ring-2 ring-white" />}
            <ChevronsLeftRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid gap-5 px-5 pt-4 pb-5 md:grid-cols-2 md:gap-10">
        {[a, b].map((s) => (
          <div key={s.id}>
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <span className={cn("size-2 shrink-0 rounded-full", DOT[s.world])} aria-hidden />
              {s.name}
            </p>
            <p className="mt-1.5 max-w-[62ch] text-[15px] leading-relaxed text-foreground/85">{s.summary}</p>
            {s.image && <p className="mt-2 text-[11px] text-muted-foreground">Image: {s.image.credit}</p>}
          </div>
        ))}
      </div>
    </article>
  );
}

/* ---------- Mission call to action ---------- */

function MissionCta({ site, onStart }: { site: Site; onStart: () => void }) {
  return (
    <section
      aria-labelledby="mission-cta-title"
      className="relative mt-20 overflow-hidden rounded-[1.75rem] bg-white/[0.03] ring-1 ring-white/10"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_50%,oklch(0.88_0.14_182/0.14),transparent_60%)]"
      />
      <div className="relative flex flex-col gap-6 p-6 sm:p-10 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <p className="hud text-xs tracking-[0.16em] text-primary uppercase">Mission score</p>
          <h2
            id="mission-cta-title"
            className="mt-2 font-heading text-[clamp(1.5rem,2.6vw,2.1rem)] leading-tight font-semibold tracking-tight"
          >
            Could {site.name} take a landing, a rover or a base?
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Pick a mission, weigh what matters, and see how {site.name} ranks against every other site, built from
            measured NASA data.
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="inline-flex shrink-0 items-center gap-2.5 self-start rounded-full bg-primary py-3 ps-5 pe-6 text-[15px] font-semibold text-primary-foreground shadow-[0_12px_40px_-12px_var(--primary)] transition-[scale,box-shadow] duration-150 ease-out hover:shadow-[0_16px_48px_-12px_var(--primary)] motion-safe:active:scale-[0.96] md:self-center"
        >
          <Rocket className="size-4.5" aria-hidden />
          Start your mission
        </button>
      </div>
    </section>
  );
}

/* ---------- What matches ---------- */

function Pill({ children, tone }: { children: React.ReactNode; tone: "shared" | World }) {
  return (
    <li
      className={cn(
        "rounded-full px-3 py-1.5 text-xs",
        tone === "shared" ? "bg-primary/15 text-primary ring-1 ring-primary/25" : "text-foreground/80 ring-1",
        tone === "earth" && "ring-earth/35",
        tone === "moon" && "ring-moon/35",
        tone === "mars" && "ring-mars/40",
      )}
    >
      {children}
    </li>
  );
}

function Match({ a, b, twin, overlap }: { a: Site; b: Site; twin?: TwinLink; overlap: ReturnType<typeof tagOverlap> }) {
  const total = overlap.onlyA.length + overlap.shared.length + overlap.onlyB.length || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <section className="mt-20" aria-labelledby="match-title">
      <h2 id="match-title" className="font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight">
        What matches and what doesn&apos;t
      </h2>
      <p className="mt-2 max-w-[62ch] text-muted-foreground">
        Named features of each place, side by side. An analogue shares a few of them, never all.
      </p>

      {/* Proportion bar: Earth-only | shared | Moon/Mars-only */}
      <div
        className="mt-7 flex h-2 w-full overflow-hidden rounded-full bg-white/5"
        role="img"
        aria-label={`${overlap.shared.length} shared, ${overlap.onlyA.length} only on Earth, ${overlap.onlyB.length} only on ${WORLD_CONFIG[b.world].name}`}
      >
        <span className="compare-bar h-full bg-earth/70" style={{ width: seg(overlap.onlyA.length) }} />
        <span className="compare-bar h-full bg-primary" style={{ width: seg(overlap.shared.length) }} />
        <span
          className={cn("compare-bar h-full", b.world === "mars" ? "bg-mars/75" : "bg-moon/70")}
          style={{ width: seg(overlap.onlyB.length) }}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1.25fr_1fr]">
        <div className="md:pt-5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <span className="size-1.5 rounded-full bg-earth" aria-hidden />
            Only at {a.name}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {overlap.onlyA.length ? (
              overlap.onlyA.map((t) => (
                <Pill key={t} tone="earth">
                  {tagLabel(t)}
                </Pill>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">Nothing extra</li>
            )}
          </ul>
        </div>
        <div className="rounded-[1.4rem] bg-primary/[0.06] p-5 ring-1 ring-primary/20">
          <h3 className="flex items-center justify-between gap-3 text-sm font-medium">
            <span>Both places</span>
            <span className="hud text-primary">{Math.round(overlap.score * 100)}%</span>
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {overlap.shared.length ? (
              overlap.shared.map((t) => (
                <Pill key={t} tone="shared">
                  {tagLabel(t)}
                </Pill>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No named feature in common</li>
            )}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Overlap = shared features ÷ all named features of both places.
          </p>
        </div>
        <div className="md:pt-5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <span className={cn("size-1.5 rounded-full", DOT[b.world])} aria-hidden />
            Only at {b.name}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {overlap.onlyB.length ? (
              overlap.onlyB.map((t) => (
                <Pill key={t} tone={b.world}>
                  {tagLabel(t)}
                </Pill>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">Nothing extra</li>
            )}
          </ul>
        </div>
      </div>

      {twin ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="px-1">
            <h3 className="font-heading text-lg font-semibold">What they share</h3>
            <ul className="mt-3 space-y-2.5">
              {twin.shared.map((s) => (
                <li key={s} className="flex gap-3 text-[15px] leading-snug">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[1.4rem] bg-warn/[0.06] p-5 ring-1 ring-warn/25">
            <h3 className="flex items-center gap-2 font-heading text-lg font-semibold text-warn">
              <TriangleAlert className="size-4" aria-hidden />
              Important differences
            </h3>
            <ul className="mt-3 space-y-2.5">
              {twin.differences.map((s) => (
                <li key={s} className="flex gap-3 text-[15px] leading-snug text-foreground/90">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="mt-8 max-w-[62ch] rounded-[1.4rem] bg-white/[0.03] p-5 text-sm text-muted-foreground ring-1 ring-white/10">
          NASA does not name this exact pair. The match comes only from the features both places share, so treat it as a
          starting point, not a finding. Try one of the NASA pairs above for a sourced comparison.
        </p>
      )}
    </section>
  );
}

/* ---------- In the field: NASA hardware ---------- */

function Field({ a, b, twin }: { a: Site; b: Site; twin?: TwinLink }) {
  const items = hardwareForPair(a.id, b.id);
  const [pick, setPick] = useState(0);
  const [ref, seen] = useInView<HTMLDivElement>("200px", true);
  const webgl = useWebGL();
  if (!twin && !items.length) return null;
  const current = items[Math.min(pick, items.length - 1)];
  const source = current && sourceById(current.sourceId);

  return (
    <section className="mt-20" aria-labelledby="field-title">
      <div className={cn("grid items-start gap-8", items.length && "md:grid-cols-[1fr_1.15fr]")}>
        <div>
          <h2 id="field-title" className="font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight">
            In the field
          </h2>
          {twin && <p className="mt-3 max-w-[56ch] text-lg leading-relaxed text-foreground/90">{twin.nasaUse}</p>}

          {current && (
            <div className="mt-8">
              {items.length > 1 && (
                <div
                  role="tablist"
                  aria-label="NASA hardware"
                  className="mb-4 inline-flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/10"
                >
                  {items.map((it, i) => (
                    <button
                      key={it.hardwareId}
                      type="button"
                      role="tab"
                      aria-selected={i === pick}
                      onClick={() => setPick(i)}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150",
                        i === pick ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {it.hardware.name}
                    </button>
                  ))}
                </div>
              )}
              <h3 key={current.hardwareId} className="compare-rise font-heading text-xl font-semibold">
                {current.hardware.name}
              </h3>
              <p
                key={`${current.hardwareId}-fact`}
                className="compare-rise mt-2 max-w-[56ch] leading-relaxed text-foreground/85 [--d:60ms]"
              >
                {current.fact}
              </p>
              {source && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                >
                  {source.title} · {source.org}
                  <ExternalLink className="size-3 opacity-70" aria-hidden />
                </a>
              )}
            </div>
          )}
        </div>

        {current && (
          <div
            ref={ref}
            className="compare-hangar relative aspect-[4/3] overflow-hidden rounded-[1.8rem] ring-1 ring-white/10"
            style={{ "--tint": TINT[b.world] } as React.CSSProperties}
          >
            {seen && webgl ? (
              <HardwareViewer url={current.hardware.model} yaw={current.hardware.yaw} tint={TINT[b.world]} />
            ) : (
              <p className="flex size-full items-center justify-center text-sm text-muted-foreground">
                {webgl === false ? "3D view needs WebGL" : "Loading 3D model…"}
              </p>
            )}
            {seen && webgl && (
              <p className="pointer-events-none absolute start-4 bottom-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Hand className="size-3.5" aria-hidden />
                Drag to turn
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Analog Finder card ---------- */

const SHOWCASE = landing.finder;
const fmtLat = (v: number) => `${Math.abs(v).toFixed(1)}°${v < 0 ? "S" : "N"}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(1)}°${v < 0 ? "W" : "E"}`;

/** Points from the pair to the data-driven Analog Finder, preset to the Moon or Mars site on screen. */
function AnalogFinderCard({ b }: { b: Site }) {
  const exact = SHOWCASE.find((t) => t.id === b.id);
  const example = exact ?? SHOWCASE.find((t) => t.world === b.world) ?? SHOWCASE[0];
  // Every Moon and Mars site on Compare is a Finder target; the Finder falls back to Jezero for unknown ids.
  const href = `/finder?t=${b.id}`;
  return (
    <section className="mt-20" aria-labelledby="finder-title">
      <Link
        href={href}
        className="group relative grid overflow-hidden rounded-[1.6rem] bg-white/[0.03] ring-1 ring-white/10 transition-[box-shadow,background-color] duration-300 hover:bg-white/[0.05] hover:ring-primary/40 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
      >
        <div className="relative z-10 flex flex-col p-6 sm:p-8">
          <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-primary uppercase">
            <ScanSearch className="size-3.5" aria-hidden /> Analog Finder
          </p>
          <h2
            id="finder-title"
            className="mt-3 font-heading text-[clamp(1.5rem,2.4vw,2rem)] leading-tight font-semibold tracking-tight text-balance"
          >
            Where else on Earth is like {b.name}?
          </h2>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
            Shared labels only go so far. The Analog Finder scores all {landing.earthCells.toLocaleString("en-US")} land
            cells on Earth against {b.name} with measured NASA data (temperature, dryness, ground type, ice, sunlight
            and relief) and shows where each match breaks down.
          </p>
          {exact && (
            <ol className="mt-5 grid gap-1.5 text-sm">
              {exact.top.slice(0, 3).map((p, i) => (
                <li key={`${p.lat},${p.lon}`} className="flex items-baseline gap-3">
                  <span className="w-4 hud text-xs text-primary">{i + 1}</span>
                  <span className="text-foreground">{p.country}</span>
                  <span className="hud text-[11px] text-muted-foreground">
                    {fmtLat(p.lat)} {fmtLon(p.lon)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform duration-200 group-active:scale-[0.98] max-md:mt-6 md:mt-7">
            Rank Earth for {b.name}
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
          </span>
        </div>
        <div className="relative min-h-56 overflow-hidden bg-black md:min-h-full">
          <Image
            src={example.image}
            alt={`World map coloured by how well each place matches ${example.name}`}
            fill
            sizes="(min-width: 768px) 55vw, 94vw"
            className="object-cover transition-transform duration-[1200ms] ease-[var(--ease-out)] group-hover:scale-[1.04]"
            // Moon targets match Antarctica: keep the bottom of the map in frame when the card crops it
            style={{ objectPosition: example.world === "moon" ? "50% 88%" : "50% 50%" }}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.14_0.02_265)_0%,transparent_28%)] max-md:bg-[linear-gradient(180deg,oklch(0.14_0.02_265/0.6)_0%,transparent_35%)]"
          />
          <span className="absolute end-3 bottom-3 rounded-full glass px-3 py-1 text-[11px] text-muted-foreground">
            {exact ? `Top matches for ${exact.name}` : `Example: ${example.name}`}
          </span>
        </div>
      </Link>
    </section>
  );
}

/* ---------- Data behind the page ---------- */

/** One resource from the challenge's own list, and what it gave this page. */
interface DataRow {
  resource: string;
  url: string;
  items: string[];
}

/** The open data behind this pair, limited to the challenge's resource list (NASA and its partner agencies). */
function dataUsed(a: Site, b: Site): DataRow[] {
  const rows: DataRow[] = [
    {
      resource: "NASA Earthdata Search",
      url: "https://search.earthdata.nasa.gov/",
      items: ["MODIS MOD11C3, MOD13C2 and MCD43C3: the temperature, vegetation and albedo behind the Analog Finder card"],
    },
    {
      resource: "NASA Worldview / GIBS",
      url: "https://worldview.earthdata.nasa.gov/",
      items: ["MODIS and HLS satellite views of Earth places", "Blue Marble imagery on the Earth globe"],
    },
  ];
  if (a.image?.credit.includes("Copernicus")) {
    rows.push({ resource: "ESA Copernicus Data Space Ecosystem", url: "https://dataspace.copernicus.eu/", items: [`Sentinel-2 view of ${a.name}`] });
  }
  rows.push(
    b.world === "moon"
      ? {
          resource: "NASA Planetary Data System",
          url: "https://pds.nasa.gov/",
          items: [`Diviner, LOLA and Mini-RF data for ${b.name}, archived at PDS Geosciences`],
        }
      : {
          resource: "NASA Planetary Data System",
          url: "https://pds.nasa.gov/",
          items: [`MGS TES thermal inertia and MGS MOLA terrain for ${b.name}`, "Mars Odyssey GRS and neutron spectrometer: water and elements"],
        },
    {
      resource: "NASA Lunar Reconnaissance Orbiter",
      url: "https://pds-geosciences.wustl.edu/missions/lro/",
      items: [...(b.world === "moon" ? [`LOLA elevation and slope for ${b.name}`] : []), "Mini-RF radar in Radar Twins"],
    },
  );
  if (b.world === "moon") {
    rows.push({
      resource: "NASA LRO Diviner Lunar Data",
      url: "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
      items: ["Polar resource product: temperatures and ice stability", "Rock abundance and regolith thermal inertia"],
    });
  }
  rows.push(
    { resource: "CSA RADARSAT Constellation Mission", url: "https://donnees-data.asc-csa.gc.ca/en/dataset/rcm", items: ["Canadian Arctic radar in Radar Twins"] },
    { resource: "CSA SAR Python Tutorial", url: "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial", items: ["How we read the RCM GeoTIFF bands"] },
  );
  return rows;
}

/* ---------- Page ---------- */

export function CompareView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const stageRef = useRef<HTMLDivElement>(null);
  const a =
    siteById(params.get("a") ?? "")?.world === "earth" ? siteById(params.get("a")!)! : siteById("earth-atacama")!;
  const bCandidate = siteById(params.get("b") ?? "");
  const b = bCandidate && bCandidate.world !== "earth" ? bCandidate : siteById("mars-jezero")!;

  const setPair = (na: string, nb: string, scroll = false) => {
    if (na === a.id && nb === b.id) return;
    router.replace(`${pathname}?a=${na}&b=${nb}`, { scroll: false });
    if (useExplorer.getState().soundOn) playCue("warp");
    if (scroll) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      stageRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };
  // The mission scorer stays folded behind "Start your mission" until asked for; a #mission-score link opens it.
  const [missionOpen, setMissionOpen] = useState(false);
  const openMission = () => {
    setMissionOpen(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      document
        .getElementById("mission-score")
        ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }),
    );
  };
  useEffect(() => {
    const check = () => {
      if (window.location.hash !== "#mission-score") return;
      setMissionOpen(true);
      requestAnimationFrame(() => document.getElementById("mission-score")?.scrollIntoView({ block: "start" }));
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  const twin = TWINS.find((t) => t.earthId === a.id && t.otherId === b.id);
  const overlap = tagOverlap(a.tags, b.tags);
  const data = dataUsed(a, b);

  return (
    <div className="mx-auto max-w-7xl">
      <Morph name="feature-compare">
        <header className="max-w-2xl">
          <h1 className="font-heading text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.05] font-semibold tracking-tight">
            Compare
          </h1>
          <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
            Fly from a place on Earth to its twin on the Moon or Mars. Each pair names the one feature that matches and
            the differences that matter, because an analogue is never an exact copy.
          </p>
        </header>
      </Morph>

      <PairStrip a={a} b={b} onPick={(e, o) => setPair(e, o)} />

      <div ref={stageRef} className="scroll-mt-20">
        <Stage a={a} b={b} twin={twin} overlapPct={Math.round(overlap.score * 100)} />
      </div>

      <SiteWipe a={a} b={b} onA={(id) => setPair(id, b.id)} onB={(id) => setPair(a.id, id)} />

      <Match a={a} b={b} twin={twin} overlap={overlap} />
      <Field key={`${a.id}:${b.id}`} a={a} b={b} twin={twin} />
      <Conditions a={a} b={b} />
      {missionOpen ? (
        <MissionScore site={b} onSite={(id) => setPair(a.id, id)} />
      ) : (
        <MissionCta site={b} onStart={openMission} />
      )}
      <AnalogFinderCard b={b} />

      <section className="mt-20 border-t border-white/[0.07] pt-8" aria-labelledby="compare-sources">
        <h2 id="compare-sources" className="font-heading text-lg font-semibold">
          Data behind this page
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Only open data from the challenge&apos;s resource list: NASA and its partner agencies.</p>
        <ul className="mt-4 grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
          {data.map((r) => (
            <li key={r.resource}>
              <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 font-medium text-foreground hover:text-primary">
                {r.resource}
                <ExternalLink className="mt-1 size-3 shrink-0 opacity-60" aria-hidden />
              </a>
              <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
                {r.items.map((i) => (
                  <li key={i}>· {i}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/explore/${b.world}?site=${b.id}`}
            className="rounded-full glass px-4 py-2 transition-colors duration-150 hover:bg-white/10"
          >
            See {b.name} on the {WORLD_CONFIG[b.world].name} globe
          </Link>
          <button
            type="button"
            onClick={openMission}
            className="rounded-full px-4 py-2 text-muted-foreground ring-1 ring-white/10 transition-colors duration-150 hover:text-foreground hover:ring-white/20"
          >
            Score it for a mission
          </button>
        </div>
      </section>
    </div>
  );
}
