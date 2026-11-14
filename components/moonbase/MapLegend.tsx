import type { LayerMeta } from "@/lib/moonbase/types";
import { SUIT_RAMP } from "@/lib/moonbase/suitability";

export const rampCss = (stops: string[]) => `linear-gradient(90deg, ${stops.join(", ")})`;

const fmt = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : String(v);

/** Colour bar for the layer on the map, with units and the dataset it comes from. */
export function MapLegend({ layer, suitability }: { layer?: LayerMeta; suitability: boolean }) {
  if (suitability) {
    return (
      <div className="w-[min(260px,calc(100vw-7rem))] rounded-xl glass px-3 py-2.5">
        <p className="text-xs font-medium">Base suitability</p>
        <div className="mb-ramp mt-2 h-2 rounded-full" style={{ ["--ramp" as string]: rampCss(SUIT_RAMP) }} />
        <div className="mt-1 flex justify-between hud text-[10px] text-muted-foreground">
          <span>0 poor</span>
          <span>100 best</span>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Computed in your browser from LOLA, Diviner and Mini-RF grids
        </p>
      </div>
    );
  }
  if (!layer) return null;
  const [lo, hi] = layer.range;
  const unit = layer.units === "ratio" ? "" : ` ${layer.units}`;
  return (
    <div className="w-[min(260px,calc(100vw-7rem))] rounded-xl glass px-3 py-2.5">
      <p className="flex items-baseline justify-between gap-2 text-xs font-medium">
        <span className="truncate">{layer.label}</span>
        <span className="shrink-0 hud text-[10px] text-muted-foreground">{layer.units}</span>
      </p>
      <div className="mb-ramp mt-2 h-2 rounded-full" style={{ ["--ramp" as string]: rampCss(layer.ramp) }} />
      <div className="mt-1 flex justify-between hud text-[10px] text-muted-foreground">
        {layer.ends ? (
          <>
            <span>
              {fmt(lo)} · {layer.ends[0]}
            </span>
            <span>
              {layer.ends[1]} · +{fmt(hi)}
            </span>
          </>
        ) : (
          <>
            <span>
              {layer.id === "coldtrap" ? "> 0" : fmt(lo)}
              {unit}
            </span>
            <span>
              {fmt(hi)}
              {unit}
              {layer.id !== "coldtrap" ? "+" : ""}
            </span>
          </>
        )}
      </div>
      {(layer.id === "icedepth" || layer.id === "coldtrap") && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="inline-block size-2.5 rounded-sm bg-[#6b6b6b]" aria-hidden />
          {layer.id === "icedepth" ? "grey: deeper than 2.87 m (model limit)" : "grey relief: no cold-trap ground"}
        </p>
      )}
      {layer.coverageNote && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          {layer.coverageShort ?? "No data outside the central square (≈ 80°S)"}
        </p>
      )}
      <p className="mt-1.5 truncate text-[10px] text-muted-foreground" title={layer.dataset.name}>
        {layer.dataset.name.replace(/\s*\(.*\)$/, "")}
      </p>
    </div>
  );
}
