"""
Analog Finder parameters: the thirteen site-vs-target conditions as Earth-wide grids, so the Finder ranks every land
cell on exactly the parameters its breakdown table shows.

  python -I scripts/build-finder-params.py

Run after scripts/build-finder.py and scripts/build-finder-conditions.py (it reads their outputs). Needs numpy,
Pillow and numcodecs (pip install numcodecs). Downloads (~10 MB, cached under assets-raw/nasa/):
  NASA POWER climatology, MERRA-2 0.5 x 0.625 deg  (AWS Open Data, s3://nasa-power, Zarr): T2M, T2M_MAX, T2M_MIN,
                                                    PRECTOTCORR, RH2M, PS, annual values
  NASA POWER climatology, CERES SYN1deg 1 deg       AOD_55, annual value
  ISRIC SoilGrids 2.0 (WCS, EPSG:4326)              sand share of the top 5 cm, 1/16 deg, averaged to 0.25 deg

Outputs
  public/data/finder/earth-params.json + earth-params.bin
      bin = land mask (same bit layout as earth-core.bin) then one uint8 per land cell per channel:
      tmean, trange, precip, rh, ps, aod, sand, slope, isolation, elev.
      Every channel: 0 = no data, value = offset + (q - 1) * scale (log channels: 10 ** value - 1), and `pct`, the
      area-weighted percentile of each level over Earth's land. Radiation (from elevation) and daylight (from
      latitude) are computed in the browser.
  lib/finder/params.generated.json
      the closeness curve of every parameter and each Moon / Mars target's value, mode and Earth reach.

The scoring maths lives in lib/finder/model.ts and is mirrored in ml/twinworlds_ml.py.
"""

import importlib.util
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FINDER = ROOT / "public" / "data" / "finder"
NASA = ROOT / "assets-raw" / "nasa"
CACHE = NASA / "finder-params"
OUT_PARAMS = ROOT / "lib" / "finder" / "params.generated.json"
MOLA = ROOT / "assets-raw" / "textures" / "mars-mola" / "megt90n000eb.img"
LOLA = NASA / "moon" / "lola-south-pole" / "ldem_75s_240m.lbl"

POWER = "https://nasa-power.s3.us-west-2.amazonaws.com"
MERRA2 = f"{POWER}/merra2/spatial/power_merra2_climatology_spatial_utc.zarr"
SYN1DEG = f"{POWER}/syn1deg/spatial/power_syn1deg_climatology_spatial_utc.zarr"
ANNUAL = 12  # climatology time index: 0..11 = Jan..Dec, 12 = annual
SOIL_PX = 16  # SoilGrids samples per degree before averaging to 0.25 deg

# Closeness curves (Gaussian on the difference; sigma in the parameter's units, or in decades on log rows, where
# `log` is the offset added before log10). The browser reads these from params.generated.json.
CURVES = {
    "tmean": {"sigma": 15},
    "trange": {"sigma": 20},
    "radiation": {"sigma": 0.3, "log": 0.1},
    "slope": {"sigma": 1.5},
    "sand": {"sigma": 20},
    "pressure": {"sigma": 0.3, "log": 0.001},
    "daylight": {"sigma": 3},
    "precip": {"sigma": 60},
    "rh": {"sigma": 20},
    "aod": {"sigma": 0.25},
    "isolation": {"sigma": 0.5, "log": 1},
    "elev": {"sigma": 0.12},  # rank within each world
    "water": {"sigma": 0},
}
# Earth channel behind each numeric parameter ("dose" and "daylight" are derived from elevation and latitude).
CHANNEL_OF = {"tmean": "tmean", "trange": "trange", "radiation": "dose", "slope": "slope", "sand": "sand",
              "pressure": "ps", "daylight": "daylight", "precip": "precip", "rh": "rh", "aod": "aod",
              "isolation": "isolation"}
TOWARD_BELOW = 0.3  # best Earth closeness under this: rank Earth by how far it goes toward the target instead
UNREACHABLE = 0.25  # target beyond Earth's land range by more than this many sigma: "unreachable on Earth"

ORBIT = {"earth": (23.44, 24.0), "moon": (1.54, 708.7), "mars": (25.19, 24.66)}

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("build_finder", ROOT / "scripts" / "build-finder.py")
bf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bf)


def log(*a):
    print(*a, flush=True)


def get(url: str, cache: Path, timeout=300) -> bytes:
    if cache.exists() and cache.stat().st_size > 0:
        return cache.read_bytes()
    for attempt in range(3):
        try:
            data = urllib.request.urlopen(url, timeout=timeout).read()
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(data)
            return data
        except Exception as e:  # network resets: try again
            log(f"    retry {attempt + 1}: {e}")
    raise RuntimeError(f"download failed: {url}")


# ------------------------------------------------------------------ Earth cells

def earth_cells():
    header = json.loads((FINDER / "earth-grid.json").read_text(encoding="utf-8"))
    nx, ny, n, res = (header["grid"][k] for k in ("nx", "ny", "cells", "res"))
    core = np.fromfile(FINDER / "earth-core.bin", dtype=np.uint8)
    mask = core[: header["maskBytes"]]
    land = np.unpackbits(mask, bitorder="little")[: nx * ny].astype(bool)
    g = np.flatnonzero(land)
    rows, cols = g // nx, g % nx
    lat = 90 - (rows + 0.5) * res
    lon = -180 + (cols + 0.5) * res
    detail = np.fromfile(FINDER / "earth-detail.bin", dtype=np.uint8)
    ch = next(c for c in header["channels"] if c["key"] == "elev")
    q = detail[ch["byteOffset"]: ch["byteOffset"] + n].astype(np.float64)
    elev = np.where(q > 0, ch["offset"] + (q - 1) * ch["scale"], np.nan)
    site = json.loads((FINDER / "earth-site.json").read_text(encoding="utf-8"))
    sbin = np.fromfile(FINDER / "earth-site.bin", dtype=np.uint8)
    extra = {}
    for c in site["channels"]:
        q = sbin[c["byteOffset"]: c["byteOffset"] + n].astype(np.float64)
        v = np.where(q > 0, c["offset"] + (q - 1) * c["scale"], np.nan)
        extra[c["key"]] = (10 ** v - 1 if c["log"] else v, c)
    return dict(header=header, nx=nx, ny=ny, n=n, res=res, mask=mask, rows=rows, cols=cols, lat=lat, lon=lon,
                area=np.cos(np.radians(lat)), elev=elev, elev_ch=ch, site=extra)


# ------------------------------------------------------------------ NASA POWER (Zarr on AWS)

def zarr_annual(store: str, var: str, tag: str):
    """One annual-mean chunk of a POWER climatology Zarr store, with its lat / lon axes."""
    import numcodecs

    meta = json.loads(get(f"{store}/.zmetadata", CACHE / f"{tag}.zmetadata.json"))["metadata"]

    def read(name, key):
        za = meta[f"{name}/.zarray"]
        raw = get(f"{store}/{name}/{key}", CACHE / f"{tag}.{name}.{key}")
        a = np.frombuffer(numcodecs.get_codec(za["compressor"]).decode(raw), dtype=za["dtype"])
        for f in reversed(za.get("filters") or []):
            a = numcodecs.get_codec(f).decode(a)
        return np.asarray(a, dtype=np.float64), za

    lat, _ = read("lat", "0")
    lon, _ = read("lon", "0")
    a, za = read(var, f"{ANNUAL}.0.0")
    a = a.reshape(za["shape"][1:])
    a[(a < -900) | ~np.isfinite(a)] = np.nan
    return a, lat, lon, meta[f"{var}/.zattrs"].get("units", "")


def bilinear(a: np.ndarray, alat: np.ndarray, alon: np.ndarray, lat: np.ndarray, lon: np.ndarray):
    """Sample a regular lat/lon grid (ascending axes, longitudes wrapping) at points; NaN neighbours are skipped."""
    dlat, dlon = alat[1] - alat[0], alon[1] - alon[0]
    fy = np.clip((lat - alat[0]) / dlat, 0, len(alat) - 1)
    fx = ((lon - alon[0]) / dlon) % len(alon)
    y0 = np.minimum(np.floor(fy).astype(int), len(alat) - 2)
    x0 = np.floor(fx).astype(int) % len(alon)
    x1 = (x0 + 1) % len(alon)
    ty, tx = fy - y0, fx - np.floor(fx)
    num = np.zeros(lat.shape)
    den = np.zeros(lat.shape)
    for yy, xx, w in ((y0, x0, (1 - ty) * (1 - tx)), (y0, x1, (1 - ty) * tx), (y0 + 1, x0, ty * (1 - tx)), (y0 + 1, x1, ty * tx)):
        v = a[yy, xx]
        ok = np.isfinite(v)
        num += np.where(ok, v * w, 0)
        den += np.where(ok, w, 0)
    return np.where(den > 0, num / np.maximum(den, 1e-9), np.nan)


def earth_climate(e):
    out = {}
    for var in ("T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "PS"):
        a, alat, alon, units = zarr_annual(MERRA2, var, "merra2")
        out[var] = bilinear(a, alat, alon, e["lat"], e["lon"])
        log(f"  {var:12s} {units:7s} land range {np.nanmin(out[var]):8.2f} .. {np.nanmax(out[var]):8.2f}")
    a, alat, alon, units = zarr_annual(SYN1DEG, "AOD_55", "syn1deg")
    out["AOD_55"] = bilinear(a, alat, alon, e["lat"], e["lon"])
    log(f"  {'AOD_55':12s} {units[:7]:7s} land range {np.nanmin(out['AOD_55']):8.2f} .. {np.nanmax(out['AOD_55']):8.2f}")
    return out


# ------------------------------------------------------------------ SoilGrids sand (WCS)

def earth_sand(e):
    from PIL import Image

    lat0, lat1 = -60, 84  # SoilGrids has no soil on Antarctica; the grid ends near 84 N
    w, h = 360 * SOIL_PX, (lat1 - lat0) * SOIL_PX
    url = (
        "https://maps.isric.org/mapserv?map=/map/sand.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
        f"&COVERAGEID=sand_0-5cm_mean&FORMAT=GEOTIFF_INT16&SUBSET=X(-180,180)&SUBSET=Y({lat0},{lat1})"
        "&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
        f"&SCALESIZE=X({w}),Y({h})"
    )
    tif = get(url, NASA / "soilgrids" / f"sand_0-5cm_mean_{SOIL_PX}ppd.tif", timeout=600)
    a = np.asarray(Image.open(io.BytesIO(tif)), dtype=np.float64)
    assert a.shape == (h, w), a.shape
    a[a <= 0] = np.nan  # 0 = no soil (water, ice, bare rock)
    k = SOIL_PX // 4
    blocks = a.reshape(h // k, k, w // k, k)
    valid = np.isfinite(blocks).sum(axis=(1, 3))
    mean = np.where(valid >= k * k // 4, np.nansum(blocks, axis=(1, 3)) / np.maximum(valid, 1), np.nan) / 10  # g/kg -> %
    r0 = int(round((90 - lat1) / e["res"]))
    out = np.full(e["n"], np.nan)
    inside = (e["rows"] >= r0) & (e["rows"] < r0 + mean.shape[0])
    out[inside] = mean[e["rows"][inside] - r0, e["cols"][inside]]
    log(f"  sand         %       land coverage {np.isfinite(out).mean() * 100:5.1f} %, median {np.nanmedian(out):.0f} %")
    return out


# ------------------------------------------------------------------ derived Earth values (mirrors lib/finder)

def earth_dose(elev):
    """lib/finder/conditions.ts earthDose: UNSCEAR 2000 cosmic + terrestrial background, µSv/day."""
    z = np.maximum(0, np.nan_to_num(elev)) / 1000
    return ((36.5 * 2 ** (z / 1.5) + 41) * 24) / 1000


def longest_daylight(lat, obliquity, day):
    x = -np.tan(np.radians(np.abs(lat))) * np.tan(np.radians(obliquity))
    return np.where(x <= -1, day, np.where(x >= 1, 0, np.arccos(np.clip(x, -1, 1)) / np.pi * day))


# ------------------------------------------------------------------ quantised channels

def channel(key, values, area, lo, hi, *, log10=False, units, label, source):
    v = np.log10(np.maximum(values, 0) + 1) if log10 else values
    scale = (hi - lo) / 254
    q = np.zeros(v.shape, np.uint8)
    ok = np.isfinite(v)
    q[ok] = np.clip(np.round((np.clip(v[ok], lo, hi) - lo) / scale) + 1, 1, 255).astype(np.uint8)
    # area-weighted mid-rank percentile of each level over the land cells that have data
    w = np.bincount(q, weights=area, minlength=256)
    w[0] = 0
    tot = w.sum()
    below = np.concatenate([[0], np.cumsum(w)[:-1]])
    pct = (below + 0.5 * w) / tot
    meta = {"key": key, "units": units, "log": log10, "offset": lo, "scale": scale, "label": label, "source": source,
            "coverage": round(float(ok.mean()), 4), "pct": [round(float(p), 5) for p in pct]}
    return q, meta


# ------------------------------------------------------------------ targets

MARS_WATER = {"mars-jezero", "mars-gale", "mars-mawrth-vallis", "mars-utopia-viking2", "mars-arcadia", "mars-hellas", "mars-phoenix"}


def world_elev_pct(world: str, elev: float, mola: np.ndarray | None, lola: np.ndarray | None):
    """Area-weighted share of the world's surface lower than `elev` (Mars: all of MOLA; Moon: LOLA south of 75 S)."""
    if world == "mars":
        lat = 90 - (np.arange(mola.shape[0]) + 0.5) * 180 / mola.shape[0]
        w = np.repeat(np.cos(np.radians(lat))[:, None], mola.shape[1], axis=1)
        return bf.weighted_pct(mola.ravel(), w.ravel(), elev)
    return bf.weighted_pct(lola, np.ones_like(lola), elev)


def target_params(t: dict, tt: dict | None, curves_earth: dict, mola, lola):
    moon = t["world"] == "moon"
    facts = {f["label"].lower(): f["v"] for f in t["facts"]}
    fact = lambda word: next((v for k, v in facts.items() if word in k and v is not None), None)  # noqa: E731
    t_avg, t_max = fact("annual average temperature"), fact("annual max temperature")
    marius = t["id"] == "moon-marius-hills-pit"
    rover = t["id"] in ("mars-gale", "mars-jezero")
    ti = None if moon else fact("thermal inertia")
    obl, day = ORBIT[t["world"]]

    v = {}
    v["tmean"] = (t_avg - 273.15) if (moon and t_avg is not None) else (None if moon else -63.0)
    if marius:
        v["trange"] = 295.0
    elif moon and t_avg is not None and t_max is not None:
        v["trange"] = {"v": t_max - t_avg, "min": True}  # annual max minus mean: the full range is at least this
    else:
        v["trange"] = 100.0 if rover else None
    # Mars: Curiosity RAD at Gale (Hassler et al. 2014). Moon: no NASA surface value, but with no air or magnetic
    # field the dose is higher than on Mars, so Earth is ranked toward a higher dose.
    v["radiation"] = {"v": None, "dir": 1} if moon else 640.0
    v["slope"] = tt["slope"] if tt and tt.get("slope") is not None else None
    v["sand"] = 55.0 if moon else (None if ti is None else 20.0 if ti < 150 else 85.0 if ti <= 420 else None)
    v["pressure"] = 0.0 if moon else (0.636 * math.exp(-tt["elev"] / 11100) if tt else None)
    v["daylight"] = float(longest_daylight(np.array(t["lat"]), obl, day))
    v["precip"] = 0.0
    v["rh"] = 0.0
    v["aod"] = 0.0 if moon else 0.5
    v["isolation"] = 384400.0 if moon else 2.25e8

    out = {}
    for pid, raw in v.items():
        spec = raw if isinstance(raw, dict) else {"v": raw}
        tv = spec["v"]
        if tv is None and "dir" not in spec:
            continue
        rng = curves_earth[CHANNEL_OF[pid]]
        c = CURVES[pid]
        f = (lambda x: math.log10(max(0.0, x) + c["log"])) if "log" in c else (lambda x: x)  # noqa: E731
        p = {"v": None if tv is None else round(tv, 4)}
        if tv is None:
            p.update(mode="toward", dir=spec["dir"], unreachable=True)
        else:
            lo, hi = f(rng[0]), f(rng[1])
            x = f(tv)
            d = max(0.0, x - hi) if spec.get("min") else max(0.0, lo - x, x - hi)
            best = math.exp(-0.5 * (d / c["sigma"]) ** 2)
            if spec.get("min"):
                p["min"] = True
            if d > UNREACHABLE * c["sigma"]:
                p["unreachable"] = True
            if best < TOWARD_BELOW:
                p.update(mode="toward", dir=1 if x > hi else -1)
            else:
                p["mode"] = "near"
        out[pid] = p
    if tt:
        out["elev"] = {"v": tt["elev"], "mode": "rank", "pct": round(world_elev_pct(t["world"], tt["elev"], mola, lola), 4)}
    out["water"] = {"v": 0 if marius else 1, "mode": "match"}  # 1 = the target has water-formed minerals or ice
    return out


def lola_polar():
    if not LOLA.exists():
        return None
    lab = bf.pds3(LOLA)
    a = np.asarray(bf.img(LOLA.with_suffix(".img"), lab)[::4, ::4], dtype=np.float64) * lab["scale"]
    yy, xx = np.mgrid[0: a.shape[0], 0: a.shape[1]]
    c = (np.array(a.shape) - 1) / 2
    inside = (yy - c[0]) ** 2 + (xx - c[1]) ** 2 <= c[0] ** 2  # south of 75 S: the inscribed circle
    return a[inside]


# ------------------------------------------------------------------ main

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    e = earth_cells()
    n = e["n"]
    log(f"Earth: {n:,} land cells")
    log("NASA POWER climatology (AWS Zarr):")
    clim = earth_climate(e)
    log("ISRIC SoilGrids 2.0:")
    sand = earth_sand(e)

    trange = clim["T2M_MAX"] - clim["T2M_MIN"]
    precip = clim["PRECTOTCORR"] * 365.25
    ps = clim["PS"] / 10  # hPa -> kPa
    slope, slope_ch = e["site"]["slope"]
    iso, iso_ch = e["site"]["isolation"]
    pw = "NASA POWER climatology, MERRA-2 (AWS Open Data Zarr), annual"
    a = e["area"]
    chans = [
        channel("tmean", clim["T2M"], a, -60, 35, units="°C", label="Mean air temperature at 2 m", source=f"{pw} T2M"),
        channel("trange", trange, a, 0, 100, units="°C", label="Warmest minus coldest month (T2M_MAX − T2M_MIN)", source=f"{pw} T2M_MAX, T2M_MIN"),
        channel("precip", precip, a, 0, 4.2, log10=True, units="mm/yr", label="Precipitation (corrected)", source=f"{pw} PRECTOTCORR"),
        channel("rh", clim["RH2M"], a, 0, 100, units="%", label="Relative humidity at 2 m", source=f"{pw} RH2M"),
        channel("ps", ps, a, 45, 106, units="kPa", label="Surface pressure", source=f"{pw} PS"),
        channel("aod", clim["AOD_55"], a, 0, 1.2, units="AOD", label="Aerosol optical depth at 550 nm", source="NASA POWER climatology, CERES SYN1deg (AWS Open Data Zarr), annual AOD_55"),
        channel("sand", sand, a, 0, 100, units="%", label="Sand share of the top 5 cm", source="ISRIC SoilGrids 2.0 (WCS), 1/16° averaged to 0.25°"),
        channel("slope", slope, a, 0, 15, units="°", label=slope_ch["label"], source=slope_ch["source"]),
        channel("isolation", iso, a, 0, 3.7, log10=True, units="km", label=iso_ch["label"], source=iso_ch["source"]),
        channel("elev", e["elev"], a, -500, 7000, units="m", label=e["elev_ch"]["label"], source=e["elev_ch"]["source"]),
    ]
    blob = [e["mask"].tobytes()]
    offset = len(blob[0])
    meta_ch = []
    for q, m in chans:
        m["byteOffset"] = offset
        offset += n
        blob.append(q.tobytes())
        meta_ch.append(m)
    (FINDER / "earth-params.bin").write_bytes(b"".join(blob))
    sources = [
        {"id": "power-ard", "title": "NASA POWER Analysis Ready Data (MERRA-2 and CERES SYN1deg climatology, AWS Open Data)", "url": "https://registry.opendata.aws/nasa-power/"},
        {"id": "soilgrids", "title": "ISRIC SoilGrids 2.0: sand content, 0–5 cm", "url": "https://soilgrids.org/"},
        {"id": "aw3d30", "title": "JAXA ALOS World 3D 30 m (AW3D30) v3.2 DSM", "url": "https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm"},
        {"id": "natural-earth", "title": "Natural Earth 10m populated places", "url": "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/"},
    ]
    (FINDER / "earth-params.json").write_text(json.dumps({
        "version": 1, "cells": n, "maskBytes": len(blob[0]), "channels": meta_ch, "sources": sources,
        "notes": [
            "Climate is the 2001–2020 MERRA-2 / CERES annual climatology from NASA POWER, sampled bilinearly at each 0.25° cell centre.",
            "Radiation dose is estimated from elevation (UNSCEAR 2000 cosmic + terrestrial background) and daylight from latitude.",
        ],
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Wrote earth-params.bin ({offset / 1e6:.2f} MB)")

    # Earth's land range of every numeric parameter, for each target's mode and "unreachable" flag.
    def rng(x):
        return [float(np.nanmin(x)), float(np.nanmax(x))]
    dose = earth_dose(e["elev"])
    daylight = longest_daylight(e["lat"], *ORBIT["earth"])
    earth_rng = {"tmean": rng(clim["T2M"]), "trange": rng(trange), "precip": rng(precip), "rh": rng(clim["RH2M"]),
                 "ps": rng(ps), "aod": rng(clim["AOD_55"]), "sand": rng(sand), "slope": rng(slope),
                 "isolation": rng(iso), "dose": rng(dose[np.isfinite(e["elev"])]), "daylight": rng(daylight)}

    targets = json.loads((FINDER / "targets.json").read_text(encoding="utf-8"))["targets"]
    terrain = json.loads((ROOT / "lib" / "finder" / "target-terrain.generated.json").read_text(encoding="utf-8"))
    mola = np.fromfile(MOLA, dtype=">i2").reshape(2880, 5760).astype(np.float64)[::2, ::2]
    lola = lola_polar()
    out_t = {}
    for t in targets:
        out_t[t["id"]] = target_params(t, terrain.get(t["id"]), earth_rng, mola, lola)
        brief = ", ".join(f"{k}:{p['mode'][0]}{'!' if p.get('unreachable') else ''}" for k, p in out_t[t["id"]].items())
        log(f"  {t['id']:26s} {brief}")
    OUT_PARAMS.write_text(json.dumps({
        "version": 1,
        "curves": CURVES,
        "earthRange": {k: [round(v[0], 4), round(v[1], 4)] for k, v in earth_rng.items()},
        "targets": out_t,
    }, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {OUT_PARAMS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
