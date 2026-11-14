import { LANDINGS } from "@/lib/data/landings";
import { STATIC_PLACES } from "@/lib/data/globePlaces";
import { SITES } from "@/lib/data/sites";
import { layersFor } from "@/lib/layers";
import { ARTEMIS_REGIONS } from "@/lib/moonbase/regions";
import type { MissionId } from "./types";

/**
 * Ids Rovi can act on, shared by the browser (lib/rovi/actions.ts, script.ts) and the server brain's tool schemas
 * (lib/rovi/server/tools.ts), so the model can only name things that exist.
 */

export const FINDER_TARGETS: Record<string, string> = {
  // Ids and names from public/data/finder/targets.json (scripts/build-finder.py).
  "mars-jezero": "Jezero Crater",
  "mars-gale": "Gale Crater",
  "mars-utopia-viking2": "Utopia Planitia",
  "mars-arcadia": "Arcadia Planitia",
  "mars-mawrth-vallis": "Mawrth Vallis",
  "mars-hellas": "Hellas Planitia",
  "mars-phoenix": "Phoenix landing site",
  "moon-shackleton-rim": "Shackleton crater rim",
  "moon-malapert-massif": "Malapert Massif",
  "moon-haworth": "Haworth",
  "moon-nobile-rim-1": "Nobile Rim",
  "moon-de-gerlache-rim-2": "de Gerlache Rim 2",
  "moon-mons-mouton": "Mons Mouton",
  "moon-peak-near-cabeus-b": "Peak near Cabeus B",
  "moon-slater-plain": "Slater Plain",
  "moon-marius-hills-pit": "Marius Hills pit",
};

export const MISSION_NAMES: Record<MissionId, string> = {
  guess: "Earth or Elsewhere?",
  scout: "Moon Base Scout",
  land: "Touchdown",
  rover: "Sample Run",
  launch: "Launch Window",
};

export const PAGES = ["/", "/explore/earth", "/explore/moon", "/explore/mars", "/finder", "/bases", "/compare", "/challenge", "/learn", "/data", "/about"];

export const SITE_IDS = SITES.map((s) => s.id);
/** Everything a globe can fly to: comparison sites, Earth places (campaigns, launch sites, DSN) and landings. */
export const PIN_IDS = [...SITE_IDS, ...STATIC_PLACES.map((p) => p.id), ...LANDINGS.map((l) => l.id)];
export const LAYER_IDS = (["earth", "moon", "mars"] as const).flatMap((w) => layersFor(w).map((l) => l.id));
export const REGION_IDS = ARTEMIS_REGIONS.map((r) => r.id);
