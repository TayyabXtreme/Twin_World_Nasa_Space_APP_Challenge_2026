/**
 * "Get the data": NASA CMR granule search for one spot on Earth, and Earthdata Search links pre-filtered to it.
 *
 * CMR search needs no login; downloading the files does (free Earthdata Login). Concept IDs were looked up on
 * 2026-11-14 with collections.json?short_name=…&version=… (all cloud-hosted). Sizes come from UMM-G
 * ArchiveAndDistributionInformation, because the plain JSON format leaves them empty for HLS.
 * No app imports, so scripts can load this file directly with Node.
 */

export interface CmrCollection {
  id: string;
  short: string;
  version: string;
  conceptId: string;
  label: string;
  /** Cadence · resolution · platform. */
  detail: string;
  /** What a scientist would use it for here. */
  use: string;
  /** Granule tiles carry a cloud-cover percentage (HLS). */
  cloud?: boolean;
  /** One granule for all time (a DEM tile). */
  static?: boolean;
}

export const CMR_COLLECTIONS: CmrCollection[] = [
  {
    id: "mod11a2",
    short: "MOD11A2",
    version: "061",
    conceptId: "C2269056084-LPCLOUD",
    label: "MODIS land surface temperature",
    detail: "8-day · 1 km · Terra",
    use: "Day and night ground temperature, for heat and thermal-swing comparisons.",
  },
  {
    id: "mod13q1",
    short: "MOD13Q1",
    version: "061",
    conceptId: "C1748066515-LPCLOUD",
    label: "MODIS vegetation indices (NDVI)",
    detail: "16-day · 250 m · Terra",
    use: "How bare or green the ground is.",
  },
  {
    id: "astgtm",
    short: "ASTGTM",
    version: "003",
    conceptId: "C1711961296-LPCLOUD",
    label: "ASTER Global DEM",
    detail: "Static · 30 m · 1° tiles",
    use: "Elevation, slope and roughness at rover scale.",
    static: true,
  },
  {
    id: "spl3smp-e",
    short: "SPL3SMP_E",
    version: "006",
    conceptId: "C2938664763-NSIDC_CPRD",
    label: "SMAP soil moisture",
    detail: "Daily · 9 km · global grid",
    use: "How wet the top 5 cm of soil is: dry analogues read near zero.",
  },
  {
    id: "hlsl30",
    short: "HLSL30",
    version: "2.0",
    conceptId: "C2021957657-LPCLOUD",
    label: "HLS surface reflectance (Landsat)",
    detail: "Every few days · 30 m · Landsat 8/9",
    use: "Field-scale colour and minerals, matched to Sentinel-2.",
    cloud: true,
  },
  {
    id: "hlss30",
    short: "HLSS30",
    version: "2.0",
    conceptId: "C2021957295-LPCLOUD",
    label: "HLS surface reflectance (Sentinel-2)",
    detail: "Every few days · 30 m · Sentinel-2",
    use: "Field-scale colour and minerals, matched to Landsat.",
    cloud: true,
  },
];

export const cmrCollection = (conceptId: string) => CMR_COLLECTIONS.find((c) => c.conceptId === conceptId);

/** Coordinates rounded to ~100 m, so nearby clicks share a cache entry. */
export const roundCoord = (x: number) => Math.round(x * 1000) / 1000;

export const CMR_GRANULES = "https://cmr.earthdata.nasa.gov/search/granules.umm_json";

export function granuleQueryUrl(conceptId: string, lat: number, lon: number, pageSize = 5) {
  const q = new URLSearchParams({
    collection_concept_id: conceptId,
    point: `${roundCoord(lon)},${roundCoord(lat)}`,
    sort_key: "-start_date",
    page_size: String(pageSize),
  });
  return `${CMR_GRANULES}?${q}`;
}

/** Earthdata Search with the collection focused and a point filter (its URL keys: p = collection, sp = point). */
export function earthdataSearchUrl(conceptId: string, lat: number, lon: number) {
  return `https://search.earthdata.nasa.gov/search/granules?p=${conceptId}&sp%5B0%5D=${roundCoord(lon)}%2C${roundCoord(lat)}`;
}

export interface Granule {
  id: string;
  name: string;
  start: string;
  end: string | null;
  bytes: number | null;
  cloud: number | null;
  /** HTTPS download (needs Earthdata Login). */
  url: string | null;
}

export interface GranuleResult {
  conceptId: string;
  hits: number;
  granules: Granule[];
  fetched: string;
}

const UNIT: Record<string, number> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };

interface UmmItem {
  meta: { "concept-id": string };
  umm: {
    GranuleUR: string;
    TemporalExtent?: { RangeDateTime?: { BeginningDateTime: string; EndingDateTime?: string }; SingleDateTime?: string };
    DataGranule?: { ArchiveAndDistributionInformation?: { Name?: string; SizeInBytes?: number; Size?: number; SizeUnit?: string }[] };
    AdditionalAttributes?: { Name: string; Values: string[] }[];
    CloudCover?: number;
    RelatedUrls?: { URL: string; Type?: string }[];
  };
}

/** UMM-G search response → our compact granule list. */
export function parseGranules(conceptId: string, body: { hits?: number; items?: UmmItem[] }, hitsHeader?: string | null): GranuleResult {
  const granules = (body.items ?? []).map(({ meta, umm }): Granule => {
    const t = umm.TemporalExtent;
    const files = umm.DataGranule?.ArchiveAndDistributionInformation ?? [];
    const sized = files.map((f) => f.SizeInBytes ?? (f.Size !== undefined ? f.Size * (UNIT[f.SizeUnit ?? "MB"] ?? 1e6) : null));
    const bytes = sized.some((s) => s !== null) ? sized.reduce<number>((a, s) => a + (s ?? 0), 0) : null;
    const cloudAttr = umm.AdditionalAttributes?.find((a) => a.Name === "CLOUD_COVERAGE")?.Values?.[0];
    const cloud = umm.CloudCover ?? (cloudAttr !== undefined && cloudAttr !== "" ? Number(cloudAttr) : null);
    const data = (umm.RelatedUrls ?? []).filter((u) => u.Type === "GET DATA" && u.URL.startsWith("https"));
    const primary = data.find((u) => /\.(hdf|h5|tif|nc|zip)$/i.test(u.URL)) ?? data[0];
    // Display the data file's name; some providers append a suffix to the granule ID (SMAP).
    const name = primary ? decodeURIComponent(primary.URL.split("/").pop()!) : umm.GranuleUR;
    return {
      id: meta["concept-id"],
      name: data.length > 1 && /\.(B\d+|Fmask|SAA|SZA|VAA|VZA)\.tif$/.test(name) ? umm.GranuleUR : name,
      start: t?.RangeDateTime?.BeginningDateTime ?? t?.SingleDateTime ?? "",
      end: t?.RangeDateTime?.EndingDateTime ?? null,
      bytes,
      cloud: Number.isFinite(cloud) ? cloud : null,
      url: primary?.URL ?? null,
    };
  });
  const hits = Number(hitsHeader ?? body.hits ?? granules.length);
  return { conceptId, hits: Number.isFinite(hits) ? hits : granules.length, granules, fetched: new Date().toISOString() };
}

export function formatSize(bytes: number | null) {
  if (bytes === null) return "size not listed";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(bytes >= 1e8 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
