import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DATASETS, type DatasetId } from "@/lib/data/metrics";
import type { Basis } from "@/lib/score";
import { cn } from "@/lib/utils";

/**
 * Where a number comes from, as a small pill: the instrument's short name, solid when the value is measured,
 * outlined when the dataset is only shown as context, dashed "Rule" when no dataset is involved.
 */
export function DatasetBadge({
  id,
  basis = "measured",
  detail,
  className,
}: {
  id?: DatasetId;
  basis?: Basis;
  detail?: string;
  className?: string;
}) {
  if (!id || basis === "rule") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              "inline-flex items-center rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[10.5px] leading-none text-muted-foreground",
              className,
            )}
          >
            Rule
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          A plain rule on the site&apos;s sourced facts; no measured dataset covers this factor here.
        </TooltipContent>
      </Tooltip>
    );
  }
  const d = DATASETS[id];
  const context = basis === "context";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] leading-none ring-1",
            context ? "text-muted-foreground ring-white/15" : "bg-primary/[0.07] text-primary/90 ring-primary/25",
            className,
          )}
        >
          <svg viewBox="0 0 12 12" className="size-2.5 shrink-0" aria-hidden>
            {/* A tiny orbiter: body plus two panels. */}
            <rect x="4.5" y="4.5" width="3" height="3" rx="0.6" fill="currentColor" />
            <rect x="0.5" y="5.25" width="3" height="1.5" rx="0.4" fill="currentColor" opacity="0.6" />
            <rect x="8.5" y="5.25" width="3" height="1.5" rx="0.4" fill="currentColor" opacity="0.6" />
          </svg>
          {d.short}
          {context && <span className="opacity-70">· context</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <span className="block font-medium">{d.name}</span>
        {detail && <span className="mt-0.5 block opacity-80">{detail}</span>}
        {d.pds && <span className="mt-0.5 block font-mono text-[10px] opacity-70">{d.pds}</span>}
        {context && <span className="mt-1 block opacity-80">Shown for context; the score still uses the rule.</span>}
      </TooltipContent>
    </Tooltip>
  );
}
