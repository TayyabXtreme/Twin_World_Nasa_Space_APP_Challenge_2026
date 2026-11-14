"use client";

import {
  CloudLightning,
  Droplets,
  ExternalLink,
  Flag,
  Mountain,
  Orbit,
  Snowflake,
  Sparkles,
  Sun,
  Thermometer,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { EvidenceTag } from "@/components/site/EvidenceTag";
import { FACTS, type Fact, type WorldChapter as Chapter } from "@/lib/data/learn";
import { sourceById } from "@/lib/data/sources";
import { cn } from "@/lib/utils";
import { PlanetOrb } from "./PlanetOrb";
import { Reveal } from "./Reveal";

const ICONS: Record<string, LucideIcon> = {
  "mars-red": Sparkles,
  "mars-air": Wind,
  "mars-temp": Thermometer,
  "mars-water": Droplets,
  "mars-storms": CloudLightning,
  "mars-olympus": Mountain,
  "moon-gravity": Orbit,
  "moon-exosphere": Wind,
  "moon-craters": Mountain,
  "moon-ice": Snowflake,
  "moon-shackleton": Sun,
  "moon-artemis": Flag,
  "earth-atacama": Sun,
  "earth-drysvalleys": Snowflake,
  "earth-ripples": Wind,
  "earth-analogues": Orbit,
};

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * One world's chapter: on wide screens the planet stays pinned on the left and turns as you scroll, while the fact
 * cards slide in on the right; the card crossing the middle of the screen lights up.
 */
export function WorldChapter({ chapter, index }: { chapter: Chapter; index: number }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const spin = useTransform(scrollYProgress, [0, 1], ["0%", "-40%"]);
  const scale = useTransform(scrollYProgress, [0, 0.25, 0.8, 1], [0.8, 1, 1, 0.85]);
  const facts = FACTS.filter((f) => f.world === chapter.id);

  return (
    <section
      ref={ref}
      id={`world-${chapter.id}`}
      aria-labelledby={`world-${chapter.id}-title`}
      className="relative scroll-mt-32 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16"
    >
      <div className="lg:sticky lg:top-24 lg:flex lg:h-[calc(100dvh-8rem)] lg:flex-col lg:justify-center">
        <Reveal>
          <p className="hud text-xs tracking-[0.18em] uppercase" style={{ color: chapter.glow }}>
            Chapter {String(index + 1).padStart(2, "0")}
          </p>
          <h2
            id={`world-${chapter.id}-title`}
            className="mt-2 font-heading text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.02] font-semibold tracking-tight"
          >
            {chapter.name}
          </h2>
          <p className="mt-3 max-w-md text-lg leading-relaxed text-muted-foreground">{chapter.tagline}</p>
        </Reveal>
        <div className="mt-8 flex items-center gap-6 lg:block">
          <PlanetOrb
            texture={chapter.texture}
            glow={chapter.glow}
            spin={reduce ? "-10%" : spin}
            style={reduce ? undefined : { scale }}
            className="w-[34vw] max-w-56 shrink-0 lg:w-[min(26vw,20rem)] lg:max-w-none"
          />
          <dl className="grid flex-1 gap-3 lg:mt-10 lg:grid-cols-3">
            {chapter.stats.map((s, i) => (
              <Reveal key={s.label} delay={0.08 * i} y={12}>
                <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{s.label}</dt>
                <dd className="mt-0.5 text-sm leading-snug font-medium">{s.value}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>

      <ol className="mt-10 flex flex-col gap-4 lg:mt-0 lg:py-[22vh]">
        {facts.map((f, i) => (
          <FactCard key={f.id} fact={f} n={i + 1} glow={chapter.glow} />
        ))}
      </ol>
    </section>
  );
}

function FactCard({ fact, n, glow }: { fact: Fact; n: number; glow: string }) {
  const ref = useRef<HTMLLIElement>(null);
  const reduce = useReducedMotion();
  // "Active" while the card sits in the middle band of the screen.
  const active = useInView(ref, { margin: "-42% 0px -42% 0px" });
  const src = sourceById(fact.sourceId);
  const Icon = ICONS[fact.id] ?? Sparkles;
  return (
    <motion.li
      ref={ref}
      initial={reduce ? false : { opacity: 0, x: 48, scale: 0.96 }}
      whileInView={{ opacity: 1, x: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, ease: EASE }}
      data-active={active || undefined}
      style={{ "--glow": glow } as React.CSSProperties}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025] p-5 transition-[background-color,border-color,box-shadow] duration-500 sm:p-6",
        "data-[active]:border-[color-mix(in_oklch,var(--glow)_45%,transparent)] data-[active]:bg-white/[0.05] data-[active]:shadow-[0_20px_60px_-30px_var(--glow)]",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -end-10 -top-10 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-data-[active]:opacity-25"
        style={{ background: glow }}
      />
      <div className="relative flex items-start gap-4">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/10 transition-[background-color,color] duration-500 group-data-[active]:text-background"
          style={{ backgroundColor: active ? glow : "oklch(1 0 0 / 0.04)" }}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <span className="hud text-[11px] text-muted-foreground">{String(n).padStart(2, "0")}</span>
          <p className="mt-1 text-[1.05rem] leading-relaxed text-foreground/90">{fact.text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <EvidenceTag evidence={fact.evidence} />
            {src && (
              <a
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                {src.org}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  );
}
