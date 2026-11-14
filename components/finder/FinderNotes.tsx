const STEPS: { title: string; body: React.ReactNode; formula?: string }[] = [
  {
    title: "Seven factors",
    body: "Temperature, day–night swing, vegetation, thermal inertia (loose vs rocky ground), frozen ground, Sun height and terrain relief, each measured on Earth and on the target.",
  },
  {
    title: "Similarity per factor",
    body: "0–100 %, falling off along a bell curve as the Earth value moves away from the target. Values Earth can never reach (−222 °C) are compared by rank within each world.",
  },
  {
    title: "Weighted score",
    body: "Move the weights and every site re-scores instantly.",
    formula: "Σ(weight × similarity) ÷ Σ weight",
  },
  {
    title: "Confidence",
    body: "The share of the score resting on direct measurements. Proxies and gaps at the site (missing months, polar night, no albedo) count less.",
  },
];

/** How the score works, as four steps: shown in the "Go deeper" tabs. */
export function ScoreSteps() {
  return (
    <div>
      <p className="text-[13px] text-muted-foreground">
        A high score means conditions play a similar role on each world, never that Earth matches it outright.
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col rounded-[1.4rem] bg-white/[0.03] p-5 ring-1 ring-white/10">
            <span
              className="flex size-7 items-center justify-center rounded-full bg-primary/12 hud text-[13px] text-primary ring-1 ring-primary/30"
              aria-hidden
            >
              {i + 1}
            </span>
            <h3 className="mt-4 text-[15px] font-semibold">{s.title}</h3>
            {s.formula && (
              <p className="mt-2 overflow-x-auto rounded-lg bg-white/[0.04] px-3 py-2 hud text-[12px] whitespace-nowrap text-foreground ring-1 ring-white/10">
                {s.formula}
              </p>
            )}
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Named sites are scored by their best 0.25° (≈ 28 km) land cell within 25–80 km of the published site.
      </p>
    </div>
  );
}
