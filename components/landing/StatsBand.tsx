import { NumberTicker } from "@/components/ui/number-ticker";
import { catalogueStats } from "@/lib/data/datasets";
import landing from "@/lib/data/landing.generated.json";
import { Reveal } from "./Reveal";

/** Headline numbers, all computed from the dataset catalogue and the Finder grid (never typed in by hand). */
export function StatsBand() {
  const s = catalogueStats();
  const stats = [
    { value: s.datasets, decimals: 0, unit: "", label: "datasets catalogued" },
    { value: s.agencies, decimals: 0, unit: "", label: "space agencies: NASA · CSA · ESA · JAXA" },
    { value: s.downloadedBytes / 1e9, decimals: 1, unit: " GB", label: "of raw mission data processed" },
    { value: landing.earthCells, decimals: 0, unit: "", label: "Earth land cells scored per search" },
    { value: landing.moon.regions.length, decimals: 0, unit: "", label: "Artemis III landing regions mapped" },
  ];
  return (
    <section
      aria-label="TwinWorlds in numbers"
      className="relative border-y border-[var(--line)] bg-[oklch(0.12_0.02_260/0.6)]"
    >
      <dl className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((st, i) => (
          <Reveal
            key={st.label}
            delay={i * 0.07}
            y={14}
            className="border-[var(--line)] px-5 py-7 not-last:border-e max-sm:nth-[2n]:border-e-0 max-sm:nth-[n+3]:border-t sm:px-6 sm:max-lg:nth-[3n]:border-e-0 sm:max-lg:nth-[n+4]:border-t"
          >
            <dt className="sr-only">{st.label}</dt>
            <dd className="display text-[clamp(1.7rem,3vw,2.4rem)] leading-none font-semibold text-[var(--ink)] tabular-nums">
              <NumberTicker value={st.value} decimalPlaces={st.decimals} className="text-[var(--ink)]" />
              {st.unit}
            </dd>
            <dd aria-hidden className="mt-2 text-[0.8rem] leading-snug text-[var(--ink-dim)]">
              {st.label}
            </dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
