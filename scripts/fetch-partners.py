"""
Partner-agency resources from the challenge page (CSA, ESA/Copernicus, JAXA), into assets-raw/nasa/partners/.
Everything here is public; full-resolution scenes that need an account are listed with instructions instead.

  CSA        dataset records, RCM sample previews + metadata, the official SAR / RADARSAT-1 tutorial repos
             (--full also downloads one full-resolution RCM band, about 164 MB)
  Copernicus best low-cloud Sentinel-2 L2A scene and latest Sentinel-1 GRD radar scene per analogue site,
             with their public quicklook images (product downloads need a free Copernicus account)
  ESA OSC    Open Science Catalog products whose titles match analogue themes (permafrost, desert, ice, ...)
  JAXA       JAXA Earth API (public STAC) collection list; G-Portal itself needs a free account

Usage: python scripts/fetch-partners.py [--full]
"""

import importlib.util
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets-raw" / "nasa" / "partners"

spec = importlib.util.spec_from_file_location("fetch_earth", Path(__file__).with_name("fetch-earth.py"))
fe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fe)
get = fe.get

RCM = "https://donnees-data.asc-csa.gc.ca/users/OpenData_DonneesOuvertes/pub/RCM"
RCM_SAMPLES = [
    ("Antarctica", "RCM3_OK1050586_PK1050588_3_SC30MCPB_20200124_083635_CH_CV_GRD", "Antarctic Peninsula, about 65°S"),
    ("Canadian%20Arctic", "RCM2_OK1050583_PK1050584_1_SCLND_20191105_135220_HH_HV_GRD", "Canadian Arctic islands, about 75°N 110°W"),
    ("Canadian%20Arctic", "RCM2_OK1050607_PK1050608_1_SC100MA_20200113_150406_HH_HV_GRD", "Beaufort Sea and Banks Island, about 77°N 121°W"),
]
REPOS = [
    "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial",
    "https://github.com/asc-csa/radarsat1-scripts",
    "https://github.com/asc-csa/EO-Visualization-and-Search-Tutorial",
]
CDSE = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
OSC = "https://esa-earthcode.github.io/open-science-catalog-metadata"
JAXA = "https://data.earth.jaxa.jp/stac/cog/v1/catalog.json"
THEMES = ["permafrost", "desert", "ice", "glacier", "volcan", "lava", "salt", "dune", "polar", "antarctic", "arctic", "soil moisture", "land surface temperature", "sar", "radar", "snow"]


def save(path: Path, data: bytes | str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))


def csa(full: bool):
    base = OUT / "csa"
    for pkg in ("radarsat1", "rcm"):
        try:
            save(base / f"{pkg}-dataset.json", get(f"https://donnees-data.asc-csa.gc.ca/api/3/action/package_show?id={pkg}"))
        except Exception as e:
            print(f"  csa {pkg}: {e}")
    for folder, product, where in RCM_SAMPLES:
        dest = base / "rcm-samples" / product
        for rel in ("preview/productOverview.png", "preview/mapOverlay.kml", "preview/productPreview.html", "metadata/product.xml", "license.pdf", "manifest.safe"):
            path = dest / rel
            if path.exists():
                continue
            try:
                save(path, get(f"{RCM}/{folder}/{product}/{rel}"))
            except Exception as e:
                print(f"  rcm {product} {rel}: {e}")
        save(dest / "WHERE.txt", where + "\n")
        print(f"  rcm sample: {where}")
    if full:
        band = base / "rcm-samples" / RCM_SAMPLES[1][1] / "imagery" / "1050584_1_HH.tif"
        band.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "-sSL", "-C", "-", "-o", str(band), f"{RCM}/{RCM_SAMPLES[1][0]}/{RCM_SAMPLES[1][1]}/imagery/1050584_1_HH.tif"], check=False)
        print(f"  rcm full band: {band.stat().st_size // 1_000_000} MB")
    for repo in REPOS:
        dest = base / "repos" / repo.rsplit("/", 1)[1]
        if dest.exists():
            continue
        for attempt in range(4):
            r = subprocess.run(["git", "-c", "http.version=HTTP/1.1", "clone", "--depth", "1", repo, str(dest)], capture_output=True, text=True)
            if r.returncode == 0:
                print(f"  cloned {repo}")
                break
            time.sleep(3)
        else:
            print(f"  clone failed: {repo}")


def copernicus(sites):
    base = OUT / "copernicus"
    listing = {}
    for slug, name, lat, lon, _ in sites:
        day = fe.date_for(lat)
        year = int(day[:4])
        point = f"geography'SRID=4326;POINT({lon} {lat})'"
        found = {}
        queries = {
            "sentinel-2-l2a": f"Collection/Name eq 'SENTINEL-2' and contains(Name,'L2A') and OData.CSC.Intersects(area={point}) and ContentDate/Start gt {year - 1}-06-01T00:00:00.000Z and ContentDate/Start lt {year + 1}-01-31T00:00:00.000Z and Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value lt 5.0)",
            "sentinel-1-grd": f"Collection/Name eq 'SENTINEL-1' and contains(Name,'GRD') and OData.CSC.Intersects(area={point}) and ContentDate/Start gt {year - 1}-01-01T00:00:00.000Z",
        }
        for key, flt in queries.items():
            q = urllib.parse.urlencode({"$filter": flt, "$top": "1", "$orderby": "ContentDate/Start desc", "$expand": "Assets"})
            try:
                items = json.loads(get(f"{CDSE}?{q}")).get("value", [])
            except Exception as e:
                found[key] = f"error: {e}"
                continue
            if not items:
                found[key] = None
                continue
            p = items[0]
            ql = next((a.get("DownloadLink") for a in p.get("Assets", []) if a.get("Type") == "QUICKLOOK"), None)
            entry = {"name": p["Name"], "id": p["Id"], "date": p.get("ContentDate", {}).get("Start"), "size_bytes": p.get("ContentLength"), "quicklook": ql, "download_needs_login": f"https://download.dataspace.copernicus.eu/odata/v1/Products({p['Id']})/$value"}
            if ql:
                path = base / slug / f"{key}-quicklook.jpg"
                if not path.exists():
                    try:
                        save(path, get(ql))
                    except Exception as e:
                        entry["quicklook_error"] = str(e)
                entry["quicklook_file"] = str(path.relative_to(ROOT)).replace("\\", "/")
            found[key] = entry
        listing[slug] = {"name": name, "lat": lat, "lon": lon, **found}
        print(f"  copernicus {slug}: " + ", ".join(k for k, v in found.items() if isinstance(v, dict)))
    save(base / "scenes-by-site.json", json.dumps(listing, indent=2))


def esa_osc():
    base = OUT / "esa-open-science-catalog"
    try:
        products_root = json.loads(get(f"{OSC}/products/catalog.json"))
    except Exception as e:
        print(f"  osc: {e}")
        return
    matches = []
    for link in products_root.get("links", []):
        if link.get("rel") != "child":
            continue
        title = (link.get("title") or link.get("href", "")).lower()
        if any(t in title for t in THEMES):
            matches.append({"title": link.get("title"), "href": urllib.parse.urljoin(f"{OSC}/products/", link["href"])})
    save(base / "matching-products.json", json.dumps({"themes": THEMES, "count": len(matches), "products": matches}, indent=2))
    print(f"  osc: {len(matches)} products match analogue themes")


def jaxa():
    base = OUT / "jaxa"
    try:
        cat = json.loads(get(JAXA))
    except Exception as e:
        print(f"  jaxa: {e}")
        return
    # Child links carry no titles in this catalogue; the collection id is the folder name in the link.
    cols = [{"title": l.get("title") or l["href"].rstrip("/").split("/")[-2], "href": urllib.parse.urljoin(JAXA, l["href"])} for l in cat.get("links", []) if l.get("rel") == "child"]
    save(base / "jaxa-earth-api-collections.json", json.dumps({"catalog": JAXA, "count": len(cols), "collections": cols, "g_portal": "https://gportal.jaxa.jp/gpr/ (free account needed for downloads)"}, indent=2))
    print(f"  jaxa: {len(cols)} collections listed")


if __name__ == "__main__":
    full = "--full" in sys.argv
    sites = fe.app_sites() + fe.EXTRA
    print("CSA");          csa(full)
    print("Copernicus");   copernicus(sites)
    print("ESA OSC");      esa_osc()
    print("JAXA");         jaxa()
