"""Download the NASA Image Library photos used by the Mission Challenge games.

Mars rover and Apollo surface photos for "Earth or Elsewhere?", field photos from Earth analogue sites, and one
picture per game card. Each photo is saved with its NASA metadata (title, centre, date, photographer, description).

Usage: python -I scripts/fetch-challenge-photos.py          -> assets-raw/photos/challenge/
Then:  node scripts/build-assets.mjs photos  (or the conversion step in scripts/build-challenge.mjs)
"""

import json
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets-raw" / "photos" / "challenge"

IDS = [
    # Mars surface (rovers)
    "PIA21043", "PIA19083", "PIA21851", "PIA26247", "PIA20281", "PIA19109", "PIA03274", "PIA25212", "PIA26373",
    "PIA24626", "PIA26559",
    # Moon surface (Apollo)
    "as15-85-11425", "as15-89-12100", "as16-114-18421", "as17-137-20989", "as12-48-7121", "as16-114-18412",
    # Earth analogue field photos
    "ARC-2007-ACD07-0170-001", "ARC-2007-ACD07-0170-004", "ARC-2007-ACD07-0170-006",
    # Game cards
    "NHQ202211160030", "PIA24542", "as16-107-17436",
]


def get_json(url):
    return json.load(urllib.request.urlopen(url, timeout=90))


def best_href(nasa_id):
    hrefs = [i["href"] for i in get_json(f"https://images-api.nasa.gov/asset/{urllib.parse.quote(nasa_id)}")["collection"]["items"]]
    for tag in ("~large.jpg", "~medium.jpg", "~orig.jpg"):
        for h in hrefs:
            if h.endswith(tag):
                return h.replace("http://", "https://")
    raise ValueError(f"no jpg for {nasa_id}")


def metadata(nasa_id):
    d = get_json("https://images-api.nasa.gov/search?" + urllib.parse.urlencode({"nasa_id": nasa_id}))
    m = d["collection"]["items"][0]["data"][0]
    return {k: m.get(k) for k in ("nasa_id", "title", "center", "date_created", "photographer", "secondary_creator", "description")}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for nid in IDS:
        dest = OUT / f"{nid}.jpg"
        try:
            m = metadata(nid)
            m["source_page"] = f"https://images.nasa.gov/details/{nid}"
            if not dest.exists():
                href = best_href(nid)
                m["downloaded_url"] = href
                dest.write_bytes(urllib.request.urlopen(href, timeout=180).read())
            meta[nid] = m
            print(f"ok   {nid:28s} {dest.stat().st_size // 1024:>6} kB  {m['title'][:60]}")
        except Exception as e:  # keep going; report at the end
            print(f"FAIL {nid}: {e}")
    (OUT / "metadata.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
