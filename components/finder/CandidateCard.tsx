"use client";

import { BarChart3, Check, Database, FlaskConical, Satellite, TriangleAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { GetTheData } from "@/components/data/GetTheData";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { SatelliteView } from "@/components/satellite/SatelliteView";
import type { PlaceLabel } from "@/lib/finder/places";
import { WORLD_LIMITS, fieldTests, parameterRows, strengths, weaknesses } from "@/lib/finder/text";
import type { CellResult, GridHeader, Target, Weights } from "@/lib/finder/types";
import { FinderTabs } from "./FinderTabs";
import { ParameterTable } from "./ParameterTable";

const k2c = (k: number) => `${(k - 273.15).toFixed(0)} °C`;
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
  const rows: [string, string, string][] = [
    ["Daytime surface (~10:30)", Number.isFinite(detail.tday) ? k2c(detail.tday) : "–", "MOD11C3 LST"],
    ["Night surface (~22:30)", Number.isFinite(detail.tnight) ? k2c(detail.tnight) : "–", "MOD11C3 LST"],
    ["Coldest sampled night", Number.isFinite(detail.tcold) ? k2c(detail.tcold) : "–", "MOD11C3 LST"],
    [
      "Seasonal range",
      Number.isFinite(detail.seasonal) ? `${detail.seasonal.toFixed(0)} K` : "–",
      "MOD11C3 LST, 4 months",
    ],
    ["Albedo (shortwave)", Number.isFinite(detail.albedo) ? detail.albedo.toFixed(2) : "–", "MCD43C3"],
    [
      "Elevation",
      Number.isFinite(detail.elev) ? `${Math.round(detail.elev).toLocaleString("en-US")} m` : "–",
      "JAXA AW3D30",
    ],
  ];
  const flags = detail.flags;
  const months = Number.isFinite(flags) ? flags & 7 : 0;
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {rows.map(([k, v, src]) => (
          <div key={k}>
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 hud text-[15px]">{v}</dd>
            <dd className="text-[10px] text-muted-foreground/80">{src}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {months}/4 months with day and night temperatures
        {Number.isFinite(flags) && flags & 8 ? " · polar night: day set equal to night" : ""}
        {Number.isFinite(flags) && flags & 16 ? " · no NDVI (ice sheet), counted as bare" : ""}
        {Number.isFinite(flags) && flags & 32 ? " · no albedo, so no thermal inertia" : ""}
      </p>
    </>
  );
}

/**
 * One candidate place: name, the score ring, and the details in four tabs (how each dimension matches, what to
 * test there, satellite imagery, raw data) so only one part is on screen at a time.
 */
export function CandidateCard({
  cell,
  label,
  rank,
  target,
  header,
  detail,
  weights,
  confidence,
}: {
  cell: CellResult;
  label: PlaceLabel;
  rank: number | null;
  target: Target;
  header: GridHeader;
  detail: Record<string, number> | null;
  weights: Weights;
  /** Data confidence 0–100 (lib/finder/text.ts confidence()). */
  confidence: number;
}) {
  const strong = strengths(cell);
  const weak = weaknesses(cell, target, header);
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
              Better than <span className="hud text-foreground">{better.toFixed(better > 99 ? 1 : 0)} %</span> of Earth&apos;s land
            </p>
            <p className="mt-1" title="Share of the score resting on direct measurements on both worlds">
              Data confidence <span className={confidence < 70 ? "hud text-warn" : "hud text-foreground"}>{confidence}</span>
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
                  <ParameterTable rows={parameterRows(cell, target, header, weights, detail)} worldName={target.world === "moon" ? "Moon" : "Mars"} score={score} />
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
                          <li className="text-sm text-muted-foreground">No dimension scores 75 or more here.</li>
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
                <ul className="space-y-2.5">
                  {(tests.length
                    ? tests
                    : [
                        "Use it as a contrast site: the dimensions that score low show what this place cannot stand in for.",
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
              id: "data",
              label: "Data",
              icon: Database,
              render: () => (
                <>
                  <h4 className="text-sm font-medium">Measured here</h4>
                  <div className="mt-3">
                    <Measured detail={detail} />
                  </div>
                  <h4 className="mt-7 border-t border-white/[0.07] pt-5 text-sm font-medium">Get the data</h4>
                  <GetTheData
                    key={cell.cell}
                    lat={cell.lat}
                    lon={cell.lon}
                    name={label.title}
                    className="mt-2 max-w-2xl"
                  />
                  <p className="mt-6 text-xs text-muted-foreground">
                    Data: MODIS MOD11C3 · MOD13C2 · MCD43C3 (2024), JAXA AW3D30; target:{" "}
                    {target.facts
                      .map((f) => f.source)
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(" · ")}
                  </p>
                </>
              ),
            },
          ]}
        />
      </div>
    </article>
  );
}
