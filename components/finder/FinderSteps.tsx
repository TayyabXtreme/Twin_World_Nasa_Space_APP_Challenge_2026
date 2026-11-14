"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const FINDER_STEPS = [
  { id: "finder-target", n: 1, label: "Pick a target" },
  { id: "finder-stage", n: 2, label: "Set what matters" },
  { id: "finder-results", n: 3, label: "See the matches" },
  { id: "finder-method", n: 4, label: "How it works" },
];

/**
 * The page as four numbered steps, stuck under the header. The step on screen lights up (earlier ones get a tick
 * colour), and each one jumps to its part of the page.
 */
export function FinderSteps({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(FINDER_STEPS[0].id);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const s of FINDER_STEPS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
    // The results sections only exist once the first ranking arrives: observe again then.
  }, [ready]);

  const activeIndex = FINDER_STEPS.findIndex((s) => s.id === active);

  return (
    <nav
      aria-label="Finder steps"
      className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] z-30 -mx-4 mt-6 px-4 md:mx-0 md:px-0"
    >
      <ol className="finder-scroll flex w-max max-w-full gap-0.5 overflow-x-auto rounded-2xl glass p-1">
        {FINDER_STEPS.map((s, i) => {
          const on = s.id === active;
          const done = i < activeIndex;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={on ? "step" : undefined}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs no-underline transition-colors duration-200 sm:text-sm",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="finder-step"
                    className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/15"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <span
                  className={cn(
                    "relative flex size-5 items-center justify-center rounded-full hud text-[10px] ring-1 transition-colors duration-200",
                    on
                      ? "bg-primary text-primary-foreground ring-primary"
                      : done
                        ? "bg-primary/15 text-primary ring-primary/40"
                        : "ring-white/20",
                  )}
                >
                  {s.n}
                </span>
                <span className="relative">{s.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
