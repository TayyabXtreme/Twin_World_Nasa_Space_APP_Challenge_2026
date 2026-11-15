"use client";

import { NAV_ITEMS } from "@/components/shell/nav";
import { LANDINGS } from "@/lib/data/landings";
import { STATIC_PLACES } from "@/lib/data/globePlaces";
import { SITES } from "@/lib/data/sites";
import { DIM_LABEL } from "@/lib/finder/params";
import { DIM_IDS, type DimId } from "@/lib/finder/types";
import { legendUrl, layersFor } from "@/lib/layers";
import { ARTEMIS_REGIONS } from "@/lib/moonbase/regions";
import type { World } from "@/lib/worlds";
import { FINDER_TARGETS } from "./catalog";
import type { Explainer, MissionId, RoviAction, RoviReply } from "./types";

/**
 * Rovi's demo brain: scripted answers for the suggested questions, plus a small intent parser so typed or spoken
 * questions about any site, region, layer, game or page still do the right thing. Every number Rovi says comes from
 * the project's own data files (cited inline), never from memory.
 */

export interface Suggestion {
  id: string;
  q: string;
  /** Extra phrasings that should land on this answer. */
  match: RegExp;
  reply: () => RoviReply | Promise<RoviReply>;
}

/* Grid size from public/data/finder/earth-grid.json (grid.cells, 0.25° land cells). */
const FINDER_CELLS = "354,342";

const site = (id: string) => SITES.find((s) => s.id === id)!;
/** Lower-case the first letter unless the first word is a name (Earth, NASA, Moon…). */
const lowerFirst = (s: string) =>
  /^(Earth|Moon|Mars|NASA|ESA|CSA|JAXA|[A-Z]{2,})\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
const region = (id: string) => ARTEMIS_REGIONS.find((r) => r.id === id)!;

/**
 * Scripted "learn it" cards for demo mode (the live brain draws its own with show_explainer). Facts from the repo:
 * the Finder's grid and sources (public/data/finder/earth-grid.json, lib/finder/model.ts), Moon base factors
 * (lib/moonbase/suitability.ts) and Mini-RF caveats (lib/data/datasets.ts).
 */
const EXPLAINERS: Record<"analogue" | "finder" | "radar" | "moonbase", Explainer> = {
  analogue: {
    title: "What makes an Earth analogue",
    answer: "A place on Earth that matches one feature of the Moon or Mars well enough to practise or test there.",
    nodes: [
      { id: "earth", label: "Earth place", kind: "place" },
      { id: "feature", label: "One shared feature", kind: "data" },
      { id: "test", label: "Tests and training", kind: "process" },
      { id: "mission", label: "Moon or Mars mission", kind: "result" },
    ],
    edges: [
      { from: "earth", to: "feature", label: "" },
      { from: "feature", to: "test", label: "" },
      { from: "test", to: "mission", label: "" },
    ],
    steps: [
      { title: "Pick a place", text: "Start with somewhere on Earth, like the Atacama Desert or a lava field in Iceland.", nodes: ["earth"] },
      { title: "Find what matches", text: "Look for one feature it shares with another world: dryness, volcanic rock, cold, or bare ground.", nodes: ["earth", "feature"] },
      { title: "Use it", text: "Teams test rovers, life-detection tools and spacesuits there, or train crews, long before launch.", nodes: ["feature", "test"] },
      { title: "Know the limits", text: "Gravity, air and radiation always differ, so an analogue is never a copy of the whole world.", nodes: ["test", "mission"] },
    ],
  },
  finder: {
    title: "How the Analog Finder scores Earth",
    answer: "It compares each 0.25° land cell's NASA measurements with the target's, one dimension at a time, and averages them with your weights.",
    nodes: [
      { id: "modis", label: "MODIS + ALOS data", kind: "data" },
      { id: "target", label: "Moon or Mars target", kind: "place" },
      { id: "sim", label: "Similarity per dimension", kind: "process" },
      { id: "weights", label: "Your weights", kind: "process" },
      { id: "map", label: "Ranked map", kind: "result" },
    ],
    edges: [
      { from: "modis", to: "target", label: "" },
      { from: "target", to: "sim", label: "" },
      { from: "sim", to: "weights", label: "" },
      { from: "weights", to: "map", label: "" },
    ],
    steps: [
      { title: "Measure Earth", text: "Every land cell gets 13 parameters: temperature, rain, humidity, air pressure and dust from NASA POWER, sand from SoilGrids, slope and height from JAXA ALOS, and how remote it is.", nodes: ["modis"] },
      { title: "Describe the target", text: "The Moon or Mars site is described the same way, from orbiter data.", nodes: ["target"] },
      { title: "Compare fairly", text: "Where the target is beyond anything on Earth, like the Moon's vacuum or -220 °C, land is ranked by how far it goes toward it, so Earth never has to reach lunar values.", nodes: ["modis", "target", "sim"] },
      { title: "Weigh what matters", text: "Each parameter gives a 0 to 1 match; your sliders decide how much each one counts in the final 0 to 100 score.", nodes: ["sim", "weights"] },
      { title: "Rank the planet", text: "The brightest cells on the map are the closest matches, and the list shows the best distinct places.", nodes: ["weights", "map"] },
    ],
  },
  radar: {
    title: "How radar hunts for ice",
    answer: "Radar measures how rough the surface feels; rough rock and ice both scramble the echo, so a high reading is a clue, not proof.",
    nodes: [
      { id: "pulse", label: "Radar pulse", kind: "data" },
      { id: "surface", label: "Surface or ice", kind: "place" },
      { id: "cpr", label: "Echo polarisation (CPR)", kind: "process" },
      { id: "clue", label: "Ice clue", kind: "result" },
    ],
    edges: [
      { from: "pulse", to: "surface", label: "" },
      { from: "surface", to: "cpr", label: "" },
      { from: "cpr", to: "clue", label: "" },
    ],
    steps: [
      { title: "Send a pulse", text: "An orbiter's radar (Mini-RF on the Moon, RADARSAT on Earth) sends circularly polarised pulses.", nodes: ["pulse"] },
      { title: "Bounce", text: "Smooth ground sends the echo back simply; blocky rock or ice bounces it around many times.", nodes: ["pulse", "surface"] },
      { title: "Read the ratio", text: "The circular polarisation ratio (CPR) rises when the echo has been scrambled.", nodes: ["surface", "cpr"] },
      { title: "Stay honest", text: "High CPR inside a crater that never sees the Sun is a clue for ice; on a sunny rocky slope it is just rock.", nodes: ["cpr", "clue"] },
    ],
  },
  moonbase: {
    title: "How a Moon base site is scored",
    answer: "Six NASA LRO layers become 0 to 1 scores, then your weights average them into one suitability map.",
    nodes: [
      { id: "lro", label: "LRO layers", kind: "data" },
      { id: "factors", label: "Six factors", kind: "process" },
      { id: "weights", label: "Your weights", kind: "process" },
      { id: "spots", label: "Best spots", kind: "result" },
    ],
    edges: [
      { from: "lro", to: "factors", label: "" },
      { from: "factors", to: "weights", label: "" },
      { from: "weights", to: "spots", label: "" },
    ],
    steps: [
      { title: "Read the data", text: "LOLA gives slope and height, Diviner gives temperatures and cold traps, Mini-RF gives radar roughness.", nodes: ["lro"] },
      { title: "Score each factor", text: "Gentle slope, even ground, a cold trap nearby, sunlit ground, high ground and few blocky rocks each get a score.", nodes: ["lro", "factors"] },
      { title: "Weigh them", text: "Slope and ice count most by default, because landers tip on steep ground and ice is the reason to go.", nodes: ["factors", "weights"] },
      { title: "Find the spots", text: "The brightest areas on the map are the best trade-offs; the Base score tab lists the top ones.", nodes: ["weights", "spots"] },
    ],
  },
};

/** "How does X work?" questions that have a scripted explainer. */
const LEARN: [RegExp, keyof typeof EXPLAINERS, RoviAction | null, string][] = [
  [/\b(finder|similar|score earth|rank(ing)? earth|match(ing)?)\b/, "finder", { type: "navigate", href: "/finder", spot: "#finder-stage", caption: "The Analog Finder" }, "Here's how the Analog Finder works, step by step. Tap a box or press Next."],
  [/\b(radar|cpr|mini-?rf|radarsat)\b/, "radar", { type: "navigate", href: "/compare", spot: 'section[aria-labelledby="radar-title"]', caption: "Radar twins" }, "Here's how radar hunts for ice, step by step, with the Radar Twins section open behind it."],
  [/\b(moon ?base|base site|suitab\w*|landing site)\b/, "moonbase", { type: "navigate", href: "/bases", spot: "#moonbase-map", caption: "Base Maps" }, "Here's how the Moon Base map scores a site, step by step."],
  [/\banalog(ue)?s?\b/, "analogue", null, "Here's the idea behind an Earth analogue, step by step."],
];

export const SUGGESTIONS: Suggestion[] = [
  {
    id: "tour",
    q: "Show me around",
    match: /\b(show me around|guided tour|walk me through|give me a tour|what can (i|you) do here|tour of the site)\b/,
    reply: () => ({
      text: "Let's go! Four stops: the Analog Finder, the Moon Base map, Radar Twins and the Mission Challenge. I'll point at each one. Tap Next to move on, or End to stop.",
      actions: [{ type: "startTour", tour: "site" }],
    }),
  },
  {
    id: "analogue",
    q: "What is an Earth analogue?",
    match: /\b(what is|what's|explain|define)\b.*\banalog(ue)?s?\b/,
    reply: () => ({
      text: "An analogue is a place on Earth that helps scientists study one feature of another world. It's never an exact copy: the Atacama is dry enough to test life-detection instruments for Mars, but it still has Earth's air and gravity. Here is the Learn chapter on Earth as the analogue lab.",
      actions: [{ type: "navigate", href: "/learn", spot: "#world-earth", caption: "Earth, the analogue lab" }],
      next: ["How does the Analog Finder work?", "Where on Earth is most like Jezero Crater?"],
      explainer: EXPLAINERS.analogue,
    }),
  },
  {
    id: "jezero-finder",
    q: "Where on Earth is most like Jezero Crater?",
    match: /\b(most like|similar to|closest to|twin (of|for)|analog(ue)? (of|for))\b.*\bjezero\b/,
    reply: () => ({
      text: `Jezero is ${lowerFirst(site("mars-jezero").summary.split(".")[0])}. I've pointed the Analog Finder at it: all ${FINDER_CELLS} land cells of a 0.25° Earth grid get scored against Jezero with NASA measurements. The brightest cells on the map are the closest matches; the ranked list is just below.`,
      actions: [{ type: "setFinder", targetId: "mars-jezero" }],
      next: ["Rank Earth for a Moon base, ice first", "Take me to Jezero on the Mars globe"],
    }),
  },
  {
    id: "ice-weights",
    q: "Rank Earth for a Moon base, ice first",
    match: /\b(moon base|lunar)\b.*\b(ice|frozen)\b.*\b(first|matter|most|priority|weight)|\bice first\b/,
    reply: () => ({
      text: "Done. The target is the Shackleton crater rim at the lunar south pole. I turned the water-ice and temperature sliders all the way up and the rest down, so the ranking leans toward frozen, icy ground. Drag any slider to make it your own.",
      actions: [
        {
          type: "setFinder",
          targetId: "moon-shackleton-rim",
          weights: {
            water: 1,
            tmean: 1,
            trange: 0.3,
            radiation: 0.3,
            pressure: 0.3,
            daylight: 0.3,
            precip: 0.3,
            rh: 0.2,
            aod: 0.2,
            sand: 0.2,
            slope: 0.2,
            isolation: 0.2,
            elev: 0.2,
          },
        },
      ],
      next: ["Where would you build a Moon base?", "What is an Earth analogue?"],
    }),
  },
  {
    id: "moonbase",
    q: "Where would you build a Moon base?",
    match: /\b(where|which place).*\b(build|put|place|set up)\b.*\b(moon )?base\b/,
    reply: () => {
      const r = region("malapert-massif");
      return {
        text: `I'd look at ${r.name}, one of NASA's nine Artemis III candidate regions. ${r.note} I've pinned it on the south-pole map; the readout shows every NASA layer at that point. The region centre is approximate, taken from published landing-site lists.`,
        actions: [{ type: "placeMoonBase", regionId: r.id }],
        next: ["Rank Earth for a Moon base, ice first", "Let me land on the Moon"],
      };
    },
  },
  {
    id: "hingol",
    q: "Fly me to Pakistan's Mars twin",
    match: /\b(pakistan|hingol|mud volcano)/,
    reply: () => {
      const s = site("earth-hingol");
      return {
        text: `${s.name}, ${s.region}. ${s.summary} It's a proposed analogue for cones in Utopia Planitia, not a NASA field site.`,
        actions: [{ type: "flyGlobe", world: "earth", id: s.id }],
        next: ["Show me where Mars has water", "Play the cinematic globe tour"],
      };
    },
  },
  {
    id: "mars-water",
    q: "Show me where Mars has water",
    match: /\b(water|ice|hydrogen)\b.*\bmars\b|\bmars\b.*\b(water|ice|hydrogen)\b/,
    reply: () => layerReply("mars", "mars-grs-water", ["Take me to Jezero on the Mars globe", "Where would you build a Moon base?"]),
  },
  {
    id: "jezero-globe",
    q: "Take me to Jezero on the Mars globe",
    match: /\b(fly|take|go|show)\b.*\bjezero\b/,
    reply: () => {
      const s = site("mars-jezero");
      return {
        text: `Flying to ${s.name} on Mars. ${s.summary}`,
        actions: [{ type: "flyGlobe", world: "mars", id: s.id }],
        next: ["Where on Earth is most like Jezero Crater?", "Show me where Mars has water"],
      };
    },
  },
  {
    id: "land",
    q: "Let me land on the Moon",
    match: /\b(land|landing|touchdown)\b.*\bmoon\b|\btouchdown\b/,
    reply: () => ({
      // Gravity and controls as shown on the game's own menu (components/challenge/Arcade.tsx).
      text: "Touchdown, Moon edition: real lunar gravity, 1.62 m/s². Left and right arrows tilt the lander, Up or Space fires the engine. Come down slow and level. Starting now!",
      actions: [{ type: "startGame", mission: "land" }],
      next: ["Show me around", "Where would you build a Moon base?"],
    }),
  },
  {
    id: "globe-tour",
    q: "Play the cinematic globe tour",
    match: /\b(cinematic|globe tour|tour (of|the) (globe|earth))\b/,
    reply: () => ({
      text: "Lights down. The camera flies pin to pin across Earth: the ISS right now, Kennedy, NEEMO, Desert RATS, Hingol and more, with a caption at each stop. Press Escape to end it.",
      actions: [{ type: "startTour", tour: "globe" }],
      next: ["Fly me to Pakistan's Mars twin", "Show me around"],
    }),
  },
];

/* ---------- layer answers, read from the layer's own legend ---------- */

async function layerReply(world: World, layerId: string, next?: string[]): Promise<RoviReply> {
  const layer = layersFor(world).find((l) => l.id === layerId)!;
  let text = `Here's ${layer.label} on the ${world === "earth" ? "Earth" : world === "moon" ? "Moon" : "Mars"} map.`;
  if (layer.group === "science") {
    try {
      const legend = (await fetch(legendUrl(layerId)).then((r) => r.json())) as {
        title: string;
        meaning?: string;
        caveat?: string;
        dataset?: string;
      };
      text = `On the map now: ${legend.title}${legend.dataset ? `, from ${legend.dataset}` : ""}. ${legend.meaning ?? ""} ${legend.caveat ?? ""}`.trim();
    } catch {
      /* keep the short line */
    }
  }
  return { text, actions: [{ type: "openLayer", world, layerId }], next };
}

/* ---------- the intent parser for anything else ---------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯʻ']/g, "")
    .replace(/[^a-z0-9.%\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(["crater", "desert", "valley", "valleys", "region", "site", "landing", "space", "center", "centre", "the", "lake", "mine", "rim", "plain", "pit", "near", "peak", "hills", "salt"]);

/** Words that identify a name on their own ("jezero", "atacama", "shackleton"). */
function keys(name: string) {
  const n = norm(name.replace(/\(.*?\)/g, ""));
  const words = n.split(" ").filter((w) => w.length > 3 && !STOP.has(w));
  return [n, ...words];
}

interface Entity {
  kind: "site" | "place" | "landing" | "region" | "target";
  id: string;
  name: string;
  world: World;
  keys: string[];
}

let entities: Entity[] | null = null;
function allEntities(): Entity[] {
  if (entities) return entities;
  entities = [
    ...SITES.map((s) => ({ kind: "site" as const, id: s.id, name: s.name, world: s.world, keys: keys(s.name) })),
    ...STATIC_PLACES.map((p) => ({ kind: "place" as const, id: p.id, name: p.name, world: "earth" as World, keys: keys(p.name) })),
    ...LANDINGS.map((l) => ({ kind: "landing" as const, id: l.id, name: l.mission, world: l.world as World, keys: [norm(l.mission), norm(l.id.replace(/-/g, " "))] })),
    ...ARTEMIS_REGIONS.map((r) => ({ kind: "region" as const, id: r.id, name: r.name, world: "moon" as World, keys: keys(r.name) })),
    ...Object.entries(FINDER_TARGETS).map(([id, name]) => ({ kind: "target" as const, id, name, world: id.split("-")[0] as World, keys: keys(name) })),
  ];
  return entities;
}

function findEntities(t: string) {
  const padded = ` ${t} `;
  return allEntities().filter((e) => e.keys.some((k) => k && padded.includes(` ${k} `)));
}

const MISSION_WORDS: [RegExp, MissionId][] = [
  [/\b(earth or elsewhere|guess)\b/, "guess"],
  [/\bscout\b/, "scout"],
  [/\b(touchdown|land(er|ing)?)\b/, "land"],
  [/\b(rover|sample run|drive|drill)\b/, "rover"],
  [/\b(launch window|launch game|rocket game|capture burn)\b/, "launch"],
];

const DIM_WORDS: [RegExp, DimId][] = [
  [/\b(ice|frozen|freez\w*|water|minerals?|clays?|salts?|geochem\w*|aqueous)\b/, "water"],
  [/\b(cold|temperature)\b/, "tmean"],
  [/\b(swing|temperature range|day night)\b/, "trange"],
  [/\b(radiation|dose|cosmic)\b/, "radiation"],
  [/\b(slope|steep|flat|terrain)\b/, "slope"],
  [/\b(soil|sand|sandy|regolith)\b/, "sand"],
  [/\b(pressure|atmosphere|vacuum|thin air)\b/, "pressure"],
  [/\b(daylight|sun|sunlight)\b/, "daylight"],
  [/\b(rain|precipitation|dry|dryness|arid)\b/, "precip"],
  [/\b(humidity|humid)\b/, "rh"],
  [/\b(dust|dusty|aerosol)\b/, "aod"],
  [/\b(isolat\w*|remote)\b/, "isolation"],
  [/\b(elevation|altitude|height)\b/, "elev"],
];

const LAYER_WORDS: Record<World, [RegExp, string][]> = {
  mars: [
    [/\b(water|ice)\b/, "mars-grs-water"],
    [/\b(hydrogen|neutron)\b/, "mars-ns-epithermal"],
    [/\b(thermal inertia|inertia)\b/, "mars-tes-ti-night"],
    [/\bdust\b/, "mars-dust"],
    [/\b(elevation|height|mola)\b/, "mars-mola-shade"],
    [/\b(themis|infrared|thermal)\b/, "mars-themis"],
  ],
  moon: [
    [/\b(rock|rocks|boulder)\b/, "moon-diviner-rocks"],
    [/\b(night|soil temp)\b/, "moon-diviner-regolith-temp"],
    [/\b(temperature|hot|heat|diviner)\b/, "moon-diviner-max"],
    [/\b(radar|mini-?rf)\b/, "moon-minirf-cpr"],
    [/\bslope\b/, "moon-slope"],
    [/\b(ice|shadow|illumination|sunlight)\b/, "moon-psr-south"],
    [/\b(elevation|height|lola)\b/, "moon-lola-shade"],
  ],
  earth: [
    [/\bnight\b.*\btemp|\btemp\w*\b.*\bnight\b/, "earth-lst-night"],
    [/\b(temperature|heat|hot)\b/, "earth-lst-day"],
    [/\b(vegetation|ndvi|plants?|green)\b/, "earth-ndvi"],
    [/\bsnow\b/, "earth-snow"],
    [/\b(aerosol|haze|smoke)\b/, "earth-aod"],
    [/\bdust\b/, "earth-dust"],
    [/\b(lights|night)\b/, "earth-black-marble"],
    [/\b(relief|elevation|terrain)\b/, "earth-aster-relief"],
  ],
};

const PAGE_WORDS: [RegExp, string][] = [
  [/\b(home|landing page|start page)\b/, "/"],
  [/\b(explore|globe)\b/, "/explore/earth"],
  [/\bfinder\b/, "/finder"],
  [/\bmoon ?base\b/, "/bases"],
  [/\b(compare|comparison|mission score)\b/, "/compare"],
  [/\b(challenge|games?|missions?)\b/, "/challenge"],
  [/\b(learn|glossary|quiz)\b/, "/learn"],
  [/\b(data lab|datasets?|data)\b/, "/data"],
  [/\babout\b/, "/about"],
];

const worldIn = (t: string): World | null =>
  /\bmars|martian\b/.test(t) ? "mars" : /\bmoon|lunar\b/.test(t) ? "moon" : /\bearth\b/.test(t) ? "earth" : null;

const DEFAULT_NEXT = ["Show me around", "Where on Earth is most like Jezero Crater?", "Where would you build a Moon base?"];

function parse(t: string): RoviReply | Promise<RoviReply> | null {
  const wantsAction = /\b(show|open|go|get to|visit|take|fly|bring|zoom|switch|start|play|put|place|pin|build|turn on|navigate)\b/.test(t);
  const found = findEntities(t);

  // Games.
  if (/\b(play|game|start)\b/.test(t) || MISSION_WORDS.some(([re]) => re.test(t) && /\b(game|play|mission)\b/.test(t))) {
    const m = MISSION_WORDS.find(([re]) => re.test(t))?.[1] ?? "guess";
    if (!(m === "land" && found.some((e) => e.kind === "region"))) {
      return {
        text: `Starting a mission for you. ${
          m === "guess" ? "Ten real photos: Earth, the Moon or Mars? Analogue sites are built to fool you." : "Read the controls on the left of the stage. Good luck!"
        }`,
        actions: [{ type: "startGame", mission: m }],
        next: ["Show me around"],
      };
    }
  }

  // A Moon base at a named Artemis III region.
  const reg = found.find((e) => e.kind === "region");
  if (reg && (/\b(base|build|pin|place|land)\b/.test(t) || !found.some((e) => e.kind === "target" || e.kind === "site"))) {
    const r = ARTEMIS_REGIONS.find((x) => x.id === reg.id)!;
    return {
      text: `${r.name} (${r.short}) is one of NASA's nine Artemis III candidate regions. ${r.note} Pinned on the south-pole map, with every NASA layer readable at that point.`,
      actions: [{ type: "placeMoonBase", regionId: r.id }],
      next: ["Rank Earth for a Moon base, ice first"],
    };
  }

  // The Finder: "most like X", "twin for X", or weights.
  const dims = DIM_WORDS.filter(([re]) => re.test(t)).map(([, d]) => d);
  const target = found.find((e) => e.kind === "target");
  const finderish = /\b(finder|most like|similar|twin|analog(ue)?|rank|match(es)?|resembl\w*)\b/.test(t);
  const weighty = /\b(weight|matter|priority|first|care)\b/.test(t);
  if ((target && finderish) || (dims.length && (finderish || (weighty && location.pathname === "/finder")))) {
    const weights = dims.length
      ? (Object.fromEntries(DIM_IDS.map((d) => [d, dims.includes(d) ? 1 : 0.3])) as Record<DimId, number>)
      : undefined;
    const name = target?.name;
    return {
      text: `${name ? `Ranking every land cell on Earth against ${name}.` : "Re-weighting the ranking."}${dims.length ? ` I put ${dims.map((d) => DIM_LABEL[d].toLowerCase()).join(" and ")} first and turned the rest down.` : ""} Brightest cells are the closest matches.`,
      actions: [{ type: "setFinder", targetId: target?.id, weights }],
      next: ["Where would you build a Moon base?"],
    };
  }

  // A map layer: "show Mars dust", "Moon temperature map".
  const w = worldIn(t);
  const layerWorlds: World[] = w ? [w] : ["mars", "moon", "earth"];
  if (/\b(map|layer|show|where)\b/.test(t)) {
    for (const lw of layerWorlds) {
      const hit = LAYER_WORDS[lw].find(([re]) => re.test(t));
      if (hit && (w || /\b(map|layer)\b/.test(t))) return layerReply(lw, hit[1], ["Show me around"]);
    }
  }

  // A pin on a globe.
  const pin = found.find((e) => e.kind === "site" || e.kind === "place" || e.kind === "landing") ?? (target ? { ...target, kind: "site" as const } : undefined);
  if (pin && pin.world !== undefined) {
    const s = SITES.find((x) => x.id === pin.id);
    const p = STATIC_PLACES.find((x) => x.id === pin.id);
    const l = LANDINGS.find((x) => x.id === pin.id);
    const summary = s?.summary ?? p?.summary ?? l?.summary;
    if (summary) {
      return {
        text: `Flying to ${pin.name}. ${summary}`,
        actions: [{ type: "flyGlobe", world: pin.world, id: pin.id }],
        next: s && s.world !== "earth" ? [`Where on Earth is most like ${s.name}?`] : ["Play the cinematic globe tour"],
      };
    }
  }

  // A page.
  if (wantsAction || /\b(page|section)\b/.test(t)) {
    const page = PAGE_WORDS.find(([re]) => re.test(t));
    if (page) {
      const item = NAV_ITEMS.find((n) => n.href === page[1]);
      return {
        text: item ? `Opening ${item.label}: ${lowerFirst(item.hint)}.` : "Here you go.",
        actions: [{ type: "navigate", href: page[1] === "/explore/earth" && w && w !== "earth" ? `/explore/${w}` : page[1] }],
        next: DEFAULT_NEXT,
      };
    }
  }

  if (/\btour\b/.test(t)) return SUGGESTIONS[0].reply();
  return null;
}

/** Answer one question in demo mode. */
export async function demoBrain(raw: string): Promise<RoviReply> {
  const t = norm(raw);
  const exact = SUGGESTIONS.find((s) => norm(s.q) === t);
  if (exact) return exact.reply();

  if (/^(hi|hello|hey|salam|assalam\w*|yo)\b|\b(who are you|your name|what are you)\b/.test(t)) {
    return {
      text: "Hi, I'm Rovi, TwinWorlds' mission robot. I can fly the globes, run the Analog Finder, pin a Moon base, open NASA map layers, start a game or give you a tour. I'm in demo mode right now, so I know a set of questions best. Try one below!",
      actions: [],
      next: DEFAULT_NEXT,
    };
  }

  // "How does X work?" / "explain X" / "teach me X": an interactive explainer card.
  const wantsPlace = /\b(get to|go to|open|take me|find the)\b/.test(t);
  if (!wantsPlace && /\b(how (does|do|is|are)|explain|teach me|help me understand|why does)\b/.test(t)) {
    const hit = LEARN.find(([re]) => re.test(t));
    if (hit) {
      const [, key, action, line] = hit;
      return { text: line, actions: action ? [action] : [], explainer: EXPLAINERS[key], next: ["Show me around"] };
    }
  }

  const scripted = SUGGESTIONS.find((s) => s.match.test(t));
  if (scripted) return scripted.reply();

  const parsed = await parse(t);
  if (parsed) return parsed;

  return {
    text: "I'm in demo mode, so I can't answer that one yet. I can fly to any site or landing, rank Earth against a Moon or Mars target, pin a Moon base at an Artemis III region, open a NASA map layer or start a game. Try one of these:",
    actions: [],
    next: DEFAULT_NEXT,
  };
}

/** Undo the last action: handled by the conductor, recognised here so "undo" never reaches the parser. */
export const isUndo = (raw: string) => /^(undo|go back|revert|undo that|take that back)\b/.test(norm(raw));

export type { RoviAction };
