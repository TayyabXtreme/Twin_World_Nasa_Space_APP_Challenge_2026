import {
  DATASETS,
  METRIC_GROUPS,
  METRIC_INFO,
  formatMetric,
  formatSpread,
  metricsFor,
  type Metric,
  type MetricKey,
} from "@/lib/data/metrics";
import type { Site } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { DatasetBadge } from "./DatasetBadge";

/*
 * Measured NASA values at a Moon or Mars site (lib/data/site-metrics.generated.json), grouped by the question
 * they answer. Missing values are never hidden silently: gaps are listed with their reason underneath.
 */

type Other = "moon" | "mars";

const CHEM: Partial<Record<MetricKey, string>> = {
  ironGRS: "Fe",
  siliconGRS: "Si",
  chlorineGRS: "Cl",
  potassiumGRS: "K",
  thoriumGRS: "Th",
};

function detail(m: Metric) {
  const bits = [m.resolution, `averaged over ${m.sample}`];
  if (m.range) bits.push(`10–90 %: ${m.range[0]}–${m.range[1]} ${m.units === "ratio" ? "" : m.units}`.trim());
  if (m.interpolatedShare) bits.push(`${Math.round(m.interpolatedShare * 100)} % of pixels interpolated`);
  return bits.join(" · ");
}

function gaps(siteId: string, keys: MetricKey[]) {
  const all = metricsFor(siteId);
  const pending: MetricKey[] = [];
  const byNote = new Map<string, MetricKey[]>();
  for (const k of keys) {
    const m = all[k];
    if (!m || m.value !== null) continue;
    if (m.pending) pending.push(k);
    else if (m.note) byNote.set(m.note, [...(byNote.get(m.note) ?? []), k]);
  }
  return { pending, byNote: [...byNote.entries()] };
}

const names = (keys: MetricKey[]) => keys.map((k) => METRIC_INFO[k].label.toLowerCase()).join(", ");

/** Full panel for the site drawer. */
export function MeasuredPanel({ site }: { site: Site }) {
  if (site.world === "earth") return null;
  const all = metricsFor(site.id);
  const groups = METRIC_GROUPS[site.world as Other];
  const keys = groups.flatMap((g) => g.keys);
  if (!keys.some((k) => all[k])) return null;
  const { pending, byNote } = gaps(site.id, keys);
  const pendingSets = [...new Set(pending.map((k) => DATASETS[all[k]!.datasetId].short))];

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const rows = g.keys.filter((k) => all[k]?.value != null);
        if (!rows.length) return null;
        const chem = rows.every((k) => CHEM[k]);
        return (
          <div key={g.title}>
            <h4 className="mb-1.5 text-[11px] font-medium text-foreground/70">{g.title}</h4>
            {chem ? (
              <>
                <dl className="grid grid-cols-3 gap-1.5">
                  {rows.map((k) => {
                    const m = all[k]!;
                    return (
                      <div key={k} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5 ring-1 ring-white/[0.06]">
                        <dt className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground/80">{CHEM[k]}</span> {METRIC_INFO[k].label}
                        </dt>
                        <dd className="hud text-sm">{formatMetric(k, m)}</dd>
                      </div>
                    );
                  })}
                </dl>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>Top ~1 m, 5° bins (~300 km)</span>
                  <DatasetBadge id="odyssey-grs" detail={detail(all[rows[0]]!)} />
                </div>
              </>
            ) : (
              <dl className="divide-y divide-white/[0.05]">
                {rows.map((k) => {
                  const m = all[k]!;
                  const spread = formatSpread(k, m);
                  return (
                    <div key={k} className="flex items-start justify-between gap-3 py-2">
                      <dt className="min-w-0">
                        <span className="block text-sm">{METRIC_INFO[k].label}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">
                          {METRIC_INFO[k].hint}
                        </span>
                      </dt>
                      <dd className="flex shrink-0 flex-col items-end gap-1">
                        <span className="hud text-sm whitespace-nowrap">
                          {formatMetric(k, m)}
                          {spread && <span className="ms-1 text-[11px] text-muted-foreground">{spread}</span>}
                        </span>
                        <DatasetBadge id={m.datasetId} detail={detail(m)} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        );
      })}

      {(pending.length > 0 || byNote.length > 0) && (
        <ul className="flex flex-col gap-1.5 rounded-xl bg-white/[0.025] p-3 text-[11px] leading-snug text-muted-foreground ring-1 ring-white/[0.06]">
          {pending.length > 0 && (
            <li>
              <span className="text-foreground/80">Not yet processed:</span> {names(pending)} ({pendingSets.join(", ")};
              the file is still downloading from NASA PDS).
            </li>
          )}
          {byNote.map(([note, ks]) => (
            <li key={note}>
              <span className="text-foreground/80">No {names(ks)}:</span> {note}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Averaged around the listed coordinates (± shows the spread inside that area, or the product&apos;s own error for
        GRS). For crater-named sites the point is the crater&apos;s centre, not a landing ellipse.
      </p>
    </div>
  );
}

const KEY_METRICS: Record<Other, MetricKey[]> = {
  moon: ["iceStableShare", "avgTempPRP", "slopeLOLA", "cprMiniRF", "rockAbundance", "regolithTempAnomaly"],
  mars: ["epithermalNS", "waterGRS", "thermalInertiaNight", "chlorineGRS"],
};

/** Up to four measured headline metrics for a site (empty for Earth or when nothing is measured). */
export function headlineMetrics(site: Site): MetricKey[] {
  if (site.world === "earth") return [];
  const all = metricsFor(site.id);
  return KEY_METRICS[site.world as Other].filter((k) => all[k]?.value != null).slice(0, 4);
}

/** Up to four headline values as cards, for Compare's "Conditions on the ground". */
export function MeasuredCards({ site, className }: { site: Site; className?: string }) {
  const all = metricsFor(site.id);
  const keys = headlineMetrics(site);
  if (!keys.length) return null;
  return (
    <dl className={cn("grid grid-cols-2 gap-2.5 lg:grid-cols-4", className)}>
      {keys.map((k) => {
        const m = all[k]!;
        const spread = formatSpread(k, m);
        return (
          <div key={k} className="flex flex-col rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.07]">
            <dt className="text-xs text-muted-foreground">{METRIC_INFO[k].label}</dt>
            <dd className="mt-1 font-heading text-xl font-semibold tracking-tight">
              {formatMetric(k, m)}
              {spread && <span className="ms-1.5 hud text-xs font-normal text-muted-foreground">{spread}</span>}
            </dd>
            <dd className="mt-0.5 mb-2.5 text-[11px] leading-snug text-muted-foreground">{METRIC_INFO[k].hint}</dd>
            <dd className="mt-auto">
              <DatasetBadge id={m.datasetId} detail={detail(m)} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
