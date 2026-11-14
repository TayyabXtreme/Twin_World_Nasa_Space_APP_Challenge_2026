import type { World } from "@/lib/worlds";

/** How sure we are about a claim (docs/archive/plan.md §0). */
export type Evidence = "confirmed" | "evidence_for" | "candidate" | "estimate";

export interface Source {
  id: string;
  title: string;
  org: string;
  url: string;
  /** What this source supports, in a few words. */
  covers: string;
}

export interface SiteImage {
  src: string;
  alt: string;
  credit: string;
}

export interface Site {
  id: string;
  world: World;
  name: string;
  region: string;
  kind: "analogue" | "landing_candidate" | "mission_site" | "science_target";
  lat: number;
  lon: number;
  /** true when coordinates come from a gazetteer or mission record; false when approximate. */
  coordsVerified: boolean;
  summary: string;
  tags: string[];
  landforms: string[];
  geology: string[];
  resources: { label: string; evidence: Evidence }[];
  hazards: string[];
  /** Earth sites only: published elevation, metres. Moon/Mars use computed terrain. */
  elevationM?: number;
  image?: SiteImage;
  evidence: Evidence;
  sourceIds: string[];
}

export interface TwinLink {
  id: string;
  earthId: string;
  otherId: string;
  /** The specific feature being compared (never "the whole world"). */
  feature: string;
  shared: string[];
  differences: string[];
  nasaUse: string;
  /** true when TwinWorlds proposes the pair (Pakistan spotlight); NASA has not used the Earth site. */
  proposed?: boolean;
  sourceIds: string[];
}

export interface Terrain {
  elevationM: number;
  /** null near the poles, where the equirectangular grid cannot give a fair east-west gradient. */
  slopeDeg: number | null;
  roughnessM: number;
  pixelKm: number;
  source: string;
}
