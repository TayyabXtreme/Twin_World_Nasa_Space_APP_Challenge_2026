"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { HARDWARE } from "@/lib/data/hardware";
import { cn } from "@/lib/utils";
import { Reveal, SectionHead } from "./Reveal";

// three.js and the model load only once this section scrolls near the screen.
const HardwareViewer = dynamic(() => import("@/components/compare/HardwareViewer"), {
  ssr: false,
  loading: () => null,
});

const EASE = [0.22, 1, 0.36, 1] as const;

/** Each machine with the part it plays in TwinWorlds; facts match the mission records used on Compare. */
const ITEMS = [
  {
    hw: HARDWARE.lro,
    world: "moon",
    tint: "#9fb8ff",
    role: "Orbiting the Moon since 2009",
    text: "Its LOLA laser altimeter, Diviner thermometer and Mini-RF radar made the elevation, slope, ice-stability, cold-trap and radar layers of the Moon Base Map.",
    data: ["LOLA 240 m", "Diviner PRP", "Mini-RF CPR"],
  },
  {
    hw: HARDWARE.perseverance,
    world: "mars",
    tint: "#ff9a6a",
    role: "In Jezero Crater since 18 Feb 2021",
    text: "Looking for signs of ancient life in an old river delta. Before landing, its team practised hazard avoidance on rough desert ground in California.",
    data: ["Finder target: Jezero", "Twin: Atacama"],
  },
  {
    hw: HARDWARE.curiosity,
    world: "mars",
    tint: "#ffb37a",
    role: "Exploring Gale Crater since August 2012",
    text: "Gale is one of the Mars targets the Analog Finder scores against all of Earth's land.",
    data: ["Finder target: Gale", "MOLA terrain"],
  },
  {
    hw: HARDWARE.ingenuity,
    world: "mars",
    tint: "#ffd08a",
    role: "First powered flight on another planet",
    text: "Flew over Jezero on 19 April 2021, in air less than 2 % as dense as Earth's. Mars' thin air is one of the limits no Earth analogue can copy.",
    data: ["Breaks down at: air pressure"],
  },
  {
    hw: HARDWARE.astronaut,
    world: "earth",
    tint: "#8fe6ff",
    role: "Crews train on Earth first",
    text: "Astronauts and scientists rehearse field geology on lava fields, in deserts and at polar stations: the analogue sites TwinWorlds maps and scores.",
    data: ["Kīlauea", "Devon Island", "McMurdo"],
  },
] as const;

const WORLD_DOT = { earth: "bg-[var(--earth)]", moon: "bg-[var(--moon)]", mars: "bg-[var(--mars)]" } as const;

export function HardwareShowcase() {
  const [index, setIndex] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const near = useInView(stage, { once: true, margin: "300px 0px" });
  const reduce = useReducedMotion();
  const item = ITEMS[index];

  return (
    <section
      id="hardware"
      aria-labelledby="hardware-title"
      className="nebula mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8 md:py-32"
      style={{ ["--glow-a" as string]: "oklch(0.6 0.15 40 / 0.12)" }}
    >
      <SectionHead
        id="hardware-title"
        eyebrow="The machines behind the data"
        title="Every layer was measured by something real."
        lead="Drag to turn each model. These are NASA's own 3D models of the spacecraft whose instruments, or whose landing sites, feed TwinWorlds."
      />

      <Reveal delay={0.1} className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div ref={stage} className="panel relative aspect-[4/3] overflow-hidden sm:aspect-[16/11]">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_60%,oklch(0.3_0.04_250/0.55),transparent_75%)]"
          />
          {near && <HardwareViewer url={item.hw.model} yaw={item.hw.yaw} tint={item.tint} />}
          <p className="pointer-events-none absolute bottom-4 left-5 font-mono text-[11px] text-[var(--ink-dim)]">
            NASA 3D model · drag to rotate
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div role="tablist" aria-label="Spacecraft" className="flex flex-wrap gap-1.5">
            {ITEMS.map((it, i) => (
              <button
                key={it.hw.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 transition-[background-color,color,box-shadow] duration-200",
                  i === index
                    ? "bg-white/[0.09] text-[var(--ink)] ring-white/20"
                    : "text-[var(--ink-dim)] ring-white/[0.07] hover:text-[var(--ink)]",
                )}
              >
                <span className={cn("size-1.5 rounded-full", WORLD_DOT[it.world])} aria-hidden />
                {it.hw.name
                  .replace("Lunar Reconnaissance Orbiter", "LRO")
                  .replace("Astronaut in a spacesuit", "Astronaut")}
              </button>
            ))}
          </div>

          <div className="panel relative min-h-[15rem] flex-1 overflow-hidden p-6" role="tabpanel">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={item.hw.id}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <p className="eyebrow">{item.role}</p>
                <h3 className="display mt-2 text-2xl font-semibold text-[var(--ink)]">{item.hw.name}</h3>
                <p className="mt-3 leading-relaxed text-[var(--ink-dim)]">{item.text}</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {item.data.map((d) => (
                    <li
                      key={d}
                      className="rounded-full bg-white/[0.05] px-3 py-1 font-mono text-[11px] text-[var(--ink)] ring-1 ring-white/10"
                    >
                      {d}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
