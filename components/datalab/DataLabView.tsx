import { ArrowUpRight, Download } from "lucide-react";
import Image from "next/image";
import { AGENCIES, AGENCY_INFO, DATASETS, catalogueStats, formatBytes, type Agency } from "@/lib/data/datasets";
import { AccountSection } from "./AccountSection";
import { DataFlow } from "./DataFlow";
import { DatasetCatalogue } from "./DatasetCatalogue";
import { GetDataSection } from "./GetDataSection";
import { WORLD_DOT, WORLD_NAME } from "./parts";
import "./datalab.css";
import { Morph } from "@/components/motion/PageTransition";

const SECTIONS = [
  { id: "catalogue", label: "Catalogue" },
  { id: "get-data", label: "Get the data" },
  { id: "agencies", label: "Partner agencies" },
  { id: "flow", label: "How the data flows" },
  { id: "account", label: "Needs a free account" },
];

/** Real previews behind the hero, drawn from the catalogue itself. */
const WALL = [
  "moon-lola-dem-south",
  "mars-tes-thermal-inertia",
  "earth-modis-lst-monthly",
  "csa-rcm",
  "mars-mola",
  "earth-worldview-truecolour",
  "moon-diviner-rock",
  "earth-modis-ndvi-monthly",
  "copernicus-s1",
  "mars-neutron-epithermal",
  "moon-lola-slope-south",
  "earth-modis-albedo",
]
  .map((id) => DATASETS.find((d) => d.id === id)?.preview)
  .filter((p) => p !== undefined);

const AGENCY_TINT: Record<Agency, string> = {
  NASA: "oklch(0.7 0.14 255)",
  CSA: "oklch(0.68 0.17 25)",
  ESA: "oklch(0.78 0.11 220)",
  JAXA: "oklch(0.74 0.1 290)",
};

export function DataLabView() {
  const s = catalogueStats();
  const [gbValue, gbUnit] = formatBytes(s.downloadedBytes).split(" ");
  const worlds = [...new Set(DATASETS.map((d) => d.world))];
  const live = DATASETS.filter((d) => d.status === "live").length;

  const tiles = [
    { value: String(s.datasets), unit: "", label: "Datasets", note: `${s.downloadedCount} downloaded · ${live} live · ${s.needsAccount.filter((d) => d.status === "needs-account").length} need a login` },
    { value: String(s.agencies), unit: "", label: "Space agencies", note: AGENCIES.join(" · ") },
    { value: gbValue, unit: gbUnit, label: "Raw data on disk", note: `${s.downloadedCount} datasets, before any processing` },
    { value: String(s.worlds), unit: "", label: "Worlds", note: worlds.map((w) => WORLD_NAME[w]).join(" · ") },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-20">
      {/* ── Hero ── */}
      <Morph name="feature-data">
      <section aria-labelledby="datalab-title" className="relative isolate overflow-hidden rounded-[1.75rem] border border-white/[0.06] bg-[oklch(0.13_0.02_265/0.7)] px-5 pt-10 pb-6 sm:px-8 sm:pt-14">
        <div aria-hidden className="datalab-wall pointer-events-none absolute inset-y-0 end-0 -z-10 w-full opacity-40 sm:w-[70%] sm:opacity-60">
          <div className="datalab-wall-track absolute -inset-[20%] grid grid-cols-3 gap-3 sm:grid-cols-4">
            {[...WALL, ...WALL].map((p, i) => (
              <div key={`${p.src}-${i}`} className="relative aspect-[4/3] overflow-hidden rounded-xl ring-1 ring-white/10">
                <Image src={p.src} alt="" fill sizes="220px" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[oklch(0.13_0.02_265)] via-[oklch(0.13_0.02_265/0.85)] to-transparent" />

        <p className="hud animate-rise text-xs tracking-[0.2em] text-primary uppercase">Data Lab</p>
        <h1 id="datalab-title" className="mt-3 max-w-2xl animate-rise font-heading text-[clamp(2.1rem,5vw,3.6rem)] leading-[1.02] font-semibold tracking-tight [animation-delay:60ms]">
          Every dataset behind TwinWorlds
        </h1>
        <p className="mt-4 max-w-xl animate-rise text-[1.02rem] leading-relaxed text-foreground/80 [animation-delay:120ms]">
          What each file measures, how sharp it is, where it covers, who made it and what it is allowed to tell us. The numbers on this page are
          counted from the catalogue itself; anything we do not know says “unknown”.
        </p>

        <dl className="mt-8 grid animate-rise grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 [animation-delay:180ms] lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col gap-1 bg-[oklch(0.14_0.02_265/0.92)] p-4 backdrop-blur-md">
              <dt className="order-2 text-sm font-medium">{t.label}</dt>
              <dd className="order-1 font-heading text-[clamp(1.9rem,4vw,2.6rem)] leading-none font-semibold tracking-tight">
                <span className="tabular-nums">{t.value}</span>
                {t.unit && <span className="ms-1 text-lg text-muted-foreground">{t.unit}</span>}
              </dd>
              <dd className="order-3 text-xs leading-snug text-muted-foreground">{t.note}</dd>
            </div>
          ))}
        </dl>

        {s.downloading.length > 0 && (
          <p className="mt-4 flex animate-rise items-start gap-2 text-sm text-foreground/80 [animation-delay:240ms]">
            <Download className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <span>
              Still downloading on a slow, resetting connection (resumable):{" "}
              {s.downloading.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && " and "}
                  <span className="text-foreground">{d.name}</span> <span className="hud text-muted-foreground">({formatBytes(d.sizeBytes)})</span>
                </span>
              ))}
              . They are not counted in the total above.
            </span>
          </p>
        )}

        <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {SECTIONS.map((x) => (
            <a key={x.id} href={`#${x.id}`} className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-white/25 hover:text-foreground">
              {x.label}
            </a>
          ))}
        </nav>
      </section>
      </Morph>

      {/* ── Catalogue ── */}
      <section id="catalogue" aria-labelledby="catalogue-title" className="scroll-mt-24">
        <SectionHead id="catalogue-title" title="Catalogue" lede="Filter by world, agency, status or the feature that reads it. Open a card for the full record: licence, credit, limits and the source link." />
        <DatasetCatalogue />
      </section>

      {/* ── Get the data ── */}
      <section id="get-data" aria-labelledby="get-data-title" className="scroll-mt-24">
        <SectionHead
          id="get-data-title"
          title="Get the data"
          lede="Pick a place and see which NASA files cover it right now, straight from NASA's CMR catalogue: MODIS temperature and vegetation, ASTER elevation, SMAP soil moisture and 30 m HLS imagery."
        />
        <GetDataSection />
      </section>

      {/* ── Partner agencies ── */}
      <section id="agencies" aria-labelledby="agencies-title" className="scroll-mt-24">
        <SectionHead id="agencies-title" title="Partner agencies" lede="The challenge asks for data from NASA and its partners. This is what each one contributes." />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AGENCIES.map((a) => {
            const mine = DATASETS.filter((d) => d.agency === a);
            const info = AGENCY_INFO[a];
            const ws = [...new Set(mine.map((d) => d.world))];
            return (
              <li key={a} className="glass relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4">
                <span aria-hidden className="absolute -end-10 -top-10 size-32 rounded-full opacity-25 blur-2xl" style={{ background: AGENCY_TINT[a] }} />
                <div className="relative flex items-baseline justify-between gap-2">
                  <span className="font-heading text-3xl font-bold tracking-tight" style={{ color: AGENCY_TINT[a] }}>
                    {info.name}
                  </span>
                  <span className="hud text-xs text-muted-foreground">
                    {mine.length} {mine.length === 1 ? "dataset" : "datasets"}
                  </span>
                </div>
                <p className="relative text-xs text-muted-foreground">{info.full}</p>
                <p className="relative text-sm leading-relaxed text-foreground/85">{info.role}</p>
                <div className="relative mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {ws.map((w) => (
                      <span key={w} className="inline-flex items-center gap-1">
                        <span className={`size-1.5 rounded-full ${WORLD_DOT[w]}`} aria-hidden />
                        {WORLD_NAME[w]}
                      </span>
                    ))}
                  </span>
                  <a href={info.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary">
                    Open data
                    <ArrowUpRight className="size-3" aria-hidden />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Flow ── */}
      <section id="flow" aria-labelledby="flow-title" className="scroll-mt-24">
        <SectionHead
          id="flow-title"
          title="How the data flows"
          lede="Raw files never ship to the browser. Scripts turn them into small web layers, and the features read only those."
        />
        <DataFlow />
      </section>

      {/* ── Needs an account ── */}
      <section id="account" aria-labelledby="account-title" className="scroll-mt-24">
        <SectionHead
          id="account-title"
          title="Needs a free account"
          lede="Everything above was fetched without a password, except the MODIS grids (Earthdata Login). With these free logins, anyone can add the rest."
        />
        <AccountSection />
      </section>
    </div>
  );
}

function SectionHead({ id, title, lede }: { id: string; title: string; lede: string }) {
  return (
    <header className="mb-6 max-w-2xl">
      <h2 id={id} className="font-heading text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-2 text-muted-foreground">{lede}</p>
    </header>
  );
}
