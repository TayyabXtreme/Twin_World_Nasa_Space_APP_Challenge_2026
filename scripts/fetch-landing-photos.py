"""
Photos for the Moon and Mars "Exploration history" layer: one photo per landing (from the surface where one exists)
and, where LRO or Mars Reconnaissance Orbiter imaged the hardware, a second view of the landing site from orbit.

Sources: the NASA Image and Video Library API (images-api.nasa.gov) for the Apollo, Viking, Pathfinder, MER,
Phoenix, MSL, InSight and Mars 2020 photos and the HiRISE views; LROC featured-image pages (lroc.im-ldi.com,
NASA/GSFC/Arizona State University) for the LRO views of the Apollo, Luna, Chandrayaan-3 and SLIM landing
sites (most are not in the NASA library); NSSDCA for the Luna 9 surface image.

  assets-raw/photos/landings/<file>                original download, never shipped
  public/photos/landings/<id>.webp                 card photo, 800 px wide
  public/photos/landings/<id>-orbit.webp           orbital view of the site, 800 px wide (when there is one)
  public/photos/landings/<id>-pin.webp             96 px round-pin thumbnail (from the card photo)
  lib/data/landings-photos.generated.json          credit, title and source page per photo

Usage: python -I scripts/fetch-landing-photos.py
"""

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets-raw" / "photos" / "landings"
OUT = ROOT / "public" / "photos" / "landings"
JSON_OUT = ROOT / "lib" / "data" / "landings-photos.generated.json"
sys.stdout.reconfigure(encoding="utf-8")

LROC = "https://lroc.im-ldi.com"
LROC_CREDIT = "NASA/GSFC/Arizona State University (LRO LROC)"


def nasa(nid, credit=None, crop=None):
    """crop: (left, top, right, bottom) as fractions of the image, for panoramas and odd-shaped mosaics."""
    return {"kind": "nasa", "id": nid, "credit": credit, "crop": crop}


def lroc(page, path, title):
    return {"kind": "url", "url": LROC + path, "page": f"{LROC}/images/{page}", "title": title, "credit": LROC_CREDIT}


# landing id (lib/data/landings.ts) -> card photo, plus an optional view from orbit.
PHOTOS = {
    # ---- Moon ----
    "luna-9": {
        "photo": {
            "kind": "url",
            "url": "https://nssdc.gsfc.nasa.gov/planetary/lunar/luna9close_big.gif",
            "page": "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunarussr.html",
            "title": "Luna 9 close-up of the lunar surface, February 1966",
            "credit": "Lavochkin Association, via NASA NSSDCA",
        }
    },
    "apollo-11": {"photo": nasa("as11-40-5875", "NASA/Neil Armstrong"), "orbit": lroc(484, "/news/uploads/Apollo_11.png", "Apollo 11 site from 24 km (LROC NAC)")},
    "apollo-12": {"photo": nasa("AS12-48-7133", "NASA/JSC"), "orbit": lroc(401, "/news/uploads/M175428601RE_25cm_AP12_area.png", "Apollo 12 and Surveyor 3 from low orbit (LROC NAC)")},
    "luna-16": {"photo": nasa("PIA12984")},
    "luna-17": {"photo": nasa("PIA12967")},
    "apollo-14": {"photo": nasa("as14-66-09277", "NASA/JSC"), "orbit": lroc(363, "/news/uploads/ap14_lm_closeup.png", "Apollo 14 descent stage from low orbit (LROC NAC)")},
    "apollo-15": {"photo": nasa("as15-86-11602", "NASA/David Scott"), "orbit": lroc(491, "/news/uploads/M175252641LR_ap15.png", "Apollo 15 site and rover tracks (LROC NAC)")},
    "luna-20": {"photo": nasa("PIA12960")},
    "apollo-16": {"photo": nasa("as16-113-18339", "NASA/Charles Duke"), "orbit": lroc(199, "/news/uploads/LROCiotw/M116215423ME.bwmos.png", "Apollo 16 site under a high Sun (LROC NAC)")},
    "apollo-17": {"photo": nasa("AS17-134-20384", "NASA/Eugene Cernan"), "orbit": lroc(379, "/news/uploads/ap17_lm_25cm.png", "Apollo 17 descent stage at 25 cm per pixel (LROC NAC)")},
    "luna-21": {"photo": nasa("PIA12976")},
    "luna-24": {"photo": lroc(461, "/news/uploads/LROCiotw/luna24_rev_fig.png", "Luna 24 lander from low altitude (LROC NAC)")},
    "chandrayaan-3": {"photo": lroc(1314, "/ckeditor_assets/pictures/1348/content_M1447750764_LRmos.warp.1100px1100p.clean.png", "Chandrayaan-3 landing site (LROC NAC)")},
    "slim": {"photo": lroc(1358, "/ckeditor_assets/pictures/1421/content_Fig03_SLIM_Crop_Ratio_1100x1100.png", "JAXA SLIM on the slope of Shioli crater (LROC NAC)")},
    # ---- Mars ----
    "viking-1": {"photo": nasa("PIA00563")},
    "viking-2": {"photo": nasa("PIA00568")},
    "pathfinder": {"photo": nasa("PIA01121")},
    "spirit": {"photo": nasa("PIA04995", crop=(0.045, 0.01, 0.945, 0.7))},
    "opportunity": {"photo": nasa("PIA05618", crop=(0.288, 0.085, 0.488, 0.935)), "orbit": nasa("PIA21494")},  # tracks back to the lander in Eagle crater
    "phoenix": {"photo": nasa("PIA12105"), "orbit": nasa("PIA10701")},
    "curiosity": {"photo": nasa("PIA19808"), "orbit": nasa("PIA21710")},
    "insight": {"photo": nasa("PIA23203"), "orbit": nasa("PIA23376")},
    "perseverance": {"photo": nasa("PIA24542"), "orbit": nasa("PIA24333")},
}


def get_json(url):
    return json.load(urllib.request.urlopen(url, timeout=90))


def metadata(nasa_id):
    return get_json("https://images-api.nasa.gov/search?" + urllib.parse.urlencode({"nasa_id": nasa_id}))["collection"]["items"][0]["data"][0]


def best_href(nasa_id):
    hrefs = [i["href"] for i in get_json(f"https://images-api.nasa.gov/asset/{urllib.parse.quote(nasa_id)}")["collection"]["items"]]
    for tag in ("~large.jpg", "~medium.jpg", "~orig.jpg", "~large.png", "~orig.png"):
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
    who = " ".join(who.replace("NASA-JSC", "").split())
    if who.isupper() and "/" not in who:  # "NASA/JPL" stays as it is
        who = who.title()
    return who if who.startswith("NASA") else f"NASA/{who}"


def fetch(spec):
    """Download one photo (cached in assets-raw) and return (PIL image, metadata for the JSON)."""
    if spec["kind"] == "nasa":
        nid = spec["id"]
        m = metadata(nid)
        raw = RAW / f"{nid}.jpg"
        if not raw.exists():
            raw.write_bytes(urllib.request.urlopen(best_href(nid), timeout=180).read())
        info = {
            "title": m.get("title", "").strip(),
            "credit": credit_for(m, spec["credit"]),
            "page": f"https://images.nasa.gov/details/{urllib.parse.quote(nid)}",
            "nasaId": nid,
        }
    else:
        raw = RAW / Path(urllib.parse.urlparse(spec["url"]).path).name
        if not raw.exists():
            req = urllib.request.Request(spec["url"], headers={"User-Agent": "TwinWorlds/1.0 (NASA Space Apps)"})
            raw.write_bytes(urllib.request.urlopen(req, timeout=180).read())
        info = {"title": spec["title"], "credit": spec["credit"], "page": spec["page"]}
    im = Image.open(raw)
    im.seek(0)
    im = im.convert("RGB")
    if spec.get("crop"):
        l, t, r, b = spec["crop"]
        im = im.crop((round(l * im.width), round(t * im.height), round(r * im.width), round(b * im.height)))
    return im, info


def save_card(im, path):
    card = im.copy()
    if card.width > 800:
        card = card.resize((800, round(card.height * 800 / card.width)), Image.LANCZOS)
    card.save(path, "WEBP", quality=78, method=6)
    return card.width, card.height


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    result = {}
    for lid, specs in PHOTOS.items():
        entry = {}
        im, info = fetch(specs["photo"])
        w, h = save_card(im, OUT / f"{lid}.webp")
        s = min(im.size)
        thumb = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((96, 96), Image.LANCZOS)
        thumb.save(OUT / f"{lid}-pin.webp", "WEBP", quality=72, method=6)
        entry["photo"] = {"src": f"/photos/landings/{lid}.webp", "w": w, "h": h, "pin": f"/photos/landings/{lid}-pin.webp", **info}
        if "orbit" in specs:
            oim, oinfo = fetch(specs["orbit"])
            ow, oh = save_card(oim, OUT / f"{lid}-orbit.webp")
            entry["orbit"] = {"src": f"/photos/landings/{lid}-orbit.webp", "w": ow, "h": oh, **oinfo}
        result[lid] = entry
        print(f"{lid:15} {entry['photo']['credit'][:44]:44} {'+ orbit' if 'orbit' in entry else ''}")
    JSON_OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
    print(f"{len(result)} landings, {total / 1024:.0f} KB -> {OUT.relative_to(ROOT)}")


main()
