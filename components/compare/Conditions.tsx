"use client";

import { Snowflake } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { MeasuredCards, headlineMetrics } from "@/components/score/MeasuredPanel";
import { ENVIRONMENT } from "@/lib/data/environment";
import { measured } from "@/lib/data/metrics";
import { terrainFor } from "@/lib/data/sites";
import type { Site } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import type { World } from "@/lib/worlds";

/*
 * Conditions on the ground: one row per condition, the Earth place on the left, the Moon/Mars site on the
 * right, and a small looping instrument in the middle that shows the difference (real ratios where we have
 * real numbers, and an "illustrative" caption where we don't). Rows come into focus as they scroll in, and
 * their loops pause while off screen.
 */

type Other = Exclude<World, "earth">;
const DOT: Record<World, string> = { earth: "bg-earth", moon: "bg-moon", mars: "bg-mars" };
const TEXT: Record<World, string> = { earth: "text-earth", moon: "text-moon", mars: "text-mars" };
const GRAVITY: Record<World, number> = { earth: 9.81, moon: 1.62, mars: 3.71 };
const texture = (w: World) => (w === "earth" ? "/textures/earth/day-1k.webp" : `/textures/${w}/color-1k.webp`);

const noSubscribe = () => () => {};

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Deterministic scatter so server and client agree (no Math.random in render). */
const scatter = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/* ---------- Instruments ---------- */

function Caption({ children }: { children: React.ReactNode }) {
  return <span className="mt-1.5 block text-center text-[10.5px] leading-tight text-muted-foreground">{children}</span>;
}

/** Same drop height on both worlds; the bounce period scales with 1/√g, so the ratio is the real one. */
function GravityViz({ other }: { other: Other }) {
  const slower = Math.sqrt(GRAVITY.earth / GRAVITY[other]);
  return (
    <>
      <div className="flex h-16 items-stretch justify-center gap-10">
        {(["earth", other] as const).map((w) => (
          <div key={w} className="relative w-8">
            <span className="absolute inset-x-0 bottom-0 h-px bg-white/25" />
            <span
              className={cn("cond-ball absolute start-1/2 top-0 -ms-[5px] size-2.5 rounded-full", DOT[w])}
              style={{ "--dur": `${(1.1 * (w === "earth" ? 1 : slower)).toFixed(2)}s` } as Vars}
            />
          </div>
        ))}
      </div>
      <Caption>Same drop, {slower.toFixed(1)}× slower fall</Caption>
    </>
  );
}

/** Air particles: dense on Earth, a faint few on Mars, none on the Moon. Density is illustrative. */
function AirViz({ other }: { other: Other }) {
  const counts: Record<World, number> = { earth: 26, mars: 4, moon: 0 };
  return (
    <>
      <div className="flex justify-center gap-4">
        {(["earth", other] as const).map((w, side) => (
          <div
            key={w}
            className="relative h-14 w-20 overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/[0.08]"
          >
            {Array.from({ length: counts[w] }, (_, i) => (
              <span
                key={i}
                className={cn("cond-mote absolute size-1 rounded-full", w === "earth" ? "bg-earth/80" : "bg-mars/70")}
                style={
                  {
                    left: `${(8 + scatter(i, side + 1) * 84).toFixed(2)}%`,
                    top: `${(8 + scatter(i, side + 7) * 80).toFixed(2)}%`,
                    "--dur": `${(4 + scatter(i, 3) * 5).toFixed(2)}s`,
                    "--delay": `${(-scatter(i, 5) * 6).toFixed(2)}s`,
                    "--dx": `${(scatter(i, 9) * 14 - 7).toFixed(1)}px`,
                    "--dy": `${(scatter(i, 11) * 12 - 6).toFixed(1)}px`,
                  } as Vars
                }
              />
            ))}
            {counts[w] === 0 && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                near vacuum
              </span>
            )}
          </div>
        ))}
      </div>
      <Caption>Illustrative density</Caption>
    </>
  );
}

/** A shared °C scale for the numbers we have; the Moon has no single figure, so it shows the swing instead. */
function TempViz({ other }: { other: Other }) {
  const pos = (c: number) => `${((c + 160) / 200) * 100}%`;
  return (
    <>
      <div className="relative mx-auto h-12 w-full max-w-60">
        <span className="absolute inset-x-0 top-6 h-px bg-white/20" />
        {[-150, -100, -50, 0].map((t) => (
          <span
            key={t}
            className="absolute top-[1.15rem] -translate-x-1/2 text-[9px] text-muted-foreground"
            style={{ left: pos(t) }}
          >
            <span className="mx-auto mb-0.5 block h-1.5 w-px bg-white/25" />
            <span className="block translate-y-2 hud">{t}°</span>
          </span>
        ))}
        {other === "mars" && (
          <span
            className="cond-grow absolute top-[1.3rem] h-1.5 rounded-full bg-mars/35"
            style={{ left: pos(-153), width: `calc(${pos(20)} - ${pos(-153)})` }}
          />
        )}
        {other === "mars" && (
          <span
            className="cond-pin absolute top-[1.05rem] size-2.5 -translate-x-1/2 rounded-full bg-mars ring-2 ring-background"
            style={{ left: pos(-65) }}
          />
        )}
        <span
          className="cond-pin absolute top-[1.05rem] size-2.5 -translate-x-1/2 rounded-full bg-earth ring-2 ring-background"
          style={{ left: pos(15) }}
        />
        {other === "moon" && <span className="cond-swing absolute inset-x-[18%] top-0 h-2 rounded-full" />}
      </div>
      <Caption>
        {other === "mars" ? "Mars range and median vs Earth's average" : "Moon: hot day ↔ cold night, no single number"}
      </Caption>
    </>
  );
}

function WaterViz({ other }: { other: Other }) {
  return (
    <>
      <div className="flex justify-center gap-5">
        <span className="relative size-12 overflow-hidden rounded-full bg-earth/10 ring-1 ring-earth/30">
          {[0, 1].map((i) => (
            <svg
              key={i}
              viewBox="0 0 96 24"
              className={cn("cond-wave absolute inset-x-0 h-4 w-[200%]", i ? "top-[58%] opacity-50" : "top-[46%]")}
              aria-hidden
            >
              <path d="M0 12 Q12 4 24 12 T48 12 T72 12 T96 12 V24 H0Z" className="fill-earth/60" />
            </svg>
          ))}
        </span>
        <span
          className={cn(
            "relative flex size-12 items-center justify-center rounded-full ring-1",
            other === "mars" ? "bg-mars/10 ring-mars/30" : "bg-moon/10 ring-moon/30",
          )}
        >
          <Snowflake className={cn("cond-spin size-5", TEXT[other])} aria-hidden />
        </span>
      </div>
      <Caption>Liquid on Earth · {other === "mars" ? "mostly ice on Mars" : "ice in shadowed craters"}</Caption>
    </>
  );
}

/** Two globes turning at their real relative rates: 1 Earth day = 6 seconds here. */
function DayViz({ other }: { other: Other }) {
  const dayHours: Record<World, number> = { earth: 24, mars: 24 + 37 / 60, moon: 29.5 * 24 };
  return (
    <>
      <div className="flex justify-center gap-8">
        {(["earth", other] as const).map((w) => (
          <span
            key={w}
            className={cn("cond-globe size-12 rounded-full", `cond-globe-${w}`)}
            style={
              { backgroundImage: `url(${texture(w)})`, "--dur": `${((6 * dayHours[w]) / 24).toFixed(2)}s` } as Vars
            }
          />
        ))}
      </div>
      <Caption>1 Earth day = 6 s here</Caption>
    </>
  );
}

/** A light pulse from Earth: real time to the Moon, sped up for Mars (which is minutes away). */
function LightViz({ other }: { other: Other }) {
  const travel = other === "moon" ? 1.3 : 4;
  return (
    <>
      <div className="relative mx-auto flex h-10 w-full max-w-60 items-center">
        <span className="size-3 shrink-0 rounded-full bg-earth shadow-[0_0_12px_var(--world-earth)]" />
        <span className="relative mx-1 h-px flex-1 bg-[repeating-linear-gradient(90deg,oklch(1_0_0/0.3)_0_4px,transparent_4px_8px)]">
          <span
            className="cond-photon absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-white"
            style={{ "--dur": `${(travel / 0.7).toFixed(2)}s` } as Vars}
          />
        </span>
        <span className={cn("size-3 shrink-0 rounded-full", DOT[other])} />
      </div>
      <Caption>{other === "moon" ? "Shown in real time" : "Sped up: the real trip takes minutes"}</Caption>
    </>
  );
}

/** Bars up or down from each world's own reference level (sea level on Earth, LOLA/MOLA datums elsewhere). */
function ElevationViz({ a, b, other }: { a?: number; b?: number; other: Other }) {
  const max = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), 500);
  const bar = (v: number | undefined, w: World) =>
    v === undefined ? (
      <span className="absolute inset-x-1 top-1 bottom-1 rounded-md border border-dashed border-white/15" />
    ) : (
      <span
        className={cn(
          "cond-rise absolute inset-x-1 rounded-sm",
          DOT[w],
          v >= 0 ? "bottom-1/2 origin-bottom" : "top-1/2 origin-top",
        )}
        style={{ height: `${(Math.abs(v) / max) * 46}%` }}
      />
    );
  return (
    <>
      <div className="relative mx-auto flex h-24 w-28 justify-center gap-6">
        <span className="absolute inset-x-0 top-1/2 h-px bg-white/25" />
        <span className="relative w-5">{bar(a, "earth")}</span>
        <span className="relative w-5">{bar(b, other)}</span>
      </div>
      <Caption>From each world&apos;s own zero level</Caption>
    </>
  );
}

/** The regional slope drawn at its true angle, with a rover crawling along it. */
function SlopeViz({ deg, other }: { deg: number | null; other: Other }) {
  if (deg == null) return <Caption>No slope near the pole</Caption>;
  return (
    <>
      <div className="relative mx-auto h-10 w-40">
        <span
          className="absolute start-0 bottom-2 h-px w-full origin-left bg-white/40"
          style={{ transform: `rotate(${-deg}deg)` }}
        >
          <span className={cn("cond-rover absolute -top-[5px] size-2.5 rounded-[3px]", DOT[other])} />
        </span>
      </div>
      <Caption>Drawn at the true angle, {deg}°</Caption>
    </>
  );
}

/* ---------- Rows ---------- */

function Value({ text, unit, note, align }: { text: string; unit?: string; note?: string; align: "start" | "end" }) {
  return (
    <div className={align === "end" ? "sm:text-end" : "text-start"}>
      <span className="text-[17px] leading-snug">
        {text}
        {unit && <span className="text-muted-foreground"> {unit}</span>}
      </span>
      {note && <span className="mt-1 block text-xs leading-snug text-muted-foreground">{note}</span>}
    </div>
  );
}

function Row({
  label,
  left,
  right,
  viz,
}: {
  label: string;
  left: React.ReactNode;
  right: React.ReactNode;
  viz: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) el.dataset.in = "";
        // Loops run only while the row is on screen.
        if (e.isIntersecting) el.dataset.vis = "";
        else delete el.dataset.vis;
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="cond-row grid grid-cols-2 items-center gap-x-6 gap-y-3 border-t border-white/[0.07] py-6 sm:grid-cols-[1fr_17rem_1fr]"
    >
      <dt className="cond-mid col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <span className="mb-2.5 block text-center text-sm font-medium text-foreground/80">{label}</span>
        {viz}
      </dt>
      <dd className="cond-left sm:col-start-1 sm:row-start-1">{left}</dd>
      <dd className="cond-right sm:col-start-3 sm:row-start-1">{right}</dd>
    </div>
  );
}

function MeasuredBlock({ site }: { site: Site }) {
  if (!headlineMetrics(site).length) return null;
  return (
    <div className="mt-2 border-t border-white/[0.07] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-heading text-lg font-semibold">Measured at {site.name}</h3>
        <span className="text-xs text-muted-foreground">
          Sampled from NASA orbiter maps · no matching Earth value in this table
        </span>
      </div>
      <MeasuredCards site={site} className="mt-4" />
    </div>
  );
}

export function Conditions({ a, b }: { a: Site; b: Site }) {
  const other = b.world as Other;
  const terrain = terrainFor(b.id);
  // Polar Moon sites have no regional slope on the 16 px/° grid; the LOLA 240 m polar map fills the gap.
  const localSlope = measured(b.id, "slopeLOLA");
  const slopeDeg = terrain?.slopeDeg ?? (localSlope ? Math.round(localSlope.value * 10) / 10 : null);
  // Rows hide for their entrance only once hydrated, so content is never invisible without JS.
  const armed = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const VIZ: Record<string, React.ReactNode> = {
    gravity: <GravityViz other={other} />,
    air: <AirViz other={other} />,
    temperature: <TempViz other={other} />,
    water: <WaterViz other={other} />,
    day: <DayViz other={other} />,
    light: <LightViz other={other} />,
  };

  return (
    <section className={cn("cond relative isolate mt-24", armed && "cond-armed")} aria-labelledby="conditions-title">
      <div
        aria-hidden
        className="cond-stars pointer-events-none absolute inset-x-[-1rem] -top-16 bottom-0 -z-10 md:inset-x-[-2rem]"
      />
      <h2 id="conditions-title" className="font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight">
        Conditions on the ground
      </h2>
      <p className="mt-2 max-w-[62ch] text-muted-foreground">
        What a rover or a crew would feel at each place. The middle column plays each difference out, at real ratios
        where NASA gives a number.
      </p>

      <div className="sticky top-16 z-20 mt-8 grid grid-cols-2 gap-x-6 rounded-2xl bg-[oklch(0.14_0.02_262/0.94)] px-4 py-3 text-sm shadow-[0_12px_30px_-12px_oklch(0_0_0/0.8)] ring-1 ring-white/[0.08] backdrop-blur-md sm:grid-cols-[1fr_17rem_1fr]">
        <span className={cn("flex items-center gap-2 font-medium sm:justify-end", TEXT.earth)}>
          <span className="size-2 rounded-full bg-earth" aria-hidden />
          {a.name}
        </span>
        <span className="hidden text-center text-xs text-muted-foreground sm:block">versus</span>
        <span className={cn("flex items-center gap-2 font-medium", TEXT[other])}>
          <span className={cn("size-2 rounded-full", DOT[other])} aria-hidden />
          {b.name}
        </span>
      </div>

      <div className="relative">
        {/* The spine down the middle fills as the section scrolls past. */}
        <span
          aria-hidden
          className="absolute inset-y-0 start-1/2 hidden w-px -translate-x-1/2 bg-white/[0.06] sm:block"
        >
          <span className="cond-spine block h-full w-full bg-primary/45" />
          <span className="cond-comet absolute start-1/2 size-1.5 -translate-x-1/2 rounded-full bg-primary" />
        </span>
        <dl key={`${a.id}:${b.id}`}>
          {ENVIRONMENT.map((row) => {
            const ea = row.values.earth;
            const eb = row.values[other];
            return (
              <Row
                key={row.key}
                label={row.label}
                viz={VIZ[row.key]}
                left={
                  <Value
                    text={ea.text}
                    unit={ea.value !== undefined ? row.unit : undefined}
                    note={ea.note}
                    align="end"
                  />
                }
                right={
                  <Value
                    text={eb.text}
                    unit={eb.value !== undefined ? row.unit : undefined}
                    note={eb.note}
                    align="start"
                  />
                }
              />
            );
          })}
          <Row
            label="Elevation"
            viz={<ElevationViz a={a.elevationM} b={terrain?.elevationM} other={other} />}
            left={
              <Value
                text={
                  a.elevationM !== undefined ? `${a.elevationM.toLocaleString("en-GB")} m` : "Varies across the region"
                }
                align="end"
              />
            }
            right={
              <Value
                text={terrain ? `${terrain.elevationM.toLocaleString("en-GB")} m` : "Not computed"}
                note="Computed from LOLA / MOLA"
                align="start"
              />
            }
          />
          <Row
            label={terrain?.slopeDeg == null && localSlope ? "Local slope" : "Regional slope"}
            viz={<SlopeViz deg={slopeDeg} other={other} />}
            left={<Value text="Not computed for Earth" align="end" />}
            right={
              <Value
                text={slopeDeg != null ? `${slopeDeg}°` : "Not computed near the pole"}
                note={terrain?.slopeDeg == null && localSlope ? "Mean within 1 km, LOLA 240 m polar map" : undefined}
                align="start"
              />
            }
          />
        </dl>
      </div>

      {/* Values sampled from NASA maps at the Moon/Mars site; Earth has no matching measurement in this table. */}
      <MeasuredBlock site={b} />
    </section>
  );
}
