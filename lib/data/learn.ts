import type { World } from "@/lib/worlds";
import type { Evidence } from "./types";

export interface Fact {
  id: string;
  world: World;
  text: string;
  evidence: Evidence;
  sourceId: string;
}

/** Short facts, worded from the NASA-sourced research brief. */
export const FACTS: Fact[] = [
  { id: "mars-red", world: "mars", text: "Mars is red because iron minerals in its rocks, soil and dust have oxidised: they have rusted.", evidence: "confirmed", sourceId: "nasa-mars-facts" },
  { id: "mars-air", world: "mars", text: "Mars' air is very thin and mostly carbon dioxide, with some nitrogen and argon.", evidence: "confirmed", sourceId: "nasa-mars-facts" },
  { id: "mars-temp", world: "mars", text: "Temperatures range from about 20 °C to about −153 °C; a commonly cited median is around −65 °C.", evidence: "confirmed", sourceId: "nasa-temps" },
  { id: "mars-water", world: "mars", text: "Mars once had rivers, deltas and lakes. Today its water is mostly ice, underground and at the poles.", evidence: "evidence_for", sourceId: "nasa-mars-facts" },
  { id: "mars-storms", world: "mars", text: "Winds can lift dust into local, regional and sometimes planet-wide storms. Dust devils happen too.", evidence: "confirmed", sourceId: "nasa-mars-facts" },
  { id: "mars-olympus", world: "mars", text: "Olympus Mons is a giant shield volcano, and Valles Marineris a vast canyon system.", evidence: "confirmed", sourceId: "nasa-mars-facts" },
  { id: "moon-gravity", world: "moon", text: "Gravity on the Moon is about one-sixth of Earth's, which changes how people move, build and how dust behaves.", evidence: "confirmed", sourceId: "nasa-moon" },
  { id: "moon-exosphere", world: "moon", text: "The Moon has only a very thin exosphere, not a breathable atmosphere.", evidence: "confirmed", sourceId: "nasa-moon" },
  { id: "moon-craters", world: "moon", text: "Ancient craters survive because the Moon has no wind or flowing water to erase them.", evidence: "confirmed", sourceId: "nasa-moon" },
  { id: "moon-ice", world: "moon", text: "There is evidence for water ice in permanently shadowed polar regions, but not every shadowed crater holds the same amount.", evidence: "evidence_for", sourceId: "nasa-moon-water" },
  { id: "moon-shackleton", world: "moon", text: "Parts of Shackleton crater's rim get very long sunlight, while its floor stays in permanent shadow.", evidence: "confirmed", sourceId: "nasa-shackleton" },
  { id: "moon-artemis", world: "moon", text: "NASA's Artemis III candidate regions are being assessed; being on the list does not mean a site has been chosen.", evidence: "candidate", sourceId: "nasa-artemis3-regions" },
  { id: "earth-atacama", world: "earth", text: "The Atacama is one of the driest places on Earth and is used to test life-detection instruments for Mars.", evidence: "confirmed", sourceId: "nasa-astrobio-locations" },
  { id: "earth-drysvalleys", world: "earth", text: "In Antarctica's Dry Valleys, microbes survive in protected spaces inside rocks.", evidence: "confirmed", sourceId: "nasa-astrobio-locations" },
  { id: "earth-ripples", world: "earth", text: "Gravel ripples near Askja, Iceland, are compared with Martian ridges about ten times larger.", evidence: "confirmed", sourceId: "nasa-analog-explorer" },
  { id: "earth-analogues", world: "earth", text: "An analogue is a place on Earth that helps study one feature of another world. It is never an exact copy.", evidence: "confirmed", sourceId: "nasa-analog-missions" },
];

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: "Analogue", definition: "A place or process on Earth that helps scientists study one feature of another world." },
  { term: "Basalt", definition: "Dark volcanic rock made from cooled lava; common on the Moon's maria and on Mars." },
  { term: "Delta", definition: "A fan of sediment left where a river flowed into a lake or sea, like the one in Jezero Crater." },
  { term: "Exosphere", definition: "An extremely thin layer of gas around a body, far too thin to breathe or to carry sound." },
  { term: "Field geology", definition: "Studying rocks where they are: mapping, observing and sampling, as astronauts would on the Moon." },
  { term: "Ground-penetrating radar", definition: "Radar pulses sent into the ground to find buried layers, ice or cavities." },
  { term: "Hazard avoidance", definition: "How a lander or rover detects and steers around rocks, slopes and holes." },
  { term: "Lava tube", definition: "A tunnel left when the outside of a lava flow hardened and the hot lava inside drained away." },
  { term: "LOLA", definition: "Lunar Orbiter Laser Altimeter on NASA's LRO: a laser that measured the Moon's elevation." },
  { term: "MOLA", definition: "Mars Orbiter Laser Altimeter on Mars Global Surveyor: a laser that measured Mars' elevation." },
  { term: "Perchlorate", definition: "A salt containing chlorine and oxygen, found in Martian soil by the Phoenix lander." },
  { term: "Permafrost", definition: "Ground that stays frozen all year." },
  { term: "Permanently shadowed region (PSR)", definition: "A place near the lunar poles, often a crater floor, that sunlight never reaches." },
  { term: "Regolith", definition: "The loose layer of dust and broken rock covering the Moon and Mars, made by billions of years of impacts." },
  { term: "Sol", definition: "One Martian day: 24 hours and about 37 minutes." },
  { term: "Light delay", definition: "The time a radio signal takes to cross space: about 1.3 seconds to the Moon and 3 to 22 minutes to Mars." },
  { term: "Candidate region", definition: "A place under study for a mission. It has not been chosen." },
  { term: "Evidence for", definition: "Data point towards something, but it is not confirmed everywhere." },
  // Data Lab terms (docs/archive/plan-v2.md §4, "Pages that change → Learn").
  { term: "Ice stability depth", definition: "How deep you would have to dig before buried water ice could survive for billions of years without escaping to space. Zero means ice could last right at the surface; it shows where ice could survive, not where it has been found." },
  { term: "Cold trap", definition: "A place so cold all year, below about 110 K (−163 °C), that water molecules landing there freeze and stay. On the Moon these are mostly in permanently shadowed crater floors." },
  { term: "Thermal inertia", definition: "How strongly the ground resists changing temperature. Loose dust heats and cools quickly (low thermal inertia), while solid rock and ice-cemented soil change slowly (high)." },
  { term: "Apparent thermal inertia", definition: "A quick estimate of thermal inertia from orbit, using the day–night temperature swing and how much sunlight the ground reflects. Useful for comparing Earth places, but less exact than a modelled value like Mars TES." },
  { term: "Circular polarisation ratio (CPR)", definition: "A radar measure that compares the echo returned with the same and the opposite twist as the signal sent. High CPR means rough, rocky ground or possibly ice, so CPR alone cannot prove ice." },
  { term: "Epithermal neutrons", definition: "Medium-energy neutrons knocked out of the ground by cosmic rays. Hydrogen slows them down, so fewer epithermal neutrons reaching orbit means more hydrogen, often water ice." },
  { term: "Water-equivalent hydrogen", definition: "The hydrogen in the soil, written as if all of it were in water, as a weight percent. The hydrogen may really sit in ice, in hydrated minerals or in water stuck to grains." },
  { term: "Rock abundance", definition: "The share of the ground covered by rocks rather than fine soil. Diviner measures it from how slowly rocks cool at night; high values mean a harder place to land or drive." },
  { term: "Land surface temperature (LST)", definition: "The temperature of the ground's thin top skin, measured by a satellite's heat sensor. It is not the air temperature a weather station reports: bare desert ground can be much hotter than the air." },
  { term: "NDVI", definition: "Normalized Difference Vegetation Index: compares red and near-infrared light to show how green a place is, on a scale from −1 to 1. Values near zero mean bare rock, sand or ice." },
  { term: "Albedo", definition: "The fraction of sunlight a surface reflects, from 0 (black) to 1 (white). Fresh snow and salt flats are bright; basalt plains and the lunar maria are dark." },
];

/** The research brief's cautions, as plain rules. */
export const CAUTIONS = [
  "Never describe a place on Earth as an exact copy of Mars or the Moon.",
  "Name the feature being compared: basalt geology, dry soil, buried-ice detection, lava caves.",
  "Keep confirmed observations apart from possibilities: say “evidence for”, “may contain” or “candidate region”.",
  "Do not assume every permanently shadowed lunar crater holds accessible ice.",
  "Only compare temperatures when the statistic and units are clear.",
  "Keep Moon and Mars data separate, and label each world.",
  "Use images as support, not as proof of similarity.",
  "Record the original source for every fact, map and image.",
];

/** The three world chapters on the Learn page, in scroll order. */
export interface WorldChapter {
  id: World;
  name: string;
  tagline: string;
  texture: string;
  /** Atmosphere glow around the planet. */
  glow: string;
  stats: { label: string; value: string }[];
}

export const WORLD_CHAPTERS: WorldChapter[] = [
  {
    id: "mars",
    name: "Mars",
    tagline: "A cold, dusty desert that once had rivers and lakes.",
    texture: "/textures/mars/color-1k.webp",
    glow: "oklch(0.66 0.16 40)",
    stats: [
      { label: "Gravity", value: "38% of Earth's" },
      { label: "One day", value: "about 24.6 hours" },
      { label: "Air", value: "under 1% of Earth's pressure" },
    ],
  },
  {
    id: "moon",
    name: "The Moon",
    tagline: "No air and no weather, so every impact stays written on the ground.",
    texture: "/textures/moon/color-1k.webp",
    glow: "oklch(0.85 0.01 260)",
    stats: [
      { label: "Gravity", value: "about 1/6 of Earth's" },
      { label: "One day", value: "about 29.5 Earth days" },
      { label: "Air", value: "a very thin exosphere" },
    ],
  },
  {
    id: "earth",
    name: "Earth, the analogue lab",
    tagline: "Where NASA practises for both, one feature at a time.",
    texture: "/textures/earth/day-1k.webp",
    glow: "oklch(0.72 0.13 235)",
    stats: [
      { label: "Analogue", value: "one feature, never a copy" },
      { label: "Tested here", value: "instruments, rovers, crews" },
      { label: "Examples", value: "Atacama, Dry Valleys, Iceland" },
    ],
  },
];

export interface QuizQuestion {
  id: string;
  statement: string;
  answer: boolean;
  explanation: string;
  sourceId?: string;
}

/** True-or-false questions, each answered by a fact on this page. */
export const QUIZ: QuizQuestion[] = [
  {
    id: "mars-red",
    statement: "Mars is red because it is very hot.",
    answer: false,
    explanation: "Mars is cold. It looks red because iron minerals in its rocks and dust have oxidised: they have rusted.",
    sourceId: "nasa-mars-facts",
  },
  {
    id: "sol",
    statement: "A day on Mars is a little longer than a day on Earth.",
    answer: true,
    explanation: "A Martian day, called a sol, lasts about 24.6 hours: a little over half an hour longer than ours.",
    sourceId: "nasa-mars-facts",
  },
  {
    id: "moon-sound",
    statement: "On the Moon you could hear someone shout from across a crater.",
    answer: false,
    explanation: "The Moon has only a very thin exosphere, far too thin to carry sound. Astronauts talk by radio.",
    sourceId: "nasa-moon",
  },
  {
    id: "moon-gravity",
    statement: "On the Moon you would feel about one-sixth as heavy as on Earth.",
    answer: true,
    explanation: "Lunar gravity is about one-sixth of Earth's, which changes how people walk, jump and build, and how dust flies.",
    sourceId: "nasa-moon",
  },
  {
    id: "psr-ice",
    statement: "Every permanently shadowed crater near the lunar poles is full of ice.",
    answer: false,
    explanation: "There is evidence for ice in permanently shadowed regions, but the amount varies from crater to crater and some may hold little.",
    sourceId: "nasa-moon-water",
  },
  {
    id: "mars-water",
    statement: "Mars once had rivers, deltas and lakes.",
    answer: true,
    explanation: "Orbiters and rovers have found old river channels and deltas, like the one in Jezero Crater. Today the water is mostly ice.",
    sourceId: "nasa-mars-facts",
  },
  {
    id: "radio",
    statement: "A radio message reaches Mars in under a second.",
    answer: false,
    explanation: "Even at light speed it takes 3 to 22 minutes, depending on where the two planets are in their orbits. To the Moon it is about 1.3 seconds.",
  },
  {
    id: "analogue",
    statement: "The Atacama Desert is an exact copy of Mars.",
    answer: false,
    explanation: "It is an analogue: very dry, so it is great for testing life-detection instruments, but it matches only some features of Mars.",
    sourceId: "nasa-analog-missions",
  },
];
