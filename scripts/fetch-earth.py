"""
Earth side of the challenge resources (no login needed):
  1. NASA Worldview Snapshots (GIBS) for every Earth analogue: true colour, land-surface temperature (day/night),
     vegetation (NDVI) and shaded terrain, into assets-raw/nasa/earth/worldview/<site>/.
  2. NASA Earthdata CMR metadata: the collections and granules a later ML pipeline would download
     (downloading granules needs a free Earthdata Login), into assets-raw/nasa/earth/earthdata/.
Re-runnable: existing files are skipped.  Usage: python scripts/fetch-earth.py
"""

import io
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets-raw" / "nasa" / "earth"
WVS = "https://wvs.earthdata.nasa.gov/api/v1/snapshot"
CMR = "https://cmr.earthdata.nasa.gov/search"

# Candidate analogues beyond the app's current Earth sites. Coordinates are approximate site centres.
EXTRA = [
    ("devon-island-haughton", "Haughton crater, Devon Island", 75.38, -89.68, "Arctic impact crater; long-running NASA Haughton-Mars Project field site"),
    ("svalbard-bockfjorden", "Bockfjorden, Svalbard", 79.40, 13.40, "Arctic volcanic springs and permafrost; AMASE Mars analogue expeditions"),
    ("mauna-kea", "Mauna Kea, Hawai'i", 19.82, -155.47, "Basaltic volcanic terrain used for lunar resource (ISRU) field tests"),
    ("rio-tinto", "Rio Tinto, Spain", 37.72, -6.55, "Acidic, iron-rich river; Mars astrobiology drilling analogue"),
    ("dallol-danakil", "Dallol, Danakil Depression", 14.24, 40.30, "Hot, hyper-saline, acidic springs; extreme-environment analogue"),
    ("qaidam-basin", "Qaidam Basin, China", 37.50, 95.00, "High, cold, salty desert basin; Mars analogue studies"),
    ("salar-de-uyuni", "Salar de Uyuni, Bolivia", -20.13, -67.49, "Vast salt flat; salts and evaporites"),
    ("cholistan-desert", "Cholistan Desert, Pakistan", 28.50, 71.50, "Hot sandy desert with dunes (Pakistan spotlight)"),
    ("thar-desert", "Thar Desert, Pakistan/India", 27.00, 71.00, "Dune fields and wind-driven sand (Pakistan spotlight)"),
    ("hingol-mud-volcanoes", "Hingol mud volcanoes, Pakistan", 25.43, 65.52, "Mud volcanoes; compared with possible Martian mud volcanism (Pakistan spotlight)"),
    ("khewra-salt-range", "Khewra Salt Range, Pakistan", 32.65, 73.01, "Thick evaporite (salt) deposits (Pakistan spotlight)"),
]

# layer id, file suffix, box size in degrees, pixels, format
LAYERS = [
    ("MODIS_Terra_CorrectedReflectance_TrueColor", "true-colour", 1.2, 768, "image/jpeg"),
    ("MODIS_Aqua_L3_Land_Surface_Temp_8Day_Day", "lst-day", 3.0, 512, "image/png"),
    ("MODIS_Aqua_L3_Land_Surface_Temp_8Day_Night", "lst-night", 3.0, 512, "image/png"),
    ("MODIS_Terra_L3_NDVI_16Day", "ndvi", 3.0, 512, "image/png"),
    ("ASTER_GDEM_Color_Shaded_Relief", "relief", 1.2, 768, "image/jpeg"),
]

# Earthdata collections a later ML pipeline would use (short names as listed in CMR).
COLLECTIONS = [
    ("MOD11A2", "MODIS/Terra land surface temperature, 8-day, 1 km"),
    ("MYD11A2", "MODIS/Aqua land surface temperature, 8-day, 1 km"),
    ("MOD13A2", "MODIS/Terra NDVI, 16-day, 1 km"),
    ("ASTGTM", "ASTER Global DEM, 30 m"),
    ("SPL3SMP_E", "SMAP enhanced soil moisture, 9 km"),
    ("HLSL30", "Harmonized Landsat Sentinel-2 surface reflectance, 30 m"),
]


def get(url: str, retries: int = 4) -> bytes:
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "TwinWorlds/1.0"}), timeout=90) as r:
                return r.read()
        except Exception as e:  # network resets are common here; back off and retry
            if i == retries - 1:
                raise
            print(f"   retry {i + 1}: {e}")
            time.sleep(3 * (i + 1))
    return b""


def app_sites():
    text = (ROOT / "lib" / "data" / "sites.ts").read_text(encoding="utf-8")
    pat = r'id: "earth-([^"]+)",\s*world: "earth",\s*name: "([^"]+)",\s*region: "([^"]+)".*?lat: ([-\d.]+),\s*lon: ([-\d.]+)'
    return [(slug, f"{name}, {region}", float(lat), float(lon), "Current TwinWorlds Earth analogue") for slug, name, region, lat, lon in re.findall(pat, text, re.S)]


def date_for(lat: float) -> str:
    # Local summer, so polar sites are sunlit and deserts show peak heat.
    if lat < -60:
        return "2024-12-20"
    return "2024-07-14" if lat >= 0 else "2024-01-15"


def clear_score(data: bytes, polar: bool) -> float:
    """Lower is better: share of empty swath (black) plus, away from the poles, share of white (cloud)."""
    try:
        from PIL import Image
    except ImportError:
        return 0.0
    im = Image.open(io.BytesIO(data)).convert("L").resize((128, 128))
    px = list(im.getdata())
    black = sum(v < 10 for v in px) / len(px)
    white = 0 if polar else sum(v > 200 for v in px) / len(px)
    return black * 3 + white


def best_true_colour(lat: float, lon: float, box: float, px: int):
    """Daily MODIS has swath gaps and clouds: try several dates around local summer, keep the clearest."""
    from datetime import date, timedelta
    base = date.fromisoformat(date_for(lat))
    h = box / 2
    bbox = f"{max(-90, lat - h):.4f},{lon - h:.4f},{min(90, lat + h):.4f},{lon + h:.4f}"
    best = None
    for offset in (0, -4, 4, -9, 9, -15, 15, -22, 22):
        day = (base + timedelta(days=offset)).isoformat()
        q = {"REQUEST": "GetSnapshot", "TIME": day, "BBOX": bbox, "CRS": "EPSG:4326", "LAYERS": "MODIS_Terra_CorrectedReflectance_TrueColor", "FORMAT": "image/jpeg", "WIDTH": px, "HEIGHT": px}
        url = f"{WVS}?{urllib.parse.urlencode(q)}"
        try:
            data = get(url)
        except Exception:
            continue
        # Only Antarctica is ice-white in summer; elsewhere bright white is cloud.
        score = clear_score(data, lat < -60)
        if best is None or score < best[0]:
            best = (score, data, day, url, bbox)
        if score < 0.03:
            break
    return best


def snapshots(sites):
    manifest = []
    for slug, name, lat, lon, why in sites:
        folder = OUT / "worldview" / slug
        folder.mkdir(parents=True, exist_ok=True)
        day = date_for(lat)
        print(f"-- {name}")
        for layer, suffix, box, px, fmt in LAYERS:
            ext = "jpg" if fmt == "image/jpeg" else "png"
            path = folder / f"{suffix}.{ext}"
            if suffix == "true-colour":
                meta = folder / "true-colour.json"
                if not path.exists() or not meta.exists():
                    best = best_true_colour(lat, lon, box, px)
                    if not best:
                        print("   true-colour: FAILED")
                        continue
                    score, data, chosen, url, bbox = best
                    path.write_bytes(data)
                    meta.write_text(json.dumps({"date": chosen, "url": url, "bbox": bbox, "clear_score": round(score, 3)}), encoding="utf-8")
                    print(f"   true-colour: {chosen} (score {score:.2f})")
                info = json.loads(meta.read_text(encoding="utf-8"))
                manifest.append({"site": slug, "name": name, "lat": lat, "lon": lon, "why": why, "layer": layer, "date": info["date"], "bbox": info["bbox"], "file": str(path.relative_to(ROOT)).replace("\\", "/"), "source": "NASA Worldview Snapshots / GIBS", "url": info["url"]})
                continue
            h = box / 2
            bbox = f"{max(-90, lat - h):.4f},{lon - h:.4f},{min(90, lat + h):.4f},{lon + h:.4f}"
            q = {"REQUEST": "GetSnapshot", "TIME": day, "BBOX": bbox, "CRS": "EPSG:4326", "LAYERS": layer, "FORMAT": fmt, "WIDTH": px, "HEIGHT": px}
            url = f"{WVS}?{urllib.parse.urlencode(q)}"
            if not path.exists():
                try:
                    data = get(url)
                    if len(data) < 800:
                        print(f"   {suffix}: tiny response ({len(data)} B), skipped")
                        continue
                    path.write_bytes(data)
                    print(f"   {suffix}: {len(data) // 1024} KB")
                except Exception as e:
                    print(f"   {suffix}: FAILED {e}")
                    continue
            manifest.append({"site": slug, "name": name, "lat": lat, "lon": lon, "why": why, "layer": layer, "date": day, "bbox": bbox, "file": str(path.relative_to(ROOT)).replace("\\", "/"), "source": "NASA Worldview Snapshots / GIBS", "url": url})
    (OUT / "worldview" / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"worldview manifest: {len(manifest)} images")


def earthdata(sites):
    folder = OUT / "earthdata"
    folder.mkdir(parents=True, exist_ok=True)
    summary = []
    for short, desc in COLLECTIONS:
        data = json.loads(get(f"{CMR}/collections.json?short_name={short}&page_size=5"))
        entries = data.get("feed", {}).get("entry", [])
        if not entries:
            print(f"   CMR: no collection for {short}")
            continue
        c = entries[0]
        summary.append({"short_name": short, "what": desc, "concept_id": c.get("id"), "title": c.get("title"), "time_start": c.get("time_start"), "version": c.get("version_id")})
        print(f"   CMR {short}: {c.get('id')}")
    (folder / "collections.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    # Granules that cover each site (summer 2024), so a training pipeline knows exactly what to pull.
    granules = {}
    for slug, name, lat, lon, _ in sites:
        point = f"{lon},{lat}"
        res = {}
        for short in ("MOD11A2", "MOD13A2"):
            day = date_for(lat)
            q = urllib.parse.urlencode({"short_name": short, "point": point, "temporal": f"{day}T00:00:00Z,{day}T23:59:59Z", "page_size": 3})
            try:
                feed = json.loads(get(f"{CMR}/granules.json?{q}")).get("feed", {}).get("entry", [])
                res[short] = [{"id": g.get("id"), "title": g.get("title"), "links": [l["href"] for l in g.get("links", []) if l.get("href", "").endswith((".hdf", ".h5", ".tif"))][:2]} for g in feed]
            except Exception as e:
                res[short] = f"error: {e}"
        granules[slug] = {"name": name, "lat": lat, "lon": lon, **res}
    (folder / "granules-by-site.json").write_text(json.dumps(granules, indent=2), encoding="utf-8")
    print(f"granule listing for {len(granules)} sites")


if __name__ == "__main__":
    sites = app_sites() + EXTRA
    snapshots(sites)
    earthdata(sites)
