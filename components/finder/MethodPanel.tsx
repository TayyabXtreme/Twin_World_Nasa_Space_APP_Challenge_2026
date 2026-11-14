"use client";

import { ExternalLink } from "lucide-react";
import { CLUSTER_KM, NDVI_TOL, RELIEF_LOG_SIGMA, SIGMA_ROLE, SUN_SIGMA } from "@/lib/finder/model";
import { DIM_LABEL } from "@/lib/finder/text";
import { DIM_IDS, type GridHeader, type Target, type TargetsDoc } from "@/lib/finder/types";

/** What the target looks like in numbers, and how each dimension was translated to Earth. */
export function TargetProfile({ target }: { target: Target }) {
  return (
    <section aria-labelledby="profile-title">
      <h2 id="profile-title" className="font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight">
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
          const s = target.dims[d];
          if (!s) return null;
          return (
            <li key={d} className="text-sm leading-relaxed">
              <span className="font-medium">{DIM_LABEL[d]}</span>
              <span className="ms-2 rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] tracking-wide text-muted-foreground uppercase">
                {s.mode === "role" ? "rank" : "absolute"}
              </span>
              <p className="mt-0.5 text-muted-foreground">{s.note}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MethodPanel({ header, targets }: { header: GridHeader; targets: TargetsDoc }) {
  return (
    <section aria-labelledby="method-title" className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <h2 id="method-title" className="font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight">
          Method, in plain words
        </h2>
        <ol className="mt-5 space-y-4 text-[15px] leading-relaxed text-foreground/90">
          <li>
            <span className="font-medium text-foreground">1. Describe all of Earth.</span>{" "}
            {header.grid.cells.toLocaleString("en-US")} land cells of 0.25° (about 28 km), each with temperatures,
            day–night swing, frozen months, vegetation, albedo, apparent thermal inertia and terrain relief from NASA
            MODIS (2024) and JAXA AW3D30.
          </li>
          <li>
            <span className="font-medium text-foreground">2. Describe the target.</span> From LRO (Diviner, LOLA) or
            Mars Odyssey, MGS TES and MOLA, as measured at the site.
          </li>
          <li>
            <span className="font-medium text-foreground">3. Compare like with like.</span> Where a quantity means the
            same on both worlds (no plants, Sun height, metres of relief) we compare values directly. Where it cannot
            match (no Earth ground is −200 °C), we compare <em>rank</em>: if the target is colder than 99.9 % of the
            Moon, we look for Earth ground colder than 99.9 % of Earth.
          </li>
          <li>
            <span className="font-medium text-foreground">4. Score and weigh.</span> Each dimension gives a similarity
            from 0 to 1. Your weights decide how much each one counts. The overall score is their weighted mean.
          </li>
          <li>
            <span className="font-medium text-foreground">5. Rank distinct places.</span> The best cells at least{" "}
            {CLUSTER_KM} km apart are the top 10; &quot;top x %&quot; is the share of Earth&apos;s land area scoring
            higher.
          </li>
        </ol>
        <div className="mt-6 overflow-x-auto rounded-2xl bg-black/30 p-4 font-mono text-[12px] leading-relaxed text-foreground/85 ring-1 ring-white/10">
          <p>rank: s = exp(−½ ((p_earth − p_target) / {SIGMA_ROLE})²)</p>
          <p>plants: s = exp(−½ (max(0, NDVI − 0.03) / {NDVI_TOL})²)</p>
          <p>sun: s = exp(−½ ((E_earth − E_target) / {SUN_SIGMA}°)²)</p>
          <p>relief: s = exp(−½ (ln((r+20)/(r_t+20)) / {RELIEF_LOG_SIGMA.toFixed(2)})²)</p>
          <p className="mt-2">score = Σ wᵢ sᵢ / Σ wᵢ</p>
          <p className="mt-2 text-muted-foreground">
            p = area-weighted percentile within each world · E = highest noon Sun (90° − |lat| + tilt)
          </p>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          The whole calculation runs in your browser in a Web Worker, so moving a slider re-scores every cell on Earth
          in a few milliseconds.
        </p>
      </div>
      <div>
        <h3 className="font-heading text-lg font-semibold">Limits we know about</h3>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-foreground/85">
          {header.notes.map((n) => (
            <li key={n} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
              {n}
            </li>
          ))}
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            MODIS Terra observes at about 10:30 and 22:30 local time, so the day–night swing understates the true daily
            range.
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            Not yet in the score: surface chemistry (salts, perchlorate, clays), radar roughness, dust, and slopes finer
            than ~22 km. A high score means similar physical conditions, not identical geology.
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            {targets.built.diviner_prp
              ? "Moon site temperatures come from the Diviner polar resource product, sampled within 3 km of each site."
              : "The Diviner polar resource product was still downloading at build time, so Moon temperatures are published Diviner values; the ranks use latitude, which Diviner shows controls lunar temperature."}
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            Weights are set by hand. Learning them from known NASA analogue pairs (plan §6.1) is the next step.
          </li>
        </ul>
        <h3 className="mt-8 font-heading text-lg font-semibold">Datasets</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {[...header.sources, ...targets.sources].map((s) => (
            <li key={s.id}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-1.5 text-foreground/85 hover:text-primary"
              >
                {s.title}
                <ExternalLink className="mt-1 size-3 shrink-0 opacity-60" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
