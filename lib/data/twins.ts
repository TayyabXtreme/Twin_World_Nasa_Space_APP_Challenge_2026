import type { TwinLink } from "./types";

/**
 * Earth ↔ Moon/Mars pairs. Each names one feature being compared and the differences that matter
 * (research brief §2, §6 and "Key cautions").
 */
export const TWINS: TwinLink[] = [
  {
    id: "atacama-jezero",
    earthId: "earth-atacama",
    otherId: "mars-jezero",
    feature: "Extreme dryness and salty, oxidised soils",
    shared: ["Very little liquid water", "Salty, oxidised sediments", "Targets for life-detection instruments"],
    differences: ["Atacama has Earth's air, gravity and weather", "It does not reproduce Martian radiation or air pressure"],
    nasaUse: "NASA-related teams test life-detection instruments, drills and rover operations in the Atacama.",
    sourceIds: ["nasa-analog-explorer", "nasa-astrobio-locations"],
  },
  {
    id: "mcmurdo-arcadia",
    earthId: "earth-mcmurdo",
    otherId: "mars-arcadia",
    feature: "Cold desert with ice in the ground",
    shared: ["Cold, dry desert", "Permafrost and ice-related ground", "Remote field conditions"],
    differences: ["Antarctica has Earth's atmosphere and stronger gravity", "Some valleys see seasonal meltwater, which Mars' surface does not keep"],
    nasaUse: "NASA-supported research studies polar soils, ground ice and ways to detect signs of life.",
    sourceIds: ["nasa-astrobio-locations", "nasa-eo-antarctica"],
  },
  {
    id: "mcmurdo-phoenix",
    earthId: "earth-mcmurdo",
    otherId: "mars-phoenix",
    feature: "Polar soils over ice",
    shared: ["Ice close beneath the surface", "Polygon-patterned ground", "Very cold, very dry air"],
    differences: ["Antarctic air is far thicker", "Earth's gravity is about 2.6 times Mars'"],
    nasaUse: "The Dry Valleys were used as a field analogue for the Phoenix mission.",
    sourceIds: ["nasa-ntrs-mcmurdo"],
  },
  {
    id: "death-valley-utopia",
    earthId: "earth-death-valley",
    otherId: "mars-utopia-viking2",
    feature: "Rocky, sandy ground and its hazards",
    shared: ["Rock-strewn plains", "Obstacles a rover must avoid"],
    differences: ["The comparison is about terrain and driving, not air or temperature"],
    nasaUse: "The Mars 2020 team practised hazard avoidance in California before Perseverance flew.",
    sourceIds: ["nasa-analog-explorer"],
  },
  {
    id: "pilot-valley-phoenix",
    earthId: "earth-pilot-valley",
    otherId: "mars-phoenix",
    feature: "Salts in the soil, including perchlorate-type chemistry",
    shared: ["Salt deposits", "Salts that interact with water"],
    differences: ["Similar salts do not mean the environments are alike", "Salts on Earth do not show that life exists on Mars"],
    nasaUse: "NASA compares Pilot Valley salts with the perchlorates Phoenix detected.",
    sourceIds: ["nasa-analog-explorer", "nasa-phoenix"],
  },
  {
    id: "askja-gale",
    earthId: "earth-askja",
    otherId: "mars-gale",
    feature: "Wind-shaped ripples and moving sediment",
    shared: ["Ripples built by wind", "Loose gravel and sand that changes over time"],
    differences: ["The Martian ridges NASA compares are about ten times larger", "Iceland's climate, air and gravity differ"],
    nasaUse: "Researchers monitor the Icelandic ripples with drones and terrain models.",
    sourceIds: ["nasa-analog-explorer"],
  },
  {
    id: "askja-shackleton",
    earthId: "earth-askja",
    otherId: "moon-shackleton-rim",
    feature: "Finding buried ice with radar",
    shared: ["Ice hidden below the surface", "Ground-penetrating radar to map it"],
    differences: ["Iceland has no vacuum, lunar radiation, low gravity or permanent shadow", "Not every shadowed lunar crater holds accessible ice"],
    nasaUse: "Radar work near Askja tests methods future explorers may use in the Moon's shadowed polar regions.",
    sourceIds: ["nasa-analog-explorer", "nasa-moon-water"],
  },
  {
    id: "kilauea-marius",
    earthId: "earth-kilauea",
    otherId: "moon-marius-hills-pit",
    feature: "Basaltic lava rock and field geology",
    shared: ["Basaltic volcanic rock", "Rough lava terrain to map and sample"],
    differences: ["Kīlauea has air, weather and about six times the Moon's gravity", "It trains field geology, not survival"],
    nasaUse: "Small teams map and sample lava to rehearse how astronauts would work in the field.",
    sourceIds: ["nasa-analog-explorer"],
  },
  {
    id: "medicine-lake-marius",
    earthId: "earth-medicine-lake",
    otherId: "moon-marius-hills-pit",
    feature: "Lava caves and openings into them",
    shared: ["Lava-tube geology", "Openings that could lead underground"],
    differences: ["A cave on Earth is not automatically a safe habitat", "Lunar cave size, stability and access must be measured on their own"],
    nasaUse: "NASA scientists explore Medicine Lake lava caves and compare them with lunar cave openings.",
    sourceIds: ["nasa-analog-explorer", "lroc-marius-pit"],
  },

  /* Pakistan spotlight: pairs TwinWorlds proposes. None of these Earth sites is a NASA field site. */
  {
    id: "hingol-utopia",
    earthId: "earth-hingol",
    otherId: "mars-utopia-viking2",
    feature: "Cones built by mud pushed up from below",
    shared: ["Cone- and mound-shaped landforms", "Material forced up from underground, not erupted lava"],
    differences: [
      "The Martian cones are interpreted as mud volcanoes, not confirmed",
      "They lie in southern Utopia Planitia, far from the Viking 2 landing site pinned here",
    ],
    nasaUse: "Not a NASA field site. A USGS study read cones in southern Utopia Planitia as possible mud volcanoes; Hingol shows active ones up close.",
    proposed: true,
    sourceIds: ["skinner-tanaka-utopia", "nasa-eo-pk-mud-volcanoes"],
  },
  {
    id: "cholistan-jezero",
    earthId: "earth-cholistan",
    otherId: "mars-jezero",
    feature: "A river that ran dry",
    shared: ["Channels left by a river that no longer flows", "Water-laid sediment, now in a desert"],
    differences: [
      "The Hakra dried up within the last few thousand years; Jezero's river over 3 billion years ago",
      "Jezero's river fed a crater lake and built a delta",
    ],
    nasaUse: "Not a NASA field site. Perseverance is sampling Jezero's river delta; the buried Hakra channels show how a lost river looks from orbit.",
    proposed: true,
    sourceIds: ["durcan-hakra", "nasa-mars2020"],
  },
  {
    id: "thar-gale",
    earthId: "earth-thar",
    otherId: "mars-gale",
    feature: "Wind-built sand dunes",
    shared: ["Dunes shaped and moved by wind", "Loose sand a rover has to cross"],
    differences: ["Many Thar dunes are held in place by grass and scrub", "Gale's dune sand is dark basalt and the air is over 100 times thinner"],
    nasaUse: "Not a NASA field site. Curiosity studied the active Bagnold Dunes in Gale crater up close.",
    proposed: true,
    sourceIds: ["nasa-bagnold-dunes"],
  },
  {
    id: "khewra-gale",
    earthId: "earth-khewra",
    otherId: "mars-gale",
    feature: "Salt left behind by evaporating water",
    shared: ["Salt that formed as salty water evaporated", "A rock record of water drying up"],
    differences: [
      "Khewra is mostly rock salt (halite); Gale's layers are rich in calcium and magnesium sulfates",
      "Khewra's salt forms thick beds; in Gale the salt is spread through mudstone",
    ],
    nasaUse: "Not a NASA field site. Curiosity found salt-enriched layers in Mount Sharp recording a lake that turned salty as it dried.",
    proposed: true,
    sourceIds: ["rapin-gale-salinity", "unesco-khewra"],
  },
];

/** Pairs NASA itself has used (excludes the pairs TwinWorlds proposes). */
export const NASA_TWINS = TWINS.filter((t) => !t.proposed);

export const twinsForSite = (id: string) => TWINS.filter((t) => t.earthId === id || t.otherId === id);
