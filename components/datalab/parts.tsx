import { Download, KeyRound, Library, Radio } from "lucide-react";
import { STATUS_INFO, type Dataset, type DatasetStatus } from "@/lib/data/datasets";
import { cn } from "@/lib/utils";
import type { World } from "@/lib/worlds";

export const WORLD_NAME: Record<World, string> = { earth: "Earth", moon: "Moon", mars: "Mars" };
export const WORLD_DOT: Record<World, string> = { earth: "bg-earth", moon: "bg-moon", mars: "bg-mars" };
export const WORLD_TEXT: Record<World, string> = { earth: "text-earth", moon: "text-moon", mars: "text-mars" };

/** Status colours: never colour alone, the word is always shown next to the dot. */
export const STATUS_DOT: Record<DatasetStatus, string> = {
  downloaded: "bg-ok",
  downloading: "bg-warn",
  "needs-account": "bg-[oklch(0.74_0.13_300)]",
  live: "bg-primary",
  catalogued: "bg-muted-foreground",
};

export function StatusBadge({ status, className }: { status: DatasetStatus; className?: string }) {
  return (
    <span
      title={STATUS_INFO[status].hint}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2 py-0.5 text-[11px] leading-5 text-foreground/90 backdrop-blur-md",
        className,
      )}
    >
      <span className="relative flex size-1.5" aria-hidden>
        {status === "downloading" && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70 motion-reduce:hidden", STATUS_DOT[status])} />}
        <span className={cn("relative size-1.5 rounded-full", STATUS_DOT[status])} />
      </span>
      {STATUS_INFO[status].label}
    </span>
  );
}

export function WorldChip({ world, className }: { world: World; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2 py-0.5 text-[11px] leading-5 backdrop-blur-md", className)}>
      <span className={cn("size-1.5 rounded-full", WORLD_DOT[world])} aria-hidden />
      {WORLD_NAME[world]}
    </span>
  );
}

/** Mono badge naming the dataset, the same visual language as the Score's dataset badges. */
export function DatasetBadge({ dataset, className }: { dataset: Dataset; className?: string }) {
  return (
    <span className={cn("hud inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-primary/25 bg-primary/[0.07] px-1.5 py-0.5 text-[10.5px] text-primary/90", className)}>
      <span className="font-semibold">{dataset.agency}</span>
      <span className="truncate opacity-80">{dataset.badge}</span>
    </span>
  );
}

const PLACEHOLDER_ICON: Record<DatasetStatus, typeof Radio> = {
  downloaded: Library,
  downloading: Download,
  "needs-account": KeyRound,
  live: Radio,
  catalogued: Library,
};

const PLACEHOLDER_LINE: Record<DatasetStatus, string> = {
  downloaded: "No preview",
  downloading: "Preview after download",
  "needs-account": "Free login unlocks it",
  live: "Streamed live in Explore",
  catalogued: "Catalogue records",
};

/** Stand-in for datasets with no image yet: a world-tinted panel with the status and the product id. */
export function PreviewPlaceholder({ dataset }: { dataset: Dataset }) {
  const Icon = PLACEHOLDER_ICON[dataset.status];
  const tint = dataset.world === "mars" ? "oklch(0.65 0.17 38 / 0.28)" : dataset.world === "moon" ? "oklch(0.86 0.012 250 / 0.16)" : "oklch(0.71 0.15 250 / 0.26)";
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden px-6 text-center"
      style={{ background: `radial-gradient(90% 120% at 50% 110%, ${tint}, transparent 70%), oklch(0.15 0.02 262)` }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{ backgroundImage: "radial-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
      />
      <Icon className="relative size-6 text-foreground/70" aria-hidden />
      <span className="relative text-xs font-medium text-foreground/80">{PLACEHOLDER_LINE[dataset.status]}</span>
      <span className="hud relative line-clamp-2 max-w-full text-[10px] break-all text-muted-foreground">{dataset.productId}</span>
    </div>
  );
}
