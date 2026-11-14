"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { siteById } from "@/lib/data/sites";
import type { Target } from "@/lib/finder/types";
import { cn } from "@/lib/utils";

type OffWorld = Target["world"];

const DOT: Record<OffWorld, string> = { moon: "bg-moon", mars: "bg-mars" };

export function TargetPicker({
  targets,
  current,
  onPick,
}: {
  targets: Target[];
  current: Target;
  onPick: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const world = current.world;
  const list = targets.filter((t) => t.world === world);
  const switchTo = (w: OffWorld) => {
    if (w === world) return;
    const first =
      targets.find((t) => t.world === w && (w === "moon" ? t.id === "moon-shackleton-rim" : t.id === "mars-jezero")) ??
      targets.find((t) => t.world === w);
    if (first) onPick(first.id);
  };
  return (
    <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
      <div
        role="tablist"
        aria-label="Target world"
        className="inline-flex shrink-0 self-start rounded-full bg-white/[0.04] p-1 ring-1 ring-white/10 lg:self-auto"
      >
        {(["moon", "mars"] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={w === world}
            onClick={() => switchTo(w)}
            className={cn(
              "relative flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors duration-150",
              w === world ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {w === world && (
              <motion.span
                layoutId="finder-world"
                className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/15"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <span className={cn("relative size-1.5 rounded-full", DOT[w])} aria-hidden />
            <span className="relative">{w === "moon" ? "Moon bases" : "Mars sites"}</span>
          </button>
        ))}
      </div>
      <span className="hidden h-6 w-px shrink-0 bg-white/10 lg:block" aria-hidden />
      <nav
        aria-label={`${world === "moon" ? "Moon" : "Mars"} targets`}
        className="finder-scroll -mx-4 min-w-0 flex-1 overflow-x-auto px-4 py-1 md:mx-0 md:px-0 lg:[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)] lg:pe-10"
      >
        <ul key={world} className="flex w-max gap-2">
          {list.map((t, i) => {
            const site = siteById(t.id);
            const active = t.id === current.id;
            return (
              <li key={t.id} className="finder-rise" style={{ "--d": `${i * 45}ms` } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => onPick(t.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2.5 rounded-2xl py-1.5 ps-1.5 pe-3.5 text-start ring-1 transition-[background-color,box-shadow,scale] duration-150 ease-out motion-safe:active:scale-[0.96]",
                    active
                      ? "bg-primary/10 ring-primary/55"
                      : "bg-white/[0.035] ring-white/10 hover:bg-white/[0.07] hover:ring-white/20",
                  )}
                >
                  <span className="relative size-8 shrink-0 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
                    {site?.image ? (
                      <Image
                        src={site.image.src.replace(/\.webp$/, ".thumb.webp")}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : (
                      <span className={cn("absolute inset-2.5 rounded-full", DOT[t.world])} />
                    )}
                  </span>
                  <span className="text-sm leading-tight font-medium whitespace-nowrap">{t.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
