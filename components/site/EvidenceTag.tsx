import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Evidence } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const EVIDENCE: Record<Evidence, { label: string; hint: string; dot: string }> = {
  confirmed: { label: "Confirmed", hint: "Measured or observed, reported by NASA or the mission team.", dot: "bg-ok" },
  evidence_for: { label: "Evidence for", hint: "Data point this way, but it is not settled everywhere.", dot: "bg-primary" },
  candidate: { label: "Candidate", hint: "Under study or proposed; not chosen or confirmed.", dot: "bg-warn" },
  estimate: { label: "Estimate", hint: "Our educational estimate from the data, not a NASA finding.", dot: "bg-muted-foreground" },
};

/** Small evidence label: never colour alone, always the word too. */
export function EvidenceTag({ evidence, className }: { evidence: Evidence; className?: string }) {
  const e = EVIDENCE[evidence];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] leading-none text-muted-foreground",
            className,
          )}
        >
          <span className={cn("size-1.5 rounded-full", e.dot)} aria-hidden />
          {e.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{e.hint}</TooltipContent>
    </Tooltip>
  );
}
