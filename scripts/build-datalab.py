"""
Data Lab previews: small WebP thumbnails of every dataset TwinWorlds uses, plus the measured size of each raw
dataset, for the /data page. Output: public/data/datalab/*.webp and public/data/datalab/manifest.json.

Sources (all read-only):
  assets-raw/nasa/moon, mars           PDS rasters, rendered here at thumbnail size
  assets-raw/nasa/_previews            previews made by scripts/preview-nasa.py
  assets-raw/nasa/earth                Worldview snapshots and Earthdata global HDF grids (pyhdf)
  assets-raw/nasa/partners             Copernicus quicklooks and CSA RCM product previews
  assets-raw/textures                  LOLA / MOLA heightmaps already used by the globe

The two large Moon files (Diviner polar resource table, Mini-RF CPR mosaic) are only rendered once they are
complete, i.e. once their size on disk equals the size their PDS label promises (RECORD_BYTES x FILE_RECORDS).

Usage: python -I scripts/build-datalab.py
"""

import json
import re
import sys
import warnings
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NASA = ROOT / "assets-raw" / "nasa"
TEX = ROOT / "assets-raw" / "textures"
OUT = ROOT / "public" / "data" / "datalab"
OUT.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding="utf-8")

MAX_BYTES = 150_000
IMAGES: dict = {}

# Colour ramps (dark → bright). Viridis-like for generic values, thermal for temperatures, earthy for NDVI.
VIRIDIS = [(68, 1, 84), (59, 82, 139), (33, 145, 140), (94, 201, 98), (253, 231, 37)]
THERMAL = [(10, 20, 80), (40, 90, 200), (90, 200, 220), (250, 220, 90), (230, 70, 40)]
NDVI = [(120, 90, 60), (190, 160, 110), (200, 200, 120), (90, 170, 80), (20, 100, 40)]
TERRAIN = [(30, 40, 90), (40, 110, 160), (120, 180, 150), (220, 210, 150), (250, 245, 235)]
GREY = [(15, 18, 28), (250, 250, 255)]
MAGMA = [(10, 8, 30), (80, 20, 110), (180, 50, 100), (250, 130, 70), (252, 240, 170)]


def ramp(v, stops, lo, hi):
    """Map a 2-D array to RGBA with a piecewise-linear ramp; NaN becomes transparent."""
    nan = np.isnan(v)
    t = np.clip(np.nan_to_num((v - lo) / (hi - lo)), 0, 1)
    seg = len(stops) - 1
    idx = np.minimum((t * seg).astype(int), seg - 1)
    f = (t * seg - idx)[..., None]
    a = np.array(stops, dtype=float)
    rgb = a[idx] * (1 - f) + a[idx + 1] * f
    alpha = np.where(nan, 0, 255)[..., None]
    return np.concatenate([np.nan_to_num(rgb), alpha], axis=-1).astype(np.uint8)


def block_mean(a, k):
    """Average k×k blocks, ignoring NaN (cheap, alias-free downsampling)."""
    h, w = (a.shape[0] // k) * k, (a.shape[1] // k) * k
    b = a[:h, :w].reshape(h // k, k, w // k, k)
    with np.errstate(invalid="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(b, axis=(1, 3))


def hillshade(z, px_m, az=315, alt=35):
    gy, gx = np.gradient(np.nan_to_num(z, nan=np.nanmean(z)), px_m)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    a, e = np.radians(az), np.radians(alt)
    hs = np.sin(e) * np.cos(slope) + np.cos(e) * np.sin(slope) * np.cos(a - aspect)
    return np.clip(hs, 0, 1)


def save_webp(im: Image.Image, name: str, max_w=640, quality=74, caption=""):
    """Resize to max_w and write WebP, lowering quality until the file fits the 150 KB budget."""
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    path = OUT / name
    q = quality
    while True:
        im.save(path, "WEBP", quality=q, method=6)
        if path.stat().st_size <= MAX_BYTES or q <= 40:
            break
        q -= 6
    IMAGES[name] = {"w": im.width, "h": im.height, "bytes": path.stat().st_size, "caption": caption}
    print(f"  {name:44s} {im.width}x{im.height}  {path.stat().st_size / 1024:6.1f} KB  q{q}")


def on_dark(rgba: np.ndarray) -> Image.Image:
    """Flatten transparent (no-data) pixels onto the site's deep-space colour, so thumbnails read as maps."""
    im = Image.fromarray(rgba, "RGBA")
    bg = Image.new("RGBA", im.size, (14, 17, 28, 255))
    return Image.alpha_composite(bg, im).convert("RGB")


def pds3(lbl: Path):
    text = lbl.read_text(encoding="latin-1")

    def kw(name, cast=str, default=None):
        m = re.search(rf"^\s*{name}\s*=\s*\"?([^\"\r\n<]+?)\"?\s*(<[^>]*>)?\s*$", text, re.M)
        return cast(m.group(1).strip()) if m else default

    return {
        "lines": kw("LINES", int),
        "samples": kw("LINE_SAMPLES", int),
        "type": kw("SAMPLE_TYPE", str, ""),
        "bits": kw("SAMPLE_BITS", int, 16),
        "scale": kw("SCALING_FACTOR", float, 1.0),
        "offset": kw("OFFSET", float, 0.0),
        "record_bytes": kw("RECORD_BYTES", int),
        "file_records": kw("FILE_RECORDS", int),
    }


def read_img(img: Path, lab: dict):
    t = lab["type"].upper()
    if "REAL" in t:
        dt = ">f4" if ("MSB" in t or "SUN" in t or t == "IEEE_REAL") else "<f4"
    else:
        dt = (">" if ("MSB" in t or "SUN" in t) else "<") + ("u" if "UNSIGNED" in t else "i") + str(lab["bits"] // 8)
    return np.memmap(img, dtype=dt, mode="r", shape=(lab["lines"], lab["samples"]))


def mosaic(paths, cols, cell=240, gap=4):
    ims = [Image.open(p).convert("RGB") for p in paths]
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell + (cols - 1) * gap, rows * cell + (rows - 1) * gap), (14, 17, 28))
    for i, im in enumerate(ims):
        s = min(im.size)
        im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((cell, cell), Image.LANCZOS)
        sheet.paste(im, ((i % cols) * (cell + gap), (i // cols) * (cell + gap)))
    return sheet


def square_thumb(path: Path, name: str, size=220, quality=68, caption=""):
    im = Image.open(path).convert("RGB")
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((size, size), Image.LANCZOS)
    save_webp(im, name, max_w=size, quality=quality, caption=caption)


# ---------------------------------------------------------------- Moon

def moon():
    print("Moon")
    d = NASA / "moon" / "lola-south-pole"
    lab = pds3(d / "ldem_75s_240m.lbl")
    z = block_mean(np.asarray(read_img(d / "ldem_75s_240m.img", lab), dtype=np.float32) * lab["scale"], 6)
    hs = hillshade(z, 240 * 6)
    lo, hi = np.nanpercentile(z, [2, 98])
    rgb = ramp(z, TERRAIN, lo, hi)[..., :3].astype(float) * (0.35 + 0.65 * hs[..., None])
    save_webp(Image.fromarray(rgb.clip(0, 255).astype(np.uint8)), "moon-lola-dem-south.webp", 560,
              caption="LOLA elevation 75°S–90°S, hill-shaded (south pole at centre)")

    lab = pds3(d / "ldsm_75s_240m.lbl")
    s = block_mean(np.asarray(read_img(d / "ldsm_75s_240m.img", lab), dtype=np.float32) * lab["scale"] + lab["offset"], 6)
    save_webp(on_dark(ramp(s, MAGMA, 0, 30)), "moon-lola-slope-south.webp", 560, caption="LOLA slope 75°S–90°S, 0° (dark) to 30°+ (bright)")

    g = NASA / "moon" / "diviner" / "global-maps"
    for key, fname, stops, rng, cap in [
        ("rock", "dgdr_ra_avg_cyl_032_img", MAGMA, None, "Diviner rock abundance, 60°N–60°S (bright = more rock cover)"),
        ("regolith", "dgdr_st_avg_cyl_032_img", THERMAL, None, "Diviner night-time regolith temperature anomaly, 60°N–60°S"),
    ]:
        lab = pds3(g / f"{fname}.lbl")
        a = np.asarray(read_img(g / f"{fname}.img", lab)[::4, ::4], dtype=np.float32)
        a[a == -32768] = np.nan
        a = a * lab["scale"] + lab["offset"]
        a = block_mean(a, 4)
        lo, hi = np.nanpercentile(a, [2, 98])
        save_webp(on_dark(ramp(a, stops, lo, hi)), f"moon-diviner-{key}.webp", 720, caption=cap)

    h = np.asarray(Image.open(TEX / "moon-kit" / "moon_height_2k.png").convert("L"), dtype=np.float32)
    hs = hillshade(h, 30.0)
    rgb = ramp(h, TERRAIN, *np.percentile(h, [1, 99]))[..., :3].astype(float) * (0.4 + 0.6 * hs[..., None])
    save_webp(Image.fromarray(rgb.clip(0, 255).astype(np.uint8)), "moon-lola-global.webp", 640, caption="LOLA global elevation (16 px/°), hill-shaded")


def complete(img: Path, lbl: Path, header_records=0) -> bool:
    lab = pds3(lbl)
    want = lab["record_bytes"] * (lab["file_records"] + header_records)
    return img.exists() and img.stat().st_size == want


def moon_prp():
    """Ice stability depth from the Diviner polar resource table, drawn on the table's own polar x/y grid.
    The table is fixed-width (210-byte records after a 210-byte header), so columns are sliced straight from a
    memory map instead of parsing 605 MB of text line by line."""
    d = NASA / "moon" / "diviner" / "polar-resource"
    tab, lbl = d / "dlre_prp_south.tab", d / "dlre_prp_south.lbl"
    if not complete(tab, lbl, header_records=1):
        print("  Diviner PRP: not complete yet, skipped")
        return None
    rec = pds3(lbl)["record_bytes"]
    raw = np.memmap(tab, dtype=np.uint8, mode="r", offset=rec, shape=(pds3(lbl)["file_records"], rec))
    head = tab.open("rb").read(rec).decode("ascii")
    ends = [i for i, c in enumerate(head) if c == ","] + [len(head.rstrip())]
    starts = [0] + [e + 1 for e in ends[:-1]]
    names = [n.strip() for n in head.split(",")]

    def col(name):
        i = names.index(name)
        s, e = starts[i], ends[i]
        return np.ascontiguousarray(raw[:, s:e]).view(f"S{e - s}").ravel().astype(np.float64)

    lat, tmax, ice = col("tri_clat"), col("temp_max"), col("ice_depth")
    # Facet centres in the table's own polar x/y (km). The product is a ~600 km square around the pole, so its
    # corners reach the northernmost latitude in the table. Drawn with 0° longitude up and 90°E to the right.
    cx = (col("tri1_x") + col("tri2_x") + col("tri3_x")) / 3
    cy = (col("tri1_y") + col("tri2_y") + col("tri3_y")) / 3
    half = float(max(np.abs(cx).max(), np.abs(cy).max()))
    n = 560
    px = np.clip(((cy + half) / (2 * half) * n).astype(int), 0, n - 1)
    py = np.clip(((half - cx) / (2 * half) * n).astype(int), 0, n - 1)
    idx = py * n + px
    seen = np.bincount(idx, minlength=n * n) > 0
    # ice_depth ≥ 0: depth of stable ice (m). −999: none within the model's 2.8738 m. −1: not documented in the
    # label; it occurs only on the coldest ground, so it gets its own colour instead of being read as a depth.
    valid = ice >= 0
    cnt = np.bincount(idx[valid], minlength=n * n)
    tot = np.bincount(idx[valid], weights=ice[valid], minlength=n * n)
    flag = np.bincount(idx[ice == -1], minlength=n * n)
    depth = np.where(cnt > 0, tot / np.maximum(cnt, 1), np.nan).reshape(n, n)
    rgba = ramp(-depth, [(20, 40, 110), (40, 120, 200), (120, 220, 240), (235, 252, 255)], -1.5, 0).reshape(-1, 4)
    rgba[np.isnan(depth.ravel()) & seen] = (38, 42, 56, 255)
    rgba[(flag > cnt) & seen] = (200, 160, 255, 255)
    save_webp(on_dark(rgba.reshape(n, n, 4)), "moon-diviner-prp-ice.webp", 560,
              caption="Diviner ice stability depth: white = ice stable at the surface, blue = deeper, grey = none within 2.87 m, violet = −1 flag")
    stats = {
        "facets": int(lat.size),
        "lat_edge": round(float(lat.max()), 2),
        "half_width_km": round(half, 1),
        "share_flag_minus_1": round(float((ice == -1).mean()), 4),
        "flag_minus_1_tmax_median_K": round(float(np.median(tmax[ice == -1])), 1),
        "share_ice_within_model_depth": round(float(valid.mean()), 4),
        "share_ice_at_surface": round(float((ice == 0).mean()), 4),
        "share_tmax_below_110K": round(float((tmax < 110).mean()), 4),
        "edge_km_median": round(float(np.median(np.hypot(col("tri1_x") - col("tri2_x"), col("tri1_y") - col("tri2_y")))), 3),
    }
    print(f"  PRP stats {stats}")
    return stats


def moon_minirf():
    d = NASA / "moon" / "minirf"
    img, lbl = d / "global_cpr_32ppd_simp_0c.img", d / "global_cpr_32ppd_simp_0c.lbl"
    if not complete(img, lbl):
        print("  Mini-RF CPR: not complete yet, skipped")
        return None
    lab = pds3(lbl)
    a = np.asarray(read_img(img, lab)[::8, ::8], dtype=np.float64)
    a[(a < -1e30) | (a <= 0) | ~np.isfinite(a)] = np.nan
    cover = float(np.isfinite(a).mean())
    a = block_mean(a, 2)
    save_webp(on_dark(ramp(a, VIRIDIS, 0.1, 1.2)), "moon-minirf-cpr.webp", 640, caption="Mini-RF CPR, global: bright = high CPR (rough ground or possible ice)")
    stats = {"valid_share": round(cover, 4), "median": round(float(np.nanmedian(a)), 3)}
    print(f"  Mini-RF stats {stats}")
    return stats


# ---------------------------------------------------------------- Mars

def roll_half(path: Path) -> Image.Image:
    """preview-nasa.py draws GRS / neutron maps 0°–360°E; roll them to −180°…180° like the other maps."""
    im = Image.open(path).convert("RGBA")
    a = np.roll(np.asarray(im), im.width // 2, axis=1)
    return on_dark(a)


def mars():
    print("Mars")
    p = NASA / "_previews"
    save_webp(roll_half(p / "mars-grs-water-wt-percent.png"), "mars-grs-water.webp", 640, caption="GRS water-equivalent hydrogen, 0–12 wt % (poles masked)")
    save_webp(roll_half(p / "mars-neutron-hydrogen-epithermal.png"), "mars-neutron-epithermal.webp", 640,
              caption="Neutron spectrometer epithermal flux, inverted: bright = fewer neutrons = more hydrogen")
    save_webp(on_dark(np.asarray(Image.open(p / "mars-tes-thermal-inertia-night.png").convert("RGBA"))), "mars-tes-thermal-inertia.webp", 640,
              caption="TES night-time thermal inertia, 30 (dust) to 600 (rock / ice-cemented)")

    # GRS chlorine, rendered here on −180…180 (5° bins, smoothed upscale like the water map).
    rows = np.loadtxt(NASA / "mars" / "odyssey-grs" / "cl_sr_5x5.tab", usecols=(0, 1, 2))
    grid = np.full((36, 72), np.nan)
    for lat, lon, v in rows:
        if v < 9000:
            grid[int((90 - lat) // 5), int(((lon + 180) % 360) // 5)] = v
    up = np.array(Image.fromarray(np.nan_to_num(grid, nan=-1).astype(np.float32), "F").resize((720, 360), Image.BICUBIC))
    up[up < 0] = np.nan
    save_webp(on_dark(ramp(up, VIRIDIS, *np.nanpercentile(grid, [2, 98]))), "mars-grs-chlorine.webp", 640, caption="GRS chlorine concentration (one of five element maps)")

    h = np.asarray(Image.open(TEX / "mars-mola" / "mars_height_2k.png").convert("L"), dtype=np.float32)
    hs = hillshade(h, 30.0)
    rgb = ramp(h, TERRAIN, *np.percentile(h, [1, 99.5]))[..., :3].astype(float) * (0.4 + 0.6 * hs[..., None])
    save_webp(Image.fromarray(rgb.clip(0, 255).astype(np.uint8)), "mars-mola.webp", 640, caption="MOLA global elevation (16 px/°), hill-shaded")


# ---------------------------------------------------------------- Earth

def hdf(path: Path, sds: str):
    from pyhdf.SD import SD, SDC

    f = SD(str(path), SDC.READ)
    ds = f.select(sds)
    attrs = ds.attributes()
    a = ds[::5, ::5].astype(np.float32)
    f.end()
    return a, attrs


def earth_global():
    print("Earth global grids")
    gl = NASA / "earth" / "earthdata" / "global"
    jul = sorted((gl / "MOD11C3").glob("MOD11C3.A2024183*.hdf"))
    if jul:
        a, at = hdf(jul[0], "LST_Day_CMG")
        a[a == at.get("_FillValue", 0)] = np.nan
        a = block_mean(a * float(at.get("scale_factor", 0.02)), 2) - 273.15
        save_webp(on_dark(ramp(a, THERMAL, -30, 55)), "earth-modis-lst-monthly.webp", 640, caption="MOD11C3 daytime land-surface temperature, July 2024, −30 °C to 55 °C")
    ndvi = sorted((gl / "MOD13C2").glob("MOD13C2.A2024183*.hdf"))
    if ndvi:
        a, at = hdf(ndvi[0], "CMG 0.05 Deg Monthly NDVI")
        a[a <= -3000] = np.nan
        a = block_mean(a / 10000.0, 2)
        save_webp(on_dark(ramp(a, NDVI, -0.05, 0.85)), "earth-modis-ndvi-monthly.webp", 640, caption="MOD13C2 NDVI, July 2024: brown = bare ground, green = dense plants")
    alb = sorted((gl / "MCD43C3").glob("MCD43C3.A2024008*.hdf"))
    if alb:
        a, at = hdf(alb[0], "Albedo_WSA_shortwave")
        a[a >= 32767] = np.nan
        a = block_mean(a * float(at.get("scale_factor", 0.001)), 2)
        save_webp(on_dark(ramp(a, GREY, 0, 0.9)), "earth-modis-albedo.webp", 640, caption="MCD43C3 white-sky shortwave albedo, 8 Jan 2024: dark rock to bright ice and salt")


SITE_ORDER = [
    "atacama", "mcmurdo", "devon-island-haughton", "askja", "hingol-mud-volcanoes", "dallol-danakil",
    "death-valley", "pilot-valley", "kilauea", "mauna-kea", "medicine-lake", "svalbard-bockfjorden",
    "rio-tinto", "qaidam-basin", "salar-de-uyuni", "cholistan-desert", "thar-desert", "khewra-salt-range",
]


def earth_worldview():
    print("Worldview snapshots")
    wv = NASA / "earth" / "worldview"
    six = SITE_ORDER[:6]
    save_webp(mosaic([wv / s / "true-colour.jpg" for s in six], 3), "earth-worldview-truecolour.webp", 640,
              caption="MODIS true colour: Atacama, McMurdo, Devon Island, Askja, Hingol, Dallol")
    save_webp(mosaic([wv / "atacama" / "lst-day.png", wv / "atacama" / "lst-night.png", wv / "mcmurdo" / "lst-day.png"], 3), "earth-worldview-lst.webp", 640,
              caption="MODIS land-surface temperature: Atacama day, Atacama night, McMurdo day")
    save_webp(mosaic([wv / s / "ndvi.png" for s in ("atacama", "rio-tinto", "kilauea")], 3), "earth-worldview-ndvi.webp", 640, caption="MODIS NDVI: Atacama, Rio Tinto, Kīlauea")
    save_webp(mosaic([wv / s / "relief.jpg" for s in ("devon-island-haughton", "askja", "hingol-mud-volcanoes")], 3), "earth-worldview-relief.webp", 640,
              caption="ASTER GDEM shaded relief: Haughton crater, Askja, Hingol")
    for s in SITE_ORDER:
        square_thumb(wv / s / "true-colour.jpg", f"wv-{s}.webp", caption=s)


def partners():
    print("Copernicus and CSA")
    cop = NASA / "partners" / "copernicus"
    for s in SITE_ORDER:
        for kind, short in (("sentinel-2-l2a", "s2"), ("sentinel-1-grd", "s1")):
            f = cop / s / f"{kind}-quicklook.jpg"
            if f.exists():
                square_thumb(f, f"{short}-{s}.webp", caption=s)
    save_webp(mosaic([cop / s / "sentinel-2-l2a-quicklook.jpg" for s in ("atacama", "salar-de-uyuni", "hingol-mud-volcanoes")], 3), "copernicus-s2.webp", 640,
              caption="Sentinel-2 L2A quicklooks: Atacama, Salar de Uyuni, Hingol")
    save_webp(mosaic([cop / s / "sentinel-1-grd-quicklook.jpg" for s in ("atacama", "devon-island-haughton", "dallol-danakil")], 3), "copernicus-s1.webp", 640,
              caption="Sentinel-1 radar quicklooks: Atacama, Devon Island, Dallol")

    rcm = sorted((NASA / "partners" / "csa" / "rcm-samples").glob("RCM*"))
    for i, d in enumerate(rcm, 1):
        where = (d / "WHERE.txt").read_text(encoding="utf-8").strip() if (d / "WHERE.txt").exists() else d.name
        im = Image.open(d / "preview" / "productOverview.png").convert("L")
        im = Image.merge("RGB", (im, im, im))
        save_webp(im, f"csa-rcm-{i}.webp", 520, quality=70, caption=where)


# ---------------------------------------------------------------- sizes

def du(*paths) -> int:
    total = 0
    for p in paths:
        p = Path(p)
        if p.is_file():
            total += p.stat().st_size
        elif p.is_dir():
            total += sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
    return total


def label_bytes(lbl: Path) -> int:
    lab = pds3(lbl)
    return lab["record_bytes"] * lab["file_records"]


def sizes():
    m, r, e, pt = NASA / "moon", NASA / "mars", NASA / "earth", NASA / "partners"
    wv = e / "worldview"
    grs = r / "odyssey-grs"
    s = {
        # Full sizes from the PDS labels (the PRP table has one 210-byte header record before its rows) and on disk.
        "moon-diviner-prp-expected": label_bytes(m / "diviner" / "polar-resource" / "dlre_prp_south.lbl") + pds3(m / "diviner" / "polar-resource" / "dlre_prp_south.lbl")["record_bytes"],
        "moon-diviner-prp": du(*(m / "diviner" / "polar-resource").glob("dlre_prp_south.*")),
        "moon-minirf-cpr-expected": label_bytes(m / "minirf" / "global_cpr_32ppd_simp_0c.lbl"),
        "moon-minirf-cpr": du(*(m / "minirf").glob("global_cpr_32ppd_simp_0c.*")),
        "moon-diviner-rock": du(*(m / "diviner" / "global-maps").glob("dgdr_ra_*")),
        "moon-diviner-regolith": du(*(m / "diviner" / "global-maps").glob("dgdr_st_*")),
        "moon-lola-dem-south": du(*(m / "lola-south-pole").glob("ldem_*")),
        "moon-lola-slope-south": du(*(m / "lola-south-pole").glob("ldsm_*")),
        "moon-lola-global": du(TEX / "moon-kit" / "ldem_16_uint.tif"),
        "mars-grs-water": du(grs / "h2o_sr_5x5.lbl", grs / "h2o_sr_5x5.tab", *grs.glob("grs_h_peaks_*")),
        "mars-grs-elements": du(*[grs / f"{el}_sr_5x5.{x}" for el in ("fe", "cl", "si", "k", "th") for x in ("lbl", "tab")]),
        "mars-neutron-epithermal": du(*grs.glob("ns_epithermal_*")),
        "mars-tes-thermal-inertia-zip": du(r / "mgs-tes" / "mgst_9001.zip"),
        "mars-tes-thermal-inertia-unpacked": du(r / "mgs-tes" / "mgst_9001"),
        "mars-mola": du(TEX / "mars-mola" / "megt90n000eb.img", TEX / "mars-mola" / "megt90n000eb.lbl"),
        "earth-modis-lst-monthly": du(e / "earthdata" / "global" / "MOD11C3"),
        "earth-modis-ndvi-monthly": du(e / "earthdata" / "global" / "MOD13C2"),
        "earth-modis-albedo": du(e / "earthdata" / "global" / "MCD43C3"),
        "earth-worldview-truecolour": du(*wv.glob("*/true-colour.*")),
        "earth-worldview-lst": du(*wv.glob("*/lst-*.png")),
        "earth-worldview-ndvi": du(*wv.glob("*/ndvi.png")),
        "earth-worldview-relief": du(*wv.glob("*/relief.jpg")),
        "earth-cmr-listings": du(e / "earthdata" / "collections.json", e / "earthdata" / "granules-by-site.json", e / "earthdata" / "download-plan.json"),
        "csa-rcm": du(pt / "csa" / "rcm-samples", pt / "csa" / "rcm-dataset.json"),
        "csa-tutorial-repos": du(pt / "csa" / "repos"),
        "csa-radarsat1": du(pt / "csa" / "radarsat1-dataset.json"),
        "copernicus-s2-quicklooks": du(*(pt / "copernicus").glob("*/sentinel-2-*")),
        "copernicus-s1-quicklooks": du(*(pt / "copernicus").glob("*/sentinel-1-*")),
        "copernicus-manifest": du(pt / "copernicus" / "scenes-by-site.json"),
        "esa-osc": du(pt / "esa-open-science-catalog"),
        "jaxa": du(pt / "jaxa"),
    }
    # Full Copernicus products (need a free account): total size listed in the catalogue.
    scenes = json.loads((pt / "copernicus" / "scenes-by-site.json").read_text(encoding="utf-8"))
    for kind, key in (("sentinel-2-l2a", "copernicus-s2-full-products"), ("sentinel-1-grd", "copernicus-s1-full-products")):
        found = [v[kind] for v in scenes.values() if isinstance(v.get(kind), dict)]
        s[key] = sum(f.get("size_bytes") or 0 for f in found)
        s[key.replace("full-products", "scene-count")] = len(found)
    return s


if __name__ == "__main__":
    moon()
    extra = {"prp": moon_prp(), "minirf": moon_minirf()}
    mars()
    earth_global()
    earth_worldview()
    partners()
    sz = sizes()
    print("Sizes (bytes)")
    for k, v in sz.items():
        print(f"  {k:40s} {v:>14,}")
    manifest = {"generated": date.today().isoformat(), "script": "scripts/build-datalab.py", "sizes": sz, "stats": extra, "images": IMAGES}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    total = sum(i["bytes"] for i in IMAGES.values())
    print(f"{len(IMAGES)} images, {total / 1024:.0f} KB total → {OUT.relative_to(ROOT)}")
