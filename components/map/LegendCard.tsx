"use client";

import { Crosshair, ExternalLink, Info, LoaderCircle, MousePointerClick, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { formatLat, formatLon } from "@/lib/geo";
import type { Legend, MapLayer } from "@/lib/layers";
import { cn } from "@/lib/utils";
import { canProbe, useMapLayers, type Probe } from "./science";

/** CSS gradient for a legend's colour ramp. */
export function rampGradient(ramp: string[]) {
  return `linear-gradient(to right, ${ramp.join(", ")})`;
}

function position(legend: Legend, v: number) {
  const [lo, hi] = legend.range!;
  const t = legend.scale === "log" ? (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) : (v - lo) / (hi - lo);
  return Math.min(1, Math.max(0, t));
}

function tickText(legend: Legend, v: number) {
  if (Math.abs(v) >= 1000) return `${Number((v / 1000).toFixed(1))}k`;
  return String(Number(v.toFixed(legend.decimals ?? 1)));
}

/** Colour bar with its end values (and ticks for log scales), plus what low and high mean. */
export function RampBar({ legend, compact = false }: { legend: Legend; compact?: boolean }) {
  if (!legend.ramp || !legend.range) {
    return (
      <div className="space-y-1">
        <div
          className="h-2.5 rounded-full border border-dashed border-border bg-[repeating-linear-gradient(45deg,transparent_0_6px,oklch(1_0_0/6%)_6px_12px)]"
          aria-hidden
        />
        {!compact && <p className="text-[11px] text-muted-foreground">Relative colour scale (no numeric key published) · {legend.units}</p>}
      </div>
    );
  }
  const [lo, hi] = legend.range;
  const labels = legend.rampLabels ?? [tickText(legend, lo), tickText(legend, hi)];
  // Inner ticks only where they cannot collide with the end labels.
  const ticks = !compact && legend.ticks ? legend.ticks.filter((t) => position(legend, t) > 0.12 && position(legend, t) < 0.8) : [];

  return (
    <div>
      <div
        role="img"
        aria-label={`Colour scale from ${labels[0]} to ${labels[1]} ${legend.units}`}
        className={cn("relative rounded-full ring-1 ring-white/10", compact ? "h-1.5" : "h-2.5")}
        style={{ backgroundImage: rampGradient(legend.ramp) }}
      >
        {ticks.map((t) => (
          <span key={t} className="absolute top-full h-1 w-px bg-muted-foreground/60" style={{ left: `${position(legend, t) * 100}%` }} />
        ))}
      </div>
      <div className={cn("hud relative flex justify-between text-muted-foreground", compact ? "mt-0.5 text-[10px]" : "mt-1.5 text-[11px]")}>
        <span>{labels[0]}</span>
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${position(legend, t) * 100}%` }}>
            {tickText(legend, t)}
          </span>
        ))}
        <span>
          {labels[1]} <span className="text-foreground/80">{legend.units}</span>
        </span>
      </div>
      {!compact && (legend.lowLabel || legend.highLabel) && (
        <div className="mt-0.5 flex justify-between text-[11px] text-muted-foreground/80">
          <span>← {legend.lowLabel}</span>
          <span>{legend.highLabel} →</span>
        </div>
      )}
    </div>
  );
}

function ProbeLine({ probe, pinned }: { probe: Probe; pinned: boolean }) {
  const where = `${formatLat(probe.lat)} ${formatLon(probe.lon)}`;
  return (
    <div className="flex items-center gap-2">
      {pinned ? <Crosshair className="size-3.5 shrink-0 text-primary" aria-hidden /> : <MousePointerClick className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="hud truncate text-muted-foreground">{where}</span>
      <span className="ms-auto shrink-0 text-end font-medium text-foreground">
        {probe.status === "value" && probe.text}
        {probe.status === "loading" && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-label="Reading value" />}
        {probe.status === "none" && <span className="font-normal text-muted-foreground">no data</span>}
        {probe.status === "outside" && <span className="font-normal text-muted-foreground">outside coverage</span>}
      </span>
    </div>
  );
}

/** Value readout: live under the pointer for precomputed layers, at the last click/tap for every readable layer. */
function Readout({ layer, legend }: { layer: MapLayer; legend: Legend }) {
  const hover = useMapLayers((s) => s.hoverProbe);
  const pin = useMapLayers((s) => s.pinProbe);
  if (!canProbe(layer, legend)) return null;
  return (
    <div aria-live="polite" className="space-y-1 rounded-lg border border-border bg-white/[0.03] px-2.5 py-2 text-xs">
      {pin && <ProbeLine probe={pin} pinned />}
      {hover && !(pin && Math.abs(pin.lat - hover.lat) < 1e-6 && Math.abs(pin.lon - hover.lon) < 1e-6) && <ProbeLine probe={hover} pinned={false} />}
      {!pin && !hover && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <MousePointerClick className="size-3.5 shrink-0" aria-hidden />
          {layer.type === "image" ? "Point at or tap the map to read a value" : "Tap the map to read the value from the tile"}
        </p>
      )}
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LegendBody({ layer, legend }: { layer: MapLayer; legend: Legend }) {
  const opacity = useMapLayers((s) => s.opacity);
  const setOpacity = useMapLayers((s) => s.setOpacity);

  return (
    <div className="space-y-3">
      <RampBar legend={legend} />
      <Readout layer={layer} legend={legend} />
      <p className="text-[13px] leading-snug text-foreground/90">{legend.meaning}</p>
      {legend.caveat && (
        <p className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" aria-hidden />
          <span>{legend.caveat}</span>
        </p>
      )}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground">Opacity</span>
        <Slider min={0.15} max={1} step={0.05} value={[opacity]} onValueChange={([v]) => setOpacity(v)} aria-label="Overlay opacity" className="flex-1" />
        <span className="hud w-8 text-end text-[11px] text-muted-foreground">{Math.round(opacity * 100)}%</span>
      </div>
      <div className="space-y-1 border-t border-border pt-2.5 text-[11px] leading-snug">
        <p className="text-foreground/85">{legend.dataset}</p>
        <p className="text-muted-foreground">
          {legend.resolution}
          {legend.latest && <> · latest {legend.latest}</>}
          {legend.units !== legend.unitsLong && legend.unitsLong && <> · {legend.unitsLong}</>}
        </p>
        <p className="hud break-all text-muted-foreground/70">{legend.datasetId}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
          <a href={legend.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            Source · {hostOf(legend.source)} <ExternalLink className="size-3" aria-hidden />
          </a>
          {legend.product && (
            <a href={legend.product} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Product page <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function LegendHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <h2 className="min-w-0 flex-1 text-sm leading-snug font-medium text-foreground">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Turn off science layer"
        className="-me-1 -mt-0.5 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

