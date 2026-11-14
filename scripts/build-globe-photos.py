"""
Globe photo pins: card-size WebP views and small round-pin thumbnails for every Earth site on the 3D globe.
Output: public/photos/globe/*.webp and lib/data/globe-photos.generated.json.

Sources (all read-only):
  assets-raw/nasa/earth/worldview          NASA Worldview (GIBS) MODIS true-colour snapshots, 768 px
  assets-raw/nasa/partners/copernicus      Copernicus Sentinel-2 L2A and Sentinel-1 GRD quicklooks
  public/photos                            ground and orbit photos already used by the site cards

A few views are left out on purpose: they would mislead more than help (see SKIP).

Usage: python -I scripts/build-globe-photos.py
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WV = ROOT / "assets-raw" / "nasa" / "earth" / "worldview"
COP = ROOT / "assets-raw" / "nasa" / "partners" / "copernicus"
OUT = ROOT / "public" / "photos" / "globe"
JSON_OUT = ROOT / "lib" / "data" / "globe-photos.generated.json"
OUT.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding="utf-8")

# Site id (lib/data/sites.ts) -> raw folder name, and the image the round pin is cut from.
SITES = {
    "earth-atacama": ("atacama", "public/photos/twins/atacama_desert.webp"),
    "earth-mcmurdo": ("mcmurdo", "public/photos/twins-nasa/mcmurdo_dry_valleys_orbit.webp"),
    "earth-askja": ("askja", "public/photos/twins-nasa/iceland_artemis2_geology_training.webp"),
    "earth-death-valley": ("death-valley", "public/photos/twins-nasa/death_valley_badwater.webp"),
    "earth-pilot-valley": ("pilot-valley", "public/photos/twins-nasa/pilot_valley_bonneville_orbit.webp"),
    "earth-kilauea": ("kilauea", "public/photos/twins-nasa/kilauea_ris4e_fieldwork.webp"),
    "earth-medicine-lake": ("medicine-lake", "public/photos/twins-nasa/medicine_lake_field_geology.webp"),
    "earth-hingol": ("hingol-mud-volcanoes", "public/photos/challenge/earth-hingol.webp"),
    "earth-cholistan": ("cholistan-desert", "s2"),
    "earth-thar": ("tharparkar", "s2"),
    "earth-khewra": ("khewra-salt-range", "s2"),
    # Added 2026-11-14 (headline photos from scripts/build-site-photos.mjs). Raw orbital folders exist for some;
    # the rest get a pin only. Deception Island has no usable photo, so it has no pin photo.
    "earth-devon-haughton": ("devon-island-haughton", "public/photos/sites-earth/devon-haughton.webp"),
    "earth-mauna-kea": ("mauna-kea", "public/photos/sites-earth/mauna-kea.webp"),
    "earth-craters-of-the-moon": ("craters-of-the-moon", "public/photos/sites-earth/craters-of-the-moon.webp"),
    "earth-meteor-crater": ("meteor-crater", "public/photos/sites-earth/meteor-crater.webp"),
    "earth-black-point": ("black-point", "public/photos/sites-earth/black-point.webp"),
    "earth-mdrs": ("mdrs", "public/photos/sites-earth/mdrs.webp"),
    "earth-svalbard-bockfjorden": ("svalbard-bockfjorden", "public/photos/sites-earth/svalbard-bockfjorden.webp"),
    "earth-dome-c": ("dome-c", "public/photos/sites-earth/dome-c.webp"),
    "earth-rio-tinto": ("rio-tinto", "public/photos/sites-earth/rio-tinto.webp"),
    "earth-lanzarote": ("lanzarote", "public/photos/sites-earth/lanzarote.webp"),
    "earth-teide": ("teide", "public/photos/sites-earth/teide.webp"),
    "earth-dallol": ("dallol-danakil", "public/photos/sites-earth/dallol.webp"),
    "earth-namib": ("namib", "public/photos/sites-earth/namib.webp"),
    "earth-uyuni": ("salar-de-uyuni", "public/photos/sites-earth/uyuni.webp"),
    "earth-ladakh": ("ladakh", "public/photos/sites-earth/ladakh.webp"),
    "earth-pilbara": ("pilbara", "public/photos/sites-earth/pilbara.webp"),
    "earth-wadi-rum": ("wadi-rum", "public/photos/sites-earth/wadi-rum.webp"),
    "earth-victoria-land": ("victoria-land", "public/photos/sites-earth/victoria-land.webp"),
}

# Views that would mislead: Sentinel-2 tiles that are mostly snow glare or no-data wedges, and July MODIS
# snapshots of Pakistan that show monsoon haze instead of ground.
SKIP = {
    "s2": {"mcmurdo", "askja", "pilot-valley", "kilauea"},
    "wv": {"hingol-mud-volcanoes", "cholistan-desert", "khewra-salt-range"},
}


def crop_no_data(im: Image.Image) -> Image.Image:
    """Trim the black padding and diagonal no-data wedges Copernicus leaves in quicklooks."""
    valid = np.asarray(im.convert("L")) > 8
    t, b, l, r = 0, valid.shape[0], 0, valid.shape[1]
    # Peel off whichever edge has the most no-data until every edge is at least 98% valid.
    while b - t > 32 and r - l > 32:
        edges = {
            "t": valid[t, l:r].mean(),
            "b": valid[b - 1, l:r].mean(),
            "l": valid[t:b, l].mean(),
            "r": valid[t:b, r - 1].mean(),
        }
        side, worst = min(edges.items(), key=lambda kv: kv[1])
        if worst >= 0.98:
            break
        if side == "t":
            t += 1
        elif side == "b":
            b -= 1
        elif side == "l":
            l += 1
        else:
            r -= 1
    return im.crop((l, t, r, b))


def save(im: Image.Image, name: str, max_w: int, quality: int) -> dict:
    im = im.convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(OUT / name, "WEBP", quality=quality, method=6)
    return {"src": f"/photos/globe/{name}", "w": im.width, "h": im.height}


def pin(src: Path, name: str, size=96) -> str:
    im = Image.open(src).convert("RGB")
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2))
    im.resize((size, size), Image.LANCZOS).save(OUT / name, "WEBP", quality=72, method=6)
    return f"/photos/globe/{name}"


def main():
    wv_manifest = json.loads((WV / "manifest.json").read_text(encoding="utf-8"))
    wv_dates = {e["site"]: e["date"] for e in wv_manifest if "TrueColor" in e["layer"]}
    scenes = json.loads((COP / "scenes-by-site.json").read_text(encoding="utf-8"))

    result = {}
    for site_id, (key, pin_src) in SITES.items():
        views = []
        scene = scenes.get(key, {})
        s2 = COP / key / "sentinel-2-l2a-quicklook.jpg"
        if s2.exists() and key not in SKIP["s2"]:
            meta = scene["sentinel-2-l2a"]
            v = save(crop_no_data(Image.open(s2)), f"{key}-s2.webp", 640, 82)
            # Compare and the Finder show a site's headline image as a small thumbnail (<src>.thumb.webp).
            Image.open(OUT / f"{key}-s2.webp").resize((360, round(v["h"] * 360 / v["w"])), Image.LANCZOS).save(OUT / f"{key}-s2.thumb.webp", "WEBP", quality=72, method=6)
            views.append({"kind": "s2", **v, "date": meta["date"][:10], "scene": meta["name"].removesuffix(".SAFE")})
        wv = WV / key / "true-colour.jpg"
        if wv.exists() and key not in SKIP["wv"]:
            v = save(Image.open(wv), f"{key}-wv.webp", 640, 78)
            views.append({"kind": "wv", **v, "date": wv_dates[key]})
        s1 = COP / key / "sentinel-1-grd-quicklook.jpg"
        if s1.exists():
            meta = scene["sentinel-1-grd"]
            v = save(crop_no_data(Image.open(s1)), f"{key}-s1.webp", 640, 80)
            views.append({"kind": "s1", **v, "date": meta["date"][:10], "scene": meta["name"].removesuffix(".SAFE")})

        pin_path = OUT / f"{key}-s2.webp" if pin_src == "s2" else ROOT / pin_src
        result[site_id] = {"pin": pin(pin_path, f"{key}-pin.webp"), "views": views}
        print(f"{site_id:22} pin + {', '.join(v['kind'] for v in views)}")

    JSON_OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
    print(f"{len(list(OUT.glob('*.webp')))} files, {total / 1024:.0f} KB -> {OUT.relative_to(ROOT)}")


main()
