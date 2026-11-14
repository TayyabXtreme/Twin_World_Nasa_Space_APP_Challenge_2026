"""
Photos for the Earth-globe layers (field campaigns, launch sites, Deep Space Network, ISS) from the NASA Image
and Video Library API (images-api.nasa.gov), with each photo's NASA metadata for the credit line.

  assets-raw/photos/globe-places/<nasa_id>.jpg       original download (~large or ~medium), never shipped
  public/photos/places/<place>.webp                  card photo, 800 px wide
  public/photos/places/<place>-pin.webp              96 px round-pin thumbnail
  lib/data/globe-places-photos.generated.json        credit, title, date and source page per place

Usage: python -I scripts/fetch-globe-places.py
"""

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets-raw" / "photos" / "globe-places"
OUT = ROOT / "public" / "photos" / "places"
JSON_OUT = ROOT / "lib" / "data" / "globe-places-photos.generated.json"
sys.stdout.reconfigure(encoding="utf-8")

# place id (lib/data/globePlaces.ts) -> NASA id, plus a credit when the record names no photographer.
PHOTOS = {
    "hmp": ("ARC-2007-ACD07-0170-003", "NASA/Matt Deans"),
    "desert-rats": ("jsc2008e138809", None),
    "artemis2-iceland": ("jsc2024e055108", None),
    "pisces": ("iss072e421839", "NASA/JSC (ISS Expedition 72)"),
    "neemo": ("jsc2014e068003", "NASA/JSC"),
    "kennedy": ("KSC-20220421-PH-JBS01_0061", None),
    "baikonur": ("NHQ202309150023", None),
    "kourou": ("NHQ202112250015", None),
    "sriharikota": ("PIA26611", "ISRO, via NASA/JPL-Caltech"),
    "jiuquan": ("iss010e14586", "NASA/JSC (ISS Expedition 10)"),
    "tanegashima": ("201402280007HQ", None),
    "goldstone": ("PIA23214", None),
    "madrid": ("PIA25136", None),
    "canberra": ("PIA23682", None),
    "iss": ("iss056e201248", "NASA/JSC (ISS Expedition 56)"),
}


def get_json(url):
    return json.load(urllib.request.urlopen(url, timeout=90))


def metadata(nasa_id):
    m = get_json("https://images-api.nasa.gov/search?" + urllib.parse.urlencode({"nasa_id": nasa_id}))["collection"]["items"][0]["data"][0]
    return m


def best_href(nasa_id):
    hrefs = [i["href"] for i in get_json(f"https://images-api.nasa.gov/asset/{urllib.parse.quote(nasa_id)}")["collection"]["items"]]
    for tag in ("~large.jpg", "~medium.jpg", "~orig.jpg"):
        for h in hrefs:
            if h.endswith(tag):
                return h.replace("http://", "https://").replace(" ", "%20")
    raise ValueError(f"no jpg for {nasa_id}")


def credit_for(m, override):
    if override:
        return override
    who = (m.get("photographer") or m.get("secondary_creator") or "").strip()
    if not who:
        return f"NASA/{m.get('center', 'NASA')}"
    # Some records give the photographer in capitals ("ROBERT MARKOWITZ  NASA-JSC"); tidy that up.
    who = " ".join(who.replace("NASA-JSC", "").split())
    if who.isupper():
        who = who.title()
    return who if who.startswith("NASA") else f"NASA/{who}"


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    result = {}
    for place, (nid, override) in PHOTOS.items():
        m = metadata(nid)
        raw = RAW / f"{nid}.jpg"
        if not raw.exists():
            raw.write_bytes(urllib.request.urlopen(best_href(nid), timeout=180).read())
        im = Image.open(raw).convert("RGB")
        card = im.copy()
        if card.width > 800:
            card = card.resize((800, round(card.height * 800 / card.width)), Image.LANCZOS)
        card.save(OUT / f"{place}.webp", "WEBP", quality=78, method=6)
        s = min(im.size)
        thumb = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((96, 96), Image.LANCZOS)
        thumb.save(OUT / f"{place}-pin.webp", "WEBP", quality=72, method=6)
        result[place] = {
            "src": f"/photos/places/{place}.webp",
            "w": card.width,
            "h": card.height,
            "pin": f"/photos/places/{place}-pin.webp",
            "nasaId": nid,
            "title": m.get("title", "").strip(),
            "credit": credit_for(m, override),
            "date": (m.get("date_created") or "")[:10],
            "page": f"https://images.nasa.gov/details/{urllib.parse.quote(nid)}",
        }
        print(f"{place:18} {nid:30} {result[place]['credit']}")
    JSON_OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
    print(f"{len(result)} places, {total / 1024:.0f} KB -> {OUT.relative_to(ROOT)}")


main()
