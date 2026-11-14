import photos from "./landings-photos.generated.json";

/**
 * Exploration history for the Moon and Mars globes: every successful landing we show, with the date (UTC), the
 * agency, where it came down and a photo (scripts/fetch-landing-photos.py).
 *
 * Coordinates, checked 2026-11-14 (east-positive longitude, planetocentric):
 *  - Apollo, Luna 16/17/20/21/24, Chang'e 3/4/5/6, Chandrayaan-3 and SLIM: positions measured on LRO LROC Narrow
 *    Angle Camera images of the hardware (LROC "Spacecraft Related Coordinates" lists and the per-mission LROC
 *    pages), cross-checked with NSSDCA's lunar landing-site table (Apollo, from Wagner et al. 2017) and, where one
 *    exists, the USGS Gazetteer station name (Statio Tranquillitatis, Tianhe, Tianchuan, Tianjiang, Shiv Shakti).
 *  - Luna 9: NSSDCA's position. LRO has not identified the lander, so it is approximate.
 *  - Mars: the mission's NASA fact page or the team's own location paper, as cited per landing.
 */

export type LandingWorld = "moon" | "mars";
export type Agency = "nasa" | "ussr" | "cnsa" | "isro" | "jaxa";

export const AGENCIES: Record<Agency, { label: string; short: string; color: string }> = {
  nasa: { label: "NASA", short: "NASA", color: "oklch(0.78 0.13 240)" },
  ussr: { label: "Soviet Union", short: "USSR", color: "oklch(0.68 0.2 25)" },
  cnsa: { label: "China (CNSA)", short: "CNSA", color: "oklch(0.85 0.16 88)" },
  isro: { label: "India (ISRO)", short: "ISRO", color: "oklch(0.78 0.17 150)" },
  jaxa: { label: "Japan (JAXA)", short: "JAXA", color: "oklch(0.74 0.17 335)" },
};

export interface LandingPhoto {
  src: string;
  w: number;
  h: number;
  title: string;
  credit: string;
  page: string;
  nasaId?: string;
}

export interface Landing {
  id: string;
  world: LandingWorld;
  mission: string;
  /** Lander or rover name, when it had one ("Eagle", "Lunokhod 1"). */
  craft?: string;
  agency: Agency;
  /** Touchdown date, UTC. */
  date: string;
  lat: number;
  lon: number;
  /** Position not confirmed in orbital images. */
  approx?: boolean;
  site: string;
  summary: string;
  coordSources: { label: string; url: string }[];
  photo: LandingPhoto & { pin: string };
  /** The landing site seen from orbit (LRO LROC or MRO HiRISE), when the card photo is a surface view. */
  orbit?: LandingPhoto;
}

const PHOTOS = photos as Record<string, { photo: Landing["photo"]; orbit?: LandingPhoto }>;

const LROC_2016 = { label: "LROC: Spacecraft Related Coordinates, 2016 update", url: "https://lroc.im-ldi.com/images/938" };
const LROC_2013 = { label: "LROC: Coordinates of Robotic Spacecraft, 2013 update", url: "https://lroc.im-ldi.com/images/650" };
const NSSDCA_SITES = { label: "NASA NSSDCA: Lunar landing sites (Apollo from Wagner et al. 2017)", url: "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html" };
const NSSDCA_USSR = { label: "NASA NSSDCA: Soviet missions to the Moon", url: "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunarussr.html" };
const gazetteer = (name: string, feature: number) => ({ label: `USGS Gazetteer of Planetary Nomenclature: ${name}`, url: `https://planetarynames.wr.usgs.gov/Feature/${feature}` });

type Draft = Omit<Landing, "photo" | "orbit">;

const DRAFTS: Draft[] = [
  /* ---------------- Moon ---------------- */
  {
    id: "luna-9",
    world: "moon",
    mission: "Luna 9",
    agency: "ussr",
    date: "1966-02-03",
    lat: 7.08,
    lon: -64.37,
    approx: true,
    site: "Oceanus Procellarum",
    summary: "The first spacecraft to land softly on another world. Its camera sent back the first pictures taken on the Moon's surface, showing that the ground could hold up a lander.",
    coordSources: [NSSDCA_USSR],
  },
  {
    id: "apollo-11",
    world: "moon",
    mission: "Apollo 11",
    craft: "Eagle",
    agency: "nasa",
    date: "1969-07-20",
    lat: 0.67416,
    lon: 23.47314,
    site: "Mare Tranquillitatis",
    summary: "Neil Armstrong and Buzz Aldrin became the first people to walk on the Moon. They spent about 2.5 hours outside and brought back 21.5 kg of rock and soil.",
    coordSources: [NSSDCA_SITES, LROC_2016, gazetteer("Statio Tranquillitatis", 5684)],
  },
  {
    id: "apollo-12",
    world: "moon",
    mission: "Apollo 12",
    craft: "Intrepid",
    agency: "nasa",
    date: "1969-11-19",
    lat: -3.0128,
    lon: -23.4219,
    site: "Oceanus Procellarum",
    summary: "A pinpoint landing about 180 m from the robotic Surveyor 3 probe. Pete Conrad and Alan Bean walked over to it and brought parts of it back to Earth.",
    coordSources: [NSSDCA_SITES, LROC_2016],
  },
  {
    id: "luna-16",
    world: "moon",
    mission: "Luna 16",
    agency: "ussr",
    date: "1970-09-20",
    lat: -0.5137,
    lon: 56.3638,
    site: "Mare Fecunditatis",
    summary: "The first robotic sample return: it drilled into the mare, sealed 101 g of soil in a capsule and launched it back to Earth.",
    coordSources: [LROC_2016],
  },
  {
    id: "luna-17",
    world: "moon",
    mission: "Luna 17",
    craft: "Lunokhod 1",
    agency: "ussr",
    date: "1970-11-17",
    lat: 38.2376,
    lon: -35.0016,
    site: "Mare Imbrium",
    summary: "Delivered Lunokhod 1, the first rover on another world. Driven from Earth, it covered about 10 km over ten months.",
    coordSources: [LROC_2013],
  },
  {
    id: "apollo-14",
    world: "moon",
    mission: "Apollo 14",
    craft: "Antares",
    agency: "nasa",
    date: "1971-02-05",
    lat: -3.64589,
    lon: -17.47194,
    site: "Fra Mauro highlands",
    summary: "Alan Shepard and Edgar Mitchell explored the Fra Mauro highlands, hauling a hand cart up towards the rim of Cone crater to sample rock thrown out from deep below.",
    coordSources: [NSSDCA_SITES, LROC_2016],
  },
  {
    id: "apollo-15",
    world: "moon",
    mission: "Apollo 15",
    craft: "Falcon",
    agency: "nasa",
    date: "1971-07-30",
    lat: 26.13239,
    lon: 3.6333,
    site: "Hadley–Apennine",
    summary: "The first mission with the Lunar Roving Vehicle. David Scott and James Irwin drove to the edge of Hadley Rille and found the 'Genesis Rock', a piece of the Moon's early crust.",
    coordSources: [NSSDCA_SITES, LROC_2016],
  },
  {
    id: "luna-20",
    world: "moon",
    mission: "Luna 20",
    agency: "ussr",
    date: "1972-02-21",
    lat: 3.7863,
    lon: 56.6242,
    site: "Apollonius highlands",
    summary: "Landed in rugged highlands just north of Luna 16 and returned 55 g of highland soil, older and paler than the mare samples.",
    coordSources: [LROC_2016],
  },
  {
    id: "apollo-16",
    world: "moon",
    mission: "Apollo 16",
    craft: "Orion",
    agency: "nasa",
    date: "1972-04-21",
    lat: -8.9734,
    lon: 15.5011,
    site: "Descartes Highlands",
    summary: "The first landing in the central highlands. John Young and Charles Duke spent three days on the surface and found the area was made of impact breccias, not volcanic rock as expected.",
    coordSources: [NSSDCA_SITES, LROC_2016],
  },
  {
    id: "apollo-17",
    world: "moon",
    mission: "Apollo 17",
    craft: "Challenger",
    agency: "nasa",
    date: "1972-12-11",
    lat: 20.1911,
    lon: 30.7723,
    site: "Taurus–Littrow valley",
    summary: "The last crewed landing so far. Geologist Harrison Schmitt and Eugene Cernan drove 36 km and found orange volcanic glass beads at Shorty crater.",
    coordSources: [NSSDCA_SITES, LROC_2016],
  },
  {
    id: "luna-21",
    world: "moon",
    mission: "Luna 21",
    craft: "Lunokhod 2",
    agency: "ussr",
    date: "1973-01-15",
    lat: 25.9994,
    lon: 30.4077,
    site: "Le Monnier crater",
    summary: "Delivered Lunokhod 2, which drove about 39 km in four months, a distance record off Earth until Opportunity passed it on Mars in 2014.",
    coordSources: [LROC_2013],
  },
  {
    id: "luna-24",
    world: "moon",
    mission: "Luna 24",
    agency: "ussr",
    date: "1976-08-18",
    lat: 12.7142,
    lon: 62.2129,
    site: "Mare Crisium",
    summary: "The last Soviet Moon mission. It drilled a core about 2 m deep and returned 170 g of layered soil, the last lunar sample brought to Earth for 44 years.",
    coordSources: [LROC_2016],
  },
  {
    id: "change-3",
    world: "moon",
    mission: "Chang'e 3",
    craft: "Yutu",
    agency: "cnsa",
    date: "2013-12-14",
    lat: 44.1214,
    lon: -19.5117,
    site: "Mare Imbrium, near Laplace F",
    summary: "The first soft landing on the Moon since 1976, and China's first. It delivered the Yutu rover; the lander's telescope kept working for years.",
    coordSources: [LROC_2016],
  },
  {
    id: "change-4",
    world: "moon",
    mission: "Chang'e 4",
    craft: "Yutu-2",
    agency: "cnsa",
    date: "2019-01-03",
    lat: -45.457,
    lon: 177.589,
    site: "Von Kármán crater, far side",
    summary: "The first landing on the far side of the Moon, talking to Earth through the Queqiao relay satellite. Its Yutu-2 rover became the longest-working rover on the Moon.",
    coordSources: [{ label: "LROC: Chang'e 4 lander coordinates", url: "https://lroc.im-ldi.com/images/1087" }, gazetteer("Statio Tianhe", 15781)],
  },
  {
    id: "change-5",
    world: "moon",
    mission: "Chang'e 5",
    agency: "cnsa",
    date: "2020-12-01",
    lat: 43.0576,
    lon: -51.9161,
    site: "Oceanus Procellarum, near Mons Rümker",
    summary: "Returned 1,731 g of rock and soil from some of the youngest lava on the Moon, about 2 billion years old: the first lunar samples since Luna 24.",
    coordSources: [{ label: "LROC: First look, Chang'e 5", url: "https://lroc.im-ldi.com/images/1172" }, gazetteer("Statio Tianchuan", 15994)],
  },
  {
    id: "chandrayaan-3",
    world: "moon",
    mission: "Chandrayaan-3",
    craft: "Vikram and Pragyan",
    agency: "isro",
    date: "2023-08-23",
    lat: -69.3741,
    lon: 32.32,
    site: "South polar highlands (Statio Shiv Shakti)",
    summary: "India's first Moon landing and, at the time, the closest any spacecraft had come to the south pole. The Pragyan rover measured sulphur in the soil.",
    coordSources: [{ label: "LROC: Chandrayaan-3 landing site", url: "https://lroc.im-ldi.com/images/1314" }, gazetteer("Statio Shiv Shakti", 16272)],
  },
  {
    id: "slim",
    world: "moon",
    mission: "SLIM",
    agency: "jaxa",
    date: "2024-01-19",
    lat: -13.316,
    lon: 25.251,
    site: "Slope of Shioli crater",
    summary: "Japan's first Moon landing came down within about 55 m of its target, a new standard for precision, but tipped onto its nose. It still woke up for several lunar nights.",
    coordSources: [{ label: "LROC: JAXA SLIM landing", url: "https://lroc.im-ldi.com/images/1358" }],
  },
  {
    id: "change-6",
    world: "moon",
    mission: "Chang'e 6",
    agency: "cnsa",
    date: "2024-06-01",
    lat: -41.6385,
    lon: -153.9852,
    site: "Apollo basin, far side",
    summary: "The first samples ever taken from the far side: 1,935 g from the South Pole–Aitken basin, the Moon's largest and oldest impact basin.",
    coordSources: [{ label: "LROC: First look, Chang'e 6", url: "https://lroc.im-ldi.com/images/1374" }, gazetteer("Statio Tianjiang", 16328)],
  },

  /* ---------------- Mars ---------------- */
  {
    id: "viking-1",
    world: "mars",
    mission: "Viking 1",
    agency: "nasa",
    date: "1976-07-20",
    lat: 22.27,
    lon: -47.95,
    site: "Chryse Planitia",
    summary: "The first spacecraft to work on the surface of Mars for a long time: it sent the first colour pictures and ran for more than six years, testing the soil for life.",
    coordSources: [{ label: "NASA NSSDCA: Viking mission to Mars", url: "https://nssdc.gsfc.nasa.gov/planetary/viking.html" }],
  },
  {
    id: "viking-2",
    world: "mars",
    mission: "Viking 2",
    agency: "nasa",
    date: "1976-09-03",
    lat: 47.64,
    lon: 134.29,
    site: "Utopia Planitia",
    summary: "Landed on rocky plains much farther north than Viking 1 and photographed a thin layer of water frost on the ground in the martian winter.",
    coordSources: [{ label: "NASA Science: Viking 1 and 2", url: "https://science.nasa.gov/mission/viking/" }],
  },
  {
    id: "pathfinder",
    world: "mars",
    mission: "Mars Pathfinder",
    craft: "Sojourner",
    agency: "nasa",
    date: "1997-07-04",
    lat: 19.13,
    lon: -33.22,
    site: "Ares Vallis",
    summary: "Bounced down inside airbags and released Sojourner, the first rover on Mars, onto an old flood plain strewn with rocks.",
    coordSources: [{ label: "NASA: Mars Pathfinder fact sheet", url: "https://mars.nasa.gov/internal_resources/815/" }],
  },
  {
    id: "spirit",
    world: "mars",
    mission: "Spirit (MER-A)",
    agency: "nasa",
    date: "2004-01-04",
    lat: -14.5692,
    lon: 175.4729,
    site: "Gusev crater",
    summary: "Built for 90 days, Spirit worked for six years and drove 7.7 km. Its stuck wheel dug up almost pure silica, a sign of ancient hot springs.",
    coordSources: [{ label: "NASA Science: Spirit", url: "https://science.nasa.gov/mission/mer-spirit/" }],
  },
  {
    id: "opportunity",
    world: "mars",
    mission: "Opportunity (MER-B)",
    agency: "nasa",
    date: "2004-01-25",
    lat: -1.9462,
    lon: -5.5266,
    site: "Meridiani Planum (Eagle crater)",
    summary: "Rolled into small Eagle crater and found rocks laid down in water, with hematite 'blueberries'. It drove 45 km over almost 15 years.",
    coordSources: [{ label: "Squyres et al. 2006, JGR Planets: Opportunity at Meridiani Planum", url: "https://doi.org/10.1029/2006JE002771" }],
  },
  {
    id: "phoenix",
    world: "mars",
    mission: "Phoenix",
    agency: "nasa",
    date: "2008-05-25",
    lat: 68.22,
    lon: -125.75,
    site: "Vastitas Borealis",
    summary: "Landed on the arctic plains, dug trenches into water ice a few centimetres down and found perchlorate salts in the soil.",
    coordSources: [{ label: "NASA/JPL: PIA13804, Phoenix landing site", url: "https://www.jpl.nasa.gov/images/pia13804-mars-panorama-of-phoenix-landing-site-and-lander-deck/" }],
  },
  {
    id: "curiosity",
    world: "mars",
    mission: "Curiosity (MSL)",
    agency: "nasa",
    date: "2012-08-06",
    lat: -4.5895,
    lon: 137.4417,
    site: "Gale crater",
    summary: "Lowered on cables by a rocket 'sky crane'. Curiosity showed that Gale crater once held a lake that microbes could have lived in, and it is still climbing Mount Sharp.",
    coordSources: [{ label: "Vasavada et al. 2014, JGR Planets: Curiosity's first year", url: "https://doi.org/10.1002/2014JE004622" }],
  },
  {
    id: "insight",
    world: "mars",
    mission: "InSight",
    agency: "nasa",
    date: "2018-11-26",
    lat: 4.502,
    lon: 135.623,
    site: "Elysium Planitia",
    summary: "A geophysics station: its seismometer recorded more than 1,300 marsquakes and measured the size of Mars' crust, mantle and liquid core.",
    coordSources: [{ label: "Golombek et al. 2019, LPSC: Locating the InSight lander", url: "https://www.hou.usra.edu/meetings/lpsc2019/pdf/1694.pdf" }],
  },
  {
    id: "perseverance",
    world: "mars",
    mission: "Perseverance (Mars 2020)",
    agency: "nasa",
    date: "2021-02-18",
    lat: 18.4447,
    lon: 77.4508,
    site: "Jezero crater",
    summary: "Explores an ancient river delta and seals rock cores for a future return to Earth. It carried Ingenuity, the first aircraft to fly on another planet.",
    coordSources: [{ label: "Farley et al. 2022, Science: Jezero crater floor", url: "https://doi.org/10.1126/science.abo2196" }],
  },
  {
    id: "zhurong",
    world: "mars",
    mission: "Tianwen-1",
    craft: "Zhurong",
    agency: "cnsa",
    date: "2021-05-14",
    lat: 25.066,
    lon: 109.925,
    site: "Southern Utopia Planitia",
    summary: "China's first Mars landing. The Zhurong rover drove about 1.9 km and its radar found buried layers that point to water in the region's past.",
    coordSources: [{ label: "Liu et al. 2022, Nature Astronomy: Zhurong landing site", url: "https://ui.adsabs.harvard.edu/abs/2022NatAs...6...65L/abstract" }],
  },
];

/** Decimal year of a landing date, so the timeline can place it within its year. */
export const decimalYear = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return y + (m - 1) / 12 + (d - 1) / 365;
};

export const LANDINGS: Landing[] = DRAFTS.map((d) => ({ ...d, ...PHOTOS[d.id] })).sort((a, b) => a.date.localeCompare(b.date));

const BY_WORLD: Record<LandingWorld, Landing[]> = {
  moon: LANDINGS.filter((l) => l.world === "moon"),
  mars: LANDINGS.filter((l) => l.world === "mars"),
};
const BY_ID = new Map(LANDINGS.map((l) => [l.id, l]));

export const landingsFor = (world: string): Landing[] => (world === "moon" || world === "mars" ? BY_WORLD[world] : []);
export const landingById = (id: string) => BY_ID.get(id);

/**
 * Timeline range per world. The Moon starts in 1966, not 1969: Luna 9 landed three years before Apollo 11.
 * Mars starts with Viking 1 in 1976.
 */
export const TIMELINE_END = 2026;
export const timelineStart = (world: LandingWorld) => (world === "moon" ? 1966 : 1976);

/** How many of this world's landings (sorted by date) had happened by decimal year `t`. */
export function landedBy(world: string, t: number | null) {
  const all = landingsFor(world);
  if (t === null) return all.length;
  let n = 0;
  while (n < all.length && decimalYear(all[n].date) <= t) n++;
  return n;
}

export function formatLandingDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
