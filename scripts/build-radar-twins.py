"""Radar Twins: CSA RADARSAT Constellation Mission radar over Arctic ground and sea ice, next to NASA LRO Mini-RF
radar of the Moon, processed into web images, value grids and histograms for the Compare page.

Earth (RCM2 ScanSAR Low Noise, HH + HV, 5 Nov 2019, Canadian Arctic islands):
  DN -> sigma nought with the product's lutSigma tables (sigma0 = (DN^2 + offset) / gain, RCM product spec),
  minus the noise floor (noiseLevels, Sigma Nought), 8 x 8 multilook (~320 m), dB, then oriented north-up and
  geolocated with the product's 169 image tie points. Land vs sea ice from Natural Earth 1:50m outlines.
  The read -> inspect -> geolocate -> plot steps follow CSA's Synthetic Aperture Radar Python tutorial.
Moon (Mini-RF global CPR mosaic, 32 px/deg): Anaxagoras crater resampled to a local km grid, and the south-pole CPR grid
  already built for the Moon Base Map.

Usage: python -I scripts/build-radar-twins.py      (needs the RCM HH and HV bands; see assets-raw/nasa/README.md)
Outputs: public/data/radar/*.webp|png and lib/data/radar.generated.json
"""

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets-raw" / "nasa"
CSA = RAW / "partners" / "csa" / "rcm-samples"
SCENE = CSA / "RCM2_OK1050583_PK1050584_1_SCLND_20191105_135220_HH_HV_GRD"
OUT = ROOT / "public" / "data" / "radar"
JSON_OUT = ROOT / "lib" / "data" / "radar.generated.json"
LOOKS = 8  # multilook factor (40 m pixels -> 320 m)

VIRIDIS = ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"]
ICE_GREY = ["#05070d", "#1b2433", "#34445a", "#5a6f86", "#8aa2b8", "#c4d4e2", "#f2f7fb"]


def log(msg):
    print(msg, flush=True)


def ramp_rgb(v, stops, lo, hi):
    """v -> RGB uint8 through a piecewise-linear ramp; NaN -> transparent (alpha 0)."""
    c = np.array([[int(h[i : i + 2], 16) for i in (1, 3, 5)] for h in stops], dtype=np.float32)
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    seg = len(c) - 1
    tt = np.nan_to_num(t) * seg
    i = np.minimum(tt.astype(np.int32), seg - 1)
    f = (tt - i)[..., None]
    rgb = c[i] * (1 - f) + c[i + 1] * f
    a = np.where(np.isnan(v), 0, 255).astype(np.uint8)
    return np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), a])


def grid_png(path, v, lo, hi):
    """8-bit value grid: DN 0-250 = lo..hi, 255 = no data. Returns its decode metadata."""
    scale = (hi - lo) / 250
    dn = np.clip(np.round((v - lo) / scale), 0, 250)
    dn = np.where(np.isnan(v), 255, dn).astype(np.uint8)
    Image.fromarray(dn, "L").save(path, optimize=True)
    return {"file": path.name, "scale": round(scale, 6), "offset": lo, "nodata": 255, "width": v.shape[1], "height": v.shape[0]}


def histogram(v, lo, hi, bins=40):
    v = v[np.isfinite(v)]
    h, edges = np.histogram(v, bins=bins, range=(lo, hi))  # values outside the range are left out, not piled at the ends
    return {"lo": lo, "hi": hi, "counts": (h / max(1, h.sum())).round(5).tolist(), "n": int(v.size),
            "median": round(float(np.median(v)), 2) if v.size else None,
            "p10": round(float(np.percentile(v, 10)), 2) if v.size else None,
            "p90": round(float(np.percentile(v, 90)), 2) if v.size else None}


# ------------------------------------------------------------------------------------------------ RCM


def lut(path: Path, tag: str):
    """RCM LUT: values given every `stepSize` pixels from `pixelFirst...`; returns a function of column -> value."""
    s = path.read_text(encoding="utf-8")
    first = int(re.search(r"<pixelFirst\w*>(-?\d+)<", s).group(1))
    step = int(re.search(r"<stepSize>(-?\d+)<", s).group(1))
    vals = np.array(re.search(rf"<{tag}[^>]*>([^<]+)<", s).group(1).split(), dtype=np.float64)
    px = first + step * np.arange(vals.size)
    order = np.argsort(px)
    return lambda cols: np.interp(cols, px[order], vals[order])


def noise_sigma(path: Path):
    """The Sigma Nought block of noiseLevels_*.xml (dB) as a column -> linear NESZ function."""
    s = path.read_text(encoding="utf-8")
    for block in re.findall(r"<referenceNoiseLevel>(.*?)</referenceNoiseLevel>", s, re.S):
        if "Sigma Nought" in block:
            first = int(re.search(r"<pixelFirstNoiseValue>(-?\d+)<", block).group(1))
            step = int(re.search(r"<stepSize>(-?\d+)<", block).group(1))
            db = np.array(re.search(r"<noiseLevelValues[^>]*>([^<]+)<", block).group(1).split(), dtype=np.float64)
            px = first + step * np.arange(db.size)
            o = np.argsort(px)
            return lambda cols: 10 ** (np.interp(cols, px[o], db[o]) / 10)
    raise ValueError("no Sigma Nought noise block")


def calibrated(band: str):
    dn = np.asarray(Image.open(SCENE / "imagery" / f"1050584_1_{band}.tif"), dtype=np.float32)
    cols = np.arange(dn.shape[1])
    cal = SCENE / "metadata" / "calibration"
    s = (cal / f"lutSigma_{band}.xml").read_text(encoding="utf-8")
    offset = float(re.search(r"<offset>([^<]+)<", s).group(1))
    gain = lut(cal / f"lutSigma_{band}.xml", "gains")(cols).astype(np.float32)
    nesz = noise_sigma(cal / f"noiseLevels_{band}.xml")(cols).astype(np.float32)
    valid = dn > 0
    sig = (dn * dn + offset) / gain[None, :]
    del dn
    sig = sig - nesz[None, :]  # remove the instrument noise floor; can go slightly negative over very dark ice
    sig[~valid] = np.nan
    h, w = sig.shape
    h8, w8 = h // LOOKS, w // LOOKS
    with np.errstate(invalid="ignore"):
        ml = np.nanmean(sig[: h8 * LOOKS, : w8 * LOOKS].reshape(h8, LOOKS, w8, LOOKS), axis=(1, 3))
    floor = float(np.nanmedian(nesz)) * 0.05
    ml = np.where(np.isfinite(ml), np.maximum(ml, floor), np.nan)
    log(f"  {band}: {w} x {h} px -> {w8} x {h8} looks; NESZ median {10 * np.log10(np.median(nesz)):.1f} dB")
    return ml


def tie_points():
    s = (SCENE / "metadata" / "product.xml").read_text(encoding="utf-8")
    pts = []
    for b in re.findall(r"<imageTiePoint>(.*?)</imageTiePoint>", s, re.S):
        g = lambda t: float(re.search(rf"<{t}[^>]*>([^<]+)<", b).group(1))
        pts.append((g("pixel"), g("line"), g("latitude"), g("longitude")))
    return np.array(pts)


def fit_poly(u, v, z, deg=3):
    terms = [(i, j) for i in range(deg + 1) for j in range(deg + 1 - i)]
    A = np.stack([u**i * v**j for i, j in terms], 1)
    coef, *_ = np.linalg.lstsq(A, z, rcond=None)
    rms = float(np.sqrt(np.mean((A @ coef - z) ** 2)))
    return [[i, j, float(c)] for (i, j), c in zip(terms, coef)], rms


def eval_poly(coef, u, v):
    return sum(c * u**i * v**j for i, j, c in coef)


def land_mask(lat, lon):
    """Natural Earth 1:50m land test for a coarse lat/lon grid, run with d3-geo (already a site dependency)."""
    tmp = OUT / "_mask_in.json"
    tmp.write_text(json.dumps({"lat": lat.round(4).tolist(), "lon": lon.round(4).tolist()}))
    js = """
      const fs=require('fs');const {feature}=require('topojson-client');const {geoContains}=require('d3-geo');
      const t=JSON.parse(fs.readFileSync('public/data/countries-50m.topo.json','utf8'));
      const land=feature(t,t.objects.land);const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
      process.stdout.write(JSON.stringify(d.lat.map((row,i)=>row.map((la,j)=>geoContains(land,[d.lon[i][j],la])?1:0))));
    """
    r = subprocess.run(["node", "-e", js, str(tmp)], cwd=ROOT, capture_output=True, text=True, check=True)
    tmp.unlink()
    return np.array(json.loads(r.stdout), dtype=bool)


def build_earth():
    log("RCM: Canadian Arctic, HH + HV")
    hh = calibrated("HH")
    hv = calibrated("HV")
    tp = tie_points()
    # Orient north-up and west-left (flips only, no resampling): the scene is close to north-aligned.
    H, W = hh.shape
    lat_top = np.mean(tp[tp[:, 1] == tp[:, 1].min(), 2])
    lat_bot = np.mean(tp[tp[:, 1] == tp[:, 1].max(), 2])
    lon_left = np.mean(tp[tp[:, 0] == tp[:, 0].min(), 3])
    lon_right = np.mean(tp[tp[:, 0] == tp[:, 0].max(), 3])
    flip_v, flip_h = bool(lat_top < lat_bot), bool(lon_left > lon_right)
    if flip_v:
        hh, hv = hh[::-1], hv[::-1]
    if flip_h:
        hh, hv = hh[:, ::-1], hv[:, ::-1]
    log(f"  orientation: flip vertical {flip_v}, flip horizontal {flip_h}")
    # tie points in normalised display coordinates (0..1 across the multilooked image)
    full_h, full_w = H * LOOKS, W * LOOKS
    u = tp[:, 0] / full_w
    v = tp[:, 1] / full_h
    if flip_h:
        u = 1 - u
    if flip_v:
        v = 1 - v
    lat_c, lat_rms = fit_poly(u, v, tp[:, 2])
    lon_c, lon_rms = fit_poly(u, v, tp[:, 3])
    log(f"  geolocation fit rms: {lat_rms * 111:.2f} km lat, {lon_rms:.4f}° lon")

    hh_db = 10 * np.log10(hh)
    ratio_db = 10 * np.log10(hv / hh)
    # downsample the 320 m looks to ~1000 px wide for the web (area mean in linear power)
    k = max(1, round(W / 1000))
    h2, w2 = H // k, W // k
    def down(a):
        with np.errstate(invalid="ignore"):
            return np.nanmean(a[: h2 * k, : w2 * k].reshape(h2, k, w2, k), axis=(1, 3))
    hh_w = 10 * np.log10(down(hh))
    ratio_w = 10 * np.log10(down(hv) / down(hh))
    gh, gw = hh_w.shape
    log(f"  web grids {gw} x {gh} (~{40 * LOOKS * k} m per pixel)")

    # land / sea-ice mask on a coarse grid, then nearest-upsampled
    cu, cv = np.meshgrid((np.arange(96) + 0.5) / 96, (np.arange(96) + 0.5) / 96)
    clat, clon = eval_poly(lat_c, cu, cv), eval_poly(lon_c, cu, cv)
    coarse = land_mask(clat, clon)
    rows = np.minimum((np.arange(gh) + 0.5) / gh * 96, 95).astype(int)
    cols = np.minimum((np.arange(gw) + 0.5) / gw * 96, 95).astype(int)
    land = coarse[rows][:, cols]
    log(f"  land {100 * land[np.isfinite(hh_w)].mean():.0f} % of valid pixels")

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(ramp_rgb(hh_w, ICE_GREY, -26, -6), "RGBA").save(OUT / "rcm-hh.webp", quality=84, method=6)
    Image.fromarray(ramp_rgb(ratio_w, VIRIDIS, -16, -4), "RGBA").save(OUT / "rcm-ratio.webp", quality=84, method=6)
    land_png = OUT / "rcm-land.png"
    Image.fromarray(np.where(land, 255, 0).astype(np.uint8), "L").resize((gw, gh)).save(land_png, optimize=True)

    valid = np.isfinite(ratio_w) & np.isfinite(hh_w)
    hist = {
        "ratio": {"land": histogram(ratio_w[valid & land], -18, -2), "sea": histogram(ratio_w[valid & ~land], -18, -2)},
        "hh": {"land": histogram(hh_w[valid & land], -28, -4), "sea": histogram(hh_w[valid & ~land], -28, -4)},
    }
    corners = {name: [round(float(eval_poly(lat_c, a, b)), 3), round(float(eval_poly(lon_c, a, b)), 3)]
               for name, (a, b) in {"nw": (0, 0), "ne": (1, 0), "sw": (0, 1), "se": (1, 1), "centre": (0.5, 0.5)}.items()}
    meta_xml = (SCENE / "metadata" / "product.xml").read_text(encoding="utf-8")
    inc = re.findall(r"<incidenceAngle\w*[^>]*>([\d.]+)<", meta_xml)
    return {
        "mission": "RADARSAT Constellation Mission (RCM-2)",
        "agency": "CSA",
        "product": SCENE.name,
        "mode": "ScanSAR Low Noise (SCLND), GRD",
        "date": "2019-11-05",
        "where": "Canadian Arctic Archipelago, about 75°N 110°W",
        "band": "C-band, 5.6 cm wavelength",
        "polarisations": "HH + HV (dual linear)",
        "pixel": f"{40 * LOOKS * k} m (from 40 m, {LOOKS * k} x {LOOKS * k} looks)",
        "corners": corners,
        "geo": {"lat": lat_c, "lon": lon_c, "rmsKm": round(lat_rms * 111, 2)},
        "orientation": {"flipVertical": flip_v, "flipHorizontal": flip_h},
        "images": {"hh": "/data/radar/rcm-hh.webp", "ratio": "/data/radar/rcm-ratio.webp"},
        "grids": {"hh": grid_png(OUT / "rcm-hh.png", hh_w, -30, 5), "ratio": grid_png(OUT / "rcm-ratio.png", ratio_w, -30, 0),
                  "land": {"file": land_png.name}},
        "ranges": {"hh": [-26, -6], "ratio": [-16, -4]},
        "hist": hist,
        "incidence": [round(float(min(map(float, inc))), 1), round(float(max(map(float, inc))), 1)] if inc else None,
        "licence": "RCM data: Government of Canada (CSA) open-data licence, see the product's license.pdf",
    }


# ------------------------------------------------------------------------------------------------ Mini-RF


def fill_small_gaps(a, passes=2):
    """Fill isolated no-data seams between orbits for the picture only (3 x 3 mean of neighbours)."""
    out = a.copy()
    for _ in range(passes):
        p = np.pad(out, 1, constant_values=np.nan)
        stack = np.stack([p[1 + dy : 1 + dy + out.shape[0], 1 + dx : 1 + dx + out.shape[1]] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
        n = np.isfinite(stack).sum(0)
        with np.errstate(invalid="ignore"):
            mean = np.nanmean(stack, 0)
        out = np.where(np.isnan(out) & (n >= 5), mean, out)
    return out


def smooth3(a):
    """NaN-aware 3 x 3 median, for pictures only (readout values stay unsmoothed); removes single-pixel spikes."""
    p = np.pad(a, 1, constant_values=np.nan)
    stack = np.stack([p[1 + dy : 1 + dy + a.shape[0], 1 + dx : 1 + dx + a.shape[1]] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    with np.errstate(invalid="ignore"):
        return np.where(np.isfinite(a) | (np.isfinite(stack).sum(0) >= 3), np.nanmedian(stack, 0), np.nan)


def upscale(rgba, factor):
    im = Image.fromarray(rgba, "RGBA")
    return im.resize((im.width * factor, im.height * factor), Image.BICUBIC)


def build_moon():
    log("Mini-RF: Anaxagoras crater + south pole")
    crops = []
    # Anaxagoras (73.4°N, 10.1°W, 51 km): a geologically young crater with blocky walls and ejecta. Mini-RF covers it
    # well (91 %), unlike low-latitude craters such as Copernicus (orbit strips). At 73°N the cylindrical map
    # stretches longitude 3.4x, so the crop is resampled onto a local km grid (azimuthal, 1 km pixels).
    la0, lo0, half, step = 73.4, -10.1, 130, 1.0
    km_per_deg = 3.14159265 * 1737.4 / 180
    ky, kx = np.mgrid[half - step / 2 : -half : -step, -half + step / 2 : half : step]
    lat = la0 + ky / km_per_deg
    lon = lo0 + kx / (km_per_deg * np.cos(np.radians(lat)))
    img = RAW / "moon" / "minirf" / "global_cpr_32ppd_simp_0c.img"
    mm = np.memmap(img, dtype="<f4", mode="r", shape=(5760, 11520))
    rows = np.clip(((90 - lat) * 32).astype(int), 0, 5759)
    cols = np.clip(((lon + 180) * 32).astype(int), 0, 11519)
    a = np.array(mm[rows, cols], dtype=np.float64)
    a[~(np.isfinite(a) & (a > 0) & (a < 50))] = np.nan
    cov = float(np.isfinite(a).mean())
    upscale(ramp_rgb(smooth3(fill_small_gaps(a, passes=4)), VIRIDIS, 0.1, 1.3), 2).save(OUT / "minirf-anaxagoras.webp", quality=84, method=6)
    dist = np.hypot(kx, ky)
    crops.append({
        "id": "anaxagoras", "name": "Anaxagoras crater", "where": "73.4°N 10.1°W, near the north pole",
        "caption": "A 51 km crater from the Moon's youngest geological period. Its blocky walls and ejecta are radar-rough (bright); the older, dust-softened plains around it are smoother (dark).",
        "bounds": {"halfWidthKm": half, "centre": [la0, lo0]}, "projection": "local km grid (1 km pixels) resampled from the 32 px/° global mosaic",
        "image": "/data/radar/minirf-anaxagoras.webp", "grid": grid_png(OUT / "minirf-anaxagoras.png", a, 0, 2.5),
        "coverage": round(cov * 100, 1),
        "hist": {"rough": histogram(a[dist < 40], 0, 2), "smooth": histogram(a[dist > 90], 0, 2)},
        "labels": {"rough": "Crater and ejecta (< 40 km)", "smooth": "Older plains (> 90 km away)"},
    })
    log(f"  Anaxagoras coverage {cov * 100:.0f} %; CPR median ejecta {crops[-1]['hist']['rough']['median']}, plains {crops[-1]['hist']['smooth']['median']}")

    # South pole: the Moon Base Map's CPR grid (polar stereographic, 960 m), central +-150 km
    man = json.loads((ROOT / "public" / "data" / "moonbase" / "manifest.json").read_text(encoding="utf-8"))
    cpr = next(l for l in man["layers"] if l["id"] == "cpr")
    g = cpr["grid"]
    dn = np.asarray(Image.open(ROOT / "public" / "data" / "moonbase" / g["file"]), dtype=np.float64)
    val = np.where(dn == g["nodata"], np.nan, g["offset"] + dn * g["scale"])
    n = val.shape[0]
    half_km = man["grid"]["halfWidthM"] / 1000
    px = 2 * half_km / n
    r = int(150 / px)
    c = n // 2
    win = val[c - r : c + r, c - r : c + r]
    cold = None
    ct = next((l for l in man["layers"] if l["id"] == "coldtrap" and l.get("grid")), None)
    if ct:
        cg = ct["grid"]
        cdn = np.asarray(Image.open(ROOT / "public" / "data" / "moonbase" / cg["file"]), dtype=np.float64)
        cval = np.where(cdn == cg["nodata"], np.nan, cg["offset"] + cdn * cg["scale"])[c - r : c + r, c - r : c + r]
        cold = np.nan_to_num(cval) >= 50
    upscale(ramp_rgb(fill_small_gaps(win), VIRIDIS, 0.1, 1.3), 2).save(OUT / "minirf-pole.webp", quality=84, method=6)
    crop = {
        "id": "pole", "name": "Lunar south pole", "where": "±150 km around 90°S",
        "caption": "Permanently shadowed crater floors, where water ice may hide. Their CPR is only slightly higher than sunlit ground with the same roughness: suggestive, not proof.",
        "bounds": {"halfWidthKm": 150}, "projection": "south polar stereographic, 960 m (Moon Base Map grid)",
        "image": "/data/radar/minirf-pole.webp", "grid": grid_png(OUT / "minirf-pole.png", win, 0, 2.5),
        "coverage": round(float(np.isfinite(win).mean()) * 100, 1),
    }
    if cold is not None:
        crop["hist"] = {"rough": histogram(win[cold], 0, 2), "smooth": histogram(win[~cold], 0, 2)}
        crop["labels"] = {"rough": "Cold traps (≥ 50 % of cell < 110 K)", "smooth": "Everything else"}
        log(f"  pole CPR median cold traps {crop['hist']['rough']['median']}, elsewhere {crop['hist']['smooth']['median']}")
    crops.append(crop)
    return {
        "mission": "Lunar Reconnaissance Orbiter Mini-RF", "agency": "NASA",
        "band": "S-band, 12.6 cm wavelength", "polarisations": "Hybrid (compact) polarimetry: transmits circular, receives H and V with phase",
        "product": "LRO-L-MRFLRO-5-GLOBAL-MOSAIC-V1.0 (global CPR, 32 px/°)", "range": [0.1, 1.3], "crops": crops,
    }


# ------------------------------------------------------------------------------------------------ gallery


def build_gallery():
    items = [
        ("RCM3_OK1050586_PK1050588_3_SC30MCPB_20200124_083635_CH_CV_GRD", "Antarctic Peninsula", "2020-01-24",
         "Compact polarimetry (CH + CV): the same transmit-circular design as Mini-RF"),
        ("RCM2_OK1050607_PK1050608_1_SC100MA_20200113_150406_HH_HV_GRD", "Beaufort Sea and Banks Island", "2020-01-13",
         "ScanSAR 100 m, HH + HV: winter sea ice and Arctic coast"),
        (SCENE.name, "Canadian Arctic islands", "2019-11-05", "ScanSAR Low Noise, HH + HV: the scene analysed above"),
    ]
    out = []
    for prod, where, date, note in items:
        src = CSA / prod / "preview" / "productOverview.png"
        if not src.exists():
            continue
        im = Image.open(src).convert("L")
        im.thumbnail((720, 720))
        name = f"rcm-preview-{prod.split('_')[0].lower()}-{prod.split('_')[1].lower()}.webp"
        im.save(OUT / name, quality=80, method=6)
        out.append({"where": where, "date": date, "note": note, "image": f"/data/radar/{name}", "product": prod})
    return out


def main():
    for band in ("HH", "HV"):
        if not (SCENE / "imagery" / f"1050584_1_{band}.tif").exists():
            sys.exit(f"missing RCM {band} band; download it first (see scripts/fetch-partners.py)")
    OUT.mkdir(parents=True, exist_ok=True)
    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": "Built by scripts/build-radar-twins.py",
        "earth": build_earth(),
        "moon": build_moon(),
        "gallery": build_gallery(),
    }
    JSON_OUT.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.iterdir())
    log(f"wrote {JSON_OUT.relative_to(ROOT)} and {OUT.relative_to(ROOT)} ({total / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
