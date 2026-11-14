"""
Build the science data layers for Explore's 2D map (docs/archive/plan-v2.md section 4.4).

For every precomputed layer (Moon, Mars) it writes to public/data/layers/:
  <id>.webp       colourised equirectangular overlay (west edge -180°, north edge at the layer's top latitude)
  <id>.grid.bin   value grid for the click/hover readout: uint16 little-endian, row-major from the north-west
                  corner; 0 = no data, value = offset + (q - 1) * scale
  <id>.json       legend: colour ramp, range and units, dataset, one-line meaning, caveat, source link, bounds

For the live Earth layers (NASA GIBS tiles) and the NASA Trek tile layers it writes <id>.json only: the Earth legends
are generated from the official GIBS colour maps (including the full colour -> value table, so the map can read a
value back from a tile pixel), and every GIBS tile URL is checked for HTTP 200.

Files that are still downloading (size below the size the PDS label promises) are skipped with a note, and their old
outputs are left alone, so the script can simply be re-run later.  Network failures in the Earth section keep the
previous JSON.  Usage:  python -I scripts/build-science-layers.py [mars] [moon] [earth] [trek]
"""

import datetime
import json
import math
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NASA = ROOT / "assets-raw" / "nasa"
OUT = ROOT / "public" / "data" / "layers"
OUT.mkdir(parents=True, exist_ok=True)
TODAY = datetime.date.today().isoformat()
PDS = "https://pds-geosciences.wustl.edu"

# Perceptual colour ramps (10 evenly spaced samples of the matplotlib maps; diverging ramp from ColorBrewer RdBu).
RAMPS = {
    "viridis": ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
    "magma": ["#000004", "#180f3d", "#440f76", "#721f81", "#9e2f7f", "#cd4071", "#f1605d", "#fd9668", "#feca8d", "#fcfdbf"],
    "inferno": ["#000004", "#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#f7d13d", "#fcffa4"],
    "cividis": ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#fee838"],
    "rdbu": ["#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b"],
}


def hex_rgb(h):
    return tuple(int(h[i: i + 2], 16) for i in (1, 3, 5))


# ---------------------------------------------------------------- helpers


def pds3(path: Path):
    """The few keywords we need from a PDS3 label (first IMAGE object)."""
    text = path.read_text(encoding="latin-1")

    def kw(name, cast=str, default=None):
        m = re.search(rf"^\s*{name}\s*=\s*\"?([^\"\r\n<]+?)\"?\s*(<[^>]*>)?\s*$", text, re.M)
        return cast(m.group(1).strip()) if m else default

    return {
        "lines": kw("LINES", int),
        "samples": kw("LINE_SAMPLES", int),
        "type": kw("SAMPLE_TYPE", str, "").upper(),
        "bits": kw("SAMPLE_BITS", int, 16),
        "scale": kw("SCALING_FACTOR", float, 1.0),
        "offset": kw("OFFSET", float, 0.0),
        "maxlat": kw("MAXIMUM_LATITUDE", float, 90.0),
        "minlat": kw("MINIMUM_LATITUDE", float, -90.0),
        "westlon": kw("WESTERNMOST_LONGITUDE", float, -180.0),
    }


def complete(img: Path, expected: int, name: str) -> bool:
    """True only if the file exists and has exactly the size the label promises (downloads in progress are skipped)."""
    if not img.exists():
        print(f"  {name}: missing ({img.name}) - skipped")
        return False
    have = img.stat().st_size
    if have != expected:
        print(f"  {name}: {have:,} of {expected:,} bytes (still downloading?) - skipped, re-run later")
        return False
    return True


def read_image(img: Path, lab: dict):
    t = lab["type"]
    big = "MSB" in t or "SUN" in t or t == "IEEE_REAL"
    if "REAL" in t:
        dt = (">" if big else "<") + "f4"
    else:
        dt = (">" if big else "<") + ("u" if "UNSIGNED" in t else "i") + str(lab["bits"] // 8)
    return np.memmap(img, dtype=dt, mode="r", shape=(lab["lines"], lab["samples"]))


def to_minus180(a, westlon):
    """Re-centre a global grid whose first column starts at `westlon` so that it starts at -180°."""
    shift = int(round(((westlon + 180) % 360) / 360 * a.shape[1]))
    return np.roll(a, shift, axis=1) if shift else a


def block_mean(a, f):
    """NaN-aware mean over f x f blocks (shape must be divisible by f)."""
    h, w = a.shape[0] // f, a.shape[1] // f
    a = a[: h * f, : w * f].reshape(h, f, w, f)
    ok = ~np.isnan(a)
    s = np.where(ok, a, 0).sum(axis=(1, 3))
    n = ok.sum(axis=(1, 3))
    with np.errstate(invalid="ignore", divide="ignore"):
        out = s / n
    out[n < (f * f) / 2] = np.nan  # mostly-empty blocks become no-data
    return out.astype(np.float32)


def resize(a, w, h, smooth=True):
    """NaN-aware resample to w x h (area average when shrinking, bilinear when enlarging)."""
    flt = Image.BOX if (w <= a.shape[1] and h <= a.shape[0]) else (Image.BILINEAR if smooth else Image.NEAREST)
    ok = (~np.isnan(a)).astype(np.float32)
    val = np.where(np.isnan(a), 0, a).astype(np.float32)
    rv = np.asarray(Image.fromarray(val, "F").resize((w, h), flt))
    rk = np.asarray(Image.fromarray(ok, "F").resize((w, h), flt))
    with np.errstate(invalid="ignore", divide="ignore"):
        out = rv / rk
    out[rk < 0.5] = np.nan
    return out.astype(np.float32)


def colourise(v, ramp, lo, hi, scale="linear", invert=False):
    stops = np.array([hex_rgb(c) for c in RAMPS[ramp]], dtype=np.float32)
    if scale == "log":
        t = (np.log10(np.clip(v, 1e-9, None)) - math.log10(lo)) / (math.log10(hi) - math.log10(lo))
    else:
        t = (v - lo) / (hi - lo)
    t = np.clip(np.nan_to_num(t, nan=0.0), 0, 1)
    if invert:
        t = 1 - t
    seg = len(stops) - 1
    i = np.minimum((t * seg).astype(int), seg - 1)
    f = (t * seg - i)[..., None]
    rgb = stops[i] * (1 - f) + stops[i + 1] * f
    alpha = np.where(np.isnan(v), 0, 255)[..., None]
    return np.concatenate([rgb, alpha], axis=-1).astype(np.uint8)


def nice(x, up):
    """Round to 2 significant figures, outward."""
    if x == 0 or not math.isfinite(x):
        return 0.0
    p = 10 ** (math.floor(math.log10(abs(x))) - 1)
    return float((math.ceil(x / p) if up else math.floor(x / p)) * p)


def clean(x):
    return float(f"{x:.6g}")


def write_grid(lid, g):
    """uint16 value grid; returns its legend entry."""
    finite = g[~np.isnan(g)]
    vmin, vmax = float(finite.min()), float(finite.max())
    scale = (vmax - vmin) / 65534 if vmax > vmin else 1.0
    q = np.where(np.isnan(g), 0, np.round((g - vmin) / scale) + 1).astype("<u2")
    path = OUT / f"{lid}.grid.bin"
    path.write_bytes(q.tobytes())
    return {"url": f"/data/layers/{path.name}", "width": int(g.shape[1]), "height": int(g.shape[0]), "offset": clean(vmin), "scale": float(f"{scale:.8g}")}


def write_json(lid, data):
    (OUT / f"{lid}.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def build(cfg, data, bounds, display_w, grid):
    """data: float32 grid (NaN = no data) on an equirectangular raster covering `bounds` = [[south, west], [north, east]]."""
    lid = cfg["id"]
    finite = data[~np.isnan(data)]
    p = np.percentile(finite, [1, 2, 50, 98, 99])
    print(f"  {lid}: {data.shape[1]}x{data.shape[0]} · p2 {p[1]:.4g} · median {p[2]:.4g} · p98 {p[3]:.4g} {cfg['units']}")
    if "range" in cfg:
        lo, hi = cfg["range"]
    elif cfg.get("symmetric"):
        m = nice(max(abs(p[1]), abs(p[3])), True)
        lo, hi = -m, m
    else:
        lo, hi = nice(p[1], False), nice(p[3], True)
    span = bounds[1][0] - bounds[0][0]
    display_h = int(round(display_w * span / 360))
    img = resize(data, display_w, display_h, smooth=cfg.get("smooth", True))
    if cfg.get("fill_gaps"):
        # Fill only narrow no-data seams between orbit tracks (a few display pixels wide); wide gaps stay empty.
        coarse = resize(resize(img, display_w // 4, display_h // 4), display_w, display_h)
        gaps = np.isnan(img) & ~np.isnan(coarse)
        print(f"    filled {gaps.mean() * 100:.1f}% of display pixels (narrow seams); readout grid untouched")
        img[gaps] = coarse[gaps]
    rgba = colourise(img, cfg["ramp"], lo, hi, cfg.get("scale", "linear"), cfg.get("invert", False))
    Image.fromarray(rgba, "RGBA").save(OUT / f"{lid}.webp", "WEBP", quality=88, method=6)
    ramp = RAMPS[cfg["ramp"]][::-1] if cfg.get("invert") else RAMPS[cfg["ramp"]]
    legend = {
        "id": lid,
        "type": "image",
        "title": cfg["title"],
        "units": cfg["units"],
        "unitsLong": cfg.get("unitsLong", cfg["units"]),
        "range": [clean(lo), clean(hi)],
        "scale": cfg.get("scale", "linear"),
        "ramp": ramp,
        "ticks": cfg.get("ticks"),
        "lowLabel": cfg.get("lowLabel"),
        "highLabel": cfg.get("highLabel"),
        "decimals": cfg.get("decimals", 1),
        "meaning": cfg["meaning"],
        "caveat": cfg.get("caveat"),
        "dataset": cfg["dataset"],
        "datasetId": cfg["datasetId"],
        "resolution": cfg["resolution"],
        "source": cfg["source"],
        "image": f"/data/layers/{lid}.webp",
        "bounds": bounds,
        "grid": write_grid(lid, grid),
        "stats": {"p2": clean(p[1]), "median": clean(p[2]), "p98": clean(p[3])},
        "built": TODAY,
    }
    write_json(lid, {k: v for k, v in legend.items() if v is not None})
    kb = (OUT / f"{lid}.webp").stat().st_size / 1024
    print(f"    -> {lid}.webp {display_w}x{display_h} ({kb:.0f} kB), range {lo:g}–{hi:g}, grid {grid.shape[1]}x{grid.shape[0]}")


GLOBAL = [[-90, -180], [90, 180]]

# ---------------------------------------------------------------- Mars


def mars_grs_water():
    tab = NASA / "mars" / "odyssey-grs" / "h2o_sr_5x5.tab"
    if not complete(tab, 186624, "GRS water"):
        return
    rows = np.loadtxt(tab, usecols=(0, 1, 2))
    g = np.full((36, 72), np.nan, dtype=np.float32)
    for lat, lon, v in rows:
        if v < 9000:  # 9999.999 = not applicable (the polar caps, where the model does not apply)
            g[int((90 - lat) // 5), int((lon % 360) // 5)] = v
    g = to_minus180(g, 0.0)  # bin centres are 2.5°…357.5° east
    build(
        {
            "id": "mars-grs-water",
            "title": "Water-equivalent hydrogen",
            "units": "wt%",
            "unitsLong": "weight % H₂O",
            "ramp": "viridis",
            "range": [2, 7],
            "ticks": [3, 4, 5, 6],
            "lowLabel": "drier",
            "highLabel": "more water",
            "meaning": "How much of the top metre of soil is water (as ice or bound in minerals), by mass. Higher means more water to mine.",
            "caveat": "Polar caps above about 75° are masked in this product. 5° bins smoothed with a 10° boxcar, so features smaller than ~600 km are blurred.",
            "dataset": "Mars Odyssey Gamma Ray Spectrometer · water concentration",
            "datasetId": "ODY-M-GRS-5-ELEMENTS-V1.0 (H2O_SR_5X5)",
            "resolution": "5° bins (~300 km)",
            "source": f"{PDS}/ody/ody-m-grs-5-elements-v1/odgm_xxxx/data/smoothed/",
            "decimals": 1,
        },
        g,
        GLOBAL,
        1024,
        g,
    )


def mars_ns_epithermal():
    tab = NASA / "mars" / "odyssey-grs" / "ns_epithermal_020917.tab"
    if not complete(tab, 6739200, "NS epithermal"):
        return
    lon, lat, v = np.loadtxt(tab, delimiter=",").T
    g = np.full((360, 720), np.nan, dtype=np.float32)
    r = ((90 - lat) / 0.5).astype(int).clip(0, 359)
    c = ((lon % 360) / 0.5).astype(int).clip(0, 719)
    g[r, c] = np.where(v > 0, v, np.nan)  # 0 = no coverage (the outermost polar rows)
    g = to_minus180(g, 0.0)
    build(
        {
            "id": "mars-ns-epithermal",
            "title": "Epithermal neutrons (hydrogen)",
            "units": "counts/s",
            "unitsLong": "epithermal neutron counts per second",
            "ramp": "viridis",
            "invert": True,
            # Labels follow the numbers (low counts on the left), which here means MORE hydrogen on the left.
            "lowLabel": "more hydrogen",
            "highLabel": "less hydrogen",
            "meaning": "Hydrogen slows cosmic-ray neutrons, so FEWER epithermal neutrons means MORE hydrogen (usually water ice) in the top metre. Bright = ice-rich.",
            "caveat": "First 25.7 days of mapping (Feldman et al. 2002), so it is noisy. The colour scale is reversed: low counts are bright.",
            "dataset": "Mars Odyssey Neutron Spectrometer · epithermal neutron flux",
            "datasetId": "ODY GRS special products (NS_EPITHERMAL_020917)",
            "resolution": "0.5° cells (instrument footprint ~600 km)",
            "source": f"{PDS}/ody/urn-nasa-pds-odyssey_grs_special/data/",
            "decimals": 2,
        },
        g,
        GLOBAL,
        1440,
        g,
    )


def mars_tes_ti():
    lbl = NASA / "mars" / "mgs-tes" / "mgst_9001" / "data" / "global_ti_night_2007.lbl"
    img = lbl.with_suffix(".img")
    if not lbl.exists():
        print("  TES thermal inertia: label missing - skipped")
        return
    lab = pds3(lbl)
    if not complete(img, lab["lines"] * lab["samples"] * lab["bits"] // 8, "TES thermal inertia"):
        return
    a = np.asarray(read_image(img, lab), dtype=np.float32)
    a[a <= 0] = np.nan  # 0 = no data
    a = to_minus180(a, lab["westlon"])  # already -180
    build(
        {
            "id": "mars-tes-ti-night",
            "title": "Thermal inertia (night)",
            "units": "tiu",
            "unitsLong": "J m⁻² K⁻¹ s⁻½ (thermal inertia units)",
            "ramp": "inferno",
            "scale": "log",
            "range": [30, 2000],
            "ticks": [30, 100, 300, 1000, 2000],
            "lowLabel": "fine dust",
            "highLabel": "rock / ice",
            "meaning": "How well the ground holds heat through the night. Low = loose dust, ~200–400 = sand and crusts, high = bedrock or ice-cemented soil.",
            "caveat": "Gaps between TES orbits were filled by interpolation in the source map. Log colour scale.",
            "dataset": "Mars Global Surveyor TES · nightside thermal inertia (Putzig & Mellon 2007)",
            "datasetId": "MGS-M-TES-5-TIMAP-V1.0 (GLOBAL_TI_NIGHT_2007)",
            "resolution": "20 px/° (~3 km)",
            "source": f"{PDS}/mgs/mgs-m-tes-5-timap-v1/",
            "decimals": 0,
        },
        a,
        GLOBAL,
        2048,
        block_mean(a, 10),  # 0.5° readout grid
    )


# ---------------------------------------------------------------- Moon


def moon_diviner(kind):
    name = {"ra": "Diviner rock abundance", "st": "Diviner regolith temperature"}[kind]
    lbl = NASA / "moon" / "diviner" / "global-maps" / f"dgdr_{kind}_avg_cyl_032_img.lbl"
    img = lbl.with_suffix(".img")
    if not lbl.exists():
        print(f"  {name}: label missing - skipped")
        return
    lab = pds3(lbl)
    if not complete(img, lab["lines"] * lab["samples"] * lab["bits"] // 8, name):
        return
    raw = read_image(img, lab)
    a = np.asarray(raw, dtype=np.float32)
    a[raw == -32768] = np.nan  # MISSING_CONSTANT
    a = a * lab["scale"] + lab["offset"]
    a = to_minus180(a, lab["westlon"])  # the file starts at 0° east
    bounds = [[lab["minlat"], -180], [lab["maxlat"], 180]]  # Diviner GDR covers 60°S–60°N only
    common = {
        "dataset": "LRO Diviner Lunar Radiometer · gridded data record (Bandfield et al. 2011)",
        "fill_gaps": True,
        "resolution": "32 px/° (~950 m)",
        "source": f"{PDS}/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gdr_l3/cylindrical/img/",
    }
    if kind == "ra":
        a = a * 100  # areal fraction -> percent
        cfg = {
            "id": "moon-diviner-rocks",
            "title": "Rock abundance",
            "units": "%",
            "unitsLong": "% of the surface covered by rocks ≥ ~1 m",
            "ramp": "magma",
            "range": [0, 2],
            "ticks": [0, 0.5, 1, 1.5, 2],
            "lowLabel": "smooth regolith",
            "highLabel": "boulder fields",
            "meaning": "Share of the ground covered by metre-sized rocks, from how slowly the surface cools at night. Higher = harder landing and driving.",
            "caveat": "Night-time data, 60°S–60°N only (the poles are not in this product). Typical maria and highlands are below 0.5 %; fresh craters reach 10 %+. Thin seams between orbit tracks are interpolated in the picture only.",
            "datasetId": "LRO-L-DLRE-5-GDR-V1.0 (DGDR_RA_AVG_CYL_032)",
            "decimals": 2,
        }
    else:
        cfg = {
            "id": "moon-diviner-regolith-temp",
            "title": "Night regolith temperature anomaly",
            "units": "K",
            "unitsLong": "K, difference from the global average at the same local time",
            "ramp": "rdbu",
            "symmetric": True,
            "lowLabel": "colder than average",
            "highLabel": "warmer than average",
            "meaning": "How much warmer or colder the fine soil is at night than the lunar average. Warm = denser, more compacted soil; cold = fluffy, insulating dust.",
            "caveat": "An anomaly, not an absolute temperature (night-side soil is ~90–120 K), and it still follows latitude: high latitudes get less sunlight. 60°S–60°N only; thin seams between orbit tracks are interpolated in the picture only.",
            "datasetId": "LRO-L-DLRE-5-GDR-V1.0 (DGDR_ST_AVG_CYL_032)",
            "decimals": 1,
        }
    build({**common, **cfg}, a, bounds, 2048, block_mean(a, 16))


def moon_minirf():
    lbl = NASA / "moon" / "minirf" / "global_cpr_32ppd_simp_0c.lbl"
    img = lbl.with_suffix(".img")
    if not lbl.exists():
        print("  Mini-RF CPR: label missing - skipped")
        return
    lab = pds3(lbl)
    if not complete(img, 265_420_800, "Mini-RF CPR"):
        return
    a = np.array(read_image(img, lab), dtype=np.float32)
    a[~np.isfinite(a) | (a < -1e30) | (a <= 0) | (a > 10)] = np.nan
    a = to_minus180(a, lab["westlon"])
    build(
        {
            "id": "moon-minirf-cpr",
            "title": "Radar circular polarisation ratio",
            "units": "CPR",
            "unitsLong": "circular polarisation ratio (same-sense / opposite-sense echo)",
            "ramp": "cividis",
            "range": [0.2, 1.2],
            "ticks": [0.4, 0.6, 0.8, 1.0],
            "lowLabel": "smooth",
            "highLabel": "rough or icy",
            "meaning": "S-band radar echo ratio. Values near or above 1 mean rough, blocky ground OR possible buried ice: on its own the signal is ambiguous.",
            "caveat": "High CPR also occurs on fresh, rough crater ejecta, so it is not proof of ice. Wide coverage gaps stay empty; thin seams are interpolated in the picture only.",
            "fill_gaps": True,
            "dataset": "LRO Mini-RF · global S-band CPR mosaic",
            "datasetId": "LRO-L-MRFLRO-5-GLOBAL-MOSAIC-V1.0 (GLOBAL_CPR_32PPD_SIMP_0C)",
            "resolution": "32 px/° (~950 m)",
            "source": f"{PDS}/lro/lro-l-mrflro-5-global-mosaic-v1/lromrf_1001/data/32ppd/",
            "decimals": 2,
        },
        a,
        GLOBAL,
        2048,
        block_mean(a, 16),
    )


# ---------------------------------------------------------------- Earth (live GIBS)

GIBS = "https://gibs.earthdata.nasa.gov"
EARTH = [
    {
        "id": "earth-lst-day",
        "layer": "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day",
        "matrix": "1km",
        "colormap": "MODIS_Land_Surface_Temp",
        "title": "Land surface temperature (day)",
        "units": "°C",
        "convert": "K->C",
        "meaning": "Daytime skin temperature of the ground (not the air). Hot deserts pass 60 °C; ice sheets stay far below 0 °C.",
        "caveat": "8-day composite of clear-sky days; clouds leave gaps. Ground temperature, so it swings much more than air temperature.",
        "dataset": "Terra MODIS · Land Surface Temperature 8-day (MOD11A2 v6.1)",
        "product": "https://lpdaac.usgs.gov/products/mod11a2v061/",
        "cadence": "8-day composite",
        "decimals": 0,
    },
    {
        "id": "earth-lst-night",
        "layer": "MODIS_Terra_L3_Land_Surface_Temp_8Day_Night",
        "matrix": "1km",
        "colormap": "MODIS_Land_Surface_Temp",
        "title": "Land surface temperature (night)",
        "units": "°C",
        "convert": "K->C",
        "meaning": "Night-time ground temperature. With the day layer it gives the day–night swing, a key match for Mars, where it reaches ~80 °C.",
        "caveat": "8-day composite of clear-sky nights; clouds leave gaps.",
        "dataset": "Terra MODIS · Land Surface Temperature 8-day (MOD11A2 v6.1)",
        "product": "https://lpdaac.usgs.gov/products/mod11a2v061/",
        "cadence": "8-day composite",
        "decimals": 0,
    },
    {
        "id": "earth-ndvi",
        "layer": "MODIS_Terra_L3_NDVI_16Day",
        "matrix": "250m",
        "colormap": "MODIS_L3_NDVI",
        "title": "Vegetation index (NDVI)",
        "units": "NDVI",
        "meaning": "How green the land is. Below ~0.1 is bare rock, sand or ice, the lifeless look of Mars and the Moon; above 0.5 is dense vegetation.",
        "caveat": "16-day composite. Water and permanent ice are transparent.",
        "dataset": "Terra MODIS · Vegetation Indices 16-day 250 m (MOD13Q1 v6.1)",
        "product": "https://lpdaac.usgs.gov/products/mod13q1v061/",
        "cadence": "16-day composite",
        "decimals": 2,
    },
    {
        "id": "earth-snow",
        "layer": "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct",
        "matrix": "2km",
        "colormap": "MODIS_NDSI_Snow_Cover",
        "title": "Snow cover",
        "units": "%",
        "meaning": "Average snow cover over the month. Lasting snow and ice are where Earth comes closest to polar Mars and lunar cold traps.",
        "caveat": "Monthly average of daily clear-sky snow maps; polar night has no data.",
        "dataset": "Terra MODIS · Snow Cover monthly average (MOD10CM v6.1)",
        "product": "https://nsidc.org/data/mod10cm/versions/61",
        "cadence": "monthly average",
        "decimals": 0,
    },
    {
        "id": "earth-aod",
        "layer": "MODIS_Combined_Value_Added_AOD",
        "matrix": "2km",
        "colormap": "MODIS_Combined_Value_Added_AOD",
        "title": "Aerosol optical depth",
        "units": "AOD",
        "meaning": "How hazy the air is with dust, smoke and pollution (550 nm, no units). Above ~1 the Sun is dimmed like on a dusty Mars day.",
        "caveat": "Daily, clear-sky only: clouds and bright snow leave gaps.",
        "dataset": "Aqua + Terra MODIS · Value-added Aerosol Optical Depth (Dark Target + Deep Blue)",
        "product": "https://worldview.earthdata.nasa.gov/?l=MODIS_Combined_Value_Added_AOD",
        "cadence": "daily",
        "decimals": 2,
    },
    {
        "id": "earth-dust",
        "layer": "MERRA2_Dust_Surface_Mass_Concentration_Monthly",
        "matrix": "2km",
        "colormap": "MERRA2_Dust_Surface_Mass_Concentration_Monthly",
        "title": "Surface dust concentration",
        "units": "µg/m³",
        "convert": "kg->ug",
        "meaning": "Mineral dust in the air near the ground. Dusty, windy deserts are the best Earth stand-ins for Martian dust storms.",
        "caveat": "A model reanalysis (MERRA-2) constrained by satellite aerosol data, not a direct measurement. Monthly mean, ~50 km grid.",
        "dataset": "NASA GMAO MERRA-2 · dust surface mass concentration, monthly (M2TMNXAER)",
        "product": "https://disc.gsfc.nasa.gov/datasets/M2TMNXAER_5.12.4/summary",
        "cadence": "monthly mean",
        "decimals": 0,
    },
]


def http(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "TwinWorlds/1.0 (Space Apps 2026)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


def parse_colormap(xml: str):
    """The data colour map of a GIBS v1.3 colour map: [(r, g, b, lo, hi)], plus legend ticks and units."""
    best = None
    for cm in re.finditer(r"<ColorMap([^>]*)>(.*?)</ColorMap>", xml, re.S):
        attrs, body = cm.groups()
        entries = []
        for e in re.finditer(r"<ColorMapEntry ([^>]*)/>", body):
            a = dict(re.findall(r'(\w+)="([^"]*)"', e.group(1)))
            if a.get("transparent") == "true" or a.get("nodata") == "true" or "value" not in a:
                continue
            parts = a["value"].strip("[]()").split(",")
            nums = [(-1e9 if p.strip().startswith("-") else 1e9) if "INF" in p else float(p) for p in parts]
            lo, hi = nums[0], nums[-1]
            entries.append((*[int(x) for x in a["rgb"].split(",")], lo, hi))
        if entries and (best is None or len(entries) > len(best[1])):
            units = re.search(r'units="([^"]*)"', attrs)
            leg = re.search(r'<Legend [^>]*minLabel="([^"]*)" maxLabel="([^"]*)"', body)
            ticks = []
            legend_entries = re.findall(r"<LegendEntry ([^>]*)/>", body)
            for i, le in enumerate(legend_entries):
                la = dict(re.findall(r'(\w+)="([^"]*)"', le))
                if la.get("showLabel") == "true" and la.get("label"):
                    ticks.append({"at": round(i / max(1, len(legend_entries) - 1), 4), "label": la["label"]})
            best = (units.group(1) if units else None, entries, leg.groups() if leg else None, ticks)
    return best


def convert(v, how):
    if how == "K->C":
        return v - 273.15
    if how == "kg->ug":
        return v * 1e9
    return v


def unescape(s):
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&#8805;", "≥").replace("&#8804;", "≤").replace("&amp;", "&")


def earth():
    try:
        _, _, caps = http(f"{GIBS}/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml", 180)
        caps = caps.decode("utf-8")
    except Exception as e:  # noqa: BLE001
        print(f"  GIBS capabilities unavailable ({e}); Earth legends left as they are")
        return
    blocks = {re.search(r"<ows:Identifier>(.*?)</ows:Identifier>", b).group(1): b for b in re.findall(r"<Layer>(.*?)</Layer>", caps, re.S)}
    levels = {m: len(re.findall("<TileMatrix>", body)) for m, body in re.findall(r"<TileMatrixSet>\s*<ows:Identifier>(.*?)</ows:Identifier>(.*?)</TileMatrixSet>", caps, re.S)}
    for cfg in EARTH:
        lid = cfg["id"]
        block = blocks.get(cfg["layer"])
        if not block:
            print(f"  {lid}: {cfg['layer']} is not in the GIBS capabilities - skipped")
            continue
        matrix = re.search(r"<TileMatrixSet>(.*?)</TileMatrixSet>", block).group(1)
        fmt = "png" if "image/png" in block else "jpeg"
        latest = re.search(r"<Default>(.*?)</Default>", block)
        title = re.search(r"<ows:Title[^>]*>(.*?)</ows:Title>", block).group(1)
        assert matrix == cfg["matrix"], f"{lid}: matrix {matrix} != {cfg['matrix']}"
        tile = f"{GIBS}/wmts/epsg4326/best/{cfg['layer']}/default/default/{matrix}/0/0/0.{fmt}"
        try:
            status, ctype, _ = http(tile)
            cm_xml = http(f"{GIBS}/colormaps/v1.3/{cfg['colormap']}.xml")[2].decode("utf-8")
        except Exception as e:  # noqa: BLE001
            print(f"  {lid}: network error ({e}) - kept previous legend")
            continue
        units, entries, _minmax, _ticks = parse_colormap(cm_xml)
        conv = cfg.get("convert")
        table = [[r, g, b, clean(convert(lo, conv)), clean(convert(hi, conv))] for r, g, b, lo, hi in entries]
        n = len(table)
        ramp = ["#%02x%02x%02x" % tuple(table[min(n - 1, round(i * (n - 1) / 15))][:3]) for i in range(16)]
        # The first/last entries are often catch-alls ("< 200 K", ">= 350 K"): the legend range is where they begin.
        widths = sorted(e[4] - e[3] for e in table)
        typical = widths[len(widths) // 2] or 1
        below = table[0][4] - table[0][3] > 5 * typical
        above = table[-1][4] - table[-1][3] > 5 * typical
        lo = table[0][4] if below else table[0][3]
        hi = table[-1][3] if above else table[-1][4]
        d = cfg["decimals"]
        lo, hi = round(lo, d), round(hi, d)
        fmt_n = (lambda v: f"{v:.{d}f}") if d else (lambda v: f"{round(v)}")
        legend = {
            "id": lid,
            "type": "tile",
            "title": cfg["title"],
            "units": cfg["units"],
            "unitsLong": cfg["units"] if not units or conv else unescape(units),
            "range": [lo, hi],
            "scale": "linear",
            "ramp": ramp,
            "rampLabels": [("< " if below else "") + fmt_n(lo), ("≥ " if above else "") + fmt_n(hi)],
            "decimals": cfg["decimals"],
            "meaning": cfg["meaning"],
            "caveat": cfg["caveat"],
            "dataset": cfg["dataset"],
            "datasetId": f"GIBS layer {cfg['layer']}",
            "resolution": f"{matrix} tiles · {cfg['cadence']}",
            "source": f"https://worldview.earthdata.nasa.gov/?l={cfg['layer']}",
            "product": cfg["product"],
            "gibsTitle": title,
            "latest": latest.group(1) if latest else None,
            "tileUrl": f"{GIBS}/wmts/epsg4326/best/{cfg['layer']}/default/default/{matrix}/{{z}}/{{y}}/{{x}}.{fmt}",
            "maxNativeZoom": levels[matrix] - 1,
            "verified": {"date": TODAY, "status": status, "contentType": ctype},
            "colormap": f"{GIBS}/colormaps/v1.3/{cfg['colormap']}.xml",
            "table": table,
            "built": TODAY,
        }
        write_json(lid, {k: v for k, v in legend.items() if v is not None})
        print(f"  {lid}: {cfg['layer']} · {matrix} (max zoom {levels[matrix] - 1}) · latest {legend['latest']} · tile HTTP {status} {ctype} · {n} colours, {lo:g}–{hi:g} {cfg['units']}")


# ---------------------------------------------------------------- NASA Trek tile layers (no numeric colour key)

TREK = [
    {
        "id": "moon-slope",
        "title": "LOLA slope",
        "units": "°",
        "unitsLong": "degrees from horizontal",
        "meaning": "Steepness of the ground from laser altimetry. Landers and rovers want slopes under ~8–10°.",
        "dataset": "LRO LOLA · colourised global slope, 16 px/°",
        "datasetId": "Moon Trek LRO_LOLA_ClrSlope_Global_16ppd",
        "resolution": "16 px/° (~1.9 km baseline)",
        "source": "https://trek.nasa.gov/moon/",
    },
    {
        "id": "moon-diviner-max",
        "title": "Diviner max temperature",
        "units": "K",
        "unitsLong": "kelvin (bolometric, annual maximum)",
        "meaning": "Hottest surface temperature over a lunar year. Below ~110 K, water ice can survive at the surface for billions of years.",
        "dataset": "LRO Diviner · colourised bolometric max temperature",
        "datasetId": "Moon Trek diviner_Clrtbol_max",
        "resolution": "coarse global mosaic",
        "source": "https://trek.nasa.gov/moon/",
    },
    {
        "id": "moon-psr-south",
        "title": "South-pole illumination",
        "units": "% time lit",
        "unitsLong": "average percentage of time in sunlight",
        "meaning": "How often each spot sees the Sun. Dark areas are permanently shadowed cold traps; bright ridges are candidate base sites with near-constant solar power.",
        "dataset": "LRO LOLA · south-pole average illumination, 240 m",
        "datasetId": "Moon Trek LRO_LOLA_Illumination_SPole65S_240m_EQ",
        "resolution": "240 m, 65°S–90°S",
        "source": "https://trek.nasa.gov/moon/",
    },
    {
        "id": "mars-dust",
        "title": "TES dust cover index",
        "units": "index",
        "unitsLong": "TES 1350–1400 cm⁻¹ emissivity (unitless)",
        "meaning": "Whether the surface is mantled by fine dust (low emissivity) or shows clean rock and sand (high).",
        "dataset": "MGS TES · dust cover index (Ruff & Christensen 2002)",
        "datasetId": "Mars Trek tes_ruffdust",
        "resolution": "16 px/° (~3.7 km)",
        "source": "https://trek.nasa.gov/mars/",
    },
]


def trek():
    for cfg in TREK:
        write_json(cfg["id"], {
            "id": cfg["id"],
            "type": "tile",
            **{k: v for k, v in cfg.items() if k != "id"},
            "ramp": None,
            "caveat": "NASA Trek serves these tiles already coloured and publishes no numeric colour key with them, so read them as relative (more vs less), not as exact values.",
            "built": TODAY,
        })
        print(f"  {cfg['id']}: legend (qualitative)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    want = set(sys.argv[1:]) or {"mars", "moon", "earth", "trek"}
    if "mars" in want:
        print("Mars")
        mars_grs_water()
        mars_ns_epithermal()
        mars_tes_ti()
    if "moon" in want:
        print("Moon")
        moon_diviner("ra")
        moon_diviner("st")
        moon_minirf()
    if "earth" in want:
        print("Earth (GIBS)")
        earth()
    if "trek" in want:
        print("Trek tile legends")
        trek()
