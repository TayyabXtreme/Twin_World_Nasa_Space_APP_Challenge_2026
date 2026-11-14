import { Check, X } from "lucide-react";
import type { Metadata } from "next";
import { PageShell } from "@/components/shell/PageShell";
import analogue from "@/public/data/ml/analogue-space/model-card.json";
import learned from "@/public/data/ml/learned-weights/model-card.json";

export const metadata: Metadata = {
  title: "Models",
  description: "Model cards for TwinWorlds: what data each model uses, how it works, how well it scores and where it breaks.",
};

interface Card {
  id: string;
  name: string;
  trained: string;
  task: string;
  data: Record<string, unknown>;
  method: string[];
  score: { label: string; value: number; baseline?: number; text: string };
  limits: string[];
  outputs: string[];
}

const CARDS = [analogue, learned] as unknown as Card[];

const CAN = [
  "Group Earth's land by measured climate and terrain, and show which group a Moon or Mars target is least unlike.",
  "Learn from NASA's own analogue pairs which measurements mattered, and say how well that worked on held-out pairs.",
  "Re-score every land cell in milliseconds in your browser, with the maths shown.",
];
const CANT = [
  "Prove that any place on Earth matches the Moon or Mars. A high score means similar measured conditions, nothing more.",
  "See chemistry, minerals, radar roughness, radiation, gravity or air pressure: none are in the seven dimensions.",
  "Learn much from 23 pairs. The learned weights are a hint, not a finding, and we show when they do not beat the hand-set ones.",
];

function dataLines(d: Record<string, unknown>) {
  return Object.entries(d).filter(([, v]) => typeof v === "string" && v) as [string, string][];
}

export default function ModelsPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-medium tracking-[0.14em] text-primary uppercase">Models</p>
        <h1 className="mt-2 font-heading text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.05] font-semibold tracking-tight">What the AI can and can&apos;t do</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Two small models sit behind the Analog Finder. Both are trained in plain numpy on the data already in the site, with training code in <code>ml/</code> and a Colab
          notebook. Each card below says what went in, how it works, how it scored and where it fails.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-ok/[0.05] p-5 ring-1 ring-ok/20">
            <h2 className="font-heading text-lg font-semibold text-ok">It can</h2>
            <ul className="mt-3 space-y-2.5">
              {CAN.map((t) => (
                <li key={t} className="flex gap-2.5 text-[15px] leading-snug">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl bg-warn/[0.05] p-5 ring-1 ring-warn/25">
            <h2 className="font-heading text-lg font-semibold text-warn">It can&apos;t</h2>
            <ul className="mt-3 space-y-2.5">
              {CANT.map((t) => (
                <li key={t} className="flex gap-2.5 text-[15px] leading-snug">
                  <X className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mt-14 flex flex-col gap-14">
          {CARDS.map((c) => (
            <article key={c.id} id={c.id} className="scroll-mt-28">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-heading text-2xl font-semibold tracking-tight">{c.name}</h2>
                <span className="hud text-xs text-muted-foreground">trained {c.trained}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{c.task}</p>

              <div className="mt-5 rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">{c.score.label}</p>
                <p className="hud mt-1 text-4xl font-semibold">
                  {Math.round(c.score.value * 100)}
                  <span className="text-lg text-muted-foreground"> %</span>
                  {c.score.baseline !== undefined && <span className="ms-4 text-base text-muted-foreground">hand-set {Math.round(c.score.baseline * 100)} %</span>}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">{c.score.text}</p>
              </div>

              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Data</h3>
                  <dl className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
                    {dataLines(c.data).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs tracking-wide uppercase">{k}</dt>
                        <dd className="text-foreground/85">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Method</h3>
                  <ol className="mt-2 list-decimal space-y-2 ps-5 text-sm leading-relaxed text-foreground/85">
                    {c.method.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-warn/[0.05] p-5 ring-1 ring-warn/25">
                <h3 className="text-sm font-semibold text-warn">Limits</h3>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-foreground/90">
                  {c.limits.map((l) => (
                    <li key={l} className="flex gap-2.5">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Files: {c.outputs.join(" · ")} in public/data/ml/{c.id}/</p>
            </article>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
