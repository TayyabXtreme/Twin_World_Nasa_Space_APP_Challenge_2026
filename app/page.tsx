import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AgencyStrip } from "@/components/landing/AgencyStrip";
import { FinderShowcase } from "@/components/landing/FinderShowcase";
import { HardwareShowcase } from "@/components/landing/HardwareShowcase";
import { JourneyTrack } from "@/components/landing/JourneyTrack";
import { MoonShowcase } from "@/components/landing/MoonShowcase";
import { Reveal, SlideWords } from "@/components/landing/Reveal";
import { SectionDots } from "@/components/landing/SectionDots";
import { SpaceHero } from "@/components/landing/SpaceHero";
import { StatsBand } from "@/components/landing/StatsBand";
import { TwinPairs } from "@/components/landing/TwinPairs";
import { PageTransition } from "@/components/motion/PageTransition";
import { NAV_ITEMS } from "@/components/shell/nav";
import "./space.css";

export default function Home() {
  return (
    <PageTransition>
      <div className="space relative min-h-dvh overflow-x-clip">
        <SectionDots />
        <main>
          <SpaceHero />
          <StatsBand />
          <JourneyTrack />
          <FinderShowcase />
          <TwinPairs />
          <MoonShowcase />
          <HardwareShowcase />
          <AgencyStrip />

          {/* Closing call to action */}
          <section id="cta" aria-labelledby="cta-title" className="scroll-mt-8 px-5 pb-24 sm:px-8 md:pb-32">
            <Reveal className="panel relative mx-auto max-w-6xl overflow-hidden px-6 py-16 text-center sm:px-12 md:py-20">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,oklch(0.75_0.14_195/0.22),transparent_70%),radial-gradient(40%_60%_at_80%_100%,oklch(0.6_0.18_35/0.16),transparent_70%)]"
              />
              <p className="eyebrow relative">The next analogue is out there</p>
              <h2
                id="cta-title"
                className="display relative mx-auto mt-4 max-w-3xl text-[clamp(2rem,4.6vw,3.6rem)] leading-[1.04] font-semibold text-balance"
              >
                <SlideWords text="Find the place on Earth that NASA hasn’t found yet." />
              </h2>
              <p className="relative mx-auto mt-5 max-w-[52ch] text-lg leading-relaxed text-[var(--ink-dim)]">
                Choose a Moon base or a Mars site, set what matters, and let real mission data rank the planet.
              </p>
              <div className="relative mt-9 flex flex-wrap justify-center gap-3">
                <Link
                  href="/finder"
                  transitionTypes={["warp"]}
                  className="group inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-6 py-3.5 font-medium text-[oklch(0.15_0.02_260)] no-underline shadow-[0_0_40px_-8px_var(--accent)] transition-transform duration-200 ease-(--ease-out) active:scale-[0.98]"
                >
                  Open the Analog Finder
                  <ArrowRight
                    className="size-4 transition-transform duration-200 group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
                <Link
                  href="/bases"
                  transitionTypes={["warp"]}
                  className="inline-flex items-center rounded-2xl bg-white/[0.07] px-6 py-3.5 font-medium text-[var(--ink)] no-underline ring-1 ring-white/15 transition-colors duration-200 hover:bg-white/[0.11]"
                >
                  Plan a base
                </Link>
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="border-t border-[var(--line)] px-5 pt-12 pb-28 text-sm sm:px-8 md:pb-10">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_2fr]">
            <div>
              <p className="display flex items-center gap-2 text-lg font-semibold text-[var(--ink)]">
                <span className="relative flex size-4 items-center justify-center" aria-hidden>
                  <span className="absolute size-4 rounded-full border border-[var(--accent)]/60" />
                  <span className="size-1.5 rounded-full bg-[var(--accent)]" />
                </span>
                TwinWorlds
              </p>
              <p className="mt-3 max-w-[40ch] leading-relaxed text-[var(--ink-dim)]">
                Earth analogues for permanent Moon bases and Mars, built on open data from NASA, CSA, ESA and JAXA. NASA
                Space Apps Challenge 2026.
              </p>
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
              {NAV_ITEMS.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  transitionTypes={["warp"]}
                  className="text-[var(--ink-dim)] no-underline transition-colors duration-150 hover:text-[var(--ink)]"
                >
                  {n.label}
                </Link>
              ))}
              <Link
                href="/about"
                transitionTypes={["warp"]}
                className="text-[var(--ink-dim)] no-underline transition-colors duration-150 hover:text-[var(--ink)]"
              >
                About
              </Link>
            </nav>
          </div>
          <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-6 text-xs text-[var(--ink-faint)]">
            <span>Imagery and data: NASA, CSA, ESA Copernicus, JAXA. Credits on each page and in the Data Lab.</span>
            <span>An analogue is never an exact copy of another world.</span>
          </div>
        </footer>
      </div>
    </PageTransition>
  );
}
