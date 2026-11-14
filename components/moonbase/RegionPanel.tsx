"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { Fragment } from "react";
import { ARTEMIS_REGIONS, POLAR_FEATURES, REGION_SOURCES } from "@/lib/moonbase/regions";
import { formatLat, formatLon } from "@/lib/moonbase/projection";
import { useMoonbase } from "@/lib/moonbase/store";
import type { SiteValueEntry, SiteValues } from "@/lib/moonbase/types";
import { cn } from "@/lib/utils";

const n = (v: unknown, d: number) => (typeof v === "number" ? v.toFixed(d) : "—");

/** Label/value rows for a region's expanded card; every value carries its unit. */
function regionRows(e: SiteValueEntry): [string, string][] {
  const s = e.landingSites ?? {};
  const a = e.area ?? {};
  const rows: [string, string][] = [
    ["Slope at sites", `${n(s.slopeMean, 1)}°`],
    ["Region under 8°", `${n(a.slopeBelow8Pct, 0)} %`],
    ["Elevation range", `${n(typeof a.elevationMin === "number" ? a.elevationMin / 1000 : null, 1)} to ${n(typeof a.elevationMax === "number" ? a.elevationMax / 1000 : null, 1)} km`],
  ];
  if (s.tavgMean !== undefined) rows.push(["Avg / max temperature", `${n(s.tavgMean, 0)} / ${n(s.tmaxMean, 0)} K`]);
  if (s.iceStableN !== undefined)
    rows.push(["Sites with ice ≤ 2.87 m", `${s.iceStableN} of ${s.n}${typeof s.iceMedian === "number" ? ` · ${s.iceMedian.toFixed(2)} m` : ""}`]);
  if (s.trapdistMean !== undefined) rows.push(["Cold trap (< 110 K)", `${n(s.trapdistMean, 1)} km away`]);
  if (s.cprMean !== undefined) rows.push(["Radar CPR", n(s.cprMean, 2)]);
  return rows;
}

/** NASA's nine Artemis III candidate regions; click one to fly there and read its values. */
export function RegionPanel({ siteValues }: { siteValues: SiteValues | null }) {
  const focus = useMoonbase((s) => s.focusRegion);
  const setFocus = useMoonbase((s) => s.setFocusRegion);
  const setPinned = useMoonbase((s) => s.setPinned);
  const fly = useMoonbase((s) => s.fly);
  const entry = (id: string) => siteValues?.entries.find((e) => e.id === `artemis-${id}`);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        NASA published these as a map, not coordinates. Centres and outlines here are <b className="text-foreground/85">approximate</b>: the
        mean and spread of the candidate landing sites published inside each region (small dots on the map).
      </p>
      <ul className="flex flex-col gap-1">
        {ARTEMIS_REGIONS.map((r) => {
          const e = entry(r.id);
          const on = focus === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setFocus(r.id);
                  setPinned({ x: r.x, y: r.y, lat: r.lat, lon: r.lon });
                  fly(r.x, r.y, 2.4);
                }}
                className={cn(
                  "w-full rounded-xl px-3 py-2.5 text-left ring-1 transition-colors duration-150",
                  on ? "bg-primary/10 ring-primary/45" : "ring-transparent hover:bg-white/[0.05]",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="hud flex h-6 min-w-11 shrink-0 items-center justify-center rounded-md bg-primary/12 px-1.5 text-[10px] font-semibold text-primary">
                    {r.short}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="hud block text-[11px] text-muted-foreground">
                      ≈ {formatLat(r.lat, 1)} {formatLon(r.lon, 0)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </span>
                {on && (
                  <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                    {r.note}
                    {e?.landingSites && (
                      <span className="hud mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[11px] text-foreground/85">
                        {regionRows(e).map(([k, v]) => (
                          <Fragment key={k}>
                            <span className="font-sans text-muted-foreground">{k}</span>
                            <span className="text-right">{v}</span>
                          </Fragment>
                        ))}
                      </span>
                    )}
                    <span className="mt-1.5 block text-[10px] text-muted-foreground/80">
                      Means over {e?.landingSites?.n ?? r.sites.length} published landing sites · LOLA, Diviner PRP, Mini-RF
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-1 border-t border-white/[0.07] pt-3">
        {POLAR_FEATURES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFocus(null);
              setPinned({ x: f.x, y: f.y, lat: f.lat, lon: f.lon });
              fly(f.x, f.y, 2.6);
            }}
            className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-white/[0.05]"
          >
            <span className="size-2 shrink-0 rounded-full bg-[oklch(0.85_0.13_80)]" aria-hidden />
            <span className="flex-1">{f.name}</span>
            <span className="hud text-[11px] text-muted-foreground">{formatLat(f.lat, f.lat === -90 ? 0 : 2)}</span>
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-[11px]">
        {REGION_SOURCES.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-muted-foreground hover:text-primary">
              {s.label} <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
