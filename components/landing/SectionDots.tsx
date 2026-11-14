"use client";

import { motion, useScroll, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "hero", label: "Start" },
  { id: "journey", label: "Where to go" },
  { id: "finder", label: "Analog Finder" },
  { id: "twins", label: "Twin pairs" },
  { id: "moon", label: "Moon base" },
  { id: "hardware", label: "Spacecraft" },
  { id: "data", label: "Open data" },
  { id: "cta", label: "Start exploring" },
];

/**
 * Landing-page wayfinding: a thin reading-progress line along the top, and on wide screens a column of dots on the
 * right edge, one per section, that names the section on hover and jumps to it on click.
 */
export function SectionDots() {
  const [active, setActive] = useState("hero");
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => e !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
        style={{ scaleX: progress }}
      />
      <nav aria-label="Page sections" className="fixed end-4 top-1/2 z-40 hidden -translate-y-1/2 xl:block">
        <ul className="flex flex-col gap-3">
          {SECTIONS.map((s) => {
            const on = s.id === active;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? "true" : undefined}
                  className="group flex items-center justify-end gap-3 no-underline"
                >
                  <span
                    className={cn(
                      "rounded-md bg-black/60 px-2 py-0.5 text-xs whitespace-nowrap text-[var(--ink)] ring-1 ring-white/10 backdrop-blur-sm transition-[opacity,translate] duration-200 ease-(--ease-out)",
                      // The current section keeps its name showing where there is room beside the content.
                      on ? "2xl:translate-x-0 2xl:opacity-100" : "",
                      "translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
                    )}
                  >
                    {s.label}
                  </span>
                  <span
                    className={cn(
                      "block rounded-full transition-[height,background-color,box-shadow] duration-300 ease-(--ease-out)",
                      on
                        ? "h-6 w-1.5 bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
                        : "h-1.5 w-1.5 bg-white/30 group-hover:bg-white/60",
                    )}
                  />
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
