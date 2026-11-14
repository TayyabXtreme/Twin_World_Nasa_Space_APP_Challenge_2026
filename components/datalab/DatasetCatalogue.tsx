"use client";

import { Search, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useMemo, useState } from "react";
import {
  AGENCIES,
  DATASETS,
  FEATURE_INFO,
  STATUS_INFO,
  formatBytes,
  type Agency,
  type Dataset,
  type DatasetStatus,
  type Feature,
} from "@/lib/data/datasets";
import { cn } from "@/lib/utils";
import { WORLDS, type World } from "@/lib/worlds";
import { DatasetDialog } from "./DatasetDialog";
import { DatasetBadge, PreviewPlaceholder, STATUS_DOT, StatusBadge, WORLD_DOT, WORLD_NAME, WorldChip } from "./parts";

const STATUSES = Object.keys(STATUS_INFO) as DatasetStatus[];
const FEATURES = Object.keys(FEATURE_INFO) as Feature[];
const EASE = [0.23, 1, 0.32, 1] as const;

interface Filters {
  world: World | "all";
  agency: Agency | "all";
  status: DatasetStatus | "all";
  feature: Feature | "all";
  query: string;
}
const NONE: Filters = { world: "all", agency: "all", status: "all", feature: "all", query: "" };

function matches(d: Dataset, f: Filters) {
  if (f.world !== "all" && d.world !== f.world) return false;
  if (f.agency !== "all" && d.agency !== f.agency) return false;
  if (f.status !== "all" && d.status !== f.status) return false;
  if (f.feature !== "all" && !d.usedBy.includes(f.feature)) return false;
  const q = f.query.trim().toLowerCase();
  if (q) {
    const hay = `${d.name} ${d.badge} ${d.measures} ${d.instrument} ${d.mission} ${d.productId} ${d.agency}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Filterable grid of every dataset; a card opens the full record. */
export function DatasetCatalogue() {
  const [filters, setFilters] = useState<Filters>(NONE);
  const [open, setOpen] = useState<Dataset | null>(null);
  const reduce = useReducedMotion();

  const list = useMemo(() => DATASETS.filter((d) => matches(d, filters)), [filters]);
  // Counts per option respect the other active filters, so a chip never promises results it can't show.
  const count = <K extends keyof Filters>(key: K, value: Filters[K]) => DATASETS.filter((d) => matches(d, { ...filters, [key]: value })).length;
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const active = filters.world !== "all" || filters.agency !== "all" || filters.status !== "all" || filters.feature !== "all" || filters.query.trim() !== "";

  return (
    <div>
      <div className="glass flex flex-col gap-3 rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div role="radiogroup" aria-label="World" className="flex rounded-xl bg-black/30 p-1">
            {(["all", ...WORLDS] as const).map((w) => {
              const on = filters.world === w;
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("world", w)}
                  className={cn(
                    "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 md:flex-none",
                    on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="datalab-world-pill"
                      className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-white/10"
                      transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0.15 }}
                    />
                  )}
                  {w !== "all" && <span className={cn("relative size-1.5 rounded-full", WORLD_DOT[w])} aria-hidden />}
                  <span className="relative">{w === "all" ? "All" : WORLD_NAME[w]}</span>
                  <span className="hud relative text-[11px] text-muted-foreground">{count("world", w)}</span>
                </button>
              );
            })}
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-black/30 px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={filters.query}
              onChange={(e) => set("query", e.target.value)}
              placeholder="Search instrument, product, what it measures"
              aria-label="Search datasets"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {filters.query && (
              <button type="button" onClick={() => set("query", "")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </label>
        </div>

        <ChipRow label="Agency">
          <Chip on={filters.agency === "all"} onClick={() => set("agency", "all")}>
            All
          </Chip>
          {AGENCIES.map((a) => (
            <Chip key={a} on={filters.agency === a} onClick={() => set("agency", a)} n={count("agency", a)}>
              {a}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Status">
          <Chip on={filters.status === "all"} onClick={() => set("status", "all")}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} on={filters.status === s} onClick={() => set("status", s)} n={count("status", s)} dot={STATUS_DOT[s]}>
              {STATUS_INFO[s].label}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Used by">
          <Chip on={filters.feature === "all"} onClick={() => set("feature", "all")}>
            Any
          </Chip>
          {FEATURES.map((f) => (
            <Chip key={f} on={filters.feature === f} onClick={() => set("feature", f)} n={count("feature", f)}>
              {FEATURE_INFO[f].label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm text-muted-foreground" aria-live="polite">
        <p>
          <span className="hud text-foreground">{list.length}</span> of {DATASETS.length} datasets
        </p>
        {active && (
          <button type="button" onClick={() => setFilters(NONE)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/5 hover:text-foreground">
            <X className="size-3.5" aria-hidden />
            Clear filters
          </button>
        )}
      </div>

      <motion.ul layout={!reduce} className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((d) => (
            <motion.li
              key={d.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
              transition={{ duration: 0.25, ease: EASE }}
              className="min-w-0"
            >
              <DatasetCard d={d} onOpen={() => setOpen(d)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
      {list.length === 0 && (
        <div className="glass mt-3 rounded-2xl p-8 text-center text-sm text-muted-foreground">
          No dataset matches these filters.{" "}
          <button type="button" onClick={() => setFilters(NONE)} className="text-primary hover:underline">
            Show all
          </button>
        </div>
      )}

      <DatasetDialog dataset={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function DatasetCard({ d, onOpen }: { d: Dataset; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="datalab-card glass group flex h-full w-full flex-col overflow-hidden rounded-2xl text-start transition-[border-color,transform] duration-200 hover:border-white/20 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99]"
    >
      <div className="relative aspect-[2/1] w-full overflow-hidden bg-[oklch(0.14_0.02_262)]">
        {d.preview ? (
          <Image
            src={d.preview.src}
            alt={d.preview.alt}
            fill
            sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
            className="datalab-card-img object-cover"
          />
        ) : (
          <PreviewPlaceholder dataset={d} />
        )}
        <div aria-hidden className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <StatusBadge status={d.status} />
          <WorldChip world={d.world} />
        </div>
        {d.gallery && d.gallery.length > 1 && (
          <span className="hud absolute end-2.5 bottom-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] text-foreground/85 backdrop-blur-md">
            +{d.gallery.length} images
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <DatasetBadge dataset={d} />
        <h3 className="font-heading text-[1.05rem] leading-snug font-semibold tracking-tight group-hover:text-primary">{d.name}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{d.measures}</p>
        <dl className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border pt-3 text-xs">
          <dt className="text-muted-foreground">Resolution</dt>
          <dd className="truncate" title={d.resolution}>
            {d.resolution}
          </dd>
          <dt className="text-muted-foreground">Coverage</dt>
          <dd className="truncate" title={d.coverage}>
            {d.coverage}
          </dd>
          <dt className="text-muted-foreground">Size</dt>
          <dd className="hud truncate">
            {d.sizeBytes == null ? (d.status === "live" ? "streamed" : "not stored") : formatBytes(d.sizeBytes)}
            {d.status === "downloading" && <span className="font-sans text-warn"> expected</span>}
          </dd>
        </dl>
        {d.usedBy.length > 0 && (
          <ul className="flex flex-wrap gap-1 pt-1" aria-label="Used by">
            {d.usedBy.map((f) => (
              <li key={f} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-foreground/75">
                {FEATURE_INFO[f].label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </button>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 items-center gap-3">
      <span className="hud hidden w-16 shrink-0 text-[11px] tracking-wider text-muted-foreground uppercase sm:block">{label}</span>
      {/* Scrolls sideways inside itself on narrow screens; the page never scrolls horizontally. */}
      <div className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="hud shrink-0 self-center text-[11px] tracking-wider text-muted-foreground uppercase sm:hidden">{label}</span>
        {children}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children, n, dot }: { on: boolean; onClick: () => void; children: React.ReactNode; n?: number; dot?: string }) {
  const empty = n === 0 && !on;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={empty}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]",
        on ? "border-primary/50 bg-primary/15 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
        empty && "pointer-events-none opacity-40",
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />}
      {children}
      {n !== undefined && <span className="hud text-[10.5px] opacity-70">{n}</span>}
    </button>
  );
}
