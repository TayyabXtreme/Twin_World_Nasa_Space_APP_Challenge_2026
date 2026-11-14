"use client";

import { CloudDownload, LocateFixed, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { formatLat, formatLon } from "@/lib/moonbase/projection";
import { useMoonbase } from "@/lib/moonbase/store";
import { DEFAULT_WEIGHTS, FACTORS, type FactorId } from "@/lib/moonbase/suitability";
import type { LayerMeta } from "@/lib/moonbase/types";
import { cn } from "@/lib/utils";

export interface SpotInfo {
  x: number;
  y: number;
  lat: number;
  lon: number;
  score: number;
  near: string;
}

/** Weight sliders for the suitability rule, plus the best spots it finds. */
export function ScorePanel({
  layers,
  loadedLayers,
  spots,
}: {
  layers: LayerMeta[];
  loadedLayers: Set<string>;
  spots: SpotInfo[];
}) {
  const weights = useMoonbase((s) => s.weights);
  const setWeight = useMoonbase((s) => s.setWeight);
  const reset = useMoonbase((s) => s.resetWeights);
  const fly = useMoonbase((s) => s.fly);
  const setPinned = useMoonbase((s) => s.setPinned);
  const changed = FACTORS.some((f) => weights[f.id] !== DEFAULT_WEIGHTS[f.id]);
  const byId = new Map(layers.map((l) => [l.id, l]));
  const usable = (id: FactorId) => {
    const f = FACTORS.find((x) => x.id === id);
    return f ? loadedLayers.has(f.layer) : false;
  };
  const total = FACTORS.reduce((s, f) => s + (usable(f.id) ? weights[f.id] : 0), 0) || 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Each factor turns one layer into a 0–1 score. The map shows their weighted average for every 960 m cell.
        </p>
        <button
          type="button"
          onClick={reset}
          disabled={!changed}
          className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs text-primary ring-1 ring-primary/30 transition-colors duration-150 hover:bg-primary/10 disabled:text-muted-foreground disabled:opacity-50 disabled:ring-white/10 disabled:hover:bg-transparent"
        >
          <RotateCcw className="size-3" aria-hidden /> Reset
        </button>
      </div>

      <ul className="flex flex-col gap-4">
        {FACTORS.map((f) => {
          const layer = byId.get(f.layer);
          const ok = usable(f.id);
          const share = ok ? Math.round((weights[f.id] / total) * 100) : 0;
          const pending = layer && layer.status === "ready" && !ok;
          return (
            <li key={f.id} className={cn(!ok && "opacity-60")}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{f.label}</span>
                <span className="hud text-xs text-muted-foreground">{ok ? `${share}%` : pending ? "loading…" : "—"}</span>
              </div>
              <Slider
                className="mt-2.5"
                min={0}
                max={5}
                step={0.5}
                value={[weights[f.id]]}
                disabled={!ok}
                onValueChange={([v]) => setWeight(f.id, v)}
                aria-label={`${f.label} weight`}
              />
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {layer?.label ?? f.layer}: {f.rule}.
              </p>
              {!ok && layer && layer.status !== "ready" && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-warn">
                  <CloudDownload className="size-3" aria-hidden />
                  {layer.status === "downloading" ? "Coming soon: Diviner data still downloading" : "Layer not available"}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Best spots for these weights</p>
        {spots.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Computing…</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-1">
            {spots.map((s, i) => (
              <li key={`${s.x.toFixed(1)}:${s.y.toFixed(1)}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPinned({ x: s.x, y: s.y, lat: s.lat, lon: s.lon });
                    fly(s.x, s.y, 2.25);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.06]"
                >
                  <span className="hud flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f2fff8] text-[11px] font-bold text-[#141a2a]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="hud block text-xs">
                      {formatLat(s.lat)} {formatLon(s.lon)}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{s.near}</span>
                  </span>
                  <span className="hud text-sm font-semibold text-primary">{Math.round(s.score * 100)}</span>
                  <LocateFixed className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
