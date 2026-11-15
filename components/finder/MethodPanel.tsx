"use client";

import { ExternalLink, TriangleAlert } from "lucide-react";
import { CLUSTER_KM } from "@/lib/finder/model";
import { CURVES } from "@/lib/finder/params";
import { DIM_HINT, DIM_LABEL, describeTarget } from "@/lib/finder/text";
import { DIM_IDS, type GridHeader, type ParamsHeader, type Target, type TargetsDoc } from "@/lib/finder/types";

const MODE_LABEL = { near: "direct", toward: "beyond Earth", rank: "rank", match: "evidence" } as const;

/** What the target looks like in numbers, and what it asks of Earth on each parameter. */
export function TargetProfile({ target }: { target: Target }) {
  return (
    <section aria-labelledby="profile-title">
      <h2 id="profile-title" className="font-heading text-xl font-semibold tracking-tight">
        {target.name} in numbers
      </h2>
      <p className="mt-2 max-w-[66ch] text-muted-foreground">{target.temps}</p>
      {target.refs && <p className="mt-1 text-xs text-muted-foreground">{target.refs.join(" · ")}</p>}
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {target.facts.map((f) => (
          <div key={f.label} className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="mt-1 hud text-xl">
              {f.v === null ? "–" : f.v.toLocaleString("en-US")}{" "}
              <span className="text-sm text-muted-foreground">{f.units}</span>
            </dd>
            <dd className="mt-1 text-[11px] text-muted-foreground/80">{f.source}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-6 grid gap-x-8 gap-y-4 md:grid-cols-2">
        {DIM_IDS.map((d) => {
          const s = target.params[d];
          if (!s) return null;
          return (
            <li key={d} className="text-sm leading-relaxed">
              <span className="font-medium">{DIM_LABEL[d]}</span>
              <span className="ms-2 rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] tracking-wide text-muted-foreground uppercase">
                {MODE_LABEL[s.mode]}
              </span>
              <p className="mt-0.5 text-muted-foreground">
                {describeTarget(d, s, target.world)}. <span className="text-muted-foreground/75">{DIM_HINT[d]}.</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Card({ title, tone, children }: { title: string; tone?: "warn"; children: React.ReactNode }) {
  return (
    <section
      className={
        tone === "warn"
          ? "rounded-[1.4rem] bg-warn/[0.04] p-5 ring-1 ring-warn/20"
          : "rounded-[1.4rem] bg-white/[0.03] p-5 ring-1 ring-white/10"
      }
    >
      <h3
        className={
          tone === "warn" ? "flex items-center gap-2 text-[15px] font-semibold text-warn" : "text-[15px] font-semibold"
        }
      >
        {tone === "warn" && <TriangleAlert className="size-4" aria-hidden />}
        {title}
      </h3>
      {children}
    </section>
  );
}

function DatasetLinks({ items }: { items: { id: string; title: string; url: string }[] }) {
  return (
    <ul className="mt-2 divide-y divide-white/[0.06]">
      {items.map((s) => (
        <li key={s.id}>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start justify-between gap-3 py-2.5 text-[13.5px] leading-snug text-foreground/85 transition-colors duration-150 hover:text-primary"
          >
            {s.title}
            <ExternalLink className="mt-0.5 size-3.5 shrink-0 opacity-60" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function MethodPanel({
  header,
  params,
  targets,
}: {
  header: GridHeader;
  params: ParamsHeader;
  targets: TargetsDoc;
}) {
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Describe all of Earth",
      body: (
        <>
          {header.grid.cells.toLocaleString("en-US")} land cells of 0.25° (≈ 28 km), each with air temperature and its
          range, rain, humidity, pressure and dust from NASA POWER, topsoil sand from SoilGrids, slope and elevation
          from JAXA AW3D30, and distance to the nearest town.
        </>
      ),
    },
    {
      title: "Describe the target",
      body: "From LRO (Diviner, LOLA), MGS (TES, MOLA), rover measurements (Curiosity RAD and REMS) and published mission results, as measured at the site.",
    },
    {
      title: "Compare like with like",
      body: (
        <>
          Where Earth can come close (rain, humidity, dust, slope, sand) values are compared directly. Where the target
          is beyond anything on Earth (vacuum, −200 °C, 384,000 km from home) land is ranked by how far it goes{" "}
          <em>toward</em> it. Elevation is compared by rank within each world, since each has its own zero level.
        </>
      ),
    },
    {
      title: "Score and weigh",
      body: "Each parameter gives a similarity from 0 to 1. Your weights decide how much each counts; the score is their weighted mean.",
    },
    {
      title: "Rank distinct places",
      body: (
        <>
          The best cells at least {CLUSTER_KM} km apart make the top 10. &ldquo;Top x %&rdquo; is the share of
          Earth&apos;s land area scoring higher.
        </>
      ),
    },
  ];
  const formulas: [string, string][] = [
    ["Direct", "exp(−½ ((x_earth − x_target) / σ)²)"],
    ["Toward", "p_earth  (or 1 − p_earth below Earth's range)"],
    ["Rank", `exp(−½ ((p_earth − p_target) / ${CURVES.elev.sigma})²)`],
    ["Score", "Σ wᵢ sᵢ / Σ wᵢ"],
  ];
  const limits = [
    ...params.notes,
    "Aqueous geochemistry is known only at catalogued analogue sites; everywhere else it counts as half a match.",
    "Mars mean temperature is the planet-wide mean, and Mars sand share is a grain-size class from TES thermal inertia.",
    "Not in the score: gravity, perchlorate and salt chemistry, radar roughness, and slopes finer than ~28 km. A high score means similar physical conditions, not identical geology.",
    targets.built.diviner_prp
      ? "Moon site temperatures come from the Diviner polar resource product, sampled within 3 km of each site."
      : "Moon temperatures are published Diviner values.",
    "Hand-set weights are the default. Learned weights, fitted to 23 known NASA analogue pairs, appear once the model is retrained on these parameters.",
  ];

  return (
    <section aria-labelledby="method-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <h2 id="method-title" className="font-heading text-xl font-semibold tracking-tight">
          Method, in plain words
        </h2>
        <p className="max-w-md text-[13px] text-muted-foreground sm:text-end">
          Runs in your browser in a Web Worker: moving a slider re-scores every cell on Earth in milliseconds.
        </p>
      </div>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <Card title="Pipeline">
            <ol className="mt-4">
              {steps.map((st, i) => (
                <li key={st.title} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < steps.length - 1 && (
                    <span className="absolute start-[13px] top-8 bottom-1 w-px bg-white/10" aria-hidden />
                  )}
                  <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 hud text-[13px] text-primary ring-1 ring-primary/30">
                    {i + 1}
                  </span>
                  <div className="pt-0.5">
                    <p className="text-[14.5px] font-semibold">{st.title}</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{st.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Formulas">
            <dl className="mt-3 divide-y divide-white/[0.06] overflow-x-auto">
              {formulas.map(([k, f]) => (
                <div key={k} className="flex items-baseline gap-4 py-2.5">
                  <dt className="w-14 shrink-0 text-[12px] font-medium text-muted-foreground">{k}</dt>
                  <dd
                    className={
                      k === "Score"
                        ? "hud text-[13px] whitespace-nowrap text-primary"
                        : "hud text-[13px] whitespace-nowrap text-foreground/90"
                    }
                  >
                    {k === "Score" ? "score" : "s"} = {f}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
              p = area-weighted percentile of Earth&apos;s land (elevation: within each world) · σ = {CURVES.tmean.sigma}{" "}
              °C, {CURVES.sand.sigma} % sand, {CURVES.daylight.sigma} h, {CURVES.precip.sigma} mm/yr; pressure, radiation
              and isolation in decades
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Limits we know about" tone="warn">
            <ul className="mt-3 space-y-2.5">
              {limits.map((n) => (
                <li key={n} className="flex gap-2.5 text-[13.5px] leading-relaxed text-foreground/85">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                  {n}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Datasets">
            <p className="mt-3 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Earth</p>
            <DatasetLinks items={params.sources} />
            <p className="mt-4 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
              Moon &amp; Mars
            </p>
            <DatasetLinks items={targets.sources} />
          </Card>
        </div>
      </div>
    </section>
  );
}
