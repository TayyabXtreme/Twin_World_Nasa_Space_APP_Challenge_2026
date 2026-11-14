"use client";

import { Crosshair, MousePointerClick, X } from "lucide-react";
import { errKey, formatError, formatValue, valueAtXY } from "@/lib/moonbase/grids";
import { distKm, formatLat, formatLon } from "@/lib/moonbase/projection";
import { ARTEMIS_REGIONS } from "@/lib/moonbase/regions";
import { useMoonbase, type MapPoint } from "@/lib/moonbase/store";
import type { Grid, LayerMeta } from "@/lib/moonbase/types";
import { cn } from "@/lib/utils";

const STATUS_SHORT: Record<string, string> = {
  downloading: "downloading",
  no_coverage: "no polar data",
  missing: "not downloaded",
};

export function nearestRegion(x: number, y: number) {
  let best = ARTEMIS_REGIONS[0];
  let d = Infinity;
  for (const r of ARTEMIS_REGIONS) {
    const dd = distKm([x, y], [r.x, r.y]);
    if (dd < d) {
      d = dd;
      best = r;
    }
  }
  return { region: best, km: d, inside: d <= best.radiusKm };
}

/** Floating coordinate chip on the map: where the pointer is, and the active layer's value there. */
export function MapHud({
  layer,
  grid,
  errGrid,
  score,
  loading,
}: {
  layer?: LayerMeta;
  grid?: Grid;
  errGrid?: Grid;
  score: (p: MapPoint) => number | null;
  loading: boolean;
}) {
  const hover = useMoonbase((s) => s.hover);
  const pinned = useMoonbase((s) => s.pinned);
  const active = useMoonbase((s) => s.activeLayer);
  const p = hover ?? pinned;
  if (!p) {
    return (
      <div className="flex items-center gap-2 rounded-xl glass px-3 py-2 text-xs text-muted-foreground">
        <MousePointerClick className="size-3.5" aria-hidden /> Hover or tap the map to read every layer
      </div>
    );
  }
  const s = active === "suitability" ? score(p) : null;
  const v = layer && grid ? valueAtXY(grid, p.x, p.y) : null;
  return (
    <div className="flex items-center gap-3 rounded-xl glass px-3 py-2 hud text-xs">
      <span>
        {formatLat(p.lat)} <span className="text-muted-foreground">·</span> {formatLon(p.lon)}
      </span>
      {active === "suitability" ? (
        <span className="text-primary">{s === null ? "—" : `${Math.round(s * 100)} / 100`}</span>
      ) : (
        layer &&
        (grid ? (
          <span className="text-primary">
            {formatValue(layer, v)}
            {v !== null && errGrid && (
              <span className="text-muted-foreground">{formatError(layer, valueAtXY(errGrid, p.x, p.y))}</span>
            )}
          </span>
        ) : (
          loading && layer.status === "ready" && <span className="text-muted-foreground">loading…</span>
        ))
      )}
    </div>
  );
}

/** Every layer's value at the hovered (or pinned) point, with its dataset. */
export function Readout({
  layers,
  grids,
  score,
}: {
  layers: LayerMeta[];
  grids: Record<string, Grid>;
  score: (p: MapPoint) => number | null;
}) {
  const hover = useMoonbase((s) => s.hover);
  const pinned = useMoonbase((s) => s.pinned);
  const setPinned = useMoonbase((s) => s.setPinned);
  const p = hover ?? pinned;
  const near = p ? nearestRegion(p.x, p.y) : null;
  const s = p ? score(p) : null;

  return (
    <section aria-label="Values at the selected point" className="rounded-2xl glass p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Crosshair className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="hud text-sm">
              {p ? (
                <>
                  {formatLat(p.lat, 3)} {formatLon(p.lon, 2)}
                  <span className="ms-2 text-xs text-muted-foreground">
                    {hover ? "under pointer" : "pinned"} · x {p.x.toFixed(1)} km, y {p.y.toFixed(1)} km
                  </span>
                </>
              ) : (
                <span className="font-sans text-muted-foreground">Point at the map to read every layer here</span>
              )}
            </p>
            {near && (
              <p className="truncate text-xs text-muted-foreground">
                {near.inside
                  ? `Inside ${near.region.name} (approx. extent)`
                  : `${near.km.toFixed(0)} km from ${near.region.name}`}
              </p>
            )}
          </div>
        </div>
        {pinned && !hover && (
          <button
            type="button"
            onClick={() => setPinned(null)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-white/10 transition-colors duration-150 hover:text-foreground"
          >
            <X className="size-3" aria-hidden /> Clear pin
          </button>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <div className="rounded-xl bg-primary/[0.08] px-3 py-2 ring-1 ring-primary/25">
          <dt className="truncate text-[11px] text-muted-foreground">Base suitability</dt>
          <dd className="mt-0.5 hud text-sm font-semibold text-primary">
            {s === null ? "—" : `${Math.round(s * 100)} / 100`}
          </dd>
          <dd className="truncate text-[10px] text-muted-foreground">your weights</dd>
        </div>
        {layers.map((l) => {
          const g = grids[l.id];
          const ready = l.status === "ready";
          const v = p && g ? valueAtXY(g, p.x, p.y) : null;
          const eg = grids[errKey(l.id)];
          const err = p && eg && v !== null ? formatError(l, valueAtXY(eg, p.x, p.y)) : "";
          const text = !ready
            ? (STATUS_SHORT[l.status] ?? l.status)
            : !p
              ? "—"
              : !g
                ? "loading…"
                : formatValue(l, v) + err;
          return (
            <div
              key={l.id}
              className="rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/[0.06]"
              title={`${l.label}: ${l.dataset.name}`}
            >
              <dt className="truncate text-[11px] text-muted-foreground">{l.label}</dt>
              <dd
                className={cn(
                  "mt-0.5 truncate hud text-sm",
                  ready ? "text-foreground" : "text-[12px] text-warn/90",
                  ready && v === null && p && g && "text-muted-foreground",
                )}
              >
                {text}
              </dd>
              <dd className="truncate text-[10px] text-muted-foreground">
                {l.dataset.name.split(" (")[0].replace(/^LRO /, "")}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
