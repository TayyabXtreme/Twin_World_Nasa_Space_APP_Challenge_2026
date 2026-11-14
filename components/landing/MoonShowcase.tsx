"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import landing from "@/lib/data/landing.generated.json";
import { toXY } from "@/lib/moonbase/projection";
import { cn } from "@/lib/utils";
import { Reveal, SectionHead } from "./Reveal";

const { moon } = landing;
const H = moon.halfWidthKm;
/** Polar stereographic km → percent of the square image (0° longitude up, 90°E right). */
const place = (lat: number, lon: number) => {
  const [x, y] = toXY(lat, lon);
  return { left: `${((x + H) / (2 * H)) * 100}%`, top: `${((H - y) / (2 * H)) * 100}%` };
};

const FACTS = [
  {
    k: "Cold traps",
    v: "Crater floors that never see the Sun stay below 110 K (−163 °C) all year: cold enough to hold water ice for billions of years.",
  },
  {
    k: "Sunlit ridges",
    v: "Rims a few kilometres away get sunlight most of the year: power for a base, next to the ice.",
  },
  {
    k: "Measured, not guessed",
    v: "Ice stability from LRO Diviner, slope and height from LOLA at 240 m, radar from Mini-RF.",
  },
];

/** The lunar south pole with NASA's nine Artemis III candidate regions (data from the Moon Base Map). */
export function MoonShowcase() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <section
      id="moon"
      aria-labelledby="moon-title"
      className="nebula mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8 md:py-32"
      style={{ ["--glow-x" as string]: "75%", ["--glow-x2" as string]: "20%" }}
    >
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div>
          <SectionHead
            id="moon-title"
            eyebrow="Moon Base Map"
            title="Where would you build the first Moon base?"
            lead="The lunar south pole holds water ice in craters that never see sunlight, a few kilometres from ridges that almost never go dark. Explore every layer, then tune your own base-suitability score."
          />
          <ul className="mt-8 flex flex-col gap-5">
            {FACTS.map((f, i) => (
              <Reveal key={f.k} delay={0.08 * i} y={16}>
                <li className="flex gap-4">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]"
                    aria-hidden
                  />
                  <p>
                    <span className="font-medium text-[var(--ink)]">{f.k}.</span>{" "}
                    <span className="text-[var(--ink-dim)]">{f.v}</span>
                  </p>
                </li>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={0.2} className="mt-9">
            <Link
              href="/bases"
              transitionTypes={["warp"]}
              className="group inline-flex items-center gap-2 rounded-2xl bg-white/[0.07] px-5 py-3 font-medium text-[var(--ink)] no-underline ring-1 ring-white/15 transition-[background-color,transform] duration-200 hover:bg-white/[0.11] active:scale-[0.98]"
            >
              Open the Base Maps
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </Link>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="relative mx-auto w-full max-w-[34rem]">
          <div className="relative aspect-square">
            <span className="orbit-ring" style={{ inset: "-4%" }} aria-hidden />
            <span className="orbit-ring reverse" style={{ inset: "-9%", borderStyle: "dotted" }} aria-hidden />
            <div className="absolute inset-0 overflow-hidden rounded-full shadow-[0_0_120px_-20px_oklch(0.75_0.12_220/0.45)] ring-1 ring-white/15">
              <Image
                src={moon.image}
                alt="Lunar south pole from LRO LOLA shaded relief, with Diviner cold traps in pale blue"
                fill
                sizes="(min-width: 1024px) 540px, 92vw"
                className="object-cover"
              />
              <div
                aria-hidden
                className="absolute inset-0 rounded-full bg-[radial-gradient(circle,transparent_55%,rgb(3_5_11/0.75)_100%)]"
              />
            </div>
            {moon.regions.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className="pin cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none [&:focus-visible>.pin-dot]:outline-2 [&:focus-visible>.pin-dot]:outline-offset-2 [&:focus-visible>.pin-dot]:outline-white"
                style={{
                  ...place(r.lat, r.lon),
                  ["--pin" as string]: "#7ef3d6",
                  ["--pin-delay" as string]: `${(i % 5) * 0.45}s`,
                }}
                onMouseEnter={() => setActive(r.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(r.id)}
                onBlur={() => setActive(null)}
                aria-label={`${r.name}${r.approximate ? " (approximate position)" : ""}`}
              >
                <span className="pin-ring" />
                <span className="pin-dot" />
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/80 px-2 py-1 text-xs whitespace-nowrap text-white ring-1 ring-white/15 transition-opacity duration-150",
                    active === r.id ? "opacity-100" : "opacity-0",
                  )}
                >
                  {r.name}
                </span>
              </button>
            ))}
            {moon.features
              .filter((f) => f.id === "shackleton")
              .map((f) => (
                <span
                  key={f.id}
                  className="pointer-events-none absolute -translate-x-1/2 translate-y-2 text-[11px] font-medium text-white/85 [text-shadow:0_1px_6px_black]"
                  style={place(f.lat, f.lon)}
                >
                  Shackleton
                </span>
              ))}
          </div>
          <p className="mt-10 text-center text-xs text-[var(--ink-dim)]">
            {moon.regions.length} Artemis III candidate regions (NASA, 2024) · 75°S to the pole ·{" "}
            {moon.datasets.join(" · ")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
