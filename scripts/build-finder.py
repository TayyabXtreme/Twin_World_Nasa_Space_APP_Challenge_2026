"""
Analog Finder data build (docs/archive/plan-v2.md §4.1, §5, §6.1).

  python -I scripts/build-finder.py            build everything (Earth grid + targets)
  python -I scripts/build-finder.py --targets  rebuild targets.json only (reuses the cached Earth grid)

Inputs (assets-raw/nasa, read-only):
  Earth  MODIS CMG 0.05 deg (HDF4, pyhdf):
           MOD11C3 v061 monthly LST, Jan/Apr/Jul/Oct 2024 (LST_Day_CMG, LST_Night_CMG; x0.02 K, fill 0)
           MOD13C2 v061 monthly NDVI, Jan + Jul 2024 (x1/10000, fill -3000)
           MCD43C3 v061 albedo, days 008 + 190 of 2024 (Albedo_WSA_shortwave; x0.001, fill 32767)
         JAXA ALOS AW3D30 v3.2 DSM, coarsest COG level (0.2 deg), fetched from the public JAXA Earth API
           bucket (no login) and cached in a temp folder, for terrain relief.
  Moon   LRO LOLA south-polar DEM 240 m (relief); LRO Diviner rock abundance (60S-60N, Marius Hills only);
         LRO Diviner polar resource product (used only when fully downloaded: annual max/avg temperature,
         ice-stability depth at each site). Published Diviner values otherwise.
  Mars   MGS TES night thermal inertia, Odyssey neutron spectrometer (epithermal), Odyssey GRS water,
         MGS MOLA MEGDR 16 ppd (relief).

Outputs (public/data/finder):
  earth-grid.json    header: grid, channels (scale/offset/units/source), area-weighted CDF per channel
  earth-core.bin     land bitset (1440 x 720, row 0 = 90N, col 0 = 180W) + scoring channels (uint8 per land cell)
  earth-detail.bin   display-only channels, same cell order (lazy-loaded by the page)
  targets.json       Moon and Mars target profiles: per-dimension own-world percentile, Earth-equivalent
                     percentile, absolute values with units and sources

Every uint8 channel: 0 = no data, 1..255 = value. value = offset + (q - 1) * scale (log10 channels say so).

Afterwards run scripts/build-finder-conditions.py for the site-vs-target breakdown (slope, isolation, target terrain).
"""

import json
import math
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
NASA = ROOT / "assets-raw" / "nasa"
EARTH = NASA / "earth" / "earthdata" / "global"
OUT = ROOT / "public" / "data" / "finder"
CACHE = Path(os.environ.get("FINDER_CACHE", Path(tempfile.gettempdir()) / "twinworlds-finder-cache"))

RES = 0.25
NX, NY = int(360 / RES), int(180 / RES)  # 1440 x 720
BLOCK = int(RES / 0.05)  # 5 CMG pixels per cell side

# Files still downloading: only read them at their exact final size.
FINAL_SIZES = {
    NASA / "moon" / "diviner" / "polar-resource" / "dlre_prp_south.tab": 604_800_210,
    NASA / "moon" / "minirf" / "global_cpr_32ppd_simp_0c.img": 265_420_800,
}


def complete(path: Path) -> bool:
    want = FINAL_SIZES.get(path)
    return path.exists() and (want is None or path.stat().st_size == want)


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------ Earth: MODIS CMG -> 0.25 deg

def block_mean(a: np.ndarray, valid: np.ndarray, min_count=8):
    """Mean of valid CMG pixels in each 5x5 block, NaN where fewer than min_count are valid."""
    v = np.where(valid, a, 0.0).astype(np.float64).reshape(NY, BLOCK, NX, BLOCK).sum(axis=(1, 3))
    n = valid.reshape(NY, BLOCK, NX, BLOCK).sum(axis=(1, 3))
    with np.errstate(invalid="ignore", divide="ignore"):
        m = v / n
    m[n < min_count] = np.nan
    return m.astype(np.float32), n


def read_sds(path: Path, name: str):
    from pyhdf.SD import SD, SDC

    sd = SD(str(path), SDC.READ)
    d = sd.select(name).get()
    sd.end()
    return d


def earth_modis():
    cache = CACHE / "modis-025-v3.npz"
    if cache.exists():
        log(f"  MODIS: cached {cache}")
        return dict(np.load(cache))
    lst_files = sorted((EARTH / "MOD11C3").glob("MOD11C3.A2024*.hdf"))
    ndvi_files = sorted((EARTH / "MOD13C2").glob("MOD13C2.A2024*.hdf"))
    alb_files = sorted((EARTH / "MCD43C3").glob("MCD43C3.A2024*.hdf"))
    log(f"  MODIS files: {len(lst_files)} LST, {len(ndvi_files)} NDVI, {len(alb_files)} albedo")
    day, night, land_n = [], [], np.zeros((NY, NX), np.int32)
    # 0.05 deg land pixels: valid LST in any month. NDVI and albedo are averaged over these pixels only, so
    # coastal cells are not darkened (albedo) or "de-vegetated" (NDVI) by sea water.
    landpix = np.zeros((NY * BLOCK, NX * BLOCK), bool)
    for f in lst_files:
        for name, store in (("LST_Day_CMG", day), ("LST_Night_CMG", night)):
            raw = read_sds(f, name)
            ok = raw >= 7500  # valid_range 7500-65535, fill 0
            landpix |= ok
            m, n = block_mean(raw * 0.02, ok)
            store.append(m)
            land_n = np.maximum(land_n, n)
        log(f"    {f.name}: day valid cells {np.isfinite(day[-1]).sum():,}, night {np.isfinite(night[-1]).sum():,}")
    ndvi = []
    for f in ndvi_files:
        raw = read_sds(f, "CMG 0.05 Deg Monthly NDVI")
        ok = (raw >= -2000) & (raw <= 10000) & landpix
        m, _ = block_mean(raw / 10000.0, ok)
        ndvi.append(m)
    alb = []
    for f in alb_files:
        raw = read_sds(f, "Albedo_WSA_shortwave")
        # Below 0.05 is open water, not land (darkest natural land surfaces are ~0.08-0.1).
        ok = (raw >= 50) & (raw <= 32766) & landpix
        m, _ = block_mean(raw * 0.001, ok)
        alb.append(m)
    out = {
        "day": np.stack(day),
        "night": np.stack(night),
        "ndvi": np.stack(ndvi),
        "alb": np.stack(alb),
        "land_n": land_n,
    }
    CACHE.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache, **out)
    return out


# ------------------------------------------------------------------ Terrain relief (same method on all worlds)
#
# Relief = standard deviation of elevation over a box about 66 km on a side, built from ~22 km pixels
# (block means), so the same physical baseline is used on Earth, the Moon and Mars.
RELIEF_PIXEL_KM = 22.2
RELIEF_BOX_PX = 3  # 3 x 3 pixels -> ~66 km


def relief_box(grid: np.ndarray, lat_rows: np.ndarray):
    """Std of elevation over a 3-row box whose east-west width is widened by 1/cos(lat) so it stays ~66 km.
    grid: (rows, cols) equirectangular, NaN = no data, wraps in longitude."""
    rows, cols = grid.shape
    valid = np.isfinite(grid)
    g = np.where(valid, grid, 0.0)
    # per-row rolling sums along longitude with a latitude-dependent half-width
    s1 = np.zeros_like(g)
    s2 = np.zeros_like(g)
    cn = np.zeros_like(g)
    for r in range(rows):
        hw = int(min(cols // 4, round(1 / max(0.05, math.cos(math.radians(lat_rows[r]))))))
        for arr, src in ((s1, g[r]), (s2, g[r] ** 2), (cn, valid[r].astype(float))):
            c = np.concatenate([src[-hw:], src, src[:hw]]) if hw else src
            cs = np.concatenate([[0.0], np.cumsum(c)])
            w = 2 * hw + 1
            arr[r] = cs[w:] - cs[:-w]
    # vertical 3-row sum
    def vsum(a):
        p = np.pad(a, ((1, 1), (0, 0)))
        return p[:-2] + p[1:-1] + p[2:]

    S1, S2, CN = vsum(s1), vsum(s2), vsum(cn)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = S1 / CN
        var = np.maximum(0.0, S2 / CN - mean**2)
    std = np.sqrt(var)
    std[CN < 5] = np.nan
    return std


def fetch(url: str, dest: Path):
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"  fetching {url}")
    tmp = dest.with_suffix(".part")
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        f.write(r.read())
    tmp.replace(dest)
    return dest


JAXA_BASE = "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1/JAXA.EORC_ALOS.PRISM_AW3D30.v3.2_global/2021-02/0"


def earth_relief():
    """AW3D30 at its coarsest COG level (0.2 deg, 900 x 900 per hemisphere) -> elevation + relief on the 0.25 grid."""
    from PIL import Image

    try:
        w = fetch(f"{JAXA_BASE}/W180.00-E000.00/W180.00-S90.00-E000.00-N90.00-DSM.tiff", CACHE / "aw3d30-l0-w.tif")
        e = fetch(f"{JAXA_BASE}/E000.00-E180.00/E000.00-S90.00-E180.00-N90.00-DSM.tiff", CACHE / "aw3d30-l0-e.tif")
    except Exception as ex:  # network trouble: terrain is optional
        log(f"  AW3D30 unavailable ({ex}); terrain relief skipped")
        return None, None
    dem = np.concatenate([np.array(Image.open(w)), np.array(Image.open(e))], axis=1).astype(np.float64)
    dem[dem <= -9999] = np.nan
    rows = dem.shape[0]
    lat_rows = 90 - (np.arange(rows) + 0.5) * 0.2
    rel = relief_box(dem, lat_rows)
    # sample at 0.25 cell centres (nearest 0.2 pixel)
    lat_c = 90 - (np.arange(NY) + 0.5) * RES
    lon_c = -180 + (np.arange(NX) + 0.5) * RES
    ri = np.clip(((90 - lat_c) / 0.2).astype(int), 0, rows - 1)
    ci = np.clip(((lon_c + 180) / 0.2).astype(int), 0, dem.shape[1] - 1)
    elev = dem[np.ix_(ri, ci)]
    relief = rel[np.ix_(ri, ci)]
    log(f"  AW3D30 relief: valid cells {np.isfinite(relief).sum():,}; median {np.nanmedian(relief):.0f} m")
    return elev.astype(np.float32), relief.astype(np.float32)


# ------------------------------------------------------------------ Earth features

def earth_features():
    m = earth_modis()
    day, night, ndvi, alb = m["day"], m["night"], m["ndvi"], m["alb"]
    lat_c = (90 - (np.arange(NY) + 0.5) * RES)[:, None] * np.ones((1, NX))
    # A cell counts as land when at least half of its 25 MODIS pixels are land (valid LST in some month):
    # thin coastal slivers mix sea into albedo and NDVI and would masquerade as dark, bare ground.
    land = m["land_n"] >= 13
    land &= np.any(np.isfinite(night) | np.isfinite(day), axis=0)

    # A month with night LST but no day LST at high latitude is polar night: no sunlit overpass, so the
    # "day" surface is as cold as the night one. Elsewhere a missing day value stays missing (clouds).
    polar_night = np.isnan(day) & np.isfinite(night) & (np.abs(lat_c) > 60)[None]
    day = np.where(polar_night, night, day)
    both = np.isfinite(day) & np.isfinite(night)
    months_ok = both.sum(axis=0)

    with np.errstate(invalid="ignore"):
        tm_month = np.where(both, (day + night) / 2, np.nan)
        f = {}
        f["tday"] = np.nanmean(np.where(both, day, np.nan), axis=0)
        f["tnight"] = np.nanmean(np.where(both, night, np.nan), axis=0)
        f["tmean"] = np.nanmean(tm_month, axis=0)
        f["swing"] = np.maximum(0, f["tday"] - f["tnight"])
        seas = np.nanmax(tm_month, axis=0) - np.nanmin(tm_month, axis=0)
        f["seasonal"] = np.where(months_ok >= 3, seas, np.nan)
        f["tcold"] = np.nanmin(np.where(both, night, np.nan), axis=0)
        # Freezing index: mean of how far each sampled month's mean surface temperature sits below 0 C.
        f["freeze"] = np.nanmean(np.maximum(0, 273.15 - tm_month), axis=0)
        ndvi_max = np.nanmax(ndvi, axis=0)
        # No NDVI over ice sheets (MOD13C2 fill): frozen ground with no vegetation signal counts as bare.
        no_ndvi = np.isnan(ndvi_max)
        ndvi_max = np.where(no_ndvi & (f["tmean"] < 273.15), 0.0, ndvi_max)
        f["ndvi"] = ndvi_max
        f["albedo"] = np.nanmean(alb, axis=0)
        # Apparent thermal inertia (Price 1977 / Kahle 1987 style): (1 - albedo) / diurnal LST range.
        # MODIS Terra sees ~10:30 and ~22:30 local, so this range underestimates the true diurnal amplitude.
        f["ati"] = (1 - f["albedo"]) / np.maximum(f["swing"], 1.0)

    elev, relief = earth_relief()
    f["elev"] = elev if elev is not None else np.full((NY, NX), np.nan, np.float32)
    f["relief"] = relief if relief is not None else np.full((NY, NX), np.nan, np.float32)

    flags = (
        months_ok.astype(np.uint8)  # bits 0-2: months with day+night LST (0-4)
        | (np.any(polar_night, axis=0).astype(np.uint8) << 3)  # bit 3: polar-night fill used
        | (no_ndvi.astype(np.uint8) << 4)  # bit 4: no NDVI (ice sheet / fill)
        | (np.isnan(f["albedo"]).astype(np.uint8) << 5)  # bit 5: no albedo
    )
    f["flags"] = flags.astype(np.float32)
    for k in f:
        f[k] = np.where(land, f[k], np.nan).astype(np.float32)
    land &= np.isfinite(f["tmean"])
    log(f"  land cells: {land.sum():,}; with 4 LST months: {(months_ok[land] == 4).sum():,}; polar-night fill: {np.any(polar_night, axis=0)[land].sum():,}")
    return land, f


# Channel definitions: (key, file, scale/offset spec, units, label, source)
LST_SRC = "MODIS Terra MOD11C3 v061 monthly LST, 0.05 deg CMG (Jan/Apr/Jul/Oct 2024)"
CHANNELS = [
    # scoring channels (earth-core.bin)
    dict(key="tmean", file="core", lo=185.0, hi=330.0, log=False, units="K", label="Mean surface temperature (day+night, 4 months)", source=LST_SRC),
    dict(key="swing", file="core", lo=0.0, hi=50.0, log=False, units="K", label="Day-night surface temperature swing (10:30 vs 22:30 overpass)", source=LST_SRC),
    dict(key="ndvi", file="core", lo=-0.15, hi=0.95, log=False, units="NDVI", label="Highest monthly NDVI (Jan, Jul 2024)", source="MODIS Terra MOD13C2 v061 monthly NDVI, 0.05 deg CMG"),
    dict(key="ati", file="core", lo=-2.6, hi=-0.2, log=True, units="1/K", label="Apparent thermal inertia (1 - albedo) / day-night swing", source="MOD11C3 LST + MCD43C3 v061 white-sky shortwave albedo"),
    dict(key="freeze", file="core", lo=0.0, hi=75.0, log=False, units="K", label="Freezing index: mean degrees below 0 C of the monthly mean surface temperature", source=LST_SRC),
    dict(key="relief", file="core", lo=0.0, hi=3.4, log=True, units="m", label="Terrain relief: std of elevation over ~66 km (log10 m+1)", source="JAXA ALOS AW3D30 v3.2 DSM, coarsest COG level (0.2 deg)"),
    # display channels (earth-detail.bin)
    dict(key="tday", file="detail", lo=190.0, hi=345.0, log=False, units="K", label="Mean daytime surface temperature (~10:30 local)", source=LST_SRC),
    dict(key="tnight", file="detail", lo=180.0, hi=320.0, log=False, units="K", label="Mean night-time surface temperature (~22:30 local)", source=LST_SRC),
    dict(key="tcold", file="detail", lo=175.0, hi=315.0, log=False, units="K", label="Coldest sampled month, night surface temperature", source=LST_SRC),
    dict(key="seasonal", file="detail", lo=0.0, hi=80.0, log=False, units="K", label="Seasonal range: warmest minus coldest sampled month", source=LST_SRC),
    dict(key="albedo", file="detail", lo=0.0, hi=0.92, log=False, units="", label="White-sky shortwave albedo (Jan + Jul 2024)", source="MODIS MCD43C3 v061 albedo, 0.05 deg CMG"),
    dict(key="elev", file="detail", lo=-450.0, hi=6000.0, log=False, units="m", label="Elevation (surface model, 0.2 deg)", source="JAXA ALOS AW3D30 v3.2 DSM"),
    dict(key="flags", file="detail", lo=0.0, hi=254.0, log=False, units="bits", label="Data flags: bits0-2 LST months, 3 polar-night fill, 4 no NDVI, 5 no albedo", source="build-finder.py"),
]


def quantise(v: np.ndarray, ch: dict):
    x = v.astype(np.float64)
    if ch["log"]:
        x = np.log10(np.maximum(x, 0) + 1) if ch["key"] == "relief" else np.log10(np.maximum(x, 1e-6))
    if ch["key"] == "flags":
        q = np.where(np.isfinite(x), x + 1, 0)
        return q.clip(0, 255).astype(np.uint8), 1.0
    scale = (ch["hi"] - ch["lo"]) / 254.0
    q = np.round((np.clip(x, ch["lo"], ch["hi"]) - ch["lo"]) / scale) + 1
    q = np.where(np.isfinite(x), q, 0)
    return q.astype(np.uint8), scale


def write_earth():
    land, f = earth_features()
    lat_c = 90 - (np.arange(NY) + 0.5) * RES
    w_row = np.cos(np.radians(lat_c))[:, None] * np.ones((1, NX))
    idx = np.flatnonzero(land.ravel())
    weights = w_row.ravel()[idx]
    bits = np.packbits(land.ravel(), bitorder="little")
    header = {
        "version": 1,
        "grid": {"res": RES, "nx": NX, "ny": NY, "origin": "row 0 = 90N..89.75N, col 0 = 180W..179.75W", "cells": int(len(idx))},
        "encoding": "uint8 per land cell, 0 = no data; value = offset + (q - 1) * scale; log channels give log10 (relief: log10(m + 1))",
        "files": {"core": "earth-core.bin", "detail": "earth-detail.bin"},
        "maskBytes": int(len(bits)),
        "channels": [],
        "notes": [
            "0.25 deg cells: means of 0.05 deg MODIS CMG pixels; a cell counts only if at least half of it is land, and NDVI and albedo use land pixels only.",
            "Only four months of one year (2024) are sampled, so seasonal figures are approximate.",
            "Polar night: when a month has night LST but no daytime LST poleward of 60 deg, the daytime value is set equal to the night value.",
            "Apparent thermal inertia is not in SI units and is not the same quantity as TES thermal inertia; it is compared by percentile only.",
            "Ice sheets have no NDVI in MOD13C2; frozen cells with no NDVI count as bare (NDVI 0).",
        ],
        "sources": [
            {"id": "MOD11C3", "title": "MODIS/Terra Land Surface Temperature/Emissivity Monthly L3 Global 0.05Deg CMG V061", "url": "https://doi.org/10.5067/MODIS/MOD11C3.061"},
            {"id": "MOD13C2", "title": "MODIS/Terra Vegetation Indices Monthly L3 Global 0.05Deg CMG V061", "url": "https://doi.org/10.5067/MODIS/MOD13C2.061"},
            {"id": "MCD43C3", "title": "MODIS/Terra+Aqua BRDF/Albedo Albedo Daily L3 Global 0.05Deg CMG V061", "url": "https://doi.org/10.5067/MODIS/MCD43C3.061"},
            {"id": "AW3D30", "title": "JAXA ALOS World 3D 30 m DSM v3.2 (via JAXA Earth API, coarsest level)", "url": "https://www.eorc.jaxa.jp/ALOS/en/aw3d30/"},
        ],
    }
    blobs = {"core": [bits.tobytes()], "detail": []}
    offsets = {"core": len(bits), "detail": 0}
    q_cache = {}
    # Reference set for ranking swing and apparent thermal inertia: bare, snow-free ground (NDVI <= 0.2,
    # albedo < 0.5). Moon and Mars surfaces are all bare, and ATI is not meaningful over snow and ice, so
    # these two roles are ranked among Earth's deserts and barrens, not among forests and ice sheets.
    nd, al = f["ndvi"].ravel()[idx], f["albedo"].ravel()[idx]
    bare_ref = (nd <= 0.2) & (al < 0.5)
    log(f"  bare snow-free reference set: {bare_ref.sum():,} cells ({weights[bare_ref].sum() / weights.sum() * 100:.1f}% of land area)")
    for ch in CHANNELS:
        q, scale = quantise(f[ch["key"]].ravel()[idx], ch)
        q_cache[ch["key"]] = q
        entry = {k: ch[k] for k in ("key", "units", "label", "source", "log")}
        entry.update({"file": ch["file"], "offset": ch["lo"], "scale": scale, "byteOffset": offsets[ch["file"]]})
        # Area-weighted CDF over the 256 quantised levels: percentile(q) = cdf[q-1] + w[q]/2 (mid-rank)
        if ch["file"] == "core":
            ok = q > 0
            if ch["key"] in ("swing", "ati"):
                ok &= bare_ref
                entry["pctRef"] = "bare snow-free land (NDVI <= 0.2, albedo < 0.5)"
            else:
                entry["pctRef"] = "all land"
            hist = np.bincount(q[ok], weights=weights[ok], minlength=256)
            hist /= hist.sum()
            cdf = np.cumsum(hist)
            mid = np.concatenate([[0.0], cdf[:-1]]) + hist / 2
            entry["pct"] = [round(float(x), 5) for x in mid]
            entry["coverage"] = round(float(weights[q > 0].sum() / weights.sum()), 4)
        blobs[ch["file"]].append(q.tobytes())
        offsets[ch["file"]] += len(q)
        header["channels"].append(entry)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "earth-core.bin").write_bytes(b"".join(blobs["core"]))
    (OUT / "earth-detail.bin").write_bytes(b"".join(blobs["detail"]))
    (OUT / "earth-grid.json").write_text(json.dumps(header, separators=(",", ":")), encoding="utf-8")
    log(f"  wrote earth-core.bin {offsets['core'] / 1e6:.2f} MB, earth-detail.bin {offsets['detail'] / 1e6:.2f} MB, {len(idx):,} cells")
    np.savez_compressed(CACHE / "earth-q.npz", idx=idx, weights=weights, **q_cache)
    return header


# ------------------------------------------------------------------ PDS helpers (Moon, Mars)

def pds3(path: Path):
    text = path.read_text(encoding="latin-1")

    def kw(name, cast=str, default=None):
        m = re.search(rf"^\s*{name}\s*=\s*\"?([^\"\r\n]+?)\"?\s*(<[^>]*>)?\s*$", text, re.M)
        try:
            return cast(m.group(1).strip()) if m else default
        except ValueError:  # 'N/A' and friends
            return default

    return {
        "lines": kw("LINES", int),
        "samples": kw("LINE_SAMPLES", int),
        "type": kw("SAMPLE_TYPE", str, ""),
        "bits": kw("SAMPLE_BITS", int, 16),
        "scale": kw("SCALING_FACTOR", float, 1.0),
        "offset": kw("OFFSET", float, 0.0),
        "res": kw("MAP_RESOLUTION", float, None),
        "scale_km": kw("MAP_SCALE", float, None),
        "line_off": kw("LINE_PROJECTION_OFFSET", float, None),
        "samp_off": kw("SAMPLE_PROJECTION_OFFSET", float, None),
        "maxlat": kw("MAXIMUM_LATITUDE", float, 90.0),
        "westlon": kw("WESTERNMOST_LONGITUDE", float, 0.0),
    }


def img(path: Path, lab: dict):
    t = lab["type"].upper()
    if "REAL" in t:
        dt = ">f4" if ("MSB" in t or "SUN" in t or t == "IEEE_REAL") else "<f4"
    else:
        dt = (">" if ("MSB" in t or "SUN" in t) else "<") + ("u" if "UNSIGNED" in t else "i") + str(lab["bits"] // 8)
    return np.memmap(path, dtype=dt, mode="r", shape=(lab["lines"], lab["samples"]))


def weighted_pct(values: np.ndarray, weights: np.ndarray, x: float):
    """Area-weighted share of values below x (mid-rank for ties)."""
    ok = np.isfinite(values)
    v, w = values[ok], weights[ok]
    tot = w.sum()
    return float((w[v < x].sum() + 0.5 * w[v == x].sum()) / tot)


# ------------------------------------------------------------------ Mars

def mars_tables():
    d = NASA / "mars"
    lab = pds3(d / "mgs-tes" / "mgst_9001" / "data" / "global_ti_night_2007.lbl")
    ti = np.asarray(img(d / "mgs-tes" / "mgst_9001" / "data" / "global_ti_night_2007.img", lab), dtype=np.float64)
    ti[ti <= 0] = np.nan
    ppd = lab["res"] or lab["samples"] / 360
    ti_lat = 90 - (np.arange(ti.shape[0]) + 0.5) / ppd
    lon, lat, v = np.loadtxt(d / "odyssey-grs" / "ns_epithermal_020917.tab", delimiter=",").T
    ns = np.full((360, 720), np.nan)
    ns[((90 - lat) / 0.5).astype(int).clip(0, 359), ((lon % 360) / 0.5).astype(int).clip(0, 719)] = np.where(v > 0, v, np.nan)
    ns_lat = 90 - (np.arange(360) + 0.5) * 0.5
    rows = np.loadtxt(d / "odyssey-grs" / "h2o_sr_5x5.tab", usecols=(0, 1, 2))
    grs = np.full((36, 72), np.nan)
    for la, lo, val in rows:
        if val < 9000:
            grs[int((90 - la) // 5), int((lo % 360) // 5)] = val
    mola = np.fromfile(d.parent.parent / "textures" / "mars-mola" / "megt90n000eb.img", dtype=">i2").reshape(2880, 5760).astype(np.float64)
    return dict(ti=ti, ti_ppd=ppd, ti_lat=ti_lat, ti_westlon=lab["westlon"], ns=ns, ns_lat=ns_lat, grs=grs, mola=mola)


def win_mean(a, r, c, k=2):
    rows, cols = a.shape
    block = a[max(0, r - k): r + k + 1, [(c + d) % cols for d in range(-k, k + 1)]]
    return float(np.nanmean(block)) if np.isfinite(block).any() else None


def mars_relief(mola: np.ndarray, lat: float, lon: float):
    """MOLA 16 ppd (3.7 km px): 6x6 block means (~22 km), then std over a ~66 km box (3 x 3 blocks, widened E-W)."""
    ppd, b = 16, 6
    r0 = int((90 - lat) * ppd)
    c0 = int((lon % 360) * ppd)
    hw = max(1, round(1 / max(0.05, math.cos(math.radians(lat)))))
    means = []
    for dr in (-1, 0, 1):
        for dc in range(-hw, hw + 1):
            rr = r0 + dr * b - b // 2
            cc = c0 + dc * b - b // 2
            if rr < 0 or rr + b > mola.shape[0]:
                continue
            blk = mola[rr: rr + b, [(cc + j) % mola.shape[1] for j in range(b)]]
            means.append(blk.mean())
    return float(np.std(means))


# ------------------------------------------------------------------ Moon

def moon_relief(lat: float, lon: float):
    """LOLA south-polar 240 m DEM: 92x92 block means (~22 km), std over 3 x 3 blocks (~66 km)."""
    lbl = NASA / "moon" / "lola-south-pole" / "ldem_75s_240m.lbl"
    if lat > -75 or not lbl.exists():
        return None
    lab = pds3(lbl)
    a = img(lbl.with_suffix(".img"), lab)
    R = 1737.4
    rho = 2 * R * math.tan(math.radians(90 + lat) / 2)
    xk, yk = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    px_km = lab["scale_km"] / 1000 if lab["scale_km"] and lab["scale_km"] > 10 else 0.24
    col = lab["samp_off"] + xk / px_km
    row = lab["line_off"] - yk / px_km
    b = int(round(RELIEF_PIXEL_KM / px_km))
    means = []
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            r0 = int(row + dr * b - b / 2)
            c0 = int(col + dc * b - b / 2)
            if r0 < 0 or c0 < 0 or r0 + b > lab["lines"] or c0 + b > lab["samples"]:
                continue
            means.append(float(np.asarray(a[r0: r0 + b, c0: c0 + b], dtype=np.float64).mean()) * lab["scale"])
    return float(np.std(means)) if len(means) >= 5 else None


def moon_prp_sites(sites):
    """Diviner polar resource product, only once fully downloaded: values within 3 km of each site."""
    tab = NASA / "moon" / "diviner" / "polar-resource" / "dlre_prp_south.tab"
    if not complete(tab):
        size = tab.stat().st_size if tab.exists() else 0
        log(f"  Diviner PRP not complete ({size:,} of {FINAL_SIZES[tab]:,} bytes): using published Diviner values")
        return {}
    cache = CACHE / "prp_south_lonlat_tavg_tmax_ice.npy"
    if cache.exists():
        d = np.load(cache)
    else:
        d = np.loadtxt(tab, delimiter=",", skiprows=1, usecols=(9, 10, 12, 13, 14), dtype=np.float32)
        np.save(cache, d)
    lon, lat, tavg, tmax, ice = d.T
    R = 1737.4
    rho = 2 * R * np.tan(np.radians(90 + lat) / 2)
    x, y = rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))
    out = {}
    for s in sites:
        r0 = 2 * R * math.tan(math.radians(90 + s["lat"]) / 2)
        sx, sy = r0 * math.sin(math.radians(s["lon"])), r0 * math.cos(math.radians(s["lon"]))
        m = (np.abs(x - sx) < 3) & (np.abs(y - sy) < 3)
        if m.any():
            out[s["id"]] = {
                "tmaxK": round(float(np.max(tmax[m])), 1),
                "tavgK": round(float(np.mean(tavg[m])), 1),
                "coldTrapShare": round(float(np.mean(tmax[m] < 110)), 3),
                # -999 = ice only deeper than 2.87 m. -1 is not documented in the label but occurs only where the
                # annual maximum is below 110 K (cold traps), so it is counted as ice-stable ground.
                "iceStableShare": round(float(np.mean(ice[m] > -998)), 3),
            }
    return out


def moon_rock_abundance(lat: float, lon: float):
    lbl = NASA / "moon" / "diviner" / "global-maps" / "dgdr_ra_avg_cyl_032_img.lbl"
    if abs(lat) > 60 or not lbl.exists():
        return None, None
    lab = pds3(lbl)
    a = img(lbl.with_suffix(".img"), lab)
    r = int((60 - lat) * 32)
    c = int((lon % 360) * 32)
    block = np.asarray(a[r - 3: r + 4, c - 3: c + 4], dtype=np.float64)
    block[block == -32768] = np.nan
    site = float(np.nanmean(block)) * lab["scale"]
    small = np.asarray(a[::8, ::8], dtype=np.float64)
    small[small == -32768] = np.nan
    small *= lab["scale"]
    w = np.cos(np.radians(60 - (np.arange(small.shape[0]) * 8 + 0.5) / 32))[:, None] * np.ones((1, small.shape[1]))
    return site, weighted_pct(small.ravel(), w.ravel(), site)


# ------------------------------------------------------------------ Targets

DIMENSIONS = [
    dict(id="cold", label="Cold", mode="role", earth="tmean",
         blurb="How cold the ground is compared with the rest of its own world (percentile)."),
    dict(id="swing", label="Day-night swing", mode="role", earth="swing",
         blurb="How strongly the surface heats by day and cools by night, ranked within each world."),
    dict(id="bare", label="Bare & lifeless", mode="absolute", earth="ndvi",
         blurb="No plants: Moon and Mars have none, so the Earth target is NDVI 0 (absolute)."),
    dict(id="inertia", label="Loose vs rocky ground", mode="role", earth="ati",
         blurb="Thermal inertia: fine loose soil heats and cools fast, rock and bedrock slowly (percentile)."),
    dict(id="ice", label="Frozen ground / ice", mode="role", earth="freeze",
         blurb="Ice-favourable ground: hydrogen on Mars, cold traps on the Moon, frozen months on Earth."),
    dict(id="sun", label="Sun angle", mode="absolute", earth="lat",
         blurb="Highest noon Sun of the year, in degrees. Set by latitude and axial tilt (absolute)."),
    dict(id="relief", label="Terrain relief", mode="absolute", earth="relief",
         blurb="Height variation over ~66 km, in metres: plains vs craters and mountains (absolute)."),
]

OBLIQUITY = {"earth": 23.44, "moon": 1.54, "mars": 25.19}

MOON_PUBLISHED = {
    "polar": {
        "temps": "Diviner: sunlit south-polar ridges stay roughly 90-220 K over a year (about -180 to -50 C); the permanently shadowed floors beside them stay below 110 K, some below 40 K.",
        "refs": ["Paige et al. 2010, Science 330:479 (Diviner cold traps)", "Williams et al. 2019, JGR Planets 124:2505 (seasonal polar temperatures)"],
    },
    "equatorial": {
        "temps": "Diviner: near the equator the surface swings from about 390 K at noon to about 95 K before dawn (about +120 C to -180 C).",
        "refs": ["Williams et al. 2017, Icarus 283:300 (global surface temperatures of the Moon)"],
    },
}


def snap_earth_pct(channel: dict, q_world: float):
    """Earth percentile equivalent to an own-world percentile: find the Earth level at that quantile and return
    its mid-rank percentile (snaps to ties, e.g. the large share of land with freezing index 0)."""
    pct = channel["pct"]
    hist_cdf = []
    # rebuild cdf from mid-ranks: cdf[i] = 2*mid[i] - cdf[i-1]
    prev = 0.0
    for m in pct:
        c = 2 * m - prev
        hist_cdf.append(c)
        prev = c
    for i in range(1, 256):
        if hist_cdf[i] >= q_world and hist_cdf[i] > hist_cdf[i - 1]:
            return round(pct[i], 4), i
    return round(pct[255], 4), 255


def max_sun(lat: float, world: str):
    return min(90.0, 90 - abs(lat) + OBLIQUITY[world])


def build_targets(header):
    chans = {c["key"]: c for c in header["channels"]}
    sites_ts = (ROOT / "lib" / "data" / "sites.ts").read_text(encoding="utf-8")
    coords = json.loads((ROOT / "scripts" / "sites-coords.json").read_text(encoding="utf-8"))
    samples = json.loads((NASA / "site-samples.json").read_text(encoding="utf-8"))
    targets = []

    def name_of(sid):
        m = re.search(rf'id: "{sid}",\s*world: "\w+",\s*name: "([^"]+)"', sites_ts) or re.search(rf'\["{sid}",\s*"([^"]+)"', sites_ts)
        return m.group(1) if m else sid

    def role(dim_id, q_world, note, absolute=None):
        ch = chans[next(d["earth"] for d in DIMENSIONS if d["id"] == dim_id)]
        ep, level = snap_earth_pct(ch, q_world)
        return {"mode": "role", "worldPct": round(q_world, 4), "earthPct": ep, "note": note, **({"value": absolute} if absolute else {})}

    # ---- Mars
    mt = mars_tables()
    ti, ti_lat = mt["ti"], mt["ti_lat"]
    w_ti = np.cos(np.radians(ti_lat))[:, None] * np.ones((1, ti.shape[1]))
    ti_small, w_small = ti[::4, ::4], w_ti[::4, ::4]
    amp_small = np.cos(np.radians(ti_lat[::4]))[:, None] / ti_small  # first-order diurnal amplitude proxy
    ns_w = np.cos(np.radians(mt["ns_lat"]))[:, None] * np.ones((1, 720))
    mars_ids = [k for k in coords["mars"]]
    for sid in mars_ids:
        lat, lon = coords["mars"][sid]
        smp = samples["mars"].get(sid, {})
        r = int((90 - lat) * mt["ti_ppd"])
        c = int(((lon - mt["ti_westlon"]) % 360) * mt["ti_ppd"])
        ti_site = smp.get("tes_thermal_inertia_night") or win_mean(ti, r, c)
        ns_site = smp.get("ns_epithermal_counts_s") or win_mean(mt["ns"], int((90 - lat) / 0.5), int((lon % 360) / 0.5))
        grs_site = smp.get("grs_water_wt_percent")
        relief = mars_relief(mt["mola"], lat, lon)
        q_cold = 1 - math.sin(math.radians(abs(lat)))
        q_ti = weighted_pct(ti_small.ravel(), w_small.ravel(), ti_site)
        q_amp = weighted_pct(amp_small.ravel(), w_small.ravel(), math.cos(math.radians(lat)) / ti_site)
        # More hydrogen = fewer epithermal neutrons. Ice role = share of Mars with fewer hydrogen (more counts).
        q_ice = 1 - weighted_pct(mt["ns"].ravel(), ns_w.ravel(), ns_site)
        dims = {
            "cold": role("cold", q_cold, "Mars' average surface temperature is set mainly by latitude, so the share of Mars colder than this site is taken as the area share closer to the poles (approximation)."),
            "swing": role("swing", q_amp, "First-order energy balance: daily swing grows with sunlight (cos latitude) and shrinks with thermal inertia. Ranked over the whole TES map.",
                          {"v": round(math.cos(math.radians(lat)) / ti_site * 1000, 2), "units": "cos(lat)/TI x1000", "source": "MGS TES"}),
            "bare": {"mode": "absolute", "value": {"v": 0, "units": "NDVI", "source": "No vegetation on Mars"}, "earthTarget": 0.0,
                     "note": "Mars has no plants; any Earth vegetation is a difference."},
            "inertia": role("inertia", q_ti, "TES night thermal inertia ranked over Mars, matched to apparent thermal inertia ranked over Earth's land. Different units, same idea: loose fines vs rock.",
                            {"v": round(ti_site), "units": "J m-2 K-1 s-1/2 (tiu)", "source": "MGS TES night thermal inertia (Putzig & Mellon 2007)"}),
            "ice": role("ice", q_ice, "Odyssey neutron counts ranked over Mars (fewer epithermal neutrons = more hydrogen = more ground ice), matched to Earth's freezing index. Near the equator much of this hydrogen sits in hydrated minerals rather than ice, so the ice role there is an upper bound.",
                        {"v": round(ns_site, 2), "units": "epithermal counts/s (lower = more H)", "source": "Mars Odyssey Neutron Spectrometer"}),
            "sun": {"mode": "absolute", "earthTarget": round(max_sun(lat, "mars"), 1), "value": {"v": round(max_sun(lat, "mars"), 1), "units": "deg", "source": "latitude + 25.19 deg axial tilt"},
                    "note": "Mars' tilt (25.2 deg) is close to Earth's (23.4 deg), so the same latitude gives a similar Sun path and seasons."},
            "relief": {"mode": "absolute", "earthTarget": round(relief), "value": {"v": round(relief), "units": "m", "source": "MGS MOLA MEGDR 16 ppd, std over ~66 km"},
                       "note": "Same method as on Earth: 22 km block means, standard deviation over a ~66 km box."},
        }
        targets.append({
            "id": sid, "world": "mars", "name": name_of(sid), "lat": lat, "lon": lon, "dims": dims,
            "facts": [f for f in [
                {"label": "TES thermal inertia (night)", "v": round(ti_site), "units": "tiu", "source": "MGS TES"},
                {"label": "Neutron epithermal counts", "v": round(ns_site, 2), "units": "counts/s", "source": "Odyssey NS"},
                {"label": "GRS water-equivalent hydrogen", "v": grs_site, "units": "wt %", "source": "Odyssey GRS"} if grs_site is not None else
                {"label": "GRS water-equivalent hydrogen", "v": None, "units": "wt %", "source": "Odyssey GRS (masked poleward of ~±60 deg)"},
                {"label": "Terrain relief (~66 km)", "v": round(relief), "units": "m", "source": "MGS MOLA"},
            ]],
            "temps": "Mars ground at low latitudes ranges roughly from −90 °C before dawn to 0–20 °C at midday (Curiosity REMS, Perseverance MEDA).",
        })
        log(f"  {sid:24} TI {ti_site:6.0f} q{q_ti:.2f}  NS {ns_site:5.2f} qIce {q_ice:.2f}  qCold {q_cold:.2f}  qSwing {q_amp:.2f}  relief {relief:5.0f} m")

    # ---- Moon
    moon_sites = [{"id": k, "lat": v[0], "lon": v[1]} for k, v in coords["moon"].items() if k != "moon-nobile-rim-2"]
    prp = moon_prp_sites([s for s in moon_sites if s["lat"] < -75])
    for s in moon_sites:
        sid, lat, lon = s["id"], s["lat"], s["lon"]
        polar = lat < -75
        relief = moon_relief(lat, lon)
        q_cold = 1 - math.sin(math.radians(abs(lat)))
        ra, q_ra = moon_rock_abundance(lat, lon)
        m = prp.get(sid)
        if polar:
            q_ice = 1 - q_cold
            ice_note = "Within a few km of permanently shadowed cold traps where Diviner finds water ice can survive; among the most ice-favourable ~1% of the Moon."
            if m:
                ice_note += f" Diviner PRP: {m['iceStableShare'] * 100:.0f}% of the ground within 3 km keeps ice stable within 2.87 m."
        else:
            q_ice = 0.02
            ice_note = "Equatorial ground: too hot by day for surface ice. Ice role near the bottom of the Moon's range."
        dims = {
            "cold": role("cold", q_cold, "Diviner shows lunar average temperature is set mainly by latitude, so the share of the Moon colder than a site is the area share closer to the poles. Earth has nothing as cold: we match the role, not the number."),
            "swing": role("swing", q_cold if polar else 0.97, "Polar ground sees a low Sun circling the horizon: one of the smallest day-night swings on the Moon." if polar else "Equatorial lunar ground has one of the largest swings in the Solar System (~300 K)."),
            "bare": {"mode": "absolute", "value": {"v": 0, "units": "NDVI", "source": "No vegetation on the Moon"}, "earthTarget": 0.0, "note": "The Moon has no plants."},
            "inertia": role("inertia", q_ra if q_ra is not None else 0.05,
                            ("Diviner rock abundance ranked over the Moon (60S-60N); rockier ground has higher thermal inertia." if q_ra is not None else
                             "Polar sites lie outside Diviner's rock-abundance map. Lunar regolith (~50 tiu, Hayne et al. 2017) is looser than almost any Earth surface, so the target is Earth's lowest-inertia 5%."),
                            {"v": round(ra * 100, 1), "units": "% rock cover", "source": "LRO Diviner rock abundance (Bandfield et al. 2011)"} if ra is not None else
                            {"v": 55, "units": "tiu (typical regolith)", "source": "LRO Diviner, Hayne et al. 2017"}),
            "ice": role("ice", q_ice, ice_note),
            "sun": {"mode": "absolute", "earthTarget": round(max_sun(lat, "moon"), 1), "value": {"v": round(max_sun(lat, "moon"), 1), "units": "deg", "source": "latitude + 1.54 deg axial tilt"},
                    "note": ("The Sun never rises more than a few degrees here. On Earth even the poles get 23 deg: no Earth place matches this." if polar else "Moon's tiny tilt: the Sun path barely changes over a year.")},
        }
        if relief is not None:
            dims["relief"] = {"mode": "absolute", "earthTarget": round(relief), "value": {"v": round(relief), "units": "m", "source": "LRO LOLA south-polar DEM 240 m, std over ~66 km"},
                              "note": "Same method as on Earth: 22 km block means, standard deviation over a ~66 km box."}
        pub = MOON_PUBLISHED["polar" if polar else "equatorial"]
        facts = [{"label": "Latitude", "v": lat, "units": "deg", "source": "USGS Gazetteer / NASA Artemis III regions"}]
        if m:
            facts += [
                {"label": "Annual max temperature", "v": m["tmaxK"], "units": "K", "source": "LRO Diviner PRP"},
                {"label": "Annual average temperature", "v": m["tavgK"], "units": "K", "source": "LRO Diviner PRP"},
                {"label": "Ground with ice stable within 2.87 m", "v": round(m["iceStableShare"] * 100), "units": "%", "source": "LRO Diviner PRP"},
            ]
        if relief is not None:
            facts.append({"label": "Terrain relief (~66 km)", "v": round(relief), "units": "m", "source": "LRO LOLA"})
        if ra is not None:
            facts.append({"label": "Rock abundance", "v": round(ra * 100, 1), "units": "%", "source": "LRO Diviner"})
        temps = pub["temps"]
        if m:
            temps = (f"Diviner, within 3 km of the listed coordinate: annual maximum {m['tmaxK']:.0f} K ({m['tmaxK'] - 273.15:.0f} °C), "
                     f"annual average {m['tavgK']:.0f} K ({m['tavgK'] - 273.15:.0f} °C)"
                     + ("; this spot is a cold trap (never above 110 K). " if m["tmaxK"] < 110 else ". ")
                     + "Region coordinates are approximate, and sunlit ridge tops nearby run warmer. No place on Earth gets this cold: "
                       "the coldest ground measured on Earth is about −98 °C (175 K).")
        targets.append({"id": sid, "world": "moon", "name": name_of(sid).replace("Nobile Rim 1", "Nobile Rim"), "lat": lat, "lon": lon, "dims": dims,
                        "facts": facts, "temps": temps, "refs": pub["refs"] + (["LRO Diviner polar resource product (Paige et al., PDS LRO-L-DLRE-5-PRP-V2.0)"] if m else []),
                        "measured": bool(m)})
        log(f"  {sid:24} qCold {q_cold:.4f} relief {relief if relief is None else round(relief)} RA {ra}")

    doc = {
        "version": 1,
        "dimensions": DIMENSIONS,
        "obliquity": OBLIQUITY,
        "targets": targets,
        "sources": [
            {"id": "TES", "title": "MGS TES global thermal inertia (Putzig & Mellon 2007), PDS mgst_9001", "url": "https://pds-geosciences.wustl.edu/missions/mgs/tes.html"},
            {"id": "ODY-NS", "title": "Mars Odyssey GRS suite: neutron spectrometer epithermal map and GRS water map", "url": "https://pds-geosciences.wustl.edu/missions/odyssey/grs.html"},
            {"id": "MOLA", "title": "MGS MOLA MEGDR 16 ppd", "url": "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html"},
            {"id": "LOLA", "title": "LRO LOLA south-polar DEM 240 m", "url": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm"},
            {"id": "DIVINER", "title": "LRO Diviner GDR rock abundance and polar resource product", "url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm"},
        ],
        "built": {"diviner_prp": bool(prp), "minirf": complete(NASA / "moon" / "minirf" / "global_cpr_32ppd_simp_0c.img")},
    }
    (OUT / "targets.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
    log(f"  wrote targets.json ({len(targets)} targets)")
    return doc


def main():
    only_targets = "--targets" in sys.argv
    hdr_path = OUT / "earth-grid.json"
    if only_targets and hdr_path.exists():
        header = json.loads(hdr_path.read_text(encoding="utf-8"))
    else:
        log("Earth grid")
        header = write_earth()
    log("Targets")
    build_targets(header)


if __name__ == "__main__":
    main()
