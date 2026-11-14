import { PageShell } from "./PageShell";

/** Temporary page body for sections that are planned but not built yet (see docs/archive/plan.md §7). */
export function SectionPlaceholder({
  title,
  summary,
  planRef,
  points,
}: {
  title: string;
  summary: string;
  planRef: string;
  points: string[];
}) {
  return (
    <PageShell>
      <div className="mx-auto max-w-2xl pt-6">
        <p className="hud mb-3 text-xs text-primary">{planRef} · in progress</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{summary}</p>
        <ul className="mt-8 space-y-3 border-s border-border ps-5">
          {points.map((p) => (
            <li key={p} className="text-sm text-foreground/85">
              {p}
            </li>
          ))}
        </ul>
      </div>
    </PageShell>
  );
}
