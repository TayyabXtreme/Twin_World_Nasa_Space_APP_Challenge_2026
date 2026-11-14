"""
Build the web layers for the Moon South Pole Base Map (/moonbase, docs/archive/plan-v2.md §4.2).

Every layer is put on ONE grid: the LOLA 75°S–90°S south polar stereographic grid (sphere R = 1737.4 km, true
scale at the pole, 0° longitude up, 90°E to the right), block-averaged from 240 m to 960 m (953 × 953 cells) for
value grids and to 480 m (1906 × 1906 px) for the shaded display images.

Inputs (assets-raw/nasa/moon, read-only) and what happens to each:
  LOLA LDEM 240 m                 elevation, slope, ruggedness, local relief      (polar grid already)
                                  Slope is computed from the 2017 LDEM surface. The 2012 LDSM slope product
                                  (shot-to-shot slopes through LRO_SM_17) shows strong ground-track striping
                                  away from the pole, so it is only used as a cross-check (printed below).
  Diviner rock abundance, regolith temperature anomaly (32 px/°)   reprojected by inverse mapping, but these
                                  global products stop at 60°S, so they have no polar coverage (reported)
  Diviner Polar Resource Product  2.88 M triangles (0.5 km grid, ±300 km) → max T, average T, ice stability depth, cold-trap share
  Mini-RF global CPR (32 px/°)    reprojected onto the polar grid
A file is only read when its size matches its PDS label exactly; partly downloaded files are skipped and the
layer is listed as "downloading" so the page can say so. Re-run any time: python -I scripts/build-moon-layers.py

Outputs (public/data/moonbase):
  manifest.json            grid, projection and every layer (status, units, range, ramp, dataset, meaning)
  <layer>.webp             colourised display image (perceptual ramp over LOLA shaded relief)
  <layer>.png              quantised value grid, 8- or 16-bit greyscale, value = offset + DN × scale
  site-values.json         every layer's value at each Moon site and each Artemis III region centre
"""

import argparse
import json
import math
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets-raw" / "nasa" / "moon"
OUT_DEFAULT = ROOT / "public" / "data" / "moonbase"
REGIONS_JSON = ROOT / "lib" / "moonbase" / "artemis-regions.json"
SITES_TS = ROOT / "lib" / "data" / "sites.ts"

R_MOON = 1737400.0  # m, the sphere every product here is referenced to
LOLA_N = 3812  # LOLA pixels across
LOLA_PX = 240.0  # m
HALF_W = LOLA_N / 2 * LOLA_PX  # 457 440 m: the grid spans ±HALF_W in x and y
GRID_N = LOLA_N // 4  # 953 cells → 960 m (value grids)
DISP_N = LOLA_N // 2  # 1906 px → 480 m (display images)
GRID_PX = 2 * HALF_W / GRID_N
DISP_PX = 2 * HALF_W / DISP_N

# Final sizes of the two files that were still downloading when this script was written. The PDS labels give
# the same numbers (records × record bytes); both checks must pass before a byte is read.
EXPECTED_BYTES = {"dlre_prp_south.tab": 604_800_210, "global_cpr_32ppd_simp_0c.img": 265_420_800}

# Colour ramps (hex stops, interpolated in sRGB). Perceptually ordered ramps after Crameri's Scientific
# Colour Maps (batlow, vik, oslo) and matplotlib's viridis/inferno/magma; the page draws the same stops as legends.
RAMPS = {
    "batlow": ["#011959", "#10475f", "#2c6559", "#577a43", "#8a8a2f", "#c29539", "#eda569", "#fdb9ac", "#facdfa"],
    "magma": ["#000004", "#1c1044", "#4f127b", "#812581", "#b5367a", "#e55064", "#fb8761", "#fec287", "#fcfdbf"],
    "viridis": ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
    "inferno": ["#000004", "#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#f7d13d", "#fcffa4"],
    "vik": ["#001261", "#033e7d", "#1e6f9d", "#71a8c4", "#c9dde7", "#eacebd", "#d39774", "#be6533", "#8b2706", "#590007"],
    "ice": ["#e8fbff", "#9be7ff", "#45b8f0", "#1f7fd1", "#1d4fa8", "#1b2f73"],
    "frost": ["#0b1e3d", "#12457a", "#1d78b5", "#3fb0e0", "#8fe3ff", "#e9fdff"],
    "suit": ["#2b0f3a", "#5a1d5c", "#8f2f5f", "#c4515a", "#e5814f", "#f2b45a", "#f6e27a", "#d7f59a", "#9ff5c4"],
}


# ----------------------------------------------------------------------------------------------- helpers


def log(msg: str):
    print(msg, flush=True)


def hex_rgb(h: str):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def colourise(v: np.ndarray, ramp: str, lo: float, hi: float) -> np.ndarray:
    """Map v to RGB (float 0–255) with a piecewise-linear ramp. NaN stays NaN so callers can mask it."""
    stops = np.array([hex_rgb(h) for h in RAMPS[ramp]], dtype=np.float32)
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    seg = len(stops) - 1
    tt = np.nan_to_num(t) * seg
    idx = np.minimum(tt.astype(np.int32), seg - 1)
    f = (tt - idx)[..., None]
    rgb = stops[idx] * (1 - f) + stops[idx + 1] * f
    rgb[np.isnan(v)] = np.nan
    return rgb


def pds3_label(path: Path) -> dict:
    """Flat KEY → value dict of a PDS3 label (first occurrence wins; quotes and <units> stripped)."""
    out = {}
    for m in re.finditer(r"^\s*([A-Z0-9_:^]+)\s*=\s*(.+?)\s*$", path.read_text(encoding="latin-1"), re.M):
        key, val = m.group(1), re.sub(r"\s*<[^>]*>\s*$", "", m.group(2)).strip().strip('"').strip("'")
        out.setdefault(key, val)
    return out


def num(lbl: dict, key: str, default=None):
    try:
        return float(lbl[key])
    except (KeyError, ValueError):
        return default


def file_status(path: Path, expected: int | None) -> str:
    """'ready' only when the file exists and has exactly the size its label (and our record) promises."""
    if not path.exists():
        return "missing"
    size = path.stat().st_size
    wants = [v for v in (EXPECTED_BYTES.get(path.name.lower()), expected) if v]
    return "ready" if all(size == v for v in wants) else "downloading"


def label_bytes(lbl: dict) -> int | None:
    rb, fr = num(lbl, "RECORD_BYTES"), num(lbl, "FILE_RECORDS")
    return int(rb * fr) if rb and fr else None


# ------------------------------------------------------------------------------------- polar projection


def polar_xy(lat, lon):
    """South polar stereographic (LOLA convention): metres, x to 90°E, y to 0°E."""
    r = 2 * R_MOON * np.tan(np.radians(45 + np.asarray(lat, dtype=np.float64) / 2))
    lam = np.radians(lon)
    return r * np.sin(lam), r * np.cos(lam)


def polar_latlon(x, y):
    r = np.hypot(x, y)
    lat = 2 * np.degrees(np.arctan(r / (2 * R_MOON))) - 90
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon


def grid_centres(n: int):
    px = 2 * HALF_W / n
    c = -HALF_W + (np.arange(n) + 0.5) * px
    x = np.broadcast_to(c[None, :], (n, n))
    y = np.broadcast_to(-c[:, None], (n, n))  # row 0 is the top (+y)
    return x, y


def xy_to_cell(x, y, n: int):
    px = 2 * HALF_W / n
    col = np.floor((x + HALF_W) / px).astype(np.int64)
    row = np.floor((HALF_W - y) / px).astype(np.int64)
    ok = (col >= 0) & (col < n) & (row >= 0) & (row < n)
    return row, col, ok


def block_mean(a: np.ndarray, k: int) -> np.ndarray:
    n = a.shape[0] // k
    return np.nanmean(a[: n * k, : n * k].reshape(n, k, n, k), axis=(1, 3))


def box_mean(a: np.ndarray, radius: int) -> np.ndarray:
    """Mean over a (2r+1)² window, NaN-aware, via an integral image (no scipy needed)."""
    valid = ~np.isnan(a)
    def integral(v):
        s = np.zeros((v.shape[0] + 1, v.shape[1] + 1), dtype=np.float64)
        s[1:, 1:] = v.cumsum(0).cumsum(1)
        return s
    S, C = integral(np.where(valid, a, 0.0)), integral(valid.astype(np.float64))
    n = a.shape[0]
    i = np.arange(n)
    lo, hi = np.clip(i - radius, 0, n), np.clip(i + radius + 1, 0, n)
    def win(s):
        return s[hi][:, hi] - s[lo][:, hi] - s[hi][:, lo] + s[lo][:, lo]
    count = win(C)
    with np.errstate(invalid="ignore", divide="ignore"):
        # Empty windows are NaN; dividing their rounding residue by 0 would give ±inf.
        return np.where(count > 0.5, win(S) / count, np.nan)


def distance_km(mask: np.ndarray, px_km: float, max_km: float) -> np.ndarray:
    """Approximate Euclidean distance to the nearest True cell by alternating 4- and 8-neighbour dilation
    (octagonal metric, within ~8 % of Euclidean). Cells farther than max_km get max_km."""
    dist = np.full(mask.shape, np.inf, dtype=np.float32)
    dist[mask] = 0
    cur = mask.copy()
    steps = int(math.ceil(max_km / px_km))
    for s in range(1, steps + 1):
        nxt = cur.copy()
        nxt[1:] |= cur[:-1]
        nxt[:-1] |= cur[1:]
        nxt[:, 1:] |= cur[:, :-1]
        nxt[:, :-1] |= cur[:, 1:]
        if s % 2 == 0:  # diagonal step every other ring → octagon
            nxt[1:, 1:] |= cur[:-1, :-1]
            nxt[1:, :-1] |= cur[:-1, 1:]
            nxt[:-1, 1:] |= cur[1:, :-1]
            nxt[:-1, :-1] |= cur[1:, 1:]
        new = nxt & ~cur
        dist[new] = s * px_km
        cur = nxt
        if cur.all():
            break
    dist[np.isinf(dist)] = max_km
    return np.minimum(dist, max_km)


# --------------------------------------------------------------------------------------------- writers


class Writer:
    def __init__(self, out: Path, shade: np.ndarray):
        self.out = out
        self.shade = shade  # 1906² hillshade 0–1 for display images
        self.layers: list[dict] = []
        self.grids: dict[str, np.ndarray] = {}

    def grid_png(self, lid: str, v: np.ndarray, lo: float, hi: float, bits: int) -> dict:
        """Quantise v (NaN = nodata) to an 8-bit (DN 0–250, 255 = nodata) or 16-bit (DN 1–65535, 0 = nodata) PNG."""
        if bits == 8:
            scale = (hi - lo) / 250
            dn = np.clip(np.round((v - lo) / scale), 0, 250)
            dn = np.where(np.isnan(v), 255, dn).astype(np.uint8)
            Image.fromarray(dn, "L").save(self.out / f"{lid}.png", optimize=True)
            meta = {"file": f"{lid}.png", "bits": 8, "scale": scale, "offset": lo, "nodata": 255}
        else:
            scale = (hi - lo) / 65534
            dn = np.clip(np.round((v - lo) / scale) + 1, 1, 65535)
            dn = np.where(np.isnan(v), 0, dn).astype(np.uint16)
            Image.fromarray(dn).save(self.out / f"{lid}.png", optimize=True)
            meta = {"file": f"{lid}.png", "bits": 16, "scale": scale, "offset": lo - scale, "nodata": 0}
        self.grids[lid] = np.where(np.isnan(v), np.nan, meta["offset"] + dn.astype(np.float64) * meta["scale"])
        return meta

    def display(self, lid: str, rgb: np.ndarray, relief: float = 0.45):
        """rgb at grid or display size (NaN = no data → plain grey relief); multiply in LOLA shaded relief."""
        if rgb.shape[0] != DISP_N:
            r = np.nan_to_num(rgb, nan=-1).astype(np.float32)
            chans = [np.asarray(Image.fromarray(r[..., c], "F").resize((DISP_N, DISP_N), Image.BILINEAR)) for c in range(3)]
            rgb = np.stack(chans, -1)
            rgb[rgb < 0] = np.nan
        sh = self.shade[..., None]
        grey = 30 + 150 * sh
        out = np.where(np.isnan(rgb), np.repeat(grey * 0.75, 3, -1), rgb * ((1 - relief) + relief * 1.25 * sh))
        Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB").save(self.out / f"{lid}.webp", quality=82, method=6)

    def add(self, layer: dict):
        if layer["status"] == "ready" and (self.out / f"{layer['id']}.webp").exists() and not layer.get("hidden"):
            layer["image"] = f"{layer['id']}.webp"
        self.layers.append(layer)
        st = layer["status"]
        log(f"  {layer['id']:<14} {st}" + (f" — {layer.get('statusNote', '')}" if st != "ready" else ""))


# ----------------------------------------------------------------------------------------------- LOLA


def build_lola(w_out: Path):
    """LOLA LDEM elevation (m) and slope (deg) from the DEM gradient over one 240 m pixel."""
    d = RAW / "lola-south-pole"
    lbl_e = pds3_label(d / "ldem_75s_240m.lbl")
    pe = d / "ldem_75s_240m.img"
    if file_status(pe, label_bytes(lbl_e)) != "ready":
        sys.exit("LOLA elevation is required for the base map and is not complete.")
    n = int(lbl_e["LINES"])
    assert n == LOLA_N and lbl_e["SAMPLE_TYPE"] == "LSB_INTEGER", "unexpected LOLA layout"
    elev = np.fromfile(pe, dtype="<i2").reshape(n, n).astype(np.float32) * num(lbl_e, "SCALING_FACTOR")
    gy, gx = np.gradient(elev, LOLA_PX)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)

    ps = d / "ldsm_75s_240m.img"
    lbl_s = pds3_label(d / "ldsm_75s_240m.lbl")
    if file_status(ps, label_bytes(lbl_s)) == "ready":  # cross-check only
        dn = np.fromfile(ps, dtype="<i2").reshape(n, n).astype(np.float32)
        ldsm = dn * num(lbl_s, "SCALING_FACTOR") + num(lbl_s, "OFFSET")
        ok = (dn > -32768) & (ldsm >= 0)
        log(f"  slope from LDEM: median {np.median(slope):.1f}°, LDSM product: median {np.median(ldsm[ok]):.1f}° (striped, not used)")
    return elev, slope, lbl_e


def hillshade(z: np.ndarray, px: float, az=315.0, alt=35.0, zf=2.0) -> np.ndarray:
    gy, gx = np.gradient(z * zf, px)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    a, e = math.radians(az), math.radians(alt)
    s = np.sin(e) * np.cos(slope) + np.cos(e) * np.sin(slope) * np.cos(a - aspect)
    return np.clip(s, 0, 1)


# ----------------------------------------------------------------------------------- cylindrical maps


def cylindrical_to_polar(img_path: Path, lbl: dict, valid, n: int):
    """Reproject a simple-cylindrical PDS image onto the n×n polar grid.

    Forward pass: every source pixel inside the grid is averaged into its polar cell (handles the pole, where
    many narrow source pixels fall into one cell). Inverse pass: cells that received nothing are filled by
    inverse-mapping the cell centre to lat/lon and taking the nearest source pixel. Returns (grid, n_valid)."""
    lines, samples = int(lbl["LINES"]), int(lbl["LINE_SAMPLES"])
    ppd = num(lbl, "MAP_RESOLUTION")
    max_lat, min_lat = num(lbl, "MAXIMUM_LATITUDE"), num(lbl, "MINIMUM_LATITUDE")
    west = num(lbl, "WESTERNMOST_LONGITUDE", 0.0)
    bits, stype = int(lbl.get("SAMPLE_BITS", 16)), lbl.get("SAMPLE_TYPE", "")
    dtype = {"LSB_INTEGER": "<i2", "PC_REAL": "<f4"}.get(stype)
    if dtype is None or (bits == 32) != (dtype == "<f4"):
        raise ValueError(f"unsupported sample type {stype}/{bits}")
    scale, offset = num(lbl, "SCALING_FACTOR", 1.0), num(lbl, "OFFSET", 0.0)

    gx, gy = grid_centres(n)
    glat, glon = polar_latlon(gx, gy)
    lat_lo = float(glat.max())  # northernmost latitude the polar grid reaches (its corners)
    if min_lat >= lat_lo:  # product ends north of our grid
        return np.full((n, n), np.nan, dtype=np.float32), 0

    mm = np.memmap(img_path, dtype=dtype, mode="r", shape=(lines, samples))
    r0 = int(max(0, math.floor((max_lat - lat_lo) * ppd) - 1))
    block = np.array(mm[r0:lines], dtype=np.float32)
    good = valid(block)
    vals = np.where(good, block * scale + offset, np.nan)

    lon = west + (np.arange(samples) + 0.5) / ppd
    s = np.zeros(n * n)
    c = np.zeros(n * n)
    for a in range(0, vals.shape[0], 64):  # 64 source rows at a time keeps memory small
        v, g = vals[a : a + 64], good[a : a + 64]
        lat = max_lat - (np.arange(r0 + a, r0 + a + v.shape[0]) + 0.5) / ppd
        x, y = polar_xy(lat[:, None], lon[None, :])
        gr, gc, ok = xy_to_cell(x, y, n)
        ok &= g
        idx = (gr * n + gc)[ok]
        s += np.bincount(idx, weights=v[ok], minlength=n * n)
        c += np.bincount(idx, minlength=n * n)
    with np.errstate(invalid="ignore", divide="ignore"):
        out = (s / c).reshape(n, n).astype(np.float32)

    empty = c.reshape(n, n) == 0
    if empty.any():
        er = np.floor((max_lat - glat[empty]) * ppd).astype(np.int64) - r0
        ec = np.floor(((glon[empty] - west) % 360) * ppd).astype(np.int64) % samples
        inside = (er >= 0) & (er < vals.shape[0])
        fill = np.full(er.shape, np.nan, dtype=np.float32)
        fill[inside] = vals[er[inside], ec[inside]]
        out[empty] = fill
    return out, int(np.isfinite(out).sum())


def sample_cylindrical(img_path: Path, lbl: dict, valid, lat: float, lon: float):
    """Value of a cylindrical product at one point (nearest pixel), or None outside its coverage/no data."""
    ppd = num(lbl, "MAP_RESOLUTION")
    max_lat, min_lat = num(lbl, "MAXIMUM_LATITUDE"), num(lbl, "MINIMUM_LATITUDE")
    if not (min_lat <= lat <= max_lat):
        return None
    lines, samples = int(lbl["LINES"]), int(lbl["LINE_SAMPLES"])
    dtype = {"LSB_INTEGER": "<i2", "PC_REAL": "<f4"}[lbl["SAMPLE_TYPE"]]
    mm = np.memmap(img_path, dtype=dtype, mode="r", shape=(lines, samples))
    r = min(lines - 1, int((max_lat - lat) * ppd))
    c = int(((lon - num(lbl, "WESTERNMOST_LONGITUDE", 0.0)) % 360) * ppd) % samples
    win = np.array(mm[max(0, r - 1) : r + 2, max(0, c - 1) : c + 2], dtype=np.float32)  # 3×3 mean, ~2.8 km
    win = np.where(valid(win), win * num(lbl, "SCALING_FACTOR", 1.0) + num(lbl, "OFFSET", 0.0), np.nan)
    return None if np.isnan(win).all() else float(np.nanmean(win))


# --------------------------------------------------------------------------- Diviner polar resource product


def prp_fields(xml_path: Path):
    """Field byte ranges, record length, header offset and record count from the PDS4 label."""
    ns = {"p": "http://pds.nasa.gov/pds4/pds/v1"}
    root = ET.parse(xml_path).getroot()
    table = root.find(".//p:Table_Character", ns)
    fields = {}
    for f in table.findall(".//p:Field_Character", ns):
        name = f.find("p:name", ns).text.strip()
        loc = int(f.find("p:field_location", ns).text)
        length = int(f.find("p:field_length", ns).text)
        fields[name] = (loc - 1, loc - 1 + length)
    rec_len = int(table.find(".//p:record_length", ns).text)
    offset = int(table.find("p:offset", ns).text)
    records = int(table.find("p:records", ns).text)
    return fields, rec_len, offset, records


def rasterise_prp(tab: Path, xml: Path, n: int, chunk_rows=200_000):
    """Stream the triangle table and bin each triangle centre into the polar grid.

    Per cell: mean annual max surface T, mean annual average T (2 cm depth), share of triangles whose annual
    max is below 110 K (cold traps), share of triangles with stable ice within 1 m, and the median
    ice-stability depth.

    ice_depth sentinels, checked against the whole table (2026-11-13):
      -999  documented in the PDS4 label: the depth is greater than 2.8738 m (the model's limit). It occurs only
            where the annual maximum is >= 203 K. Kept as "deeper than 2.87 m" (+inf here, its own DN on the web).
      -1    NOT documented in the label. It occurs on 100 319 triangles, all with annual max <= 101.3 K, while
            real 0 m values start just above 101.3 K. So -1 marks the coldest cold traps, where ice is stable at
            the surface by a wide margin; it is treated as 0 m (surface-stable) and reported as such."""
    fields, rec_len, offset, records = prp_fields(xml)
    need = ["tri_clon", "tri_clat", "temp_avg", "temp_max", "ice_depth"]
    s_avg = np.zeros(n * n)
    s_max = np.zeros(n * n)
    cnt = np.zeros(n * n)
    cold = np.zeros(n * n)
    shallow = np.zeros(n * n)
    flags = {"minus1": 0, "minus999": 0}
    ice_cells, ice_vals = [], []
    t0 = time.time()
    done = 0
    with open(tab, "rb") as fh:
        fh.seek(offset)
        while done < records:
            k = min(chunk_rows, records - done)
            buf = fh.read(k * rec_len)
            k = len(buf) // rec_len
            if k == 0:
                break
            a = np.frombuffer(buf[: k * rec_len], dtype=np.uint8).reshape(k, rec_len)
            col = {}
            for name in need:
                lo, hi = fields[name]
                col[name] = np.ascontiguousarray(a[:, lo:hi]).view(f"S{hi - lo}").ravel().astype(np.float64)
            x, y = polar_xy(col["tri_clat"], col["tri_clon"])
            r, c, ok = xy_to_cell(x, y, n)
            tavg, tmax, ice = col["temp_avg"], col["temp_max"], col["ice_depth"]
            ok &= (tmax > 0) & (tavg > 0)
            idx = (r * n + c)[ok]
            s_avg += np.bincount(idx, weights=tavg[ok], minlength=n * n)
            s_max += np.bincount(idx, weights=tmax[ok], minlength=n * n)
            cnt += np.bincount(idx, minlength=n * n)
            cold += np.bincount(idx, weights=(tmax[ok] < 110).astype(np.float64), minlength=n * n)
            iv = ice[ok]
            flags["minus1"] += int((iv == -1).sum())
            flags["minus999"] += int((iv == -999).sum())
            iv = np.where(iv == -1, 0.0, iv)  # undocumented flag, coldest traps only → stable at the surface
            iv = np.where(iv < 0, np.inf, iv)  # -999 (documented) → deeper than 2.87 m
            shallow += np.bincount(idx, weights=(iv <= 1.0).astype(np.float64), minlength=n * n)
            ice_cells.append(idx.astype(np.int32))
            ice_vals.append(iv.astype(np.float32))
            done += k
            if done % 1_000_000 < chunk_rows:
                log(f"    {done:,} / {records:,} triangles ({time.time() - t0:.0f} s)")
    with np.errstate(invalid="ignore", divide="ignore"):
        tmax = (s_max / cnt).reshape(n, n)
        tavg = (s_avg / cnt).reshape(n, n)
        coldf = (100 * cold / cnt).reshape(n, n)
        shallowf = (100 * shallow / cnt).reshape(n, n)
    # median ice depth per cell: sort by (cell, depth), take the middle element of each run
    cells = np.concatenate(ice_cells)
    vals = np.concatenate(ice_vals)
    order = np.lexsort((vals, cells))
    cells, vals = cells[order], vals[order]
    uniq, start, counts = np.unique(cells, return_index=True, return_counts=True)
    med = vals[start + (counts - 1) // 2]
    ice = np.full(n * n, np.nan, dtype=np.float32)
    ice[uniq] = med
    ice = ice.reshape(n, n)
    log(f"    ice_depth sentinels: -1 (surface-stable flag) {flags['minus1']:,}, -999 (deeper than 2.87 m) {flags['minus999']:,}")
    return tmax.astype(np.float32), tavg.astype(np.float32), coldf.astype(np.float32), shallowf.astype(np.float32), ice, int(done), flags


# ----------------------------------------------------------------------------------------------- sites


def moon_sites():
    """Moon sites from lib/data/sites.ts (id, name, lat, lon), parsed from the source so nothing is duplicated."""
    text = SITES_TS.read_text(encoding="utf-8")
    sites = []
    for m in re.finditer(r'id:\s*"(moon-[^"]+)",\s*world:\s*"moon",\s*name:\s*"([^"]+)".*?lat:\s*(-?[\d.]+),\s*lon:\s*(-?[\d.]+)', text, re.S):
        sites.append({"id": m.group(1), "name": m.group(2), "lat": float(m.group(3)), "lon": float(m.group(4))})
    for m in re.finditer(r'\["(moon-[^"]+)",\s*"([^"]+)",\s*(-?[\d.]+),\s*(-?[\d.]+)', text):
        sites.append({"id": m.group(1), "name": m.group(2), "lat": float(m.group(3)), "lon": float(m.group(4))})
    return sites


def region_geometry(region: dict):
    """Approximate centre (mean position of published landing sites, in polar x/y) and extent radius."""
    pts = np.array(region["sites"], dtype=np.float64)
    x, y = polar_xy(pts[:, 0], pts[:, 1])
    cx, cy = float(x.mean()), float(y.mean())
    radius = float(np.max(np.hypot(x - cx, y - cy)))
    lat, lon = polar_latlon(cx, cy)
    return float(lat), float(lon), cx, cy, max(4000.0, radius + 2000.0)


# ------------------------------------------------------------------------------------------------ main


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles default to cp1252
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--prp-tab", type=Path, default=RAW / "diviner" / "polar-resource" / "dlre_prp_south.tab")
    args = ap.parse_args()
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    log("LOLA 240 m elevation + slope")
    elev240, slope240, lbl_e = build_lola(out)
    elev_g = block_mean(elev240, 4)
    slope_g = block_mean(slope240, 4)
    # ruggedness: spread of the sixteen 240 m slopes inside each 960 m cell (uniform tilt alone scores ~0)
    rug_g = np.nanstd(slope240[: GRID_N * 4, : GRID_N * 4].reshape(GRID_N, 4, GRID_N, 4), axis=(1, 3))
    relief_g = elev_g - box_mean(elev_g, 15)  # height above the mean of a ~30 km window
    elev_d = block_mean(elev240, 2)
    slope_d = block_mean(slope240, 2)
    shade = hillshade(elev_d, DISP_PX)
    del elev240, slope240

    w = Writer(out, shade)
    lola_ds = {"name": "LRO LOLA polar gridded data (LRO-L-LOLA-4-GDR-V1.0)", "url": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm"}

    # Elevation display: colour by height over strong relief.
    lo_e, hi_e = -6000.0, 6000.0
    w.display("elevation", colourise(elev_d, "batlow", lo_e, hi_e), relief=0.6)
    w.add({
        "id": "elevation", "label": "Elevation (shaded relief)", "group": "Terrain", "units": "m", "decimals": 0,
        "range": [lo_e, hi_e], "ramp": RAMPS["batlow"], "status": "ready", "dataset": lola_ds,
        "source": "LDEM_75S_240M", "resolution": "240 m source, 480 m display, 960 m readout",
        "what": "Height relative to a 1737.4 km sphere. Crater floors near the pole sit 3–5 km below the ridges that catch sunlight.",
        "grid": w.grid_png("elevation", elev_g, -10000.0, -10000.0 + 65534 * 1.0, 16),  # 1 m steps
        "stats": {"min": float(np.nanmin(elev_g)), "max": float(np.nanmax(elev_g))},
    })

    w.display("slope", colourise(slope_d, "magma", 0, 30))
    w.add({
        "id": "slope", "label": "Slope", "group": "Terrain", "units": "°", "decimals": 1, "range": [0, 30],
        "ramp": RAMPS["magma"], "status": "ready", "dataset": lola_ds, "source": "derived from LDEM_75S_240M",
        "resolution": "240 m slope baseline, averaged to 960 m",
        "what": "How steep the ground is, from the LOLA elevation model over 240 m. Landers and rovers need gentle ground: Wueller et al. 2026 used < 8° for the Artemis lander. 240 m averaging hides steeper metre-scale slopes.",
        "grid": w.grid_png("slope", slope_g, 0.0, 50.0, 8),
        "stats": {"mean": float(np.nanmean(slope_g)), "pctBelow8": float(100 * np.nanmean(slope_g < 8))},
    })

    w.display("ruggedness", colourise(np.repeat(np.repeat(rug_g, 2, 0), 2, 1), "viridis", 0, 5))
    w.add({
        "id": "ruggedness", "label": "Ruggedness", "group": "Terrain", "units": "°", "decimals": 1, "range": [0, 5],
        "ramp": RAMPS["viridis"], "status": "ready", "dataset": lola_ds, "source": "derived from LDEM_75S_240M",
        "resolution": "16 slope values per 960 m cell",
        "what": "Spread (standard deviation) of the sixteen 240 m slopes inside each cell: broken, lumpy ground scores high, an even plain or a smooth uniform slope scores low. It is km-scale terrain, not a rock count.",
        "grid": w.grid_png("ruggedness", rug_g, 0.0, 25.0, 8),
    })

    w.display("relief", colourise(np.repeat(np.repeat(relief_g, 2, 0), 2, 1), "vik", -2000, 2000))
    w.add({
        "id": "relief", "label": "High ground", "group": "Terrain", "units": "m", "decimals": 0,
        "range": [-2000, 2000], "ramp": RAMPS["vik"], "status": "ready", "dataset": lola_ds,
        "source": "derived from LDEM_75S_240M", "resolution": "960 m cell vs. ~30 km window",
        "what": "Height above (orange) or below (blue) the surrounding ~30 km. Near the pole the Sun skims the horizon, so high ridges see it most often: a rough proxy for sunlight, not an illumination model.",
        "grid": w.grid_png("relief", relief_g, -5000.0, 5000.0, 8),
    })

    # ---------------- Diviner global maps (rock abundance, regolith temperature anomaly)
    log("Diviner global 32 px/° maps")
    div_dir = RAW / "diviner" / "global-maps"
    div_ds = {"name": "LRO Diviner gridded data records (LRO-L-DLRE-5-GDR-V1.0)", "url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm"}
    cyl_products = {}
    for lid, stem, label, units, rng, ramp, what in [
        ("rock", "dgdr_ra_avg_cyl_032_img", "Rock abundance", "% area", [0, 10], "inferno",
         "Fraction of the surface covered by rocks larger than about 1 m, from how slowly the ground cools at night (Bandfield et al. 2011)."),
        ("soiltemp", "dgdr_st_avg_cyl_032_img", "Regolith temperature anomaly", "K", [-10, 10], "vik",
         "Night-time temperature of the fine soil relative to a model: warm = younger, more compacted regolith; cold = fluffier soil."),
    ]:
        lbl = pds3_label(div_dir / f"{stem}.lbl")
        img = div_dir / f"{stem}.img"
        st = file_status(img, label_bytes(lbl))
        missing = float(lbl.get("MISSING_CONSTANT", "-32768"))
        valid = (lambda m: (lambda b: b != m))(missing)
        layer = {"id": lid, "label": label, "group": "Surface", "units": units, "decimals": 1, "range": rng,
                 "ramp": RAMPS[ramp], "dataset": div_ds, "source": stem.upper(), "what": what,
                 "resolution": "32 px/° (~950 m)", "coverage": [num(lbl, "MINIMUM_LATITUDE"), num(lbl, "MAXIMUM_LATITUDE")]}
        if st != "ready":
            layer.update(status=st, statusNote="Data still downloading.")
        else:
            cyl_products[lid] = (img, lbl, valid)
            grid, nvalid = cylindrical_to_polar(img, lbl, valid, GRID_N)
            if nvalid == 0:
                layer.update(status="no_coverage", statusNote=(
                    f"This global Diviner product covers {abs(num(lbl, 'MINIMUM_LATITUDE')):.0f}°S–{num(lbl, 'MAXIMUM_LATITUDE'):.0f}°N only "
                    "(night-time retrievals restricted to low latitudes), so it has no data poleward of 75°S. Slope, ruggedness and "
                    "Mini-RF radar stand in for it here."))
            else:
                gv = grid * (100 if lid == "rock" else 1)
                w.display(lid, colourise(gv, ramp, *rng))
                layer.update(status="ready", grid=w.grid_png(lid, gv, -60.0 if lid == "soiltemp" else 0.0, 60.0 if lid == "soiltemp" else 100.0, 8))
        w.add(layer)

    # ---------------- Diviner Polar Resource Product
    log("Diviner Polar Resource Product (south)")
    prp_tab = args.prp_tab
    prp_xml = prp_tab.with_suffix(".xml")
    prp_ds = {"name": "LRO Diviner Polar Resource Product (LRO-L-DLRE-5-PRP-V2.0)", "url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm"}
    # The label's size check applies to the real table; a --prp-tab test file only needs its .xml beside it.
    # (the PDS3 label's FILE_RECORDS leaves out the 210-byte header row, so the PDS4 table geometry is used)
    expected = None
    if prp_tab.name.lower() == "dlre_prp_south.tab" and prp_xml.exists():
        _, rl, off, nrec = prp_fields(prp_xml)
        expected = off + rl * nrec
    prp_status = file_status(prp_tab, expected) if prp_xml.exists() else "missing"
    prp_layers = [
        ("tmax", "Max temperature", "K", [25, 350], "inferno", 0,
         "Hottest the surface gets in a year. Below about 110 K, water ice can survive at the surface for billions of years."),
        ("tavg", "Average temperature", "K", [25, 250], "inferno", 0,
         "Year-round average 2 cm below the surface. It tracks how much sunlight a spot gets on average: warm = sunlit ridge, very cold = permanent shadow."),
        ("icedepth", "Ice stability depth", "m", [0, 1.5], "ice", 2,
         "How deep you would dig before buried water ice could survive for a billion years (sublimation < 1 kg/m² per Gyr). 0 = stable right at the surface; grey = deeper than 2.87 m, the model's limit. A thermal model of where ice COULD last, not a detection of ice."),
        ("coldtrap", "Cold traps", "% of cell", [0, 100], "frost", 0,
         "Share of the cell whose annual maximum stays below 110 K: places cold enough to trap water ice at the surface."),
    ]
    if prp_status == "ready":
        log("  streaming triangles …")
        tmax, tavg, coldf, shallowf, ice, ntri, flags = rasterise_prp(prp_tab, prp_xml, GRID_N)
        has = np.isfinite(tmax)
        # The PRP is a 1200 x 1200 grid of 0.5 km cells (+-300 km): it reaches ~80.1°S on the axes and ~76°S
        # at the corners, so the outer ring of the LOLA map has no PRP values.
        prp_cover = (f"Model grid spans ±300 km around the pole (to about 80°S along 0°/90°/180°/270° and 76°S at the corners); "
                     f"{100 * has.mean():.0f} % of this map has PRP values.")
        log(f"  PRP covers {100 * has.mean():.1f} % of the map grid")
        ice_show = np.where(np.isinf(ice), np.nan, ice)
        trap_mask = np.nan_to_num(coldf) > 0
        dist = distance_km(trap_mask, GRID_PX / 1000, 60.0)
        dist[~has] = np.nan
        idist = distance_km(np.nan_to_num(shallowf) > 0, GRID_PX / 1000, 60.0)
        idist[~has] = np.nan
        log(f"  cold-trap cells {int(trap_mask.sum()):,}; cells with ice <= 1 m {int((np.nan_to_num(shallowf) > 0).sum()):,}")
        for lid, label, units, rng, ramp, dec, what in prp_layers:
            if lid == "tmax":
                g = tmax; w.display(lid, colourise(g, ramp, *rng)); meta = w.grid_png(lid, g, 0.0, 65534 * 0.05, 16)  # 0.05 K steps
            elif lid == "tavg":
                g = tavg; w.display(lid, colourise(g, ramp, *rng)); meta = w.grid_png(lid, g, 0.0, 65534 * 0.05, 16)  # 0.05 K steps
            elif lid == "icedepth":
                rgb = colourise(ice_show, ramp, *rng)
                w.display(lid, rgb)
                g = np.where(np.isinf(ice), np.nan, ice)
                meta = w.grid_png(lid, g, 0.0, 2.875, 8)
                none = np.isinf(ice)  # 'no stable ice' gets its own DN so the readout can say so
                dn = np.asarray(Image.open(out / meta["file"])).copy()
                dn[none] = 253
                Image.fromarray(dn, "L").save(out / meta["file"], optimize=True)
                meta["none"] = 253
                meta["noneMeaning"] = "deeper than 2.87 m (PRP value -999)"
                w.grids[lid] = np.where(none, np.inf, w.grids[lid])
            else:
                g = np.where(has, coldf, np.nan)
                rgb = colourise(np.where(g > 0, g, np.nan), ramp, 0, 100)
                w.display(lid, rgb, relief=0.35)
                meta = w.grid_png(lid, g, 0.0, 100.0, 8)
            layer = {"id": lid, "label": label, "group": "Ice & temperature", "units": units, "decimals": dec,
                     "range": rng, "ramp": RAMPS[ramp], "status": "ready", "dataset": prp_ds, "source": "DLRE_PRP_SOUTH",
                     "resolution": f"{ntri:,} model triangles (0.5 km grid, two per cell) binned to 960 m", "what": what, "grid": meta,
                     "coverageNote": prp_cover}
            if lid == "icedepth":
                layer["resolution"] += " (cell value = median of its triangles)"
                layer["sentinels"] = {
                    "-999": f"documented: deeper than 2.8738 m ({flags['minus999']:,} triangles, all with annual max >= 203 K); shown grey",
                    "-1": f"undocumented: only on the {flags['minus1']:,} coldest triangles (annual max <= 101.3 K); treated as 0 m, stable at the surface",
                }
            w.add(layer)
        w.add({"id": "trapdist", "label": "Distance to cold trap", "group": "Ice & temperature", "units": "km", "decimals": 1,
               "range": [0, 30], "ramp": RAMPS["frost"][::-1], "status": "ready", "dataset": prp_ds, "source": "derived",
               "resolution": "960 m, octagonal distance (±8 %)", "hidden": True,
               "what": "Straight-line distance to the nearest cell containing cold-trap ground (annual max < 110 K).",
               "grid": w.grid_png("trapdist", dist, 0.0, 62.5, 8)})
        w.add({"id": "icedist", "label": "Distance to shallow ice", "group": "Ice & temperature", "units": "km", "decimals": 1,
               "range": [0, 30], "ramp": RAMPS["frost"][::-1], "status": "ready", "dataset": prp_ds, "source": "derived",
               "resolution": "960 m, octagonal distance (±8 %)", "hidden": True,
               "what": "Straight-line distance to the nearest cell where the model says ice could survive within 1 m of the surface.",
               "grid": w.grid_png("icedist", idist, 0.0, 62.5, 8)})
    else:
        note = "Data still downloading (604.8 MB triangle table); re-run scripts/build-moon-layers.py when it completes."
        if prp_status == "missing":
            note = "Not downloaded."
        log(f"  skipped ({'downloading' if prp_status == 'downloading' else prp_status})")
        for lid, label, units, rng, ramp, dec, what in prp_layers:
            w.add({"id": lid, "label": label, "group": "Ice & temperature", "units": units, "decimals": dec, "range": rng,
                   "ramp": RAMPS[ramp], "status": prp_status, "statusNote": note, "dataset": prp_ds,
                   "source": "DLRE_PRP_SOUTH", "resolution": "~500 m model triangles", "what": what})

    # ---------------- Mini-RF CPR
    log("Mini-RF global CPR")
    mrf = RAW / "minirf" / "global_cpr_32ppd_simp_0c.img"
    mrf_lbl = pds3_label(mrf.with_suffix(".lbl"))
    mrf_status = file_status(mrf, label_bytes(mrf_lbl))
    mrf_ds = {"name": "LRO Mini-RF global mosaic (LRO-L-MRFLRO-5-GLOBAL-MOSAIC-V1.0)", "url": "https://pds-geosciences.wustl.edu/missions/lro/mrf.htm"}
    cpr_layer = {"id": "cpr", "label": "Radar CPR (Mini-RF)", "group": "Surface", "units": "ratio", "decimals": 2,
                 "range": [0, 1.5], "ramp": RAMPS["viridis"], "dataset": mrf_ds, "source": "GLOBAL_CPR_32PPD_SIMP_0C",
                 "resolution": "32 px/° (~950 m), S-band 12.6 cm",
                 "what": "Circular polarisation ratio of S-band radar echoes. High values (> 1) mean ground rough at the decimetre scale (blocky rocks, fresh craters) OR possibly ice: radar alone cannot tell them apart."}
    def cpr_valid(b):
        return np.isfinite(b) & (b > 0) & (b < 50)  # ISIS special pixels are huge negative numbers
    if mrf_status == "ready":
        cyl_products["cpr"] = (mrf, mrf_lbl, cpr_valid)
        g, nvalid = cylindrical_to_polar(mrf, mrf_lbl, cpr_valid, GRID_N)
        log(f"  {nvalid:,} cells with data")
        w.display("cpr", colourise(g, "viridis", 0, 1.5))
        cpr_layer.update(status="ready", grid=w.grid_png("cpr", g, 0.0, 2.5, 8),
                         stats={"median": float(np.nanmedian(g)) if nvalid else None})
    else:
        log(f"  skipped ({mrf_status})")
        cpr_layer.update(status=mrf_status, statusNote="Data still downloading (265 MB); re-run scripts/build-moon-layers.py when it completes." if mrf_status == "downloading" else "Not downloaded.")
    w.add(cpr_layer)

    # ---------------- LEND epithermal neutrons (hydrogen)
    log("LEND averaged south polar map")
    lend = RAW / "lend" / "lend_rdr_alds_20111211.dat"
    lend_ds = {"name": "LRO LEND averaged polar map (LRO-L-LEND-4/5-RDR-V1.0, ALDS, 2011-12-11 to 2016-09-14)",
               "url": "https://pds-geosciences.wustl.edu/missions/lro/lend.htm"}
    lend_layer = {"id": "lend", "label": "Hydrogen (LEND)", "group": "Ice & temperature", "units": "% fewer neutrons",
                  "decimals": 1, "range": [-3, 3], "ramp": RAMPS["vik"][::-1], "dataset": lend_ds, "source": "LEND_RDR_ALDS_20111211",
                  "ends": ["drier", "more hydrogen"], "coverageShort": "Covers 80°S to the pole; blank right at the pole",
                  "resolution": "0.5° cells below 80°S, smoothed over 15 km (LEND's collimated footprint is ~10 km)",
                  "what": "How many fewer epithermal neutrons escape here than on average at 80-83°S. Hydrogen slows neutrons, so blue "
                          "(fewer neutrons) means more hydrogen in the top metre, most likely water ice; brown means drier than average. "
                          "The signal is only a few per cent, so every value comes with its uncertainty."}
    if lend.exists() and lend.stat().st_size == 14400 * 310:
        raw = np.fromfile(lend, dtype=np.uint8).reshape(14400, 310)
        col = lambda off: raw[:, off - 1 : off + 3].copy().view(">f4").ravel().astype(np.float64)  # 1-based PDS offsets
        llat, llon, lrate, lerr = col(47), col(51), col(111), col(115)  # CSETN = collimated epithermal neutron detectors
        ok = (lerr > 0) & (lrate > 3) & (lrate < 7)
        lx, ly = polar_xy(llat, llon)
        lx, ly = lx / 1000, ly / 1000
        wgt = np.where(ok, 1 / lerr**2, 0.0)
        idx = np.where(ok)[0]
        smooth = np.full(lrate.size, np.nan)
        sigma = np.full(lrate.size, np.nan)
        for s in range(0, lrate.size, 800):  # inverse-variance mean of every cell within 15 km
            d = np.hypot(lx[s : s + 800, None] - lx[None, idx], ly[s : s + 800, None] - ly[None, idx])
            k = (d <= 15.0) * wgt[None, idx]
            tot = k.sum(1)
            with np.errstate(invalid="ignore", divide="ignore"):
                smooth[s : s + 800] = (k * lrate[None, idx]).sum(1) / tot
                sigma[s : s + 800] = 1 / np.sqrt(tot)
        ref = float(np.median(lrate[ok & (llat < -80) & (llat > -83)]))
        supp = (1 - smooth / ref) * 100
        supp_err = sigma / ref * 100
        supp[~(supp_err <= 1.2)] = np.nan  # too few counts to say anything (mostly right at the pole)
        # Each polar cell takes the LEND cell it falls in (0.5° bands from the pole, 0.5° of longitude).
        gx, gy = grid_centres(GRID_N)
        glat, glon = polar_latlon(gx, gy)
        band = np.floor((glat + 90) / 0.5).astype(np.int64)
        lonc = np.floor((np.mod(glon, 360)) / 0.5).astype(np.int64) % 720
        inside = (glat <= -80) & (band >= 0) & (band < 20)
        cell = np.where(inside, band * 720 + lonc, 0)
        g = np.where(inside, supp[cell], np.nan)
        gerr = np.where(inside, supp_err[cell], np.nan)
        # The cells are 0.5° wedges; two ~7 km box passes remove their hard edges (values are already 15 km means).
        g[~np.isfinite(g)] = np.nan  # infinite uncertainty (no counts) would poison the integral image
        gerr[~np.isfinite(gerr) | ~np.isfinite(g)] = np.nan
        has_lend = np.isfinite(g)
        g = np.where(has_lend, box_mean(box_mean(g, 7), 7), np.nan)
        gerr = np.where(has_lend, box_mean(box_mean(gerr, 7), 7), np.nan)
        nvalid = int(np.isfinite(g).sum())
        log(f"  reference rate {ref:.3f} (median 80-83°S); {nvalid:,} map cells; suppression p5-p95 "
            f"{np.nanpercentile(g, 5):.1f} to {np.nanpercentile(g, 95):.1f} %")
        w.display("lend", colourise(g, "vik", 3, -3), relief=0.5)
        lend_layer.update(status="ready", grid=w.grid_png("lend", g, -6.0, 6.0, 8),
                          errorGrid=w.grid_png("lend_err", gerr, 0.0, 2.5, 8),
                          coverageNote="LEND's averaged polar product covers 80°S to the pole; cells with an uncertainty above "
                                       "1.2 % (mostly within ~1° of the pole, where LRO spent little time per cell) are left blank.",
                          stats={"referenceRate": round(ref, 4), "p95": round(float(np.nanpercentile(g, 95)), 2)})
        w.grids.pop("lend_err", None)
    else:
        log("  skipped (missing)")
        lend_layer.update(status="missing", statusNote="Not downloaded: see assets-raw/nasa/README.md (LEND ALDS 2011-12-11).")
    w.add(lend_layer)

    # ---------------- Artemis regions, features, site values
    log("Site values")
    reg_doc = json.loads(REGIONS_JSON.read_text(encoding="utf-8"))
    ready = [l for l in w.layers if l["status"] == "ready"]

    def values_at(lat, lon):
        x, y = polar_xy(lat, lon)
        r, c, ok = xy_to_cell(np.array([x]), np.array([y]), GRID_N)
        vals = {}
        for l in ready:
            if not ok[0]:
                vals[l["id"]] = None
                continue
            v = float(w.grids[l["id"]][r[0], c[0]])
            vals[l["id"]] = "none" if math.isinf(v) else (None if math.isnan(v) else round(v, 4))
        return vals, bool(ok[0])

    def area_stats(cx, cy, radius):
        gx, gy = grid_centres(GRID_N)
        m = np.hypot(gx - cx, gy - cy) <= radius
        st = {"cells": int(m.sum())}
        sl = w.grids["slope"][m]
        st["slopeMean"] = round(float(np.nanmean(sl)), 2)
        st["slopeBelow8Pct"] = round(float(100 * np.nanmean(sl < 8)), 1)
        st["elevationMin"] = round(float(np.nanmin(w.grids["elevation"][m])), 0)
        st["elevationMax"] = round(float(np.nanmax(w.grids["elevation"][m])), 0)
        if "coldtrap" in w.grids:
            ct = w.grids["coldtrap"][m]
            st["coldTrapAreaPct"] = round(float(np.nanmean(ct)), 2)
            st["tavgMean"] = round(float(np.nanmean(w.grids["tavg"][m])), 1)
            st["tavgMax"] = round(float(np.nanmax(w.grids["tavg"][m])), 1)
            st["tmaxMean"] = round(float(np.nanmean(w.grids["tmax"][m])), 1)
            ice = w.grids["icedepth"][m]
            ice = ice[~np.isnan(ice)]
            st["iceWithin1mPct"] = round(float(100 * np.mean(ice <= 1.0)), 1) if ice.size else None
            st["iceMinDepth"] = (round(float(ice.min()), 2) if np.isfinite(ice.min()) else "none") if ice.size else None
            st["trapDistMin"] = round(float(np.nanmin(w.grids["trapdist"][m])), 1)
        if "ruggedness" in w.grids:
            st["ruggednessMean"] = round(float(np.nanmean(w.grids["ruggedness"][m])), 2)
        if "cpr" in w.grids:
            st["cprMean"] = round(float(np.nanmean(w.grids["cpr"][m])), 3)
        if "lend" in w.grids:
            ln = w.grids["lend"][m]
            st["lendMean"] = round(float(np.nanmean(ln)), 2) if np.isfinite(ln).any() else None
        return st

    entries = []
    for s in moon_sites():
        vals, inside = values_at(s["lat"], s["lon"])
        e = {"id": s["id"], "name": s["name"], "kind": "site", "lat": s["lat"], "lon": s["lon"],
             "coords": "lib/data/sites.ts", "onPolarMap": inside, "values": vals}
        if not inside:  # outside 75–90°S: sample the global cylindrical products directly
            e["global"] = {lid: (round(v * (100 if lid == "rock" else 1), 4) if v is not None else None)
                           for lid, (img, lbl, valid) in cyl_products.items()
                           for v in [sample_cylindrical(img, lbl, valid, s["lat"], s["lon"])]}
        entries.append(e)
    regions_out = []
    for reg in reg_doc["regions"]:
        lat, lon, cx, cy, radius = region_geometry(reg)
        vals, _ = values_at(lat, lon)
        st = area_stats(cx, cy, radius)
        # the same layers at the published landing sites themselves (a check on our 960 m cells)
        at = [values_at(a, b)[0] for a, b in reg["sites"]]
        sites_st = {"n": len(at)}
        for lid in ("slope", "ruggedness", "elevation", "tmax", "tavg", "cpr", "trapdist", "icedist"):
            vs = [v[lid] for v in at if isinstance(v.get(lid), (int, float))]
            if vs:
                sites_st[f"{lid}Mean"] = round(float(np.mean(vs)), 2)
        ices = [v.get("icedepth") for v in at if v.get("icedepth") is not None]
        if ices:
            num_ice = [v for v in ices if isinstance(v, (int, float))]
            sites_st["iceStableN"] = len(num_ice)  # sites whose cell has stable ice within 2.87 m
            sites_st["iceMedian"] = (round(float(np.median([v if isinstance(v, (int, float)) else np.inf for v in ices])), 2)
                                     if len(num_ice) * 2 > len(ices) else "none")
        regions_out.append({"id": reg["id"], "name": reg["name"], "lat": round(lat, 4), "lon": round(lon, 4),
                            "radiusKm": round(radius / 1000, 1), "approximate": True})
        entries.append({"id": f"artemis-{reg['id']}", "name": reg["name"], "kind": "artemis-region-centre",
                        "lat": round(lat, 4), "lon": round(lon, 4), "approximate": True,
                        "coords": "mean of candidate landing sites, Wueller et al. 2026 (JGR Planets)",
                        "siteId": reg.get("siteId"), "radiusKm": round(radius / 1000, 1),
                        "values": vals, "area": st, "landingSites": sites_st})
    for f in reg_doc["features"]:
        vals, _ = values_at(f["lat"], f["lon"])
        entries.append({"id": f["id"], "name": f["name"], "kind": "feature", "lat": f["lat"], "lon": f["lon"], "values": vals})

    layer_info = {l["id"]: {"label": l["label"], "units": l["units"], "dataset": l["dataset"]["name"], "status": l["status"]} for l in w.layers}
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    (out / "site-values.json").write_text(json.dumps({
        "about": "Values of every Moon base map layer at each TwinWorlds Moon site and at each Artemis III candidate region centre. "
                 "Point values are the 960 m grid cell containing the point; 'area' summarises the approximate region extent. "
                 "'none' for icedepth means deeper than 2.87 m (no stable ice in the modelled top 2.87 m). null = layer not available at that point.",
        "generated": stamp, "layers": layer_info, "entries": entries}, indent=1), encoding="utf-8")

    manifest = {
        "generated": stamp,
        "grid": {
            "projection": "South polar stereographic on a 1737.4 km sphere, true scale at the pole; 0° longitude points up, 90°E right (LOLA convention).",
            "radiusM": R_MOON, "halfWidthM": HALF_W, "size": GRID_N, "pixelM": GRID_PX,
            "display": {"size": DISP_N, "pixelM": DISP_PX},
        },
        "layers": w.layers,
        "regions": regions_out,
        "features": reg_doc["features"],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    total = sum(p.stat().st_size for p in out.iterdir() if p.is_file())
    log(f"Done in {time.time() - t0:.0f} s → {out} ({total / 1e6:.1f} MB)")
    for p in sorted(out.iterdir()):
        log(f"  {p.name:<22} {p.stat().st_size / 1e3:8.0f} kB")


if __name__ == "__main__":
    main()
