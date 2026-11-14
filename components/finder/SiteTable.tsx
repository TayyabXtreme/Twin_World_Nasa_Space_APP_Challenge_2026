"use client";

import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SiteGroup } from "@/lib/finder/places";
import { DIM_LABEL } from "@/lib/finder/text";
import { DIM_IDS, type DimId } from "@/lib/finder/types";
import { cn } from "@/lib/utils";

export interface SiteRow {
  id: string;
  name: string;
  region: string;
  group?: SiteGroup;
  /** 0–100, one decimal. */
  score: number;
  confidence: number;
  lat: number;
  lon: number;
  sims: Partial<Record<DimId, number>>;
}

const GROUP: Record<SiteGroup, { label: string; cls: string }> = {
  agency: { label: "Space agency site", cls: "bg-ok/15 text-ok" },
  pakistan: { label: "Pakistan", cls: "bg-primary/15 text-primary" },
  known: { label: "Known analogue", cls: "bg-white/[0.06] text-muted-foreground" },
  finder: { label: "Finder pick", cls: "bg-[oklch(0.76_0.15_305)]/15 text-[oklch(0.82_0.12_305)]" },
};

type Sort = "score" | "confidence" | "name";

function exportCsv(rows: SiteRow[], targetName: string) {
  const head = ["rank", "site", "region", "lat", "lon", "score", "confidence", ...DIM_IDS.map((d) => `${DIM_LABEL[d]} similarity`)];
  const esc = (v: string | number) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
  const lines = rows.map((r, i) =>
    [i + 1, r.name, r.region, r.lat.toFixed(2), r.lon.toFixed(2), r.score.toFixed(1), r.confidence, ...DIM_IDS.map((d) => (r.sims[d] === undefined ? "" : (r.sims[d]! * 100).toFixed(1)))].map(esc).join(","),
  );
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `twinworlds-${targetName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Ranked Earth sites for the current target: score with a bar and data confidence. Search, sort and CSV export
 * work on whichever list is shown (named analogue sites, or the best new places found anywhere on Earth).
 */
export function SiteTable({
  rows,
  selectedId,
  onSelect,
  targetName,
  title,
  note,
}: {
  rows: SiteRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  targetName: string;
  title: string;
  note: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("score");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.region.toLowerCase().includes(q));
    return [...list].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "confidence" ? b.confidence - a.confidence : b.score - a.score));
  }, [rows, query, sort]);
  const ranks = useMemo(() => new Map([...rows].sort((a, b) => b.score - a.score).map((r, i) => [r.id, i + 1])), [rows]);
  const max = Math.max(1, ...rows.map((r) => r.score));

  return (
    <section aria-labelledby="sites-title" className="overflow-hidden rounded-[1.6rem] bg-white/[0.03] ring-1 ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
        <h2 id="sites-title" className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground">({targetName})</span>
        </h2>
        <button
          type="button"
          onClick={() => exportCsv(shown, targetName)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-white/12 transition-colors hover:text-foreground hover:ring-white/25"
        >
          <Download className="size-3.5" aria-hidden /> Export CSV
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search site or country</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search site or country"
            className="h-8 w-full rounded-lg bg-white/[0.04] ps-8 pe-2 text-sm ring-1 ring-white/10 outline-none placeholder:text-muted-foreground focus:ring-primary/50"
          />
        </label>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span id="sort-label">Sort</span>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger aria-labelledby="sort-label" size="sm" className="h-8! min-w-[7.5rem] rounded-lg border-white/10 bg-white/[0.04] text-xs text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="score">Score</SelectItem>
              <SelectItem value="confidence">Confidence</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="px-4 pt-2.5 text-[11px] text-muted-foreground">{note}</p>
      <div className="max-h-[34rem] overflow-y-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-[oklch(0.16_0.02_265)] text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="w-10 py-2 ps-4 font-medium">#</th>
              <th scope="col" className="py-2 font-medium">Site</th>
              <th scope="col" className="w-36 py-2 font-medium">Score</th>
              <th scope="col" className="w-14 py-2 pe-4 text-end font-medium" title="Data confidence: share of the score resting on direct measurements">
                Conf.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {shown.map((r) => {
              const on = r.id === selectedId;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  className={cn("cursor-pointer transition-colors duration-150", on ? "bg-primary/[0.09]" : "hover:bg-white/[0.035]")}
                >
                  <td className="py-2.5 ps-4 hud text-muted-foreground">{ranks.get(r.id)}</td>
                  <td className="py-2.5 pe-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(r.id);
                      }}
                      aria-current={on || undefined}
                      className={cn("text-start font-medium", on ? "text-primary" : "text-foreground")}
                    >
                      {r.name}
                    </button>
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      {r.region}
                      {r.group && <span className={cn("rounded-full px-1.5 py-px text-[10px]", GROUP[r.group].cls)}>{GROUP[r.group].label}</span>}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="w-9 hud text-foreground">{r.score.toFixed(1)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.score / max) * 100}%` }} />
                      </span>
                    </span>
                  </td>
                  <td className={cn("py-2.5 pe-4 text-end hud", r.confidence < 70 ? "text-warn" : "text-foreground/85")}>{r.confidence}</td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No site matches “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
