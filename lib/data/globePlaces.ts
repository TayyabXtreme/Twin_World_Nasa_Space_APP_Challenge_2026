import photos from "./globe-places-photos.generated.json";
import type { GlobeLayerId } from "./globe";

/**
 * Earth-globe pins that are not comparison sites: NASA field campaigns, launch sites, Deep Space Network complexes
 * and the ISS. Photos come from the NASA Image and Video Library (scripts/fetch-globe-places.py), credited per photo.
 * Coordinates are checked against a gazetteer or the operator's own location data; `approx` marks a field area
 * rather than a single facility.
 */

export type PlaceLayer = Extract<GlobeLayerId, "campaigns" | "launch" | "dsn" | "iss">;

export interface PlacePhoto {
  src: string;
  w: number;
  h: number;
  pin: string;
  nasaId: string;
  title: string;
  credit: string;
  date: string;
  page: string;
}

export interface GlobePlace {
  id: string;
  layer: PlaceLayer;
  name: string;
  region: string;
  lat: number;
  lon: number;
  approx?: boolean;
  /** One line above the name, e.g. "Field campaign · since 1997". */
  kicker: string;
  summary: string;
  facts: { label: string; value: string }[];
  /** A comparison site this place relates to (opens its card). */
  siteId?: string;
  /** When the photo shows something other than the pin itself, say what it shows. */
  photoNote?: string;
  source: { label: string; url: string };
  photo: PlacePhoto;
}

const PHOTOS = photos as Record<string, PlacePhoto>;

type Draft = Omit<GlobePlace, "photo">;

const DRAFTS: Draft[] = [
  /* ---------------- NASA field campaigns ---------------- */
  {
    id: "hmp",
    layer: "campaigns",
    name: "Haughton-Mars Project",
    region: "Devon Island, Nunavut, Canada",
    lat: 75.38,
    lon: -89.68,
    approx: true,
    kicker: "Field campaign · since 1997",
    summary:
      "A NASA-supported research station inside Haughton impact crater, in a cold polar desert. Teams test rovers, spacesuits, drills and mission routines here as a stand-in for Mars.",
    facts: [
      { label: "Setting", value: "Impact crater about 23 km wide in the High Arctic" },
      { label: "Tested", value: "K10 robotic rovers (2007), drills, suits, field procedures" },
      { label: "Run by", value: "Mars Institute and SETI Institute with NASA Ames" },
    ],
    siteId: "earth-devon-haughton",
    source: { label: "NASA Image Library: Haughton-Mars Project K10 rover", url: "https://images.nasa.gov/details/ARC-2007-ACD07-0170-003" },
  },
  {
    id: "desert-rats",
    layer: "campaigns",
    name: "Desert RATS",
    region: "Black Point Lava Flow, Arizona, USA",
    lat: 35.68,
    lon: -111.4,
    approx: true,
    kicker: "Field campaign · 1997–2011",
    summary:
      "Desert Research and Technology Studies: NASA's yearly field tests in the Arizona desert. Crews lived in pressurised rovers for up to two weeks while driving across lava flows that stand in for the Moon.",
    facts: [
      { label: "Site", value: "Black Point Lava Flow, near Flagstaff" },
      { label: "Tested", value: "Lunar Electric Rover / Space Exploration Vehicle, spacesuits, rover-pair driving" },
      { label: "Longest run", value: "14 days in the rover (2009)" },
    ],
    siteId: "earth-black-point",
    source: { label: "LPI: Black Point Lava Flow lunar analog", url: "https://www.lpi.usra.edu/lunar/analogs/blackpoint/" },
  },
  {
    id: "artemis2-iceland",
    layer: "campaigns",
    name: "Artemis II geology training",
    region: "Vatnajökull National Park, Iceland",
    lat: 65.04,
    lon: -16.6,
    approx: true,
    kicker: "Field campaign · 2023 and 2024",
    summary:
      "The Artemis II astronauts and their backups practised describing and sampling volcanic rock in Iceland's lunar-looking highlands, as Apollo crews did before them.",
    facts: [
      { label: "Crew", value: "Reid Wiseman, Victor Glover, Christina Koch, Jeremy Hansen (CSA)" },
      { label: "Why here", value: "Fresh basalt and ash, few plants, Moon-like grey terrain" },
      { label: "Base", value: "Dreki camp, north of Vatnajökull" },
    ],
    siteId: "earth-askja",
    source: { label: "NASA: Artemis II crew uses Iceland terrain for lunar training", url: "https://science.nasa.gov/missions/artemis/nasas-artemis-ii-crew-uses-iceland-terrain-for-lunar-training/" },
  },
  {
    id: "pisces",
    layer: "campaigns",
    name: "PISCES",
    region: "Hilo, Hawaiʻi, USA",
    lat: 19.702,
    lon: -155.08,
    kicker: "Analogue test centre · Hawaiʻi",
    summary:
      "The Pacific International Space Center for Exploration Systems, at the University of Hawaiʻi at Hilo, hosts Moon and Mars technology tests on the island's young basalt, including NASA lunar-resource field tests on Mauna Kea.",
    facts: [
      { label: "Ground", value: "Basaltic lava and volcanic ash, much like lunar mare soil" },
      { label: "Tested", value: "Prospecting rovers, drills, oxygen-from-soil (ISRU) hardware" },
      { label: "Home", value: "University of Hawaiʻi at Hilo" },
    ],
    siteId: "earth-mauna-kea",
    photoNote: "No PISCES photo is in the NASA Image Library; this ISS photo shows Hawaiʻi Island, where its tests run.",
    source: { label: "PISCES (University of Hawaiʻi at Hilo)", url: "https://pacificspacecenter.com/about/" },
  },
  {
    id: "neemo",
    layer: "campaigns",
    name: "NEEMO",
    region: "Aquarius Reef Base, Florida Keys, USA",
    lat: 24.95,
    lon: -80.4536,
    kicker: "Undersea mission · since 2001",
    summary:
      "NASA Extreme Environment Mission Operations: crews live for up to three weeks in Aquarius, a habitat about 19 m under the sea, and rehearse spacewalks in near-weightless water.",
    facts: [
      { label: "Depth", value: "About 19 m (62 ft), off Key Largo" },
      { label: "Missions", value: "23 NEEMO missions, 2001–2019" },
      { label: "Practised", value: "Spacewalk timelines, communication delays, small-crew life" },
    ],
    source: { label: "NASA Image Library: NEEMO 18 crew in Aquarius", url: "https://images.nasa.gov/details/jsc2014e068003" },
  },

  /* ---------------- Launch sites ---------------- */
  {
    id: "kennedy",
    layer: "launch",
    name: "Kennedy Space Center",
    region: "Florida, USA",
    lat: 28.6272,
    lon: -80.6208,
    kicker: "Launch site · Launch Complex 39",
    summary: "NASA's launch site for Apollo, the Space Shuttle and Artemis. The pin marks Launch Pad 39B, where Artemis I lifted off.",
    facts: [
      { label: "Apollo 11", value: "Pad 39A, 16 July 1969" },
      { label: "Artemis I", value: "Pad 39B, 16 November 2022" },
      { label: "Operator", value: "NASA" },
    ],
    source: { label: "NASA Image Library: Artemis I on Pad 39B", url: "https://images.nasa.gov/details/KSC-20220421-PH-JBS01_0061" },
  },
  {
    id: "baikonur",
    layer: "launch",
    name: "Baikonur Cosmodrome",
    region: "Kazakhstan",
    lat: 45.996,
    lon: 63.564,
    kicker: "Launch site · since 1957",
    summary:
      "The world's first spaceport: Sputnik 1 and Yuri Gagarin both launched from here. Soyuz crews to the ISS still lift off from Baikonur; the pin marks Site 31.",
    facts: [
      { label: "Sputnik 1", value: "4 October 1957" },
      { label: "Gagarin", value: "12 April 1961, first human in orbit" },
      { label: "Operator", value: "Roscosmos (leased from Kazakhstan)" },
    ],
    source: { label: "NASA Image Library: Expedition 70 launch", url: "https://images.nasa.gov/details/NHQ202309150023" },
  },
  {
    id: "kourou",
    layer: "launch",
    name: "Guiana Space Centre",
    region: "Kourou, French Guiana",
    lat: 5.239,
    lon: -52.768,
    kicker: "Launch site · Europe's spaceport",
    summary:
      "Five degrees from the equator, where Earth's spin gives rockets the biggest free boost. An Ariane 5 launched the James Webb Space Telescope from the ELA-3 pad here.",
    facts: [
      { label: "Webb launch", value: "25 December 2021, Ariane 5" },
      { label: "Latitude", value: "5° N" },
      { label: "Operator", value: "CNES, ESA and Arianespace" },
    ],
    source: { label: "NASA Image Library: James Webb Space Telescope launch", url: "https://images.nasa.gov/details/NHQ202112250015" },
  },
  {
    id: "sriharikota",
    layer: "launch",
    name: "Satish Dhawan Space Centre",
    region: "Sriharikota, India",
    lat: 13.733,
    lon: 80.235,
    kicker: "Launch site · ISRO",
    summary:
      "India's spaceport on an island off the Bay of Bengal coast. Chandrayaan-3 left here for the Moon's south polar region, and the NASA-ISRO radar satellite NISAR launched here in 2025.",
    facts: [
      { label: "Chandrayaan-3", value: "14 July 2023, LVM3" },
      { label: "NISAR", value: "30 July 2025, GSLV" },
      { label: "Operator", value: "ISRO" },
    ],
    source: { label: "NASA Image Library: NISAR at ISRO's launch site", url: "https://images.nasa.gov/details/PIA26611" },
  },
  {
    id: "tanegashima",
    layer: "launch",
    name: "Tanegashima Space Center",
    region: "Kagoshima, Japan",
    lat: 30.4,
    lon: 130.975,
    kicker: "Launch site · JAXA",
    summary:
      "Japan's largest spaceport, on a southern island. An H-IIA rocket launched the NASA-JAXA Global Precipitation Measurement satellite from here, and later the SLIM Moon lander.",
    facts: [
      { label: "GPM", value: "28 February 2014 (Japan time), H-IIA" },
      { label: "SLIM and XRISM", value: "7 September 2023, H-IIA" },
      { label: "Operator", value: "JAXA" },
    ],
    source: { label: "NASA Image Library: GPM launch", url: "https://images.nasa.gov/details/201402280007HQ" },
  },

  /* ---------------- Deep Space Network ---------------- */
  {
    id: "goldstone",
    layer: "dsn",
    name: "Goldstone",
    region: "Mojave Desert, California, USA",
    lat: 35.4267,
    lon: -116.89,
    kicker: "Deep Space Network · complex 1 of 3",
    summary:
      "One of three antenna sites spaced about 120° apart around the world, so a spacecraft anywhere in deep space is always in view of one. Its 70 m dish is known as the Mars antenna.",
    facts: [
      { label: "Largest dish", value: "70 m (DSS-14)" },
      { label: "Talks to", value: "Mars rovers and orbiters, Voyager, Artemis" },
      { label: "Run by", value: "NASA JPL" },
    ],
    source: { label: "NASA Image Library: Goldstone complex", url: "https://images.nasa.gov/details/PIA23214" },
  },
  {
    id: "madrid",
    layer: "dsn",
    name: "Madrid",
    region: "Robledo de Chavela, Spain",
    lat: 40.4313,
    lon: -4.2481,
    kicker: "Deep Space Network · complex 2 of 3",
    summary:
      "The European corner of the Deep Space Network. In 2024 six of its antennas were arrayed together for the first time to catch faint signals.",
    facts: [
      { label: "Largest dish", value: "70 m (DSS-63)" },
      { label: "Newest", value: "34 m DSS-53, online 2022" },
      { label: "Run by", value: "INTA for NASA" },
    ],
    source: { label: "NASA Image Library: DSS-53 in Madrid", url: "https://images.nasa.gov/details/PIA25136" },
  },
  {
    id: "canberra",
    layer: "dsn",
    name: "Canberra",
    region: "Tidbinbilla, Australia",
    lat: -35.4014,
    lon: 148.9817,
    kicker: "Deep Space Network · complex 3 of 3",
    summary:
      "The southern-hemisphere complex. Its 70 m DSS-43 is the only antenna on Earth that can send commands to Voyager 2, which left the solar system heading south.",
    facts: [
      { label: "Largest dish", value: "70 m (DSS-43)" },
      { label: "Only link to", value: "Voyager 2 (commands)" },
      { label: "Run by", value: "CSIRO for NASA" },
    ],
    source: { label: "NASA Image Library: DSS-43 at Canberra", url: "https://images.nasa.gov/details/PIA23682" },
  },

  /* ---------------- ISS ---------------- */
  {
    id: "iss",
    layer: "iss",
    name: "International Space Station",
    region: "Low Earth orbit",
    lat: 0,
    lon: 0,
    kicker: "Live · computed in your browser",
    summary:
      "The ISS circles Earth about every 93 minutes at roughly 400 km. Its position here is calculated in your browser from the latest public orbit data (a two-line element set) with the standard SGP4 model.",
    facts: [],
    source: { label: "CelesTrak: ISS orbit data (NORAD 25544)", url: "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE" },
  },
];

export const PLACES: GlobePlace[] = DRAFTS.map((d) => ({ ...d, photo: PHOTOS[d.id] }));

const BY_ID = new Map(PLACES.map((p) => [p.id, p]));
export const placeById = (id: string) => BY_ID.get(id);
/** Fixed pins (everything but the ISS, which moves). */
export const STATIC_PLACES = PLACES.filter((p) => p.layer !== "iss");
