import Image from "next/image";
import { cn } from "@/lib/utils";
import { Reveal, SectionHead } from "./Reveal";

interface Place {
  name: string;
  where: string;
  world: "earth" | "moon" | "mars";
  img: string;
  width: number;
  height: number;
  credit: string;
}

interface Pair {
  earth: Place;
  other: Place;
  shared: string;
  different: string;
  nasaUse: string;
}

/** Pairs and wording follow the NASA-sourced research brief (Planetary Analog Explorer, Astrobiology). */
const PAIRS: Pair[] = [
  {
    earth: {
      name: "Atacama Desert",
      where: "Chile",
      world: "earth",
      img: "/photos/twins/atacama_desert.webp",
      width: 1600,
      height: 1600,
      credit: "NASA Earth Observatory · ASTER",
    },
    other: {
      name: "Jezero Crater",
      where: "Mars",
      world: "mars",
      img: "/photos/sites/site-jezero.webp",
      width: 1600,
      height: 869,
      credit: "NASA/JPL-Caltech/University of Arizona · HiRISE",
    },
    shared: "Extreme dryness and salty, oxidised soils",
    different:
      "Atacama still has Earth's air, gravity and weather. It does not reproduce Martian radiation or air pressure.",
    nasaUse: "NASA-related teams test life-detection instruments, drills and rover operations here.",
  },
  {
    earth: {
      name: "Death Valley",
      where: "California",
      world: "earth",
      img: "/photos/twins-nasa/death_valley_badwater.webp",
      width: 1077,
      height: 1280,
      credit: "NASA/METI/AIST/Japan Space Systems · ASTER",
    },
    other: {
      name: "Utopia Planitia",
      where: "Mars",
      world: "mars",
      img: "/photos/sites/site-utopia-planitia.webp",
      width: 1600,
      height: 1529,
      credit: "NASA/JPL/University of Arizona · HiRISE",
    },
    shared: "Rocky, sandy ground full of obstacles",
    different: "The match is about terrain and driving, not about air or temperature.",
    nasaUse: "The Mars 2020 team practised hazard avoidance in California before Perseverance landed.",
  },
  {
    earth: {
      name: "Kīlauea",
      where: "Hawaiʻi",
      world: "earth",
      img: "/photos/twins-nasa/kilauea_ris4e_fieldwork.webp",
      width: 685,
      height: 432,
      credit: "NASA/GSFC",
    },
    other: {
      name: "Marius Hills Pit",
      where: "the Moon",
      world: "moon",
      img: "/photos/sites/site-marius-hills-pit.webp",
      width: 1000,
      height: 1000,
      credit: "NASA/GSFC/Arizona State University · LROC",
    },
    shared: "Basaltic lava rock and rough volcanic terrain",
    different: "Kīlauea has air, weather and six times the Moon's gravity. It trains field geology, not survival.",
    nasaUse: "Researchers rehearse how a small team of geologists or astronauts would work on volcanic ground.",
  },
];

const WORLD_LABEL = { earth: "Earth", moon: "Moon", mars: "Mars" } as const;
const WORLD_DOT = {
  earth: "bg-[var(--earth)]",
  moon: "bg-[var(--moon)]",
  mars: "bg-[var(--mars)]",
} as const;

function PlaceFigure({ place, align }: { place: Place; align: "start" | "end" }) {
  return (
    <figure className={cn("group flex flex-col gap-3", align === "end" && "md:items-end md:text-end")}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[10px] shadow-[0_24px_60px_-28px_rgb(8_10_30/0.9)] ring-1 ring-white/10">
        <Image
          src={place.img}
          alt={`${place.name}, ${place.where}`}
          fill
          sizes="(min-width: 1024px) 40vw, (min-width: 768px) 45vw, 92vw"
          className="object-cover transition-transform duration-[1200ms] ease-(--ease-out) group-hover:scale-[1.06]"
        />
      </div>
      <figcaption>
        <span
          className={cn("flex items-center gap-2 text-sm text-[var(--ink-dim)]", align === "end" && "md:justify-end")}
        >
          <span className={cn("size-2 rounded-full", WORLD_DOT[place.world])} aria-hidden />
          {WORLD_LABEL[place.world]}
        </span>
        <span className="display mt-1 block text-2xl font-semibold text-[var(--ink)]">{place.name}</span>
        <span className="block text-sm text-[var(--ink-dim)]">{place.where}</span>
        <span className="mt-1 block text-[0.7rem] text-[var(--ink-dim)]/80">Image: {place.credit}</span>
      </figcaption>
    </figure>
  );
}

export function TwinPairs() {
  return (
    <section
      id="twins"
      aria-labelledby="twins-title"
      className="mx-auto max-w-6xl scroll-mt-8 px-5 py-24 sm:px-8 md:py-32"
    >
      <SectionHead
        id="twins-title"
        eyebrow="NASA analogue pairs"
        title="Twins, not copies."
        lead="An analogue never copies a whole world. Each pair below names the one feature that matches and the difference that matters, taken from NASA's Planetary Analog Explorer."
      />

      <ol className="mt-16 flex flex-col gap-24">
        {PAIRS.map((pair) => (
          <li key={pair.earth.name}>
            <article aria-label={`${pair.earth.name} and ${pair.other.name}`}>
              <div className="grid items-center gap-6 md:grid-cols-[1fr_minmax(9rem,13rem)_1fr] md:gap-8">
                <Reveal x={-70} y={0}>
                  <PlaceFigure place={pair.earth} align="start" />
                </Reveal>
                {/* The seam: the shared feature written between the photos, joined to each by a hairline */}
                <Reveal delay={0.25} y={20} className="flex items-center gap-3 md:-mx-8">
                  <span aria-hidden className="h-px flex-1 bg-[var(--line)]" />
                  <p className="max-w-[12rem] text-center">
                    <span className="block text-[0.72rem] font-medium tracking-[0.14em] text-[var(--accent)] uppercase">
                      Shared
                    </span>
                    <span className="display mt-1 block text-[1.08rem] leading-snug text-[var(--ink)]">
                      {pair.shared}
                    </span>
                  </p>
                  <span aria-hidden className="h-px flex-1 bg-[var(--line)]" />
                </Reveal>
                <Reveal x={70} y={0} delay={0.1}>
                  <PlaceFigure place={pair.other} align="end" />
                </Reveal>
              </div>
              <Reveal delay={0.3} y={16}>
                <dl className="mt-6 grid gap-4 border-t border-[var(--line)] pt-5 text-[0.95rem] leading-relaxed md:grid-cols-2 md:gap-10">
                  <div>
                    <dt className="text-[0.72rem] font-medium tracking-[0.14em] text-[var(--accent)] uppercase">
                      Key difference
                    </dt>
                    <dd className="mt-1 text-[var(--ink)]">{pair.different}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.72rem] font-medium tracking-[0.14em] text-[var(--accent)] uppercase">
                      How NASA uses it
                    </dt>
                    <dd className="mt-1 text-[var(--ink-dim)]">{pair.nasaUse}</dd>
                  </div>
                </dl>
              </Reveal>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
