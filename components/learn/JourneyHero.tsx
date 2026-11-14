"use client";

import { ChevronDown } from "lucide-react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { Morph } from "@/components/motion/PageTransition";
import { PlanetOrb } from "./PlanetOrb";

/** Average Earth–Moon and Earth–Mars distances (NASA), km; light speed, km/s. */
const MOON_KM = 384_400;
const MARS_KM = 225_000_000;
const C = 299_792.458;

/** Scroll progress where each leg of the trip starts and ends. */
const LEG = { moonFrom: 0.12, moonAt: 0.34, marsFrom: 0.5, marsAt: 0.74 };

/** Distance from Earth for a scroll position: linear to the Moon, then exponential out to Mars. */
function distanceKm(p: number) {
  if (p <= LEG.moonFrom) return 0;
  if (p <= LEG.moonAt) return ((p - LEG.moonFrom) / (LEG.moonAt - LEG.moonFrom)) * MOON_KM;
  if (p <= LEG.marsFrom) return MOON_KM;
  if (p <= LEG.marsAt) return MOON_KM * (MARS_KM / MOON_KM) ** ((p - LEG.marsFrom) / (LEG.marsAt - LEG.marsFrom));
  return MARS_KM;
}

const formatKm = (km: number) =>
  km < 1_000_000
    ? `${Math.round(km).toLocaleString("en-GB")} km`
    : `${(km / 1e6).toFixed(km < 1e7 ? 1 : 0)} million km`;

function formatDelay(km: number) {
  const s = km / C;
  if (s < 0.01) return "instant";
  if (s < 60) return `${s.toFixed(2)} s`;
  return `${(s / 60).toFixed(1)} min`;
}

const CAPTIONS = [
  {
    window: [0, 0, 0.08, 0.14],
    kicker: "Learn · for students and beginners",
    title: "Space, explained from the start",
    body: "The Moon and Mars made simple: the facts we are sure of, and the ones we are not. Scroll to leave Earth.",
  },
  {
    window: [0.24, 0.3, 0.44, 0.5],
    kicker: "384,400 km · 1.3 light-seconds",
    title: "The Moon",
    body: "Close enough that a radio call feels almost live. With no air and no weather, craters billions of years old are still sharp.",
  },
  {
    window: [0.6, 0.66, 0.8, 0.86],
    kicker: "225 million km on average · 3 to 22 light-minutes",
    title: "Mars",
    body: "Too far to steer a rover with a joystick: every command takes minutes to arrive, so rovers drive themselves between check-ins.",
  },
  {
    window: [0.9, 0.95, 1, 1],
    kicker: "Ready?",
    title: "Here is what we know",
    body: "How sure we are, what you can try for yourself, a quiz and the words explained.",
  },
] as const;

function Caption({
  p,
  c,
  first,
  last,
}: {
  p: MotionValue<number>;
  c: (typeof CAPTIONS)[number];
  first: boolean;
  last: boolean;
}) {
  const [a, b, d, e] = c.window;
  // The opening caption starts visible and only fades out; the closing one fades in and stays.
  const input = first ? [d, e] : last ? [a, b] : [a, b, d, e];
  const opacity = useTransform(p, input, first ? [1, 0] : last ? [0, 1] : [0, 1, 1, 0]);
  const y = useTransform(p, input, first ? [0, -24] : last ? [24, 0] : [24, 0, 0, -24]);
  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-x-0 bottom-0 md:top-1/2 md:bottom-auto md:-translate-y-1/2"
    >
      <p className="hud text-xs tracking-[0.18em] text-primary uppercase">{c.kicker}</p>
      {first ? (
        <Morph name="feature-learn">
          <h1 className="mt-3 font-heading text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.98] font-semibold tracking-tight text-balance">
            {c.title}
          </h1>
        </Morph>
      ) : (
        <h2 className="mt-3 font-heading text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.98] font-semibold tracking-tight">
          {c.title}
        </h2>
      )}
      <p className="mt-4 max-w-md text-[1.05rem] leading-relaxed text-muted-foreground">{c.body}</p>
    </motion.div>
  );
}

/**
 * The page opener: a pinned scene that flies from Earth past the Moon to Mars as you scroll, with the distance and
 * radio delay counting up. Planets shrink into the distance behind you and grow ahead of you; two star layers
 * drift at different speeds.
 */
export function JourneyHero() {
  // Both render and CSS picks one, so the server HTML matches whatever the visitor's motion setting is.
  return (
    <>
      <ScrollHero />
      <StaticHero />
    </>
  );
}

function ScrollHero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // Earth: big and close, then it falls away behind us into the top corner.
  const earthScale = useTransform(p, [0, 0.32], [1, 0.14]);
  const earthX = useTransform(p, [0, 0.32], ["0vw", "-30vw"]);
  const earthY = useTransform(p, [0, 0.32], ["0vh", "-30vh"]);
  const earthO = useTransform(p, [0.4, 0.56], [1, 0]);
  const earthSpin = useTransform(p, [0, 0.5], ["0%", "-30%"]);
  // Moon: comes up from the lower right, holds, then falls away too.
  const moonScale = useTransform(p, [LEG.moonFrom, LEG.moonAt, 0.46, 0.68], [0.18, 0.78, 0.78, 0.12]);
  const moonX = useTransform(p, [LEG.moonFrom, LEG.moonAt, 0.46, 0.68], ["40vw", "0vw", "0vw", "-26vw"]);
  const moonY = useTransform(p, [LEG.moonFrom, LEG.moonAt, 0.46, 0.68], ["30vh", "0vh", "0vh", "-28vh"]);
  const moonO = useTransform(p, [LEG.moonFrom, LEG.moonFrom + 0.06, 0.7, 0.8], [0, 1, 1, 0]);
  const moonSpin = useTransform(p, [LEG.moonFrom, 0.7], ["-10%", "-28%"]);
  // Mars: a red dot that swells until it fills the view, then steps aside for the outro text.
  const marsScale = useTransform(p, [LEG.marsFrom, LEG.marsAt, 0.88, 1], [0.08, 1.05, 1.05, 0.8]);
  const marsX = useTransform(p, [LEG.marsFrom, LEG.marsAt], ["30vw", "0vw"]);
  const marsY = useTransform(p, [LEG.marsFrom, LEG.marsAt], ["18vh", "0vh"]);
  const marsO = useTransform(p, [LEG.marsFrom, LEG.marsFrom + 0.05], [0, 1]);
  const marsSpin = useTransform(p, [LEG.marsFrom, 1], ["0%", "-22%"]);
  // Stars: the far layer drifts slower than the near one.
  const starsNear = useTransform(p, [0, 1], ["0%", "-22%"]);
  const starsFar = useTransform(p, [0, 1], ["0%", "-8%"]);
  // Readout.
  const km = useTransform(p, distanceKm);
  const kmText = useTransform(km, formatKm);
  const delayText = useTransform(km, formatDelay);
  const ship = useTransform(p, [LEG.moonFrom, LEG.moonAt, LEG.marsFrom, LEG.marsAt], ["0%", "28%", "28%", "100%"]);
  const cue = useTransform(p, [0, 0.05], [1, 0]);

  return (
    <section
      ref={ref}
      aria-label="A trip from Earth to Mars"
      className="relative -mx-4 -mt-20 h-[460vh] motion-reduce:hidden md:-ms-24 md:-me-8"
    >
      <div className="sticky top-0 h-dvh overflow-hidden">
        <motion.div className="learn-stars learn-stars-far" style={{ y: starsFar }} aria-hidden />
        <motion.div className="learn-stars" style={{ y: starsNear }} aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--background)_100%)]"
          aria-hidden
        />

        {/* Planet stage: centred above the captions on phones, right of them on wide screens. */}
        <div
          className="absolute top-[36%] left-1/2 md:top-1/2 md:left-[64%]"
          style={{ "--orb": "min(64vmin, 520px)" } as React.CSSProperties}
        >
          <Orb
            texture="/textures/earth/day-1k.webp"
            glow="oklch(0.72 0.13 235)"
            spin={earthSpin}
            style={{ scale: earthScale, x: earthX, y: earthY, opacity: earthO }}
            priority
          />
          <Orb
            texture="/textures/moon/color-1k.webp"
            glow="oklch(0.85 0.01 260)"
            spin={moonSpin}
            style={{ scale: moonScale, x: moonX, y: moonY, opacity: moonO }}
          />
          <Orb
            texture="/textures/mars/color-1k.webp"
            glow="oklch(0.66 0.16 40)"
            spin={marsSpin}
            style={{ scale: marsScale, x: marsX, y: marsY, opacity: marsO }}
          />
        </div>

        {/* Captions: bottom on phones, left column on wide screens. */}
        <div className="absolute inset-x-5 bottom-[calc(11.5rem+env(safe-area-inset-bottom))] h-64 md:inset-x-auto md:start-28 md:top-0 md:bottom-0 md:h-auto md:w-[min(30rem,38vw)]">
          {CAPTIONS.map((c, i) => (
            <Caption key={c.title} p={p} c={c} first={i === 0} last={i === CAPTIONS.length - 1} />
          ))}
        </div>

        {/* Trip readout. */}
        <div className="absolute inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] mx-auto max-w-xl rounded-2xl glass px-4 py-3 hud text-xs md:bottom-8">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">
              From Earth <motion.span className="ms-1 text-foreground">{kmText}</motion.span>
            </span>
            <span className="text-muted-foreground">
              Radio delay <motion.span className="ms-1 text-primary">{delayText}</motion.span>
            </span>
          </div>
          <div className="relative mt-3 h-4" aria-hidden>
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-white/30 via-white/20 to-white/30" />
            {[
              ["0%", "Earth", "oklch(0.72 0.13 235)"],
              ["28%", "Moon", "oklch(0.85 0.01 260)"],
              ["100%", "Mars", "oklch(0.66 0.16 40)"],
            ].map(([left, name, color]) => (
              <span key={name} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left }}>
                <span className="block size-2 rounded-full" style={{ background: color }} />
                <span className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                  {name}
                </span>
              </span>
            ))}
            <motion.div className="absolute inset-y-0 left-0 w-full" style={{ x: ship }}>
              <span className="absolute top-1/2 left-0 block size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
            </motion.div>
          </div>
          <p className="mt-4 text-[10px] text-muted-foreground/80">Average distances; the track is not to scale.</p>
        </div>

        <motion.div
          style={{ opacity: cue }}
          className="absolute top-24 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-xs text-muted-foreground md:top-auto md:bottom-44"
        >
          <span>Scroll</span>
          <ChevronDown className="learn-cue size-4" aria-hidden />
        </motion.div>
      </div>
    </section>
  );
}

function Orb({ style, ...props }: Omit<React.ComponentProps<typeof PlanetOrb>, "className">) {
  return (
    <PlanetOrb
      {...props}
      className="absolute -top-[calc(var(--orb)/2)] -left-[calc(var(--orb)/2)] size-(--orb)"
      style={style}
    />
  );
}

/**
 * Reduced motion: no flight, just the title and the three worlds side by side. No <Morph> here: ScrollHero's title
 * already holds "feature-learn" (both heroes are mounted, names must be unique), and reduced motion drops morphs anyway.
 */
function StaticHero() {
  return (
    <header className="hidden py-10 motion-reduce:block">
      <p className="hud text-xs tracking-[0.18em] text-primary uppercase">Learn · for students and beginners</p>
      <h1 className="mt-3 font-heading text-[clamp(2.2rem,6vw,4rem)] leading-tight font-semibold tracking-tight">
        Space, explained from the start
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        The Moon and Mars made simple: the facts we are sure of, and the ones we are not.
      </p>
      <div className="mt-8 flex items-center gap-6">
        <PlanetOrb texture="/textures/earth/day-1k.webp" glow="oklch(0.72 0.13 235)" className="size-28" priority />
        <PlanetOrb texture="/textures/moon/color-1k.webp" glow="oklch(0.85 0.01 260)" className="size-14" priority />
        <PlanetOrb texture="/textures/mars/color-1k.webp" glow="oklch(0.66 0.16 40)" className="size-20" priority />
      </div>
    </header>
  );
}
