"use client";

import { BarChart3, Check, Database, FlaskConical, Info, ListOrdered, Satellite, TriangleAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { GetTheData } from "@/components/data/GetTheData";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { SatelliteView } from "@/components/satellite/SatelliteView";
import type { PlaceLabel } from "@/lib/finder/places";
import { WORLD_LIMITS, fieldTests, strengths, weaknesses } from "@/lib/finder/text";
import type { CellResult, ParamsHeader, Target } from "@/lib/finder/types";
import { ScoreSteps } from "./FinderNotes";
import { FinderTabs } from "./FinderTabs";
import { SiteConditions } from "./SiteConditions";

const k2c = (k: number) => (k - 273.15).toFixed(0);
const EASE = [0.22, 1, 0.36, 1] as const;

/** The overall score as a ring that fills to the value and glides when the weights change. */
function ScoreRing({ score }: { score: number }) {
  const reduce = useReducedMotion();
  const color = score >= 75 ? "var(--ok)" : score >= 50 ? "var(--primary)" : "var(--warn)";
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="8" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: Math.max(0.01, score / 100) }}
          transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber value={score} className="hud text-[1.9rem] leading-none font-semibold" />
        <span className="text-[10px] text-muted-foreground">of 100</span>
      </div>
    </div>
  );
}

function Measured({ detail }: { detail: Record<string, number> | null }) {
  if (!detail) return <p className="finder-pulse text-sm text-muted-foreground">Loading measured values…</p>;
  const fin = Number.isFinite;
  const rows: { k: string; v: string; unit: string; src: string }[] = [
    { k: "Daytime surface", v: fin(detail.tday) ? k2c(detail.tday) : "–", unit: "°C", src: "MODIS MOD11C3 · ~10:30" },
    { k: "Night surface", v: fin(detail.tnight) ? k2c(detail.tnight) : "–", unit: "°C", src: "MODIS MOD11C3 · ~22:30" },
    { k: "Coldest night", v: fin(detail.tcold) ? k2c(detail.tcold) : "–", unit: "°C", src: "MODIS MOD11C3" },
    {
      k: "Seasonal range",
      v: fin(detail.seasonal) ? detail.seasonal.toFixed(0) : "–",
      unit: "K",
      src: "MODIS MOD11C3 · 4 months",
    },
    { k: "Albedo", v: fin(detail.albedo) ? detail.albedo.toFixed(2) : "–", unit: "", src: "MODIS MCD43C3 · shortwave" },
    {
      k: "Elevation",
      v: fin(detail.elev) ? Math.round(detail.elev).toLocaleString("en-US") : "–",
      unit: "m",
      src: "JAXA AW3D30",
    },
  ];
  const flags = detail.flags;
  const months = fin(flags) ? flags & 7 : 0;
  const notes = [
    `${months}/4 months with day and night temperatures`,
    fin(flags) && flags & 8 ? "polar night: day set equal to night" : null,
    fin(flags) && flags & 16 ? "no NDVI (ice sheet), counted as bare" : null,
    fin(flags) && flags & 32 ? "no albedo, so no thermal inertia" : null,
  ].filter(Boolean);
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {rows.map((r) => (
          <div key={r.k} className="flex flex-col rounded-2xl bg-white/[0.035] p-4 ring-1 ring-white/[0.08]">
            <dt className="text-[12px] text-muted-foreground">{r.k}</dt>
            <dd className="mt-1.5 flex items-baseline gap-1">
              <span className="font-heading text-[1.6rem] leading-none font-semibold tabular-nums">{r.v}</span>
              {r.unit && r.v !== "–" && <span className="text-[13px] text-muted-foreground">{r.unit}</span>}
            </dd>
            <dd className="mt-auto pt-3 text-[11.5px] text-muted-foreground/80">{r.src}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {notes.join(" · ")}
      </p>
    </>
  );
}

/**
 * One candidate place: name, the score ring, and the details in four tabs (how each parameter matches, what to
 * test there, satellite imagery, raw data) so only one part is on screen at a time.
 */
export function CandidateCard({
  cell,
  label,
  rank,
  target,
  params,
  detail,
  confidence,
}: {
  cell: CellResult;
  label: PlaceLabel;
  rank: number | null;
  target: Target;
  params: ParamsHeader;
  detail: Record<string, number> | null;
  /** Data confidence 0–100 (lib/finder/text.ts confidence()). */
  confidence: number;
}) {
  const strong = strengths(cell);
  const weak = weaknesses(cell, target, params);
  const tests = fieldTests(cell);
  const limits = WORLD_LIMITS[target.world];
  const score = Math.round(cell.score * 100);
  const better = 100 - cell.topPct;
  return (
    <article
      key={`${cell.cell}:${target.id}`}
      aria-labelledby="cand-title"
      className="finder-rise overflow-hidden rounded-[1.6rem] bg-white/[0.03] ring-1 ring-white/10"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] p-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {rank ? `#${rank} for ${target.name}` : `Your pick · scored for ${target.name}`}
            {label.known && (
              <span className="ms-2 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] text-ok">Known analogue site</span>
            )}
          </p>
          <h3
            id="cand-title"
            className="mt-1 font-heading text-[clamp(1.35rem,2.2vw,1.8rem)] leading-tight font-semibold tracking-tight"
          >
            {label.title}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{label.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end text-xs leading-snug text-muted-foreground">
            <p>
              Better than{" "}
              <span className="font-semibold text-foreground">
                {better >= 99.95 ? "99.9%+" : `${better.toFixed(better > 99 ? 1 : 0)}%`}
              </span>{" "}
              of Earth&apos;s land
            </p>
            <p className="mt-1" title="Share of the score resting on direct measurements on both worlds">
              Data confidence{" "}
              <span className={confidence < 70 ? "hud text-warn" : "hud text-foreground"}>{confidence}</span>
            </p>
          </div>
          <ScoreRing score={score} />
        </div>
      </header>

      <div className="p-5">
        <FinderTabs
          label="Candidate details"
          tabs={[
            {
              id: "match",
              label: "Match",
              icon: BarChart3,
              render: () => (
                <>
                  <SiteConditions
                    cell={cell}
                    target={target}
                    known={label.known}
                    params={params}
                    siteName={label.title}
                  />
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[1.2rem] bg-ok/[0.05] p-4 ring-1 ring-ok/20">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-ok">
                        <Check className="size-4" aria-hidden />
                        Strong analogy for
                      </h4>
                      <ul className="mt-2.5 space-y-2">
                        {strong.length ? (
                          strong.map((s) => (
                            <li key={s.dim} className="flex gap-2.5 text-[14px] leading-snug">
                              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ok" aria-hidden />
                              {s.text}
                            </li>
                          ))
                        ) : (
                          <li className="text-sm text-muted-foreground">No parameter scores 75 or more here.</li>
                        )}
                      </ul>
                    </div>
                    <div className="rounded-[1.2rem] bg-warn/[0.05] p-4 ring-1 ring-warn/25">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-warn">
                        <TriangleAlert className="size-4" aria-hidden />
                        Breaks down at
                      </h4>
                      <ul className="mt-2.5 space-y-2">
                        {limits.map((l) => (
                          <li key={l.title} className="flex gap-2.5 text-[14px] leading-snug text-foreground/90">
                            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                            <span>
                              <span className="font-medium">{l.title}.</span> {l.text}
                            </span>
                          </li>
                        ))}
                        {weak.map((w) => (
                          <li key={w.dim} className="flex gap-2.5 text-[14px] leading-snug text-foreground/90">
                            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warn/60" aria-hidden />
                            {w.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              ),
            },
            {
              id: "test",
              label: "Try here",
              icon: FlaskConical,
              render: () => (
                <section aria-labelledby="try-title">
                  <h4 id="try-title" className="text-[15px] font-semibold">
                    Things you can test here
                  </h4>
                  <p className="mt-0.5 mb-4 text-[13px] text-muted-foreground">
                    Field tests and experiments {label.title} suits, based on where it matches {target.name} best.
                  </p>
                  <ul className="space-y-2.5">
                    {(tests.length
                      ? tests
                      : [
                          "Use it as a contrast site: the parameters that score low show what this place cannot stand in for.",
                        ]
                    ).map((t, i) => (
                      <li
                        key={t}
                        className="finder-rise flex gap-3 rounded-2xl bg-white/[0.03] p-4 text-[14px] leading-snug text-foreground/90 ring-1 ring-white/[0.07]"
                        style={{ "--d": `${i * 60}ms` } as React.CSSProperties}
                      >
                        <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </section>
              ),
            },
            {
              id: "satellite",
              label: "Satellite",
              icon: Satellite,
              render: () => (
                <>
                  <p className="text-[12px] text-muted-foreground">
                    Recent NASA imagery of this 25 km cell&apos;s centre: check what the scores describe.
                  </p>
                  <SatelliteView
                    key={cell.cell}
                    lat={cell.lat}
                    lon={cell.lon}
                    name={label.title}
                    className="mt-3 max-w-2xl"
                  />
                </>
              ),
            },
            {
              id: "how",
              label: "How it works",
              icon: ListOrdered,
              render: () => <ScoreSteps />,
            },
            {
              id: "data",
              label: "Data",
              icon: Database,
              render: () => (
                <div className="space-y-8">
                  <section aria-labelledby="measured-title">
                    <h4 id="measured-title" className="text-[15px] font-semibold">
                      Measured here
                    </h4>
                    <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">
                      Values for this 28 km cell, from the same data the score uses.
                    </p>
                    <Measured detail={detail} />
                  </section>
                  <section aria-labelledby="getdata-title" className="border-t border-white/[0.07] pt-6">
                    <h4 id="getdata-title" className="text-[15px] font-semibold">
                      Get the data
                    </h4>
                    <GetTheData
                      key={cell.cell}
                      lat={cell.lat}
                      lon={cell.lon}
                      name={label.title}
                      layout="grid"
                      className="mt-1"
                    />
                  </section>
                  <p className="border-t border-white/[0.07] pt-4 text-[12px] text-muted-foreground">
                    Data: MODIS MOD11C3 · MOD13C2 · MCD43C3 (2024), JAXA AW3D30; target:{" "}
                    {target.facts
                      .map((f) => f.source)
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(" · ")}
                  </p>
                </div>
              ),
            },
          ]}
        />
      </div>
    </article>
  );
}
