"""
Analog Finder site conditions: the extra Earth and target values behind the "Site vs target" breakdown.

  python -I scripts/build-finder-conditions.py [places.geojson]

Run after scripts/build-finder.py (it reads that script's outputs). The places file is Natural Earth's
ne_10m_populated_places_simple.geojson (public domain); it is downloaded when no path is given.

Inputs
  public/data/finder/earth-grid.json, earth-core.bin (land mask), earth-detail.bin (AW3D30 elevation, 0.25 deg)
  public/data/finder/targets.json                    the Moon and Mars targets
  assets-raw/nasa/moon/lola-south-pole/ldem_75s_240m LRO LOLA south-polar DEM, 240 m
  assets-raw/textures/mars-mola/megt90n000eb.img     MGS MOLA MEGDR, 16 ppd

Outputs
  public/data/finder/earth-site.json + earth-site.bin  per land cell, same order as earth-core.bin:
      slope      regional slope (deg) between neighbouring 0.25 deg cells (~28 km baseline)
      isolation  great-circle distance (km) to the nearest town, city or research station
  lib/finder/target-terrain.generated.json            per target: elevation (m) and slope (deg) on the same
                                                      ~28 km baseline, from LOLA (Moon) or MOLA (Mars)

Every uint8 channel: 0 = no data, value = offset + (q - 1) * scale (log10(km + 1) for isolation).
"""

import importlib.util
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FINDER = ROOT / "public" / "data" / "finder"
NASA = ROOT / "assets-raw" / "nasa"
MOLA = ROOT / "assets-raw" / "textures" / "mars-mola" / "megt90n000eb.img"
OUT_TERRAIN = ROOT / "lib" / "finder" / "target-terrain.generated.json"
PLACES_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson"

BASE_KM = 27.8  # one 0.25 deg cell north-south: the slope baseline on every world
R_EARTH, R_MOON, R_MARS = 6371.0, 1737.4, 3389.5

# Reuse the PDS3 label reader from build-finder.py (hyphenated name, so load it by path; no .pyc left behind).
sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("build_finder", ROOT / "scripts" / "build-finder.py")
bf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bf)


def log(*a):
    print(*a, flush=True)


def quantise(v: np.ndarray, lo: float, hi: float):
    scale = (hi - lo) / 254
    q = np.zeros(v.shape, np.uint8)
    ok = np.isfinite(v)
    q[ok] = np.clip(np.round((np.clip(v[ok], lo, hi) - lo) / scale) + 1, 1, 255).astype(np.uint8)
    return q, scale


# ------------------------------------------------------------------ Earth

def earth_cells():
    header = json.loads((FINDER / "earth-grid.json").read_text(encoding="utf-8"))
    nx, ny, n, res = (header["grid"][k] for k in ("nx", "ny", "cells", "res"))
    core = np.fromfile(FINDER / "earth-core.bin", dtype=np.uint8)
    land = np.unpackbits(core[: header["maskBytes"]], bitorder="little")[: nx * ny].astype(bool)
    assert land.sum() == n, (land.sum(), n)
    g = np.flatnonzero(land)
    rows, cols = g // nx, g % nx
    lat = 90 - (rows + 0.5) * res
    lon = -180 + (cols + 0.5) * res
    detail = np.fromfile(FINDER / "earth-detail.bin", dtype=np.uint8)
    ch = next(c for c in header["channels"] if c["key"] == "elev")
    q = detail[ch["byteOffset"]: ch["byteOffset"] + n].astype(np.float64)
    elev = np.where(q > 0, ch["offset"] + (q - 1) * ch["scale"], np.nan)
    return dict(nx=nx, ny=ny, n=n, res=res, rows=rows, cols=cols, lat=lat, lon=lon, elev=elev, land=land)


def earth_slope(e):
    """Central differences of AW3D30 elevation on the 0.25 deg grid; a missing neighbour falls back to one side."""
    nx, ny = e["nx"], e["ny"]
    z = np.full((ny, nx), np.nan)
    z[e["rows"], e["cols"]] = e["elev"]
    dy_km = e["res"] * math.pi / 180 * R_EARTH
    lat_rows = 90 - (np.arange(ny) + 0.5) * e["res"]
    dx_km = np.maximum(dy_km * np.cos(np.radians(lat_rows)), 0.5)[:, None]

    def grad(a, b, dist):
        both = np.isfinite(a) & np.isfinite(b)
        return np.where(both, (a - b) / dist, np.nan)

    north = np.vstack([np.full((1, nx), np.nan), z[:-1]])
    south = np.vstack([z[1:], np.full((1, nx), np.nan)])
    east, west = np.roll(z, -1, axis=1), np.roll(z, 1, axis=1)
    gy = grad(north, south, 2 * dy_km)
    gy = np.where(np.isfinite(gy), gy, grad(north, z, dy_km))
    gy = np.where(np.isfinite(gy), gy, grad(z, south, dy_km))
    gx = grad(east, west, 2 * dx_km)
    gx = np.where(np.isfinite(gx), gx, grad(east, z, dx_km))
    gx = np.where(np.isfinite(gx), gx, grad(z, west, dx_km))
    gx, gy = np.nan_to_num(gx), np.nan_to_num(gy)
    slope = np.degrees(np.arctan(np.hypot(gx, gy) / 1000))  # m per km -> deg
    out = slope[e["rows"], e["cols"]]
    return np.where(np.isfinite(e["elev"]), out, np.nan)


def load_places(arg: str | None):
    if arg:
        data = Path(arg).read_bytes()
    else:
        log("  downloading Natural Earth populated places")
        data = urllib.request.urlopen(PLACES_URL, timeout=180).read()
    feats = json.loads(data)["features"]
    pts = np.array([f["geometry"]["coordinates"][:2] for f in feats], dtype=np.float64)  # lon, lat
    return pts[:, 1], pts[:, 0]


def unit(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def earth_isolation(e, plat, plon):
    """Nearest-place great-circle distance for every land cell (chunked max of dot products)."""
    cells = unit(e["lat"], e["lon"]).astype(np.float32)
    places = unit(plat, plon).astype(np.float32)
    best = np.empty(len(cells), np.float32)
    for i in range(0, len(cells), 8192):
        best[i: i + 8192] = (cells[i: i + 8192] @ places.T).max(axis=1)
    return np.degrees(np.arccos(np.clip(best, -1, 1))) * math.pi / 180 * R_EARTH


# ------------------------------------------------------------------ Moon and Mars targets

def plane_slope(z_at, step_km):
    """Slope (deg) from box-mean elevations one baseline away in the four directions."""
    n, s, e, w, c = (z_at(dx, dy) for dx, dy in ((0, step_km), (0, -step_km), (step_km, 0), (-step_km, 0), (0, 0)))

    def g(a, b, d):
        return None if a is None or b is None else (a - b) / (d * 1000)

    gy = g(n, s, 2 * step_km) if n is not None and s is not None else (g(n, c, step_km) if n is not None else g(c, s, step_km))
    gx = g(e, w, 2 * step_km) if e is not None and w is not None else (g(e, c, step_km) if e is not None else g(c, w, step_km))
    if gx is None or gy is None:
        return None
    return math.degrees(math.atan(math.hypot(gx, gy)))


def moon_terrain(lat, lon):
    """LOLA south-polar DEM (polar stereographic, 240 m px): ~28 km box means."""
    lbl = NASA / "moon" / "lola-south-pole" / "ldem_75s_240m.lbl"
    if lat > -75 or not lbl.exists():
        return None
    lab = bf.pds3(lbl)
    a = bf.img(lbl.with_suffix(".img"), lab)
    px_km = lab["scale_km"] / 1000 if lab["scale_km"] and lab["scale_km"] > 10 else 0.24
    rho = 2 * R_MOON * math.tan(math.radians(90 + lat) / 2)
    xk, yk = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    half = int(round(BASE_KM / px_km / 2))

    def z_at(dx, dy):
        col = lab["samp_off"] + (xk + dx) / px_km
        row = lab["line_off"] - (yk + dy) / px_km
        r0, c0 = int(row) - half, int(col) - half
        if r0 < 0 or c0 < 0 or r0 + 2 * half > lab["lines"] or c0 + 2 * half > lab["samples"]:
            return None
        return float(np.asarray(a[r0: r0 + 2 * half, c0: c0 + 2 * half], dtype=np.float64).mean()) * lab["scale"]

    elev = z_at(0, 0)
    return None if elev is None else {"elev": elev, "slope": plane_slope(z_at, BASE_KM), "source": "LRO LOLA south-polar DEM 240 m (height above the 1,737.4 km reference sphere)"}


def mars_terrain(mola, lat, lon):
    """MOLA MEGDR 16 ppd (int16 m above the areoid): ~28 km box means."""
    ppd = 16
    km_per_deg = math.pi / 180 * R_MARS

    def z_at(dx, dy):
        la = lat + dy / km_per_deg
        lo = lon + dx / (km_per_deg * max(0.05, math.cos(math.radians(lat))))
        r = int((90 - la) * ppd)
        c = int((lo % 360) * ppd)
        hr = max(1, round(BASE_KM / km_per_deg * ppd / 2))
        hc = max(1, round(hr / max(0.05, math.cos(math.radians(la)))))
        if r - hr < 0 or r + hr > mola.shape[0]:
            return None
        return float(mola[r - hr: r + hr, [(c + j) % mola.shape[1] for j in range(-hc, hc)]].mean())

    return {"elev": z_at(0, 0), "slope": plane_slope(z_at, BASE_KM), "source": "MGS MOLA MEGDR 16 ppd (height above the areoid)"}


def main():
    e = earth_cells()
    log(f"Earth: {e['n']:,} land cells")
    slope = earth_slope(e)
    plat, plon = load_places(sys.argv[1] if len(sys.argv) > 1 else None)
    log(f"  {len(plat):,} populated places")
    iso = earth_isolation(e, plat, plon)

    q_slope, s_slope = quantise(slope, 0.0, 15.0)
    log_iso = np.log10(iso + 1)
    q_iso, s_iso = quantise(log_iso, 0.0, 3.7)
    n = e["n"]
    (FINDER / "earth-site.bin").write_bytes(q_slope.tobytes() + q_iso.tobytes())
    meta = {
        "version": 1,
        "cells": n,
        "channels": [
            {"key": "slope", "units": "deg", "log": False, "offset": 0.0, "scale": s_slope, "byteOffset": 0,
             "label": "Regional slope between neighbouring 0.25 deg cells (~28 km baseline)",
             "source": "JAXA ALOS AW3D30 v3.2 DSM (0.2 deg level), resampled to 0.25 deg"},
            {"key": "isolation", "units": "km", "log": True, "offset": 0.0, "scale": s_iso, "byteOffset": n,
             "label": "Distance to the nearest town, city or research station",
             "source": f"Natural Earth 10m populated places ({len(plat):,} places, public domain)"},
        ],
    }
    (FINDER / "earth-site.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    ok = np.isfinite(slope)
    log(f"  slope: median {np.median(slope[ok]):.2f} deg, max {slope[ok].max():.1f} deg")
    log(f"  isolation: median {np.median(iso):.0f} km, max {iso.max():.0f} km")

    targets = json.loads((FINDER / "targets.json").read_text(encoding="utf-8"))["targets"]
    mola = np.fromfile(MOLA, dtype=">i2").reshape(2880, 5760).astype(np.float64)
    out = {}
    for t in targets:
        tt = moon_terrain(t["lat"], t["lon"]) if t["world"] == "moon" else mars_terrain(mola, t["lat"], t["lon"])
        if tt is None or tt["elev"] is None:
            log(f"  {t['id']}: no DEM coverage")
            continue
        out[t["id"]] = {"elev": round(tt["elev"]), "slope": None if tt["slope"] is None else round(tt["slope"], 2), "source": tt["source"]}
        log(f"  {t['id']}: {out[t['id']]['elev']} m, slope {out[t['id']]['slope']} deg")
    OUT_TERRAIN.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
