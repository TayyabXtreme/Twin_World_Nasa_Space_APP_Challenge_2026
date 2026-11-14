"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import landing from "@/lib/data/landing.generated.json";
import { cn } from "@/lib/utils";
import { Reveal, SectionHead } from "./Reveal";

const TARGETS = landing.finder;
const WORLD_DOT = { moon: "bg-[var(--moon)]", mars: "bg-[var(--mars)]" } as const;
const EASE = [0.22, 1, 0.36, 1] as const;

const fmtLat = (v: number) => `${Math.abs(v).toFixed(1)}°${v < 0 ? "S" : "N"}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(1)}°${v < 0 ? "W" : "E"}`;
const fmtTop = (p: number | null) =>
  p === null ? "no data" : p < 0.1 ? "top 0.1 %" : `top ${p.toFixed(p < 10 ? 1 : 0)} %`;

/** The Analog Finder's real result for three targets (precomputed by scripts/build-landing.mjs). */
export function FinderShowcase() {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();
  const t = TARGETS[index];

  return (
    <section
      id="finder"
      aria-labelledby="finder-title"
      className="nebula mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8 md:py-32"
    >
      <SectionHead
        id="finder-title"
        eyebrow="Analog Finder"
        title="Every place on Earth, ranked against another world."
        lead={
          <>
            Pick a Moon base or a Mars site. TwinWorlds scores all {landing.earthCells.toLocaleString("en-US")} land
            cells on Earth with NASA MODIS temperature, vegetation and albedo, matched against LRO, Odyssey and TES data
            from the other world. Not by how it looks: by how it behaves.
          </>
        }
      />

      <Reveal delay={0.1} className="mt-10">
        <div
          role="tablist"
          aria-label="Target site"
          className="inline-flex flex-wrap gap-1.5 rounded-2xl bg-white/[0.04] p-1.5 ring-1 ring-white/10"
        >
          {TARGETS.map((tg, i) => (
            <button
              key={tg.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors duration-200",
                i === index ? "text-[var(--ink)]" : "text-[var(--ink-dim)] hover:text-[var(--ink)]",
              )}
            >
              {i === index && (
                <motion.span
                  layoutId="finder-tab"
                  className="absolute inset-0 rounded-xl bg-white/[0.09] ring-1 ring-white/15"
                  transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                />
              )}
              <span
                className={cn("relative size-2 rounded-full", WORLD_DOT[tg.world as "moon" | "mars"])}
                aria-hidden
              />
              <span className="relative">{tg.name}</span>
            </button>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.15} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <figure
          className="panel relative overflow-hidden p-2"
          role="tabpanel"
          aria-label={`Earth matches for ${t.name}`}
        >
          <div className="relative aspect-[2/1] overflow-hidden rounded-[1.1rem] bg-black">
            <AnimatePresence initial={false}>
              <motion.div
                key={t.id}
                className="absolute inset-0"
                initial={reduce ? false : { opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                <Image
                  src={t.image}
                  alt={`World map coloured by how well each place matches ${t.name}`}
                  fill
                  sizes="(min-width: 1024px) 760px, 94vw"
                  className="object-cover"
                />
                {t.top.map((p, i) => (
                  <span
                    key={`${p.lat},${p.lon}`}
                    className="pin"
                    style={{
                      left: `${((p.lon + 180) / 360) * 100}%`,
                      top: `${((90 - p.lat) / 180) * 100}%`,
                      ["--pin-delay" as string]: `${i * 0.35}s`,
                    }}
                    aria-hidden
                  >
                    <span className="pin-ring" />
                    <span className="pin-dot" />
                    <span className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white/90 ring-1 ring-white/15">
                      {i + 1}
                    </span>
                  </span>
                ))}
                <span className="scan" aria-hidden />
              </motion.div>
            </AnimatePresence>
          </div>
          <figcaption className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3 pb-1 text-xs text-[var(--ink-dim)]">
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-28 rounded-full bg-[linear-gradient(90deg,rgb(40_22_96),rgb(122_40_140),rgb(222_70_110),rgb(250_150_70),rgb(255_238_170))]"
                aria-hidden
              />
              Earth&apos;s best-matching quarter of land, up to the top place
            </span>
            <span>NASA MODIS (Earth) · {t.world === "moon" ? "LRO Diviner, LOLA" : "Odyssey GRS/NS, MGS TES"}</span>
          </figcaption>
        </figure>

        <div className="flex flex-col gap-4">
          <div className="panel p-5">
            <p className="eyebrow">Top matches</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">{t.blurb}</p>
            <ol className="mt-4 flex flex-col gap-1" key={t.id}>
              {t.top.map((p, i) => (
                <motion.li
                  key={`${p.lat},${p.lon}`}
                  initial={reduce ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.45, delay: 0.08 * i, ease: EASE }}
                  className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 even:bg-white/[0.03]"
                >
                  <span className="w-4 font-mono text-xs text-[var(--accent)]">{i + 1}</span>
                  <span className="flex-1 text-[0.95rem] text-[var(--ink)]">{p.country}</span>
                  <span className="font-mono text-[11px] text-[var(--ink-dim)]">
                    {fmtLat(p.lat)} {fmtLon(p.lon)}
                  </span>
                </motion.li>
              ))}
            </ol>
          </div>

          <div className="panel p-5">
            <p className="eyebrow">Sanity check</p>
            <p className="mt-2 text-sm text-[var(--ink-dim)]">Where known NASA analogues land for {t.name}:</p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {t.known.map((k) => {
                const pct = k.topPct ?? 100;
                return (
                  <li key={k.name}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-[var(--ink)]">{k.name}</span>
                      <span
                        className={cn(
                          "font-mono text-xs",
                          pct <= 10 ? "text-[var(--accent)]" : "text-[var(--ink-dim)]",
                        )}
                      >
                        {fmtTop(k.topPct)}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <motion.div
                        key={`${t.id}-${k.name}`}
                        className="h-full origin-left rounded-full bg-[var(--accent)]"
                        style={{ opacity: pct <= 10 ? 1 : 0.45 }}
                        initial={reduce ? false : { scaleX: 0 }}
                        animate={{ scaleX: Math.max(0.03, 1 - pct / 100) }}
                        transition={{ duration: 0.9, ease: EASE }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <Link
            href={`/finder?t=${t.id}`}
            transitionTypes={["warp"]}
            className="group flex items-center justify-between rounded-2xl bg-[var(--accent)] px-5 py-3.5 font-medium text-[oklch(0.15_0.02_260)] no-underline transition-transform duration-200 ease-(--ease-out) active:scale-[0.98]"
          >
            Open the Analog Finder
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
