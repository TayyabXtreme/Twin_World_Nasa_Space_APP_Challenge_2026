"""
NASA Earthdata products for the Analog Finder (needs EARTHDATA_TOKEN in .env.local; get one at
https://urs.earthdata.nasa.gov → Generate Token).

Tier 1 (default, ~820 MB) — global 0.05° grids, enough to score every place on Earth:
  MOD11C3  MODIS/Terra land-surface temperature, monthly: Jan, Apr, Jul, Oct 2024 (day and night)
  MOD13C2  MODIS/Terra NDVI, monthly: Jan, Jul 2024 (dryness / bare ground)
  MCD43C3  MODIS albedo, daily: 15 Jan, 15 Jul 2024 (with LST → apparent thermal inertia, comparable to Mars TES)
Tier 2 (--full) — the remaining months of MOD11C3 and MOD13C2, plus 1 km MOD11A2 tiles at every analogue site.

Files go to assets-raw/nasa/earth/earthdata/global/<product>/ and .../sites/<site>/. Resumable.
Usage: python scripts/fetch-earthdata.py [--full]
"""

import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets-raw" / "nasa" / "earth" / "earthdata"
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"


def token() -> str:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("EARTHDATA_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("EARTHDATA_TOKEN missing from .env.local")


def granules(short: str, start: str, end: str, extra: dict | None = None, limit: int = 1):
    q = {"short_name": short, "temporal": f"{start}T00:00:00Z,{end}T23:59:59Z", "page_size": limit, "sort_key": "start_date"}
    q.update(extra or {})
    feed = json.loads(urllib.request.urlopen(f"{CMR}?{urllib.parse.urlencode(q)}", timeout=90).read())["feed"]["entry"]
    out = []
    for g in feed:
        href = next((l["href"] for l in g.get("links", []) if l.get("href", "").startswith("https") and l["href"].endswith(".hdf")), None)
        if href:
            out.append({"title": g["title"], "url": href, "mb": float(g.get("granule_size") or 0)})
    return out


def download(item, folder: Path, tok: str):
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / item["url"].rsplit("/", 1)[1]
    want = item["mb"] * 1_000_000
    # No curl --retry: curl 8.x starts the file over on a retry; this loop resumes with -C - instead.
    for attempt in range(30):
        if path.exists() and want and path.stat().st_size >= want * 0.995:
            print(f"  ok   {path.name} ({path.stat().st_size / 1e6:.1f} MB)")
            return True
        r = subprocess.run(["curl", "-sSL", "-C", "-", "--speed-time", "90", "--speed-limit", "2048",
                            "-H", f"Authorization: Bearer {tok}", "-o", str(path), item["url"]], capture_output=True, text=True)
        if r.returncode == 0 and (not want or path.stat().st_size >= want * 0.995):
            print(f"  done {path.name} ({path.stat().st_size / 1e6:.1f} MB)")
            return True
        if r.returncode == 22 or "401" in r.stderr or "403" in r.stderr:
            print(f"  auth error for {path.name}: {r.stderr.strip()[:200]}")
            return False
    print(f"  FAIL {path.name}")
    return False


def main():
    full = "--full" in sys.argv
    tok = token()
    plan = []  # (folder, granule)
    lst_months = ["01", "04", "07", "10"] if not full else [f"{m:02d}" for m in range(1, 13)]
    ndvi_months = ["01", "07"] if not full else [f"{m:02d}" for m in range(1, 13)]
    for m in lst_months:
        plan += [("global/MOD11C3", g) for g in granules("MOD11C3", f"2024-{m}-01", f"2024-{m}-02")]
    for m in ndvi_months:
        plan += [("global/MOD13C2", g) for g in granules("MOD13C2", f"2024-{m}-01", f"2024-{m}-02")]
    for day in ("2024-01-15", "2024-07-15"):
        plan += [("global/MCD43C3", g) for g in granules("MCD43C3", day, day)]
    if full:
        sites = json.loads((OUT / "granules-by-site.json").read_text(encoding="utf-8"))
        for slug, info in sites.items():
            for g in info.get("MOD11A2") or []:
                href = next(iter(g.get("links") or []), None)
                if href:
                    plan.append((f"sites/{slug}/MOD11A2", {"title": g["title"], "url": href, "mb": 0}))

    total = sum(g["mb"] for _, g in plan)
    print(f"{len(plan)} files, about {total:.0f} MB")
    (OUT / "download-plan.json").write_text(json.dumps([{"folder": f, **g} for f, g in plan], indent=2), encoding="utf-8")
    for folder, g in plan:
        if not download(g, OUT / folder, tok):
            break


if __name__ == "__main__":
    main()
