/** Human labels for site feature tags (used by Compare's "what matches" section). */
const LABELS: Record<string, string> = {
  dry: "Dryness",
  cold: "Cold",
  salts: "Salts",
  "oxidised-soil": "Oxidised soil",
  "low-microbes": "Few microbes",
  "life-detection": "Life-detection target",
  drilling: "Drilling",
  "ground-ice": "Ground ice",
  permafrost: "Permafrost",
  "rock-microbes": "Life inside rocks",
  polar: "Polar",
  ripples: "Wind ripples",
  wind: "Wind",
  volcanic: "Volcanic",
  "buried-ice": "Buried ice",
  radar: "Radar mapping",
  "terrain-change": "Changing terrain",
  rocky: "Rocky ground",
  sandy: "Sandy ground",
  "rover-practice": "Rover practice",
  hazards: "Driving hazards",
  perchlorate: "Perchlorate salts",
  "mineral-chemistry": "Mineral chemistry",
  habitability: "Habitability clues",
  basalt: "Basalt",
  "field-geology": "Field geology",
  "rough-terrain": "Rough terrain",
  sampling: "Sampling",
  "lava-tube": "Lava tubes",
  caves: "Caves",
  shelter: "Possible shelter",
  mapping: "Mapping",
  psr: "Permanent shadow",
  ice: "Ice",
  sunlight: "Long sunlight",
  crater: "Crater",
  "psr-nearby": "Shadowed craters nearby",
  candidate: "Landing candidate",
  delta: "River delta",
  lakebed: "Lakebed",
  "ancient-water": "Ancient water",
  "sediment-layers": "Sediment layers",
  dunes: "Dunes",
  rover: "Rover site",
  plains: "Plains",
  minerals: "Water-altered minerals",
  valley: "Valley",
  "impact-basin": "Impact basin",
  "low-elevation": "Low elevation",
  dust: "Dust",
  "mud-volcano": "Mud volcanoes",
  "river-channels": "Dry river channels",
  evaporites: "Evaporite salt beds",
  isru: "Using local resources",
  isolation: "Long isolation",
};

export const tagLabel = (tag: string) => LABELS[tag] ?? tag.replace(/-/g, " ");

/** Tag overlap (Jaccard index): a transparent, explainable similarity on named features only. */
export function tagOverlap(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  const shared = [...A].filter((t) => B.has(t));
  const union = new Set([...A, ...B]).size || 1;
  return { shared, onlyA: [...A].filter((t) => !B.has(t)), onlyB: [...B].filter((t) => !A.has(t)), score: shared.length / union };
}
