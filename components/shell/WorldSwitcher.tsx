"use client";

import Link from "next/link";
import { directionType } from "@/components/motion/PageTransition";
import { cn } from "@/lib/utils";
import { WORLD_CONFIG, WORLDS, type World } from "@/lib/worlds";

const DOT: Record<World, string> = {
  earth: "bg-earth",
  moon: "bg-moon",
  mars: "bg-mars",
};

/** Earth / Moon / Mars segmented control. The URL is the source of truth, so each segment is a link. */
export function WorldSwitcher({ world }: { world: World }) {
  return (
    <div role="tablist" aria-label="World" className="flex rounded-xl bg-secondary/70 p-0.5 md:p-1">
      {WORLDS.map((w) => {
        const active = w === world;
        return (
          <Link
            key={w}
            href={`/explore/${w}`}
            transitionTypes={directionType(WORLDS.indexOf(world), WORLDS.indexOf(w))}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted-foreground md:h-auto md:gap-2 md:px-3 md:py-1.5 md:text-sm",
              "transition-[background-color,color] duration-(--duration-fast) ease-(--ease-out)",
              "hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              active && "bg-background/80 text-foreground shadow-sm",
            )}
          >
            <span className={cn("hidden size-2 rounded-full min-[380px]:block", DOT[w])} aria-hidden />
            {WORLD_CONFIG[w].name}
          </Link>
        );
      })}
    </div>
  );
}
