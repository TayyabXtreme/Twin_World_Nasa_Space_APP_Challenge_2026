"""Download NASA Image Library photos for the Earth analogue sites added to Compare (2026-11-14).

Usage: python -I scripts/fetch-site-photos.py   -> assets-raw/photos/sites-earth/<nasa_id>.jpg + metadata.json
Then:  node scripts/build-site-photos.mjs       (crops and converts them into public/photos/sites-earth/)
"""

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets-raw" / "photos" / "sites-earth"

IDS = [
    "iss074e0208832",  # Meteor Crater from the ISS
    "PIA03212",  # Barringer Meteor Crater (ASTER)
    "PIA13365",  # Rio Tinto, Spain (ASTER)
    "PIA23526",  # Lanzarote (ASTER)
    "PIA01779",  # Teide radar image (SIR-C)
    "iss013e23272",  # Tenerife from the ISS (candidate)
    "PIA17632",  # Namib Desert (ASTER)
    "iss074e0319935",  # Salar de Uyuni from the ISS
    "PIA25122",  # Pilbara (ASTER)
    "PIA23551",  # Researching outback stromatolites
    "GSFC_20171208_Archive_e001903",  # Wadi Rum
    "iss029e041836",  # Deception Island (candidate)
    "PIA24048",  # Testing RIMFAX on Svalbard
]


def get_json(url):
    return json.load(urllib.request.urlopen(url, timeout=120))


def best_href(nasa_id):
    hrefs = [i["href"] for i in get_json(f"https://images-api.nasa.gov/asset/{urllib.parse.quote(nasa_id)}")["collection"]["items"]]
    for tag in ("~large.jpg", "~medium.jpg", "~orig.jpg"):
        for h in hrefs:
            if h.endswith(tag):
                return h.replace("http://", "https://")
    raise ValueError(f"no jpg for {nasa_id}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    meta_path = OUT / "metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    for nid in IDS:
        dest = OUT / f"{nid}.jpg"
        try:
            if nid not in meta:
                d = get_json("https://images-api.nasa.gov/search?" + urllib.parse.urlencode({"nasa_id": nid}))["collection"]["items"][0]["data"][0]
                meta[nid] = {k: d.get(k) for k in ("nasa_id", "title", "center", "date_created", "photographer", "secondary_creator", "description")}
                meta[nid]["source_page"] = f"https://images.nasa.gov/details/{nid}"
            if not dest.exists():
                dest.write_bytes(urllib.request.urlopen(best_href(nid), timeout=300).read())
            print(f"ok   {nid:32s} {dest.stat().st_size // 1024:>6} kB  {meta[nid]['title'][:56]}")
        except Exception as e:
            print(f"FAIL {nid}: {e}")
    meta_path.write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
