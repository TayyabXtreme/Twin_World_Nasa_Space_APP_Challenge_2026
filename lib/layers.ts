import type { World } from "./worlds";

/**
 * Layers for the 2D map (Leaflet, EPSG:4326), in two groups:
 *  - base maps: NASA imagery tiles, one at a time underneath;
 *  - science data: one overlay at a time on top, with an opacity slider and a legend card.
 *
 * Tile layers: IDs verified in assets-raw/docs/notes.txt and the GIBS WMTS capabilities; every URL template checked
 * (HTTP 200) on 2026-11-12 (base maps) and 2026-11-13 (Earth science layers, re-checked by
 * scripts/build-science-layers.py, which records the check in each legend JSON). GIBS maxNativeZoom values are the top
 * tile-matrix level of each matrix set in the capabilities (250m: 8, 500m: 7, 1km: 6, 2km: 5, 31.25m: 11).
 *
 * Image layers: equirectangular WebP overlays built from raw PDS data by scripts/build-science-layers.py.
 * Every science layer has a legend at /data/layers/<id>.json (see `Legend`).
 */

export type LayerKind =
  | "color"
  | "elevation"
  | "slope"
  | "temperature"
  | "ice"
  | "thermal"
  | "dust"
  | "night"
  | "relief"
  | "water"
  | "hydrogen"
  | "rocks"
  | "radar"
  | "vegetation"
  | "snow"
  | "aerosol";

export type LayerGroup = "base" | "science";

interface LayerCommon {
  id: string;
  world: World;
  kind: LayerKind;
  group: LayerGroup;
  label: string;
  attribution: string;
}

export interface TileMapLayer extends LayerCommon {
  type: "tile";
  url: string;
  maxNativeZoom: number;
  /** Trek serves 256 px tiles on the standard EPSG:4326 grid; GIBS serves 512 px tiles on its own grid (see WorldMap). */
  tileSize: 256 | 512;
}

/** A precomputed overlay; its image, bounds and value grid are described by its legend JSON. */
export interface ImageMapLayer extends LayerCommon {
  type: "image";
}

export type MapLayer = TileMapLayer | ImageMapLayer;

/** Legend JSON written by scripts/build-science-layers.py to public/data/layers/<id>.json. */
export interface Legend {
  id: string;
  type: "image" | "tile";
  title: string;
  units: string;
  unitsLong?: string;
  /** Colour-scale end points, in `units`. Absent for qualitative (NASA Trek) layers. */
  range?: [number, number];
  scale?: "linear" | "log";
  /** Evenly spaced colours from range[0] to range[1]; null when the tiles carry no published colour key. */
  ramp: string[] | null;
  rampLabels?: [string, string];
  ticks?: number[];
  lowLabel?: string;
  highLabel?: string;
  decimals?: number;
  meaning: string;
  caveat?: string;
  dataset: string;
  datasetId: string;
  resolution: string;
  source: string;
  product?: string;
  /** GIBS: date of the newest composite when the legend was built. */
  latest?: string;
  verified?: { date: string; status: number; contentType: string };
  /** Image layers. */
  image?: string;
  bounds?: [[number, number], [number, number]];
  /** uint16 LE value grid, row-major from the north-west corner of `bounds`; 0 = no data, value = offset + (q - 1) * scale. */
  grid?: { url: string; width: number; height: number; offset: number; scale: number };
  /** GIBS tiles: the colour map as [r, g, b, low, high] rows (values in `units`), for reading a value from a tile pixel. */
  table?: [number, number, number, number, number][];
  tileUrl?: string;
  maxNativeZoom?: number;
  built?: string;
}

export const legendUrl = (id: string) => `/data/layers/${id}.json`;

const trek = (body: "Moon" | "Mars", layerId: string, ext: "jpg" | "png" = "jpg") =>
  `https://trek.nasa.gov/tiles/${body}/EQ/${layerId}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`;

/** `default` time = latest available date for time-varying layers (verified HTTP 200). */
const gibs = (layerId: string, matrixSet: string, ext: "jpeg" | "png" = "jpeg") =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layerId}/default/default/${matrixSet}/{z}/{y}/{x}.${ext}`;

const TREK_MOON = "NASA/GSFC/ASU · LRO via NASA Moon Trek";
const TREK_MARS = "NASA/JPL/USGS · via NASA Mars Trek";
const GIBS = "NASA EOSDIS GIBS / Worldview";
const PDS_MOON = "NASA LRO · PDS Geosciences Node";
const PDS_MARS = "NASA · PDS Geosciences Node";

export const MAP_LAYERS: MapLayer[] = [
  // Moon: base maps
  { type: "tile", group: "base", id: "moon-wac", world: "moon", kind: "color", label: "LRO WAC mosaic", url: trek("Moon", "LRO_WAC_Mosaic_Global_303ppd_v02"), maxNativeZoom: 7, tileSize: 256, attribution: TREK_MOON },
  { type: "tile", group: "base", id: "moon-lola-shade", world: "moon", kind: "elevation", label: "LOLA color hillshade", url: trek("Moon", "LRO_LOLA_ClrShade_Global_128ppd_v04"), maxNativeZoom: 6, tileSize: 256, attribution: TREK_MOON },
  // Moon: science
  { type: "image", group: "science", id: "moon-diviner-rocks", world: "moon", kind: "rocks", label: "Rock abundance", attribution: PDS_MOON },
  { type: "image", group: "science", id: "moon-diviner-regolith-temp", world: "moon", kind: "temperature", label: "Night soil temperature", attribution: PDS_MOON },
  { type: "image", group: "science", id: "moon-minirf-cpr", world: "moon", kind: "radar", label: "Mini-RF radar CPR", attribution: PDS_MOON },
  { type: "tile", group: "science", id: "moon-slope", world: "moon", kind: "slope", label: "LOLA slope", url: trek("Moon", "LRO_LOLA_ClrSlope_Global_16ppd"), maxNativeZoom: 3, tileSize: 256, attribution: TREK_MOON },
  { type: "tile", group: "science", id: "moon-diviner-max", world: "moon", kind: "temperature", label: "Diviner max temperature", url: trek("Moon", "diviner_Clrtbol_max"), maxNativeZoom: 1, tileSize: 256, attribution: TREK_MOON },
  { type: "tile", group: "science", id: "moon-psr-south", world: "moon", kind: "ice", label: "South-pole illumination", url: trek("Moon", "LRO_LOLA_Illumination_SPole65S_240m_EQ", "png"), maxNativeZoom: 6, tileSize: 256, attribution: TREK_MOON },
  // Mars: base maps
  { type: "tile", group: "base", id: "mars-viking", world: "mars", kind: "color", label: "Viking color mosaic", url: trek("Mars", "Mars_Viking_MDIM21_ClrMosaic_global_232m"), maxNativeZoom: 7, tileSize: 256, attribution: TREK_MARS },
  { type: "tile", group: "base", id: "mars-mola-shade", world: "mars", kind: "elevation", label: "MOLA color hillshade", url: trek("Mars", "Mars_MGS_MOLA_ClrShade_merge_global_463m"), maxNativeZoom: 6, tileSize: 256, attribution: TREK_MARS },
  { type: "tile", group: "base", id: "mars-themis", world: "mars", kind: "thermal", label: "THEMIS day IR", url: trek("Mars", "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018"), maxNativeZoom: 8, tileSize: 256, attribution: TREK_MARS },
  // Mars: science
  { type: "image", group: "science", id: "mars-grs-water", world: "mars", kind: "water", label: "GRS water (hydrogen)", attribution: PDS_MARS },
  { type: "image", group: "science", id: "mars-ns-epithermal", world: "mars", kind: "hydrogen", label: "Neutron hydrogen", attribution: PDS_MARS },
  { type: "image", group: "science", id: "mars-tes-ti-night", world: "mars", kind: "thermal", label: "TES thermal inertia", attribution: PDS_MARS },
  { type: "tile", group: "science", id: "mars-dust", world: "mars", kind: "dust", label: "TES dust cover index", url: trek("Mars", "tes_ruffdust", "png"), maxNativeZoom: 3, tileSize: 256, attribution: TREK_MARS },
  // Earth: base maps
  { type: "tile", group: "base", id: "earth-bluemarble", world: "earth", kind: "color", label: "Blue Marble", url: gibs("BlueMarble_NextGeneration", "500m"), maxNativeZoom: 7, tileSize: 512, attribution: GIBS },
  { type: "tile", group: "base", id: "earth-black-marble", world: "earth", kind: "night", label: "Black Marble (night)", url: gibs("VIIRS_SNPP_DayNightBand_AtSensor_M15", "500m"), maxNativeZoom: 7, tileSize: 512, attribution: GIBS },
  { type: "tile", group: "base", id: "earth-aster-relief", world: "earth", kind: "relief", label: "ASTER GDEM shaded relief", url: gibs("ASTER_GDEM_Greyscale_Shaded_Relief", "31.25m"), maxNativeZoom: 11, tileSize: 512, attribution: GIBS },
  // Earth: live science (GIBS, latest composite)
  { type: "tile", group: "science", id: "earth-lst-day", world: "earth", kind: "temperature", label: "Land surface temp (day)", url: gibs("MODIS_Terra_L3_Land_Surface_Temp_8Day_Day", "1km", "png"), maxNativeZoom: 6, tileSize: 512, attribution: GIBS },
  { type: "tile", group: "science", id: "earth-lst-night", world: "earth", kind: "temperature", label: "Land surface temp (night)", url: gibs("MODIS_Terra_L3_Land_Surface_Temp_8Day_Night", "1km", "png"), maxNativeZoom: 6, tileSize: 512, attribution: GIBS },
  { type: "tile", group: "science", id: "earth-ndvi", world: "earth", kind: "vegetation", label: "Vegetation (NDVI)", url: gibs("MODIS_Terra_L3_NDVI_16Day", "250m", "png"), maxNativeZoom: 8, tileSize: 512, attribution: GIBS },
  { type: "tile", group: "science", id: "earth-snow", world: "earth", kind: "snow", label: "Snow cover", url: gibs("MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct", "2km", "png"), maxNativeZoom: 5, tileSize: 512, attribution: GIBS },
  { type: "tile", group: "science", id: "earth-aod", world: "earth", kind: "aerosol", label: "Aerosol optical depth", url: gibs("MODIS_Combined_Value_Added_AOD", "2km", "png"), maxNativeZoom: 5, tileSize: 512, attribution: GIBS },
  { type: "tile", group: "science", id: "earth-dust", world: "earth", kind: "dust", label: "Surface dust (MERRA-2)", url: gibs("MERRA2_Dust_Surface_Mass_Concentration_Monthly", "2km", "png"), maxNativeZoom: 5, tileSize: 512, attribution: GIBS },
];

export function layersFor(world: World) {
  return MAP_LAYERS.filter((l) => l.world === world);
}

export function baseLayersFor(world: World) {
  return MAP_LAYERS.filter((l): l is TileMapLayer => l.world === world && l.group === "base" && l.type === "tile");
}

export function scienceLayersFor(world: World) {
  return MAP_LAYERS.filter((l) => l.world === world && l.group === "science");
}
