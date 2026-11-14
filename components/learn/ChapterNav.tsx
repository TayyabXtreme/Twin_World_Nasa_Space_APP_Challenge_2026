"use client";

import { motion, useScroll, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const CHAPTERS = [
  { id: "world-mars", label: "Mars" },
  { id: "world-moon", label: "Moon" },
  { id: "world-earth", label: "Earth" },
  { id: "try", label: "Try it" },
  { id: "quiz", label: "Quiz" },
  { id: "glossary", label: "Glossary" },
  { id: "honesty", label: "Honesty" },
  { id: "sources", label: "Sources" },
];

/** The chapter currently crossing the upper-middle of the screen. */
function useActiveChapter() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = CHAPTERS.map((c) => document.getElementById(c.id)).filter((e): e is HTMLElement => e !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return active;
}

/**
 * Sticky chapter pills under the header (the active one carries a sliding highlight), plus a thin reading-progress
 * bar along the very top of the page.
 */
export function ChapterNav() {
  const active = useActiveChapter();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-0 z-40 h-0.5 origin-left bg-primary shadow-[0_0_10px_var(--primary)]"
        style={{ scaleX: progress }}
      />
      <nav
        aria-label="Chapters"
        className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] z-20 -mx-4 px-4 md:mx-0 md:px-0"
      >
        <ul className="mx-auto flex w-max max-w-full [scrollbar-width:none] gap-0.5 overflow-x-auto rounded-2xl glass p-1">
          {CHAPTERS.map((c) => (
            <li key={c.id} className="shrink-0">
              <a
                href={`#${c.id}`}
                aria-current={active === c.id ? "true" : undefined}
                className={cn(
                  "relative block rounded-xl px-3 py-1.5 text-xs transition-colors duration-200 sm:text-sm",
                  active === c.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active === c.id && (
                  <motion.span
                    layoutId="learn-chapter"
                    className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/15"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <span className="relative">{c.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
