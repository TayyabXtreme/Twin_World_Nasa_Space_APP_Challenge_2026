import type { World } from "@/lib/worlds";

/**
 * Photo rounds for "Earth or Elsewhere?". Every image is a real photograph: rover and Apollo surface views from the
 * NASA Image Library, field photos from Earth analogue sites. Files are built by scripts/build-challenge.mjs from
 * assets-raw/photos (NASA metadata in assets-raw/photos/challenge/metadata.json, Commons links in credits.txt).
 */

export interface PhotoRound {
  id: string;
  world: World;
  place: string;
  /** Why it is tricky, and what it tells us about analogues. */
  fact: string;
  credit: string;
  sourceUrl: string;
  /** Earth rounds: the Compare pair it belongs to. */
  compare?: { href: string; label: string };
}

export const photoSrc = (id: string, thumb = false) => `/photos/challenge/${id}${thumb ? ".thumb" : ""}.webp`;

export const PHOTOS: PhotoRound[] = [
  // ---------------------------------------------------------------- Mars
  {
    id: "mars-mount-sharp-buttes",
    world: "mars",
    place: "Mount Sharp, Gale Crater · Curiosity rover, 2013",
    fact: "Buttes of layered sedimentary rock, laid down by water and wind billions of years ago. It looks like the deserts of the American Southwest, which is why rover teams train there.",
    credit: "NASA/JPL-Caltech/MSSS",
    sourceUrl: "https://images.nasa.gov/details/PIA19083",
  },
  {
    id: "mars-gusev-ripples",
    world: "mars",
    place: "Gusev Crater · Spirit rover, start of 2006",
    fact: "Rippled sand on Mars. The butterscotch sky is fine dust hanging in air less than 1 % as thick as Earth's.",
    credit: "NASA/JPL-Caltech/Cornell",
    sourceUrl: "https://images.nasa.gov/details/PIA03274",
  },
  {
    id: "mars-endeavour-rim",
    world: "mars",
    place: "Rim of Endeavour Crater · Opportunity rover, 2015",
    fact: "The view from Cape Tribulation, reached in Opportunity's eleventh year on Mars. The rover was designed to last 90 days.",
    credit: "NASA/JPL-Caltech/Cornell Univ./Arizona State Univ.",
    sourceUrl: "https://images.nasa.gov/details/PIA19109",
  },
  {
    id: "mars-namib-dune",
    world: "mars",
    place: "Namib Dune, Bagnold Dunes · Curiosity rover, 2015",
    fact: "An active Martian sand dune about 4 m high. Navigation cameras shoot in black and white, so it can pass for a grey Earth desert, or even the Moon.",
    credit: "NASA/JPL-Caltech",
    sourceUrl: "https://images.nasa.gov/details/PIA20281",
  },
  {
    id: "mars-murray-buttes",
    world: "mars",
    place: "Murray Buttes, lower Mount Sharp · Curiosity rover, 2016",
    fact: "Finely layered sandstone from ancient wind-blown dunes, hardened into rock: the same process that built sandstone cliffs on Earth.",
    credit: "NASA/JPL-Caltech/MSSS",
    sourceUrl: "https://images.nasa.gov/details/PIA21043",
  },
  // ---------------------------------------------------------------- Moon
  {
    id: "moon-hadley-rille",
    world: "moon",
    place: "Hadley Rille · Apollo 15, 31 July 1971",
    fact: "A winding channel cut by flowing lava. Layers in its wall are old lava flows, the same kind of basalt found in Iceland and Hawaiʻi.",
    credit: "NASA/JSC · Apollo 15 crew",
    sourceUrl: "https://images.nasa.gov/details/as15-85-11425",
  },
  {
    id: "moon-hadley-telephoto",
    world: "moon",
    place: "Across Hadley Rille · Apollo 15 telephoto, 2 Aug 1971",
    fact: "With no air there is no haze, so the far wall looks as sharp as the near one. Astronauts found distances on the Moon very hard to judge.",
    credit: "NASA/JSC · Apollo 15 crew",
    sourceUrl: "https://images.nasa.gov/details/as15-89-12100",
  },
  {
    id: "moon-descartes-boulder",
    world: "moon",
    place: "Descartes highlands · Apollo 16, April 1972",
    fact: "The little tripod is a gnomon: it shows which way is down and carries a colour chart, so geologists on Earth could read the photo correctly.",
    credit: "NASA/JSC · Apollo 16 crew",
    sourceUrl: "https://images.nasa.gov/details/as16-114-18412",
  },
  {
    id: "moon-descartes-station1",
    world: "moon",
    place: "Station 1, Descartes · Apollo 16, John Young, 1972",
    fact: "Lunar highland ground: grey, cratered at every scale and covered in fine dust that clings to everything.",
    credit: "NASA/JSC · John W. Young",
    sourceUrl: "https://images.nasa.gov/details/as16-114-18421",
  },
  {
    id: "moon-orange-soil",
    world: "moon",
    place: "Shorty Crater, Taurus-Littrow · Apollo 17, Dec 1972",
    fact: "Orange soil spotted by geologist Harrison Schmitt: tiny beads of volcanic glass from fire-fountain eruptions over 3.5 billion years ago.",
    credit: "NASA/JSC · Apollo 17 crew",
    sourceUrl: "https://images.nasa.gov/details/as17-137-20989",
  },
  // ---------------------------------------------------------------- Earth
  {
    id: "earth-devon-camp",
    world: "earth",
    place: "Haughton Crater, Devon Island, Canada · NASA K10 rover, 2007",
    fact: "That robot is on Earth! Haughton is a 23 km impact crater in a polar desert, where the Haughton-Mars Project has tested rovers and spacesuits since 1997.",
    credit: "NASA Ames · Matt Deans",
    sourceUrl: "https://images.nasa.gov/details/ARC-2007-ACD07-0170-004",
  },
  {
    id: "earth-devon-drill-hill",
    world: "earth",
    place: "Drill Hill, Haughton Crater, Devon Island · 2007",
    fact: "NASA's K10 'Red' rover heading back to base camp. Frost-shattered rock and no plants make this one of the best Mars analogues on Earth.",
    credit: "NASA Ames · Lorenzo Flückiger (CMU West)",
    sourceUrl: "https://images.nasa.gov/details/ARC-2007-ACD07-0170-006",
  },
  {
    id: "earth-mcmurdo",
    world: "earth",
    place: "The Labyrinth, Wright Valley, McMurdo Dry Valleys, Antarctica",
    fact: "One of the coldest, driest places on Earth, with almost no snow or ice on the ground. NASA uses it as an analogue for Mars' icy plains.",
    credit: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Labyrinth,_Wright_Valley,_McMurdo_Dry_Valleys,_Antarctica.jpg",
    compare: { href: "/compare?a=earth-mcmurdo&b=mars-phoenix", label: "Compare McMurdo with the Phoenix site" },
  },
  {
    id: "earth-iceland-artemis",
    world: "earth",
    place: "Iceland · Artemis II crew geology training, 2024",
    fact: "Black basalt plains where the Artemis II astronauts practised lunar field geology before flying around the Moon.",
    credit: "NASA/Robert Markowitz",
    sourceUrl: "https://images.nasa.gov/details/jsc2024e055198",
    compare: { href: "/compare?a=earth-askja&b=moon-shackleton-rim", label: "Compare Iceland with Shackleton crater" },
  },
  {
    id: "earth-iceland-lava",
    world: "earth",
    place: "Volcanic highlands, Iceland",
    fact: "Fresh basalt and ash with almost no soil: close to the volcanic plains of the Moon and Mars, which is why crews and rovers train here.",
    credit: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Iceland_volcanic_landscape.jpg",
    compare: { href: "/compare?a=earth-askja&b=mars-gale", label: "Compare Iceland with Gale Crater" },
  },
  {
    id: "earth-hingol",
    world: "earth",
    place: "Chandragup mud volcano, Hingol National Park, Pakistan",
    fact: "Mud volcanoes push wet sediment up from underground. Mound-shaped features on Mars may be mud volcanoes too, which makes Hingol a little-known Mars analogue.",
    credit: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Chandragup_mud_volcano.jpg",
  },
];

export const WORLD_LABEL: Record<World, string> = { earth: "Earth", moon: "the Moon", mars: "Mars" };

/** Ten rounds with every world represented (4 Earth, 3 Moon, 3 Mars), shuffled. */
export function drawRounds(random: () => number = Math.random): PhotoRound[] {
  const shuffle = <T>(a: T[]) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const pick = (w: World, n: number) => shuffle(PHOTOS.filter((p) => p.world === w)).slice(0, n);
  return shuffle([...pick("earth", 4), ...pick("moon", 3), ...pick("mars", 3)]);
}
