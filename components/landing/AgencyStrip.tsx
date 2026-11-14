import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Marquee } from "@/components/ui/marquee";
import { AGENCIES, AGENCY_INFO, DATASETS } from "@/lib/data/datasets";
import { Reveal, SectionHead } from "./Reveal";

const WORLD_DOT = { earth: "bg-[var(--earth)]", moon: "bg-[var(--moon)]", mars: "bg-[var(--mars)]" } as const;

/** Partner agencies and a moving strip of every dataset badge in the catalogue (rendered on the server). */
export function AgencyStrip() {
  const half = Math.ceil(DATASETS.length / 2);
  const rows = [DATASETS.slice(0, half), DATASETS.slice(half)];
  return (
    <section
      id="data"
      aria-labelledby="data-title"
      className="nebula scroll-mt-8 py-24 md:py-32"
      style={{ ["--glow-x" as string]: "50%", ["--glow-x2" as string]: "50%" }}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          id="data-title"
          eyebrow="Open data from four space agencies"
          title="Every number has a source."
          lead="Each value on TwinWorlds carries its dataset badge, and each claim is tagged confirmed, evidence for, candidate or estimate. Where Earth can't match another world, we say so."
        />
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AGENCIES.map((a, i) => (
            <li key={a}>
              <Reveal delay={i * 0.07} y={18} className="panel h-full p-5">
                <p className="display text-2xl font-semibold text-[var(--ink)]">{AGENCY_INFO[a].name}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-dim)]">{AGENCY_INFO[a].full}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-dim)]">{AGENCY_INFO[a].role}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>

      <div
        className="relative mt-14 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]"
        aria-label="Datasets used"
        role="group"
      >
        {rows.map((row, r) => (
          <Marquee key={r} reverse={r === 1} pauseOnHover repeat={3} className="[--duration:70s] [--gap:0.6rem]">
            {row.map((d) => (
              <span
                key={d.id}
                className="flex items-center gap-2 rounded-full bg-white/[0.04] px-3.5 py-1.5 font-mono text-[12px] whitespace-nowrap text-[var(--ink)] ring-1 ring-white/10"
              >
                <span className={`size-1.5 rounded-full ${WORLD_DOT[d.world]}`} aria-hidden />
                {d.badge}
                <span className="text-[var(--ink-dim)]">· {d.agency}</span>
              </span>
            ))}
          </Marquee>
        ))}
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-wrap gap-3 px-5 sm:px-8">
        <Link
          href="/data"
          transitionTypes={["warp"]}
          className="group inline-flex items-center gap-2 rounded-xl bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-[var(--ink)] no-underline ring-1 ring-white/15 hover:bg-white/[0.11]"
        >
          Browse the Data Lab{" "}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
        </Link>
        <Link
          href="/learn"
          transitionTypes={["warp"]}
          className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm text-[var(--ink-dim)] no-underline hover:text-[var(--ink)]"
        >
          Glossary and sources
        </Link>
      </div>
    </section>
  );
}
