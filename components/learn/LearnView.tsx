"use client";

import { Check, ExternalLink, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { EvidenceTag } from "@/components/site/EvidenceTag";
import { PhotoWipe } from "@/components/slider/PhotoWipe";
import { WorldScene } from "@/components/slider/WorldScene";
import { CAUTIONS, GLOSSARY, WORLD_CHAPTERS } from "@/lib/data/learn";
import { SOURCES } from "@/lib/data/sources";
import { ChapterNav } from "./ChapterNav";
import { JourneyHero } from "./JourneyHero";
import { GravityLab, SignalLab } from "./Labs";
import { Quiz } from "./Quiz";
import { Reveal } from "./Reveal";
import { WorldChapter } from "./WorldChapter";
import "./learn.css";

const EASE = [0.23, 1, 0.32, 1] as const;

function SectionTitle({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="hud text-xs tracking-[0.18em] text-primary uppercase">{kicker}</p>
      <h2
        id={id}
        className="mt-2 font-heading text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] font-semibold tracking-tight"
      >
        {title}
      </h2>
      {children && <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{children}</p>}
    </Reveal>
  );
}

/**
 * Learn: a scroll trip from Earth to Mars, then a chapter per world, things to try, a quiz, the glossary, our
 * honesty rules and every source.
 */
export function LearnView() {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const terms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...GLOSSARY]
      .sort((a, b) => a.term.localeCompare(b.term))
      .filter((g) => !q || g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q));
  }, [query]);

  return (
    <>
      {/* Full-bleed: outside the centred column. */}
      <JourneyHero />
      <div className="mx-auto max-w-6xl">
        <ChapterNav />

        <div className="mt-16 flex flex-col gap-32 md:mt-24 md:gap-40">
          {WORLD_CHAPTERS.map((c, i) => (
            <WorldChapter key={c.id} chapter={c} index={i} />
          ))}

          <section id="try" aria-labelledby="try-title" className="scroll-mt-32">
            <SectionTitle id="try-title" kicker="Chapter 04" title="Try it yourself">
              Weigh yourself on three worlds, call a rover across space, then stand on each surface and jump.
            </SectionTitle>
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <Reveal className="flex">
                <GravityLab />
              </Reveal>
              <Reveal delay={0.1} className="flex">
                <SignalLab />
              </Reveal>
            </div>
            <div className="mt-20 flex flex-col gap-16">
              <Reveal>
                <WorldScene />
              </Reveal>
              <Reveal>
                <PhotoWipe />
              </Reveal>
            </div>
          </section>

          <section id="quiz" aria-labelledby="quiz-title" className="scroll-mt-32">
            <SectionTitle id="quiz-title" kicker="Chapter 05" title="True or false?">
              Eight quick questions. Every answer is somewhere on this page.
            </SectionTitle>
            <Reveal className="mt-10">
              <Quiz />
            </Reveal>
          </section>

          <section id="glossary" aria-labelledby="glossary-title" className="scroll-mt-32">
            <SectionTitle id="glossary-title" kicker="Chapter 06" title="Words, explained plainly" />
            <div className="mt-8 flex justify-center">
              <label className="flex w-full max-w-sm items-center gap-2 rounded-xl glass px-3 py-2.5 focus-within:ring-2 focus-within:ring-ring">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Find a word (${GLOSSARY.length} terms)`}
                  aria-label="Find a word in the glossary"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>
            <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {terms.map((g, i) => (
                <motion.div
                  key={g.term}
                  layout="position"
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.45, ease: EASE, delay: Math.min((i % 3) * 0.06, 0.12) }}
                  className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 transition-[background-color,border-color] duration-200 hover:border-primary/30 hover:bg-white/[0.05]"
                >
                  <dt className="font-heading font-semibold">{g.term}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{g.definition}</dd>
                </motion.div>
              ))}
            </dl>
            {terms.length === 0 && (
              <p className="mt-6 text-center text-sm text-muted-foreground">No word matches “{query}”.</p>
            )}
          </section>

          <section id="honesty" aria-labelledby="honesty-title" className="scroll-mt-32">
            <SectionTitle id="honesty-title" kicker="Chapter 07" title="How we avoid overclaiming">
              These rules come from the research brief behind TwinWorlds. Every comparison on the site follows them.
            </SectionTitle>
            <ol className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
              {CAUTIONS.map((c, i) => (
                <Reveal
                  key={c}
                  as="li"
                  delay={(i % 2) * 0.08}
                  className="flex gap-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4"
                >
                  <motion.span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok"
                    initial={reduce ? false : { scale: 0, rotate: -45 }}
                    whileInView={{ scale: 1, rotate: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.15 + (i % 2) * 0.08 }}
                  >
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </motion.span>
                  <span className="text-[0.98rem] leading-relaxed">{c}</span>
                </Reveal>
              ))}
            </ol>
            <Reveal className="mt-8 flex flex-wrap justify-center gap-2">
              {(["confirmed", "evidence_for", "candidate", "estimate"] as const).map((e) => (
                <EvidenceTag key={e} evidence={e} />
              ))}
            </Reveal>
          </section>

          <section id="sources" aria-labelledby="sources-title" className="scroll-mt-32">
            <SectionTitle id="sources-title" kicker="Chapter 08" title="Where it all comes from">
              {SOURCES.length} NASA and partner sources behind every fact, map and image on TwinWorlds.
            </SectionTitle>
            <ul className="mt-10 grid gap-2 md:grid-cols-2">
              {SOURCES.map((s, i) => (
                <Reveal key={s.id} as="li" delay={Math.min((i % 2) * 0.05, 0.1)} y={12}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex h-full items-start gap-3 rounded-xl border border-white/6 px-4 py-3 transition-[background-color,border-color] duration-150 hover:border-primary/30 hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium group-hover:text-primary">{s.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {s.org} · {s.covers}
                      </span>
                    </span>
                    <ExternalLink
                      className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                  </a>
                </Reveal>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
