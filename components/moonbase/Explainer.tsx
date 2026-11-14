"use client";

import {
  ChevronDown,
  ExternalLink,
  Info,
  Mountain,
  Snowflake,
  Sun,
  Thermometer,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { ARTEMIS_REGIONS, REGION_SOURCES } from "@/lib/moonbase/regions";
import { useMoonbase } from "@/lib/moonbase/store";
import { FACTORS } from "@/lib/moonbase/suitability";
import type { LayerMeta, Manifest, SiteValueEntry, SiteValues } from "@/lib/moonbase/types";

const WHY: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Sun,
    title: "The Sun never sets high",
    body: "The Moon's axis is tilted only 1.5°, so at the pole the Sun circles along the horizon. Tall ridges catch light for most of the year: steady solar power and gentler temperature swings than anywhere else on the Moon.",
  },
  {
    icon: Thermometer,
    title: "Some craters never see it",
    body: "Crater floors below the horizon stay in permanent shadow. The Diviner thermal model on this map has annual maximum temperatures as low as 27 K (−246 °C), colder than the surface of Pluto.",
  },
  {
    icon: Snowflake,
    title: "Cold enough to keep ice",
    body: "Below about 110 K, water ice survives for billions of years. LCROSS hit Cabeus crater in 2009 and found water in the plume. Ice means drinking water, oxygen to breathe and hydrogen + oxygen rocket fuel made on the Moon.",
  },
  {
    icon: Mountain,
    title: "Light and ice side by side",
    body: "Sunlit ridges sit a few kilometres from shadowed traps, so a base can run on solar power and still reach ice. Some peaks, like Malapert, also keep Earth in view for direct radio contact.",
  },
];

const fmt = (v: number | string | null | undefined, digits = 0, unit = "") =>
  typeof v === "number"
    ? `${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit}`
    : "—";

function iceText(e?: SiteValueEntry) {
  const s = e?.landingSites;
  if (!s || s.iceStableN === undefined) return "—";
  const med = s.iceMedian === "none" ? "> 2.87 m" : fmt(s.iceMedian as number, 2, " m");
  return `${med} · ${s.iceStableN}/${s.n}`;
}

/** Why the south pole, the Artemis regions in numbers, how the score works, and what the data cannot tell you. */
export function Explainer({ manifest, siteValues }: { manifest: Manifest | null; siteValues: SiteValues | null }) {
  const fly = useMoonbase((s) => s.fly);
  const setPinned = useMoonbase((s) => s.setPinned);
  const setFocus = useMoonbase((s) => s.setFocusRegion);
  const layer = (id: string): LayerMeta | undefined => manifest?.layers.find((l) => l.id === id);
  const entry = (id: string) => siteValues?.entries.find((e) => e.id === `artemis-${id}`);
  const ice = layer("icedepth");
  const prp = layer("tmax");
  const rock = layer("rock");
  const datasets = manifest
    ? [
        ...new Map(
          manifest.layers
            .filter((l) => l.status === "ready" || l.status === "no_coverage")
            .map((l) => [l.dataset.name, l.dataset]),
        ).values(),
      ]
    : [];

  const goTo = (id: string) => {
    const r = ARTEMIS_REGIONS.find((x) => x.id === id);
    if (!r) return;
    setFocus(r.id);
    setPinned({ x: r.x, y: r.y, lat: r.lat, lon: r.lon });
    fly(r.x, r.y, 2.4);
    document.getElementById("moonbase-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <section aria-labelledby="why-title" className="mt-20">
        <p className="hud text-xs tracking-[0.14em] text-moon uppercase">Why here</p>
        <h2 id="why-title" className="mt-1 font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight">
          Why the lunar south pole?
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {WHY.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <h3 className="mt-4 font-heading text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="regions-title" className="mt-20">
        <p className="hud text-xs tracking-[0.14em] text-moon uppercase">NASA · October 2024</p>
        <h2
          id="regions-title"
          className="mt-1 font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight"
        >
          The nine Artemis III regions, by the numbers
        </h2>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          Averages over the candidate landing sites published inside each region (Wueller et al. 2026), read from the
          960 m layers on this map. &ldquo;Area under 8°&rdquo; covers the whole approximate region. Select a name to
          fly there.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-white/10">
          <table className="w-full min-w-[960px] text-left text-sm">
            <caption className="sr-only">Layer values at the Artemis III candidate regions</caption>
            <thead className="bg-white/[0.04] text-[11px] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Region
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Slope at sites
                  <span className="block font-normal opacity-75">° · LOLA</span>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Area under 8°
                  <span className="block font-normal opacity-75">% · LOLA</span>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Ruggedness
                  <span className="block font-normal opacity-75">° · LOLA</span>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Avg / max temp.
                  <span className="block font-normal opacity-75">K · Diviner PRP</span>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Ice depth · sites with ice
                  <span className="block font-normal opacity-75">m, median · Diviner PRP</span>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Cold trap
                  <span className="block font-normal opacity-75">km away · Diviner PRP</span>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Radar CPR
                  <span className="block font-normal opacity-75">ratio · Mini-RF</span>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Hydrogen signal
                  <span className="block font-normal opacity-75">% fewer neutrons, region · LEND</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] hud text-[13px]">
              {ARTEMIS_REGIONS.map((r) => {
                const e = entry(r.id);
                const s = e?.landingSites;
                const a = e?.area;
                return (
                  <tr key={r.id} className="transition-colors duration-150 hover:bg-white/[0.03]">
                    <th scope="row" className="px-4 py-2.5 font-sans font-medium">
                      <button
                        type="button"
                        onClick={() => goTo(r.id)}
                        className="flex items-center gap-2 text-left hover:text-primary"
                      >
                        <span className="flex h-5 min-w-10 items-center justify-center rounded bg-primary/12 px-1 hud text-[10px] font-semibold text-primary">
                          {r.short}
                        </span>
                        {r.name}
                      </button>
                    </th>
                    <td className="px-3 py-2.5">{fmt(s?.slopeMean, 1)}</td>
                    <td className="px-3 py-2.5">{fmt(a?.slopeBelow8Pct, 0)}</td>
                    <td className="px-3 py-2.5">{fmt(s?.ruggednessMean, 1)}</td>
                    <td className="px-3 py-2.5">
                      {fmt(s?.tavgMean, 0)} <span className="text-muted-foreground">/</span> {fmt(s?.tmaxMean, 0)}
                    </td>
                    <td className="px-3 py-2.5">{iceText(e)}</td>
                    <td className="px-3 py-2.5">{fmt(s?.trapdistMean, 1)}</td>
                    <td className="px-3 py-2.5">{fmt(s?.cprMean, 2)}</td>
                    <td className="px-3 py-2.5">
                      {typeof a?.lendMean === "number" ? `${a.lendMean > 0 ? "+" : ""}${a.lendMean.toFixed(1)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Ice depth: median over the sites (&ldquo;&gt; 2.87 m&rdquo; when most sites have no stable ice within the
          model&apos;s 2.87 m), then how many sites have stable ice. Rock abundance is missing on purpose:{" "}
          {rock?.statusNote ?? "the global Diviner product does not reach the pole."}
        </p>
      </section>

      <details className="group mt-16 rounded-[1.6rem] bg-white/[0.025] ring-1 ring-white/10 open:bg-white/[0.035]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-heading text-lg font-semibold">Method, limits and datasets</span>
            <span className="block text-[13px] text-muted-foreground">
              How the base score is calculated, what to know before trusting a number, and every source.
            </span>
          </span>
          <ChevronDown
            className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <section aria-labelledby="score-title" className="grid items-start gap-4 px-5 pb-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-[1.4rem] bg-white/[0.03] p-5 ring-1 ring-white/10">
              <h2 id="score-title" className="text-[15px] font-semibold">
                How the base score works
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                Each factor turns one layer into a score from 0 to 1 with a straight-line rule. Your weights decide how
                much each one counts, and the map shows their weighted mean for every 960 m cell. Cells missing any
                weighted layer stay blank instead of being guessed.
              </p>
              <p className="mt-4 rounded-xl bg-white/[0.04] px-3.5 py-2.5 hud text-[13px] text-primary ring-1 ring-white/10">
                score = Σ wᵢ · sᵢ(layerᵢ) / Σ wᵢ
              </p>
              <dl className="mt-3 divide-y divide-white/[0.06]">
                {FACTORS.map((f) => (
                  <div key={f.id} className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-[13.5px] font-medium">{f.label}</dt>
                    <dd className="text-[13px] text-muted-foreground">{f.rule}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                The thresholds are planning rules of thumb, not NASA requirements, except the 8° lander slope limit that
                Wueller et al. used with 20 m LOLA data. Everything runs in your browser: moving a slider re-scores all
                908,000 cells at once.
              </p>
            </div>
            <div className="rounded-[1.4rem] bg-white/[0.03] p-5 ring-1 ring-white/10">
              <h3 className="text-[15px] font-semibold">Datasets</h3>
              <ul className="mt-2 divide-y divide-white/[0.06]">
                {[...datasets.map((d) => ({ label: d.name, url: d.url })), ...REGION_SOURCES].map((s) => (
                  <li key={s.label}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start justify-between gap-3 py-2.5 text-[13.5px] leading-snug text-foreground/85 transition-colors duration-150 hover:text-primary"
                    >
                      {s.label}
                      <ExternalLink className="mt-0.5 size-3.5 shrink-0 opacity-60" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.4rem] bg-warn/[0.04] p-5 ring-1 ring-warn/20">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-warn">
                <TriangleAlert className="size-4" aria-hidden />
                Read this before trusting a number
              </h3>
              <ul className="mt-3 space-y-2.5">
                {[
                  "Different sharpness: LOLA elevation is 240 m per pixel (shown at 480 m, read at 960 m). The Diviner polar model works on a 0.5 km grid. The global Diviner and Mini-RF maps are 32 pixels per degree, about 950 m north–south. A lander needs metre-scale safety; none of these layers can show a single boulder.",
                  prp?.coverageNote ?? "The Diviner polar model covers about ±300 km around the pole.",
                  "Ice depth and cold traps come from a thermal model of where ice COULD survive, not from a detection. Whether ice is actually there depends on its delivery history.",
                  ice?.sentinels?.["-1"]
                    ? `Ice-depth special values: −999 (documented) means deeper than 2.87 m and is shown grey. −1 is not in the label; we found it only on the coldest triangles (annual max ≤ 101.3 K) and treat it as ice stable at the surface.`
                    : "Ice depth −999 means deeper than 2.87 m, the model's limit, and is shown grey.",
                  "Mini-RF CPR is ambiguous: high values mean ground rough at the 10 cm scale (blocky rocks, fresh craters) OR possibly ice. The global mosaic also shows orbit-track streaks close to the pole.",
                  "LEND sees hydrogen through neutrons, not ice directly, and only at 10–15 km scale. Its signal is a few per cent, so the readout shows each value ± its uncertainty; cells right at the pole are too sparse and left blank.",
                  rock?.statusNote ?? "Diviner rock abundance does not reach the pole.",
                  "High ground and warm annual average are proxies for sunlight, not an illumination model. Region centres and outlines are approximate (NASA published a map, not coordinates).",
                ].map((n) => (
                  <li key={n} className="flex gap-2.5 text-[13.5px] leading-relaxed text-foreground/85">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </details>
    </>
  );
}
