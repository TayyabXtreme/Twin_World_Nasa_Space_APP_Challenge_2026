import { ExternalLink, ShieldAlert } from "lucide-react";
import { WORLD_LIMITS } from "@/lib/finder/text";
import type { Target } from "@/lib/finder/types";

/** What no Earth site can match for this world, said once at the top instead of in every card. */
export function EarthLimits({ target }: { target: Target }) {
  const limits = WORLD_LIMITS[target.world];
  return (
    <section aria-labelledby="limits-title" className="mt-5 rounded-[1.4rem] bg-warn/[0.05] p-4 ring-1 ring-warn/20 sm:p-5">
      <h2 id="limits-title" className="flex items-center gap-2 text-sm font-semibold text-warn">
        <ShieldAlert className="size-4" aria-hidden /> No Earth site can match these on {target.world === "moon" ? "the Moon" : "Mars"}
      </h2>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        {limits.map((l) => (
          <li key={l.title} className="text-[13px] leading-snug">
            <span className="font-medium text-foreground">{l.title}.</span> <span className="text-muted-foreground">{l.text.split(". ")[0]}.</span>
            {l.title === "Temperature" && <span className="text-foreground/80"> Scored by rank instead (coldest of each world).</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Gravity, {target.world === "moon" ? "vacuum" : "the thin CO₂ air"} and radiation are left out of the score: no Earth place could score on them, so they would
        only lower every site by the same amount. The score below compares what Earth <em>can</em> stand in for.
      </p>
    </section>
  );
}

/** The data behind the Finder, grouped by the challenge's own resource list. */
const SOURCES: { resource: string; url: string; items: string[] }[] = [
  {
    resource: "NASA Earthdata Search",
    url: "https://search.earthdata.nasa.gov/",
    items: ["MODIS MOD11C3: land surface temperature, day and night", "MODIS MOD13C2: vegetation (NDVI)", "MODIS MCD43C3: albedo (for apparent thermal inertia)"],
  },
  { resource: "NASA Worldview / GIBS", url: "https://worldview.earthdata.nasa.gov/", items: ["Blue Marble base map", "Satellite tab: recent imagery of any place"] },
  {
    resource: "NASA Planetary Data System",
    url: "https://pds.nasa.gov/",
    items: ["MGS TES: Mars thermal inertia", "MGS MOLA: Mars terrain relief", "Mars Odyssey GRS and neutron spectrometer: hydrogen (ice)"],
  },
  {
    resource: "NASA LRO (Diviner, LOLA)",
    url: "https://lunar.gsfc.nasa.gov/",
    items: ["Diviner polar resource product: temperatures and ice stability", "LOLA: lunar terrain relief", "Diviner: regolith thermal inertia"],
  },
  { resource: "JAXA", url: "https://www.eorc.jaxa.jp/ALOS/en/aw3d30/", items: ["ALOS AW3D30: Earth terrain relief (30 m)"] },
];

export function MethodGlance() {
  return (
    <section id="finder-method" aria-labelledby="method-title" className="mt-16 scroll-mt-36 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <h2 id="method-title" className="font-heading text-xl font-semibold tracking-tight">
          How the score works
        </h2>
        <ol className="mt-3 space-y-2.5 text-[14px] leading-relaxed text-muted-foreground">
          <li>
            <span className="text-foreground">1. Seven parameters.</span> Temperature, day–night swing, vegetation, thermal inertia (loose vs rocky ground), frozen
            ground, Sun height and terrain relief, each measured on Earth and on the target world.
          </li>
          <li>
            <span className="text-foreground">2. Similarity per parameter, 0–100 %.</span> It falls off along a bell curve as the Earth value moves away from the
            target, by the tolerance shown in the breakdown. Where a value cannot exist on Earth (−222 °C), both are compared by rank within their own world.
          </li>
          <li>
            <span className="text-foreground">3. Score = Σ (weight × similarity) ÷ Σ weight.</span> Move the weights and every site re-scores instantly.
          </li>
          <li>
            <span className="text-foreground">4. Confidence</span> is the share of that score resting on direct measurements on both worlds. Proxies (apparent
            thermal inertia, Mars hydrogen as ice) count less, and so do gaps at the site: months without MODIS temperature, polar night, ice with no
            vegetation reading, missing albedo.
          </li>
        </ol>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Named sites are scored by their best 0.25° (≈ 28 km) land cell within 25–80 km of the published site. A high score means the measured conditions play
          a similar role on each world, never that Earth matches the Moon or Mars outright.
        </p>
      </div>
      <div className="rounded-[1.4rem] bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
        <h3 className="text-sm font-semibold">Data used on this page</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">Only open data from the challenge&apos;s resource list.</p>
        <ul className="mt-3 space-y-3">
          {SOURCES.map((s) => (
            <li key={s.resource}>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground hover:text-primary">
                {s.resource} <ExternalLink className="size-3 opacity-60" aria-hidden />
              </a>
              <ul className="mt-1 space-y-0.5 text-[12px] text-muted-foreground">
                {s.items.map((i) => (
                  <li key={i}>· {i}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
