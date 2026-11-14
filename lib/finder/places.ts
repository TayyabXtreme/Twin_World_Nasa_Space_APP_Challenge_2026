import { SITES, siteById } from "@/lib/data/sites";
import { formatLat, formatLon } from "@/lib/geo";
import { createLookup, type Lookup } from "@/lib/lookup";
import { haversine } from "./model";
import type { RefPoint } from "./types";

/**
 * Named Earth places the Finder knows about: NASA analogue sites (for the sanity check and for labelling),
 * the Pakistan spotlight sites, and a coarse gazetteer of deserts, ice sheets and mountain regions used to
 * give unnamed cells a readable label. Coordinates are approximate centres; the gazetteer radii are rough.
 */

export interface KnownPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
}

// Pakistan sites are in SITES too; PAKISTAN below labels them, so leave them out here.
const EARTH_SITES: KnownPlace[] = SITES.filter((s) => s.world === "earth" && !s.region.endsWith("Pakistan")).map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, region: s.region }));

export interface SpotlightSite extends KnownPlace {
  /** The matching pin in lib/data/sites.ts. */
  siteId: string;
  blurb: string;
  note: string;
  approx: boolean;
}

/** Verified coordinates live in lib/data/sites.ts (the globe pins); the Finder reuses them. */
const at = (siteId: string) => {
  const s = siteById(siteId)!;
  return { lat: s.lat, lon: s.lon };
};

/** A named place built from its pin in lib/data/sites.ts. */
const site = (id: string) => {
  const s = siteById(id)!;
  return { id: s.id, name: s.name, lat: s.lat, lon: s.lon, region: s.region };
};

/** Pakistan spotlight (docs/archive/plan-v2.md §1, P1). */
export const PAKISTAN: SpotlightSite[] = [
  {
    id: "pk-hingol",
    name: "Hingol mud volcanoes",
    siteId: "earth-hingol",
    ...at("earth-hingol"),
    region: "Balochistan, Pakistan",
    approx: false,
    blurb: "Active mud volcanoes (Chandragup and neighbours) on the arid Makran coast.",
    note: "Mud volcanism has been proposed for some Martian mounds and pitted cones. A 25 km cell cannot see a mud cone: the score describes the dry coastal desert around it.",
  },
  {
    id: "pk-cholistan",
    name: "Cholistan Desert",
    siteId: "earth-cholistan",
    ...at("earth-cholistan"),
    region: "Punjab, Pakistan",
    approx: false,
    blurb: "Hot sandy desert with dune fields and dry riverbeds of the old Hakra.",
    note: "Very hot by day with a wide day-night swing. Monsoon greening and irrigated edges lower its 'bare' score; dunes are a wind analogue the grid cannot measure.",
  },
  {
    id: "pk-thar",
    name: "Thar Desert (Tharparkar)",
    siteId: "earth-thar",
    ...at("earth-thar"),
    region: "Sindh, Pakistan",
    approx: false,
    blurb: "Pakistan's share of the Thar: stabilised dunes and scrub in Tharparkar.",
    note: "The Thar is one of the most densely populated deserts; monsoon grass and scrub show up in NDVI, so it is less bare than the Atacama or the Namib.",
  },
  {
    id: "pk-khewra",
    name: "Khewra Salt Range",
    siteId: "earth-khewra",
    ...at("earth-khewra"),
    region: "Punjab, Pakistan",
    approx: false,
    blurb: "Thick Precambrian salt (evaporite) beds, mined at Khewra for centuries.",
    note: "Evaporites like these record drying water, as sulfate and chloride deposits do at Gale and Meridiani. Salt mineralogy is not in our dimensions, and the farmland around the range keeps its score low.",
  },
];

/** Known NASA analogues for the sanity check: which targets NASA or the literature pairs them with. */
export interface SanitySite extends KnownPlace {
  claim: string;
  expected: string[];
}

export const SANITY: SanitySite[] = [
  { ...site("earth-atacama"), claim: "Dry Mars: hyper-arid, oxidised, salty soils", expected: ["mars-jezero", "mars-gale", "mars-mawrth-vallis"] },
  {
    id: "earth-mcmurdo",
    name: "McMurdo Dry Valleys",
    lat: -77.5,
    lon: 162.0,
    region: "Antarctica",
    claim: "Polar cold desert with ground ice",
    expected: ["mars-phoenix", "mars-arcadia", "moon-shackleton-rim", "moon-malapert-massif", "moon-haworth", "moon-nobile-rim-1", "moon-de-gerlache-rim-2", "moon-mons-mouton", "moon-peak-near-cabeus-b", "moon-slater-plain"],
  },
  { ...site("earth-devon-haughton"), claim: "Cold-desert impact crater (Haughton-Mars Project)", expected: ["mars-phoenix", "mars-arcadia", "mars-utopia-viking2"] },
  { ...site("earth-askja"), claim: "Volcanic highland, basaltic sand, buried ice", expected: ["mars-gale", "moon-shackleton-rim"] },
  { ...site("earth-death-valley"), claim: "Hot rocky desert, rover hazard testing", expected: ["mars-utopia-viking2"] },
  { ...site("earth-kilauea"), claim: "Basaltic lava fields", expected: ["moon-marius-hills-pit"] },
];

/** The Finder reference place for a globe site, if it has one (every named site; Pakistan uses its spotlight id). */
export const finderRefFor = (siteId: string) => PAKISTAN.find((p) => p.siteId === siteId)?.id ?? NAMED_SITES.find((s) => s.id === siteId)?.id;

/** Who uses a named site: a space-agency field programme, a Pakistan spotlight site, a known analogue in the literature, or a place the Finder itself found. */
export type SiteGroup = "agency" | "pakistan" | "known" | "finder";

export interface NamedSite extends KnownPlace {
  group: SiteGroup;
  /** The site is scored by its best 0.25° land cell within this radius (bigger for broad regions). */
  radiusKm: number;
  /** One line: why it is an analogue. */
  why: string;
}

/**
 * The named Earth sites the Finder ranks for every target (the "Ranked sites" table). Coordinates come from
 * lib/data/sites.ts where the globe has a verified pin; the others are published field-site or region centres
 * (approximate, which is why each site takes its best cell within `radiusKm`).
 */
export const NAMED_SITES: NamedSite[] = [
  { ...site("earth-atacama"), group: "agency", radiusKm: 60, why: "Hyper-arid, oxidised soils; NASA rover and life-detection tests" },
  { ...site("earth-mcmurdo"), group: "agency", radiusKm: 60, why: "Polar cold desert with ground ice; Mars and Moon analogue" },
  { ...site("earth-devon-haughton"), group: "agency", radiusKm: 40, why: "Impact crater in a polar desert; Haughton-Mars Project" },
  { ...site("earth-askja"), group: "agency", radiusKm: 50, why: "Basaltic highland; Apollo and Artemis geology training" },
  { ...site("earth-death-valley"), group: "agency", radiusKm: 50, why: "Hot rocky desert; Mars 2020 hazard-avoidance tests" },
  { ...site("earth-kilauea"), group: "agency", radiusKm: 40, why: "Basaltic lava fields; NASA RIS4E and SSERVI field work" },
  { ...site("earth-pilot-valley"), group: "known", radiusKm: 50, why: "Salt flat and lake-bed sediments; Mars evaporite analogue" },
  { ...site("earth-medicine-lake"), group: "agency", radiusKm: 40, why: "Lava tubes; cave and subsurface analogue" },
  { ...site("earth-mauna-kea"), group: "agency", radiusKm: 30, why: "Volcanic regolith; NASA PISCES lunar ISRU tests" },
  { ...site("earth-craters-of-the-moon"), group: "agency", radiusKm: 40, why: "Young lava field; NASA FINESSE and BASALT field work" },
  { ...site("earth-meteor-crater"), group: "agency", radiusKm: 30, why: "Simple impact crater; Apollo astronaut training" },
  { ...site("earth-black-point"), group: "agency", radiusKm: 30, why: "Basalt flow; NASA Desert RATS rover and spacesuit tests" },
  { ...site("earth-mdrs"), group: "known", radiusKm: 40, why: "Mars Society habitat in sandstone badlands; crew simulations" },
  { ...site("earth-svalbard-bockfjorden"), group: "agency", radiusKm: 40, why: "Volcanic springs in permafrost; NASA/ESA AMASE expeditions" },
  { ...site("earth-dome-c"), group: "agency", radiusKm: 60, why: "One of the coldest inhabited stations; ESA isolation studies" },
  { ...site("earth-rio-tinto"), group: "agency", radiusKm: 30, why: "Acidic, iron-rich waters; NASA MARTE drilling experiment" },
  { ...site("earth-lanzarote"), group: "agency", radiusKm: 30, why: "Volcanic fields; NASA and ESA astronaut training and rover tests" },
  { ...site("earth-teide"), group: "known", radiusKm: 25, why: "High caldera floored with young lava flows" },
  { ...site("earth-dallol"), group: "known", radiusKm: 40, why: "Hot, acidic, salty ponds; where life stops" },
  { ...site("earth-namib"), group: "known", radiusKm: 80, why: "Ancient coastal dune desert; aeolian analogue" },
  { ...site("earth-qaidam"), group: "known", radiusKm: 80, why: "High, cold, salty basin; Mars evaporite analogue" },
  { ...site("earth-uyuni"), group: "known", radiusKm: 60, why: "Largest salt flat; dried-lake salt crust" },
  { ...site("earth-ladakh"), group: "agency", radiusKm: 50, why: "Cold, high, dry plateau with salt lakes; ISRO analogue mission" },
  { ...site("earth-pilbara"), group: "agency", radiusKm: 80, why: "3.5-billion-year-old stromatolites; ancient life analogue" },
  { ...site("earth-wadi-rum"), group: "known", radiusKm: 40, why: "Red sand valleys; nicknamed the Valley of the Moon" },
  { ...site("earth-victoria-land"), group: "finder", radiusKm: 60, why: "Top Finder match for the lunar south pole; ice-covered mountains" },
  { ...site("earth-deception"), group: "known", radiusKm: 30, why: "Active volcano in polar ice; proposed Mars analogue" },
  ...PAKISTAN.map((p): NamedSite => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, region: p.region, group: "pakistan", radiusKm: 50, why: p.blurb })),
];

export const REF_POINTS: RefPoint[] = NAMED_SITES.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, radiusKm: p.radiusKm }));

/** Coarse gazetteer: [name, lat, lon, radius km]. */
const REGIONS: [string, number, number, number][] = [
  ["Atacama Desert", -23.5, -69.6, 420],
  ["Peruvian coastal desert", -12.5, -76.5, 520],
  ["Altiplano", -19.5, -67.5, 330],
  ["Patagonian steppe", -45, -69.5, 600],
  ["Namib Desert", -23, 15, 420],
  ["Kaokoveld, Namibia", -18.3, 13, 240],
  ["Kalahari", -23.5, 22, 550],
  ["Namaqualand & Karoo", -30, 19.5, 380],
  ["Sahara", 23, 10, 1600],
  ["Western Sahara", 24.5, -12.5, 500],
  ["Libyan Desert", 25, 25, 700],
  ["Danakil & Afar", 13, 41.5, 300],
  ["Horn of Africa drylands", 8, 47, 450],
  ["Arabian Peninsula", 23, 46, 900],
  ["Rub' al Khali", 20.5, 50, 520],
  ["Dasht-e Lut", 30.5, 59, 330],
  ["Dasht-e Kavir", 34.5, 54.5, 300],
  ["Kharan & Registan deserts", 29.2, 64.5, 380],
  ["Sistan & Baluchestan drylands", 28.6, 61.3, 260],
  ["Makran coast", 25.6, 63, 300],
  ["Anti-Atlas & Drâa valley", 30.3, -6.5, 260],
  ["Atlas Mountains", 32, -5, 300],
  ["Sinai & Negev", 30, 34.5, 250],
  ["Ladakh & Aksai Chin", 34.5, 78.5, 280],
  ["Thar Desert", 27, 71, 400],
  ["Karakum", 39.5, 59.5, 450],
  ["Kyzylkum", 42.5, 64, 350],
  ["Taklamakan", 38.8, 83, 550],
  ["Qaidam Basin", 37.5, 94.5, 300],
  ["Tibetan Plateau", 33, 86, 850],
  ["Karakoram & Pamir", 36.5, 75, 380],
  ["Himalaya", 29, 84, 550],
  ["Gobi Desert", 43, 105, 750],
  ["Mongolian Plateau", 47, 100, 650],
  ["Siberian Arctic (Taymyr)", 73, 100, 700],
  ["Yakutia", 66, 130, 900],
  ["Great Basin", 40, -116.5, 480],
  ["Mojave & Sonoran deserts", 33.3, -114, 420],
  ["Chihuahuan Desert", 29, -105, 450],
  ["Alaska interior", 64.5, -150, 650],
  ["Canadian Arctic Archipelago", 75, -95, 900],
  ["Greenland ice sheet", 72, -40, 950],
  ["Iceland highlands", 64.8, -17.5, 220],
  ["Svalbard", 78.7, 17, 250],
  ["Great Victoria & Gibson deserts", -27, 126, 650],
  ["Great Sandy Desert", -20.5, 124, 500],
  ["Simpson Desert", -25, 137, 380],
  ["McMurdo Dry Valleys", -77.5, 162, 90],
  ["Transantarctic Mountains", -83, 170, 750],
  ["Victoria Land", -74, 162, 420],
  ["Ross Ice Shelf", -81.5, -175, 520],
  ["Antarctic Peninsula", -67, -64, 520],
  ["West Antarctic Ice Sheet", -79, -110, 900],
  ["East Antarctic Plateau", -80, 75, 1700],
  ["Dronning Maud Land", -72.5, 10, 700],
];

export interface PlaceLabel {
  title: string;
  subtitle: string;
  /** A NASA analogue site or spotlight site within 120 km. */
  known?: KnownPlace;
}

const KNOWN: KnownPlace[] = [...EARTH_SITES, ...PAKISTAN];

let lookupPromise: Promise<Lookup> | null = null;
export function loadLabeller() {
  lookupPromise ??= createLookup("earth");
  return lookupPromise;
}

const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** Labels for a ranked list: a repeated region name gets a compass qualifier relative to its first use. */
export function distinctLabels(points: { lat: number; lon: number }[], lookup: Lookup | null): PlaceLabel[] {
  const first = new Map<string, { lat: number; lon: number }>();
  return points.map((p) => {
    const l = labelPlace(p.lat, p.lon, lookup);
    const seen = first.get(l.title);
    if (!seen) {
      first.set(l.title, p);
      return l;
    }
    const dy = p.lat - seen.lat;
    const dx = (((p.lon - seen.lon + 540) % 360) - 180) * Math.cos((p.lat * Math.PI) / 180);
    const dir = DIRS[(Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) + 8) % 8];
    return { ...l, title: `${l.title} (${dir})` };
  });
}

/** Readable label for an Earth cell: nearby known site, else gazetteer region, else country, plus coordinates. */
export function labelPlace(lat: number, lon: number, lookup: Lookup | null): PlaceLabel {
  const coords = `${formatLat(lat)} ${formatLon(lon)}`;
  // Coastal cells often fall just outside the coarse (1:110m) outlines: look a little further out.
  let country: string | undefined;
  if (lookup) {
    outer: for (const r of [0, 0.4, 0.8, 1.3]) {
      for (const [dy, dx] of r ? [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[0, 0]]) {
        const hit = lookup(Math.max(-89.9, Math.min(89.9, lat + dy * r)), ((lon + dx * r + 540) % 360) - 180).label;
        if (hit && hit !== "Ocean") {
          country = hit;
          break outer;
        }
      }
    }
  }
  const countryText = country && country !== "Ocean" ? country : lat < -60 ? "Antarctica" : undefined;

  let known: KnownPlace | undefined;
  let knownKm = 120;
  for (const k of KNOWN) {
    const d = haversine(lat, lon, k.lat, k.lon);
    if (d < knownKm) {
      knownKm = d;
      known = k;
    }
  }
  if (known) return { title: knownKm < 40 ? known.name : `Near ${known.name}`, subtitle: [countryText, coords].filter(Boolean).join(" · "), known };

  let region: string | undefined;
  let best = 1;
  for (const [name, la, lo, r] of REGIONS) {
    const f = haversine(lat, lon, la, lo) / r;
    if (f < best) {
      best = f;
      region = name;
    }
  }
  if (region) return { title: region, subtitle: [countryText, coords].filter(Boolean).join(" · ") };
  return { title: countryText ?? coords, subtitle: countryText ? coords : "Earth" };
}
