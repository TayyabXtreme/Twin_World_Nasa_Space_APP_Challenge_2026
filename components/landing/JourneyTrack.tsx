"use client";

import {
  ArrowRight,
  BookOpen,
  Compass,
  Database,
  Gamepad2,
  MoonStar,
  Scale,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Morph } from "@/components/motion/PageTransition";
import { cn } from "@/lib/utils";
import { SlideWords } from "./Reveal";

interface Stop {
  href: string;
  name: string;
  verb: string;
  text: string;
  icon: LucideIcon;
  img: string;
  credit: string;
  tag?: string;
  /** Accent for the step number and glow. */
  tint: string;
}

/** Every section of the site, in the order a first-time visitor would want them. */
const STOPS: Stop[] = [
  {
    href: "/explore/earth",
    name: "Explore",
    verb: "Fly around three worlds",
    text: "3D globes and maps of Earth, the Moon and Mars with NASA layers, every landing since 1966, analogue sites and the live ISS.",
    icon: Compass,
    img: "/photos/challenge/mars-mount-sharp-buttes.webp",
    credit: "NASA/JPL-Caltech/MSSS · Curiosity",
    tint: "oklch(0.8 0.13 200)",
  },
  {
    href: "/finder",
    name: "Analog Finder",
    verb: "Find Earth's twin",
    text: "Rank every place on Earth against a Moon base or Mars site, dimension by dimension, with the maths on screen.",
    icon: ScanSearch,
    img: "/photos/twins/atacama_desert.webp",
    credit: "NASA Earth Observatory · ASTER",
    tag: "Flagship",
    tint: "oklch(0.82 0.15 85)",
  },
  {
    href: "/compare",
    name: "Compare",
    verb: "Put two worlds side by side",
    text: "An Earth place next to a Moon or Mars site: what matches, radar twins, and a mission score from measured data.",
    icon: Scale,
    img: "/photos/sites/site-jezero.webp",
    credit: "NASA/JPL-Caltech/University of Arizona · HiRISE",
    tint: "oklch(0.72 0.17 40)",
  },
  {
    href: "/bases",
    name: "Base Maps",
    verb: "Plan a base at the south pole",
    text: "Ice stability, hydrogen, cold traps, slope and radar, NASA's nine Artemis III regions and LRO close-ups of each one.",
    icon: MoonStar,
    img: "/landing/moon-pole.webp",
    credit: "NASA/GSFC · LRO LOLA and Diviner",
    tag: "New",
    tint: "oklch(0.86 0.06 250)",
  },
  {
    href: "/challenge",
    name: "Mission Challenge",
    verb: "Launch, land and drive",
    text: "Tell Earth from Mars in real photos, scout a Moon base with LRO data, then fly the mission yourself.",
    icon: Gamepad2,
    img: "/photos/challenge/card-launch.webp",
    credit: "NASA",
    tag: "Play",
    tint: "oklch(0.74 0.18 330)",
  },
  {
    href: "/learn",
    name: "Learn",
    verb: "Take the trip in one scroll",
    text: "Fly from Earth to Mars, the facts we are sure of and the ones we are not, a gravity lab, a quiz and every source.",
    icon: BookOpen,
    img: "/photos/landings/apollo-17.webp",
    credit: "NASA/Eugene Cernan · Apollo 17",
    tint: "oklch(0.8 0.15 150)",
  },
  {
    href: "/data",
    name: "Data Lab",
    verb: "Open the raw data",
    text: "Every NASA, CSA, ESA and JAXA dataset behind the site: resolution, coverage, licence and where to get it.",
    icon: Database,
    img: "/photos/landings/curiosity.webp",
    credit: "NASA/JPL-Caltech/MSSS · Curiosity",
    tint: "oklch(0.78 0.12 230)",
  },
];

const N = STOPS.length;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "Where to go": the section pins to the screen and scrolling down slides a row of big destination cards sideways,
 * one card per part of the site. The card nearest the middle grows and lights up; a counter and a progress line show
 * how far along you are. With reduced motion it is a plain swipeable row.
 */
export function JourneyTrack() {
  return (
    <>
      <PinnedTrack />
      <StaticTrack />
    </>
  );
}

function Heading({ active }: { active?: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-xl">
        <p className="eyebrow">Where to go</p>
        <h2
          id="journey-title"
          className="display mt-3 text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.04] font-semibold text-balance"
        >
          <SlideWords text="Seven ways into three worlds." />
        </h2>
      </div>
      {active !== undefined && (
        <p className="flex items-baseline gap-1 hud text-[var(--ink-dim)]" aria-hidden>
          <span className="display text-4xl font-semibold text-[var(--ink)] tabular-nums">{pad(active + 1)}</span>/{" "}
          {pad(N)}
        </p>
      )}
    </div>
  );
}

function PinnedTrack() {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const shiftMv = useMotionValue(0);
  const [active, setActive] = useState(0);

  // How far the row must slide so the last card ends at the right edge; the section is that much taller than the screen.
  useEffect(() => {
    const t = track.current;
    const v = viewport.current;
    if (!t || !v) return;
    const measure = () => {
      const s = Math.max(0, t.scrollWidth - v.clientWidth);
      shiftMv.set(s);
      setShift(s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    ro.observe(v);
    return () => ro.disconnect();
  }, [shiftMv]);

  const { scrollYProgress: p } = useScroll({ target: section, offset: ["start start", "end end"] });
  const x = useTransform([p, shiftMv], ([v, s]: number[]) => -v * s);
  const bar = useTransform(p, [0, 1], [0.04, 1]);
  useMotionValueEvent(p, "change", (v) => setActive(Math.min(N - 1, Math.round(v * (N - 1)))));

  return (
    <section
      ref={section}
      id="journey"
      aria-labelledby="journey-title"
      className="relative motion-reduce:hidden"
      style={{ height: `calc(100svh + ${shift}px)` }}
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden py-20">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <Heading active={active} />
          <div className="mt-5 h-px w-full overflow-hidden bg-white/10" aria-hidden>
            <motion.div
              className="h-full origin-left bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
              style={{ scaleX: bar }}
            />
          </div>
        </div>
        <div ref={viewport} className="mt-8 w-full">
          <motion.ul
            ref={track}
            style={{ x }}
            className="flex w-max gap-5 px-5 sm:px-8 lg:px-[max(2rem,calc((100vw-72rem)/2+2rem))]"
          >
            {STOPS.map((s, i) => (
              <Card key={s.href} stop={s} i={i} p={p} active={i === active} />
            ))}
          </motion.ul>
        </div>
        <div className="mx-auto mt-8 flex gap-2" aria-hidden>
          {STOPS.map((s, i) => (
            <span
              key={s.href}
              className={cn(
                "block h-1.5 rounded-full transition-[width,background-color] duration-300",
                i === active ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-white/25",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Card({ stop, i, p, active }: { stop: Stop; i: number; p: MotionValue<number>; active: boolean }) {
  // Grows as it nears the middle of the trip, shrinks and dims on either side.
  const at = i / (N - 1);
  const scale = useTransform(p, (v) => 1 - Math.min(Math.abs(v - at) * 0.9, 0.1));
  const imgX = useTransform(p, (v) => `${(at - v) * 18}%`);
  return (
    <motion.li style={{ scale }} className="shrink-0">
      <Morph name={`feature-${stop.href.split("/")[1]}`}>
        <Link
          href={stop.href}
          transitionTypes={["warp"]}
          data-active={active || undefined}
          className="journey-card group relative flex h-[min(58svh,30rem)] w-[min(80vw,25rem)] flex-col justify-end overflow-hidden rounded-[1.75rem] p-6 no-underline sm:p-7"
          style={{ "--tint": stop.tint } as React.CSSProperties}
        >
          <motion.div className="absolute -inset-x-[12%] inset-y-0" style={{ x: imgX }} aria-hidden>
            <Image
              src={stop.img}
              alt=""
              fill
              sizes="(min-width: 640px) 30rem, 90vw"
              className="object-cover transition-transform duration-[1200ms] ease-(--ease-out) group-hover:scale-105"
            />
          </motion.div>
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(180deg,rgb(3_5_11/0.1)_0%,rgb(3_5_11/0.35)_40%,rgb(3_5_11/0.94)_78%)]"
          />
          <div aria-hidden className="journey-card-glow absolute inset-0" />

          <div className="absolute inset-x-6 top-6 flex items-start justify-between sm:inset-x-7">
            <span className="display text-6xl leading-none font-semibold text-transparent [-webkit-text-stroke:1px_var(--tint)]">
              {pad(i + 1)}
            </span>
            {stop.tag && (
              <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/20 backdrop-blur-sm">
                {stop.tag}
              </span>
            )}
          </div>

          <div className="relative">
            <span className="flex items-center gap-2 text-sm text-white/75">
              <stop.icon className="size-4" style={{ color: stop.tint }} aria-hidden />
              {stop.name}
            </span>
            <span className="display mt-2 block text-[1.7rem] leading-[1.1] font-semibold text-white">{stop.verb}</span>
            <span className="mt-2.5 block text-[0.95rem] leading-relaxed text-white/75">{stop.text}</span>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium" style={{ color: stop.tint }}>
              Go to {stop.name}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </span>
            <span className="mt-3 block text-[10px] text-white/45">Image: {stop.credit}</span>
          </div>
        </Link>
      </Morph>
    </motion.li>
  );
}

/** Reduced motion: the same cards in a row you swipe or scroll yourself. */
function StaticTrack() {
  return (
    <section aria-label="Where to go" className="hidden py-24 motion-reduce:block">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="eyebrow">Where to go</p>
        <p className="display mt-3 text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.04] font-semibold">
          Seven ways into three worlds.
        </p>
      </div>
      <ul className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:px-8">
        {STOPS.map((s, i) => (
          <li key={s.href} className="snap-start">
            <Link
              href={s.href}
              className="journey-card relative flex h-[26rem] w-[min(80vw,24rem)] flex-col justify-end overflow-hidden rounded-[1.75rem] p-6 no-underline"
              style={{ "--tint": s.tint } as React.CSSProperties}
            >
              <Image src={s.img} alt="" fill sizes="24rem" className="object-cover" />
              <div
                aria-hidden
                className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgb(3_5_11/0.94)_80%)]"
              />
              <span className="relative text-sm text-white/75">
                {pad(i + 1)} · {s.name}
              </span>
              <span className="display relative mt-2 text-2xl font-semibold text-white">{s.verb}</span>
              <span className="relative mt-2 text-sm text-white/75">{s.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
