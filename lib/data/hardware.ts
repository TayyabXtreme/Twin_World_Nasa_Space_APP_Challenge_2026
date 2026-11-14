/**
 * NASA hardware tied to a specific site, shown as a 3D model on Compare. A site only gets hardware when the
 * link is a fact (the rover landed there, the orbiter measured it, crews trained there), never decoration.
 */

export interface Hardware {
  id: string;
  name: string;
  /** Optimized GLB in /public/models (see scripts/build-assets.mjs). */
  model: string;
  /** Turntable start angle (radians) so the model first faces the camera at a readable three-quarter view. */
  yaw?: number;
}

export interface HardwareLink {
  hardwareId: string;
  fact: string;
  sourceId: string;
}

export const HARDWARE: Record<string, Hardware> = {
  perseverance: { id: "perseverance", name: "Perseverance rover", model: "/models/perseverance.glb", yaw: -0.6 },
  ingenuity: { id: "ingenuity", name: "Ingenuity helicopter", model: "/models/ingenuity-mars-helicopter.glb", yaw: 0.4 },
  curiosity: { id: "curiosity", name: "Curiosity rover", model: "/models/curiosity.glb", yaw: -0.7 },
  lro: { id: "lro", name: "Lunar Reconnaissance Orbiter", model: "/models/lunar-reconnaissance-orbiter-a.glb", yaw: 0.5 },
  astronaut: { id: "astronaut", name: "Astronaut in a spacesuit", model: "/models/astronaut.glb", yaw: 0.3 },
};

const LRO: HardwareLink = {
  hardwareId: "lro",
  fact: "LRO has circled the Moon since 2009. Its laser altimeter, LOLA, measured the elevation and slope shown for this site.",
  sourceId: "svs-moon-kit",
};

const SITE_HARDWARE: Record<string, HardwareLink[]> = {
  "mars-jezero": [
    { hardwareId: "perseverance", fact: "Landed in Jezero Crater on 18 February 2021 to look for signs of ancient life and collect rock samples.", sourceId: "nasa-mars2020" },
    { hardwareId: "ingenuity", fact: "Rode to Mars under Perseverance and made the first powered, controlled flight on another planet, over Jezero on 19 April 2021.", sourceId: "nasa-mars2020" },
  ],
  "mars-gale": [
    { hardwareId: "curiosity", fact: "Landed in Gale Crater on 6 August 2012 and has been climbing the layered slopes of Mount Sharp since 2014.", sourceId: "nasa-msl" },
  ],
  "earth-death-valley": [
    { hardwareId: "perseverance", fact: "The Mars 2020 team practised hazard avoidance in California before Perseverance flew.", sourceId: "nasa-analog-explorer" },
  ],
  "earth-askja": [{ hardwareId: "astronaut", fact: "Artemis II astronauts trained in field geology in Iceland's volcanic landscapes.", sourceId: "nasa-analog-missions" }],
  "earth-kilauea": [
    { hardwareId: "astronaut", fact: "Small teams map and sample lava here to rehearse how astronauts would work in the field.", sourceId: "nasa-analog-explorer" },
  ],
  "earth-medicine-lake": [
    { hardwareId: "astronaut", fact: "NASA scientists explore these lava caves and compare them with openings into lunar caves.", sourceId: "nasa-analog-explorer" },
  ],
};

/** Hardware for a pair: the Moon/Mars site first, then the Earth place, one entry per machine. */
export function hardwareForPair(earthId: string, otherId: string): (HardwareLink & { hardware: Hardware })[] {
  const other = SITE_HARDWARE[otherId] ?? (otherId.startsWith("moon-") ? [LRO] : []);
  const seen = new Set<string>();
  return [...other, ...(SITE_HARDWARE[earthId] ?? [])]
    .filter((l) => !seen.has(l.hardwareId) && seen.add(l.hardwareId))
    .map((l) => ({ ...l, hardware: HARDWARE[l.hardwareId] }));
}
