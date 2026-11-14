import { cacheLife } from "next/cache";
import type { NextRequest } from "next/server";
import { cmrCollection, granuleQueryUrl, parseGranules, roundCoord } from "@/lib/cmr";

/**
 * GET /api/cmr/granules?c=<collection concept ID>&lat=…&lon=…
 * The newest granules of one allow-listed collection covering a point, from NASA CMR (no login needed to search).
 * Answers are cached on the server for hours per collection and ~100 m spot, shared by every visitor; failures are
 * not cached, so the next request tries CMR again.
 */

class CmrError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function searchGranules(conceptId: string, lat: number, lon: number) {
  "use cache";
  cacheLife("hours");
  const res = await fetch(granuleQueryUrl(conceptId, lat, lon), {
    headers: { "Client-Id": "twinworlds-spaceapps" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CmrError(body?.errors?.join("; ") || `CMR answered ${res.status}`, res.status >= 500 ? 502 : 400);
  }
  return parseGranules(conceptId, await res.json(), res.headers.get("CMR-Hits"));
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const conceptId = p.get("c") ?? "";
  // Number(null) and Number("") are 0, so a missing coordinate must be caught before converting.
  const lat = p.get("lat")?.trim() ? Number(p.get("lat")) : NaN;
  const lon = p.get("lon")?.trim() ? Number(p.get("lon")) : NaN;
  if (!cmrCollection(conceptId)) return Response.json({ error: "Unknown collection" }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat must be −90…90 and lon −180…180" }, { status: 400 });
  }
  try {
    return Response.json(await searchGranules(conceptId, roundCoord(lat), roundCoord(lon)));
  } catch (e) {
    if (e instanceof CmrError) return Response.json({ error: e.message }, { status: e.status });
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return Response.json({ error: timedOut ? "NASA CMR took too long to answer" : "Could not reach NASA CMR" }, { status: timedOut ? 504 : 502 });
  }
}
