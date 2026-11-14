import { cacheLife } from "next/cache";
import { connection } from "next/server";
import fallback from "@/lib/data/iss-tle.fallback.json";

/**
 * The ISS two-line element set, for the live ISS pin. CelesTrak sends no CORS header and asks clients not to
 * re-download the same data more than every couple of hours, so the server fetches it and caches it for hours.
 * If CelesTrak is unreachable the bundled copy is returned (older, so the position drifts by a few km a day).
 */

const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";

async function latestTle() {
  "use cache";
  cacheLife("hours");
  const res = await fetch(CELESTRAK, { headers: { "User-Agent": "TwinWorlds (NASA Space Apps)" } });
  if (!res.ok) throw new Error(`CelesTrak ${res.status}`);
  const [name, line1, line2] = (await res.text()).trim().split(/\r?\n/).map((l) => l.trim());
  if (!line1?.startsWith("1 25544") || !line2?.startsWith("2 25544")) throw new Error("Unexpected TLE format");
  return { name, line1, line2, source: "CelesTrak", fetched: new Date().toISOString() };
}

export async function GET() {
  await connection(); // always answer at request time; only the CelesTrak fetch is cached
  try {
    return Response.json(await latestTle());
  } catch {
    return Response.json({ ...fallback, stale: true });
  }
}
