import { Database, Layers, Orbit, Terminal } from "lucide-react";
import Link from "next/link";
import { DATASETS, FEATURE_INFO, catalogueStats, formatBytes, type Feature } from "@/lib/data/datasets";

const FEATURE_ORDER: Feature[] = ["finder", "moon-map", "score", "explore", "compare"];

/** Raw archives → scripts → web layers → features, as plain HTML: four stages joined by moving pulses. */
export function DataFlow() {
  const stats = catalogueStats();
  const perFeature = (f: Feature) => DATASETS.filter((d) => d.usedBy.includes(f)).length;

  const stages = [
    {
      icon: Database,
      title: "Raw archives",
      where: `assets-raw/nasa · ${formatBytes(stats.downloadedBytes)}`,
      items: ["NASA PDS Geosciences (LRO, Odyssey, MGS)", "NASA LP DAAC + Worldview / GIBS", "CSA Open Data (RADARSAT)", "Copernicus Data Space, ESA OSC", "JAXA Earth API"],
    },
    {
      icon: Terminal,
      title: "Scripts",
      where: "scripts/",
      items: ["fetch-nasa.sh (resumable PDS download)", "fetch-earth.py, fetch-earthdata.py", "fetch-partners.py", "preview-nasa.py (site samples)", "build-datalab.py (these previews)"],
      mono: true,
    },
    {
      icon: Layers,
      title: "Web layers",
      where: "public/data/",
      items: ["WebP map layers ≤ 150 KB each", "JSON legends with units and ranges", "Quantised value grids for in-browser maths", "Live NASA tiles (Trek, GIBS)"],
    },
  ];

  return (
    <ol className="grid items-stretch gap-0 lg:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)_2.5rem_minmax(0,1fr)_2.5rem_minmax(0,1fr)]">
      {stages.map((s, i) => (
        <Stage key={s.title} step={i + 1} icon={s.icon} title={s.title} where={s.where}>
          <ul className="flex flex-col gap-1.5">
            {s.items.map((it) => (
              <li key={it} className={s.mono ? "hud text-[12px] text-foreground/80" : "text-[13px] text-foreground/80"}>
                {it}
              </li>
            ))}
          </ul>
        </Stage>
      ))}
      <Stage step={4} icon={Orbit} title="Features" where="what you see" last>
        <ul className="flex flex-col gap-1">
          {FEATURE_ORDER.map((f) => (
            <li key={f}>
              <Link href={FEATURE_INFO[f].href} className="group flex items-baseline justify-between gap-2 rounded-md py-0.5 text-[13px] text-foreground/85 hover:text-primary">
                <span>{FEATURE_INFO[f].label}</span>
                <span className="hud text-[11px] text-muted-foreground group-hover:text-primary">{perFeature(f)} datasets</span>
              </Link>
            </li>
          ))}
        </ul>
      </Stage>
    </ol>
  );
}

function Stage({
  step,
  icon: Icon,
  title,
  where,
  last,
  children,
}: {
  step: number;
  icon: typeof Database;
  title: string;
  where: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <li className="glass flex flex-col gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <span className="relative flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25">
            <Icon className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="hud text-[10.5px] tracking-wider text-muted-foreground uppercase">Step {step}</p>
            <h3 className="font-heading leading-tight font-semibold">{title}</h3>
          </div>
        </div>
        <p className="hud truncate text-[11px] text-primary/80">{where}</p>
        {children}
      </li>
      {!last && <Connector />}
    </>
  );
}

/** A thin line with a pulse travelling along it: vertical on phones, horizontal from lg up. */
function Connector() {
  return (
    <li aria-hidden className="relative flex h-8 items-center justify-center lg:h-auto">
      <span className="relative h-full w-[6px] overflow-hidden lg:hidden">
        <span className="absolute inset-y-0 start-1/2 w-px bg-gradient-to-b from-primary/10 via-primary/40 to-primary/10" />
        <span className="datalab-flow-y">
          <span className="absolute start-1/2 top-0 size-[5px] -translate-x-1/2 rounded-full bg-primary shadow-[0_0_8px_1px_oklch(0.88_0.14_182/0.7)]" />
        </span>
      </span>
      <span className="relative hidden h-[6px] w-full overflow-hidden lg:block">
        <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-primary/10 via-primary/40 to-primary/10" />
        <span className="datalab-flow-x">
          <span className="absolute start-0 top-1/2 size-[5px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_1px_oklch(0.88_0.14_182/0.7)]" />
        </span>
      </span>
    </li>
  );
}
