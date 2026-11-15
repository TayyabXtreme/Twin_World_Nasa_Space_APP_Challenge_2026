"""
TwinWorlds ML: the two models behind the Analog Finder, in numpy only.

  M1 Analogue Space  standardise every Earth land cell's MODIS-derived environment -> PCA -> k-means into named
                     environment types, and place the 16 Moon/Mars Finder targets in the same space.
  M2 Learned weights a non-negative, L2-regularised logistic regression that learns how much each of the Finder's
                     thirteen parameters (the sliders: temperature, range, radiation, slope, sand, pressure, daylight,
                     rain, humidity, dust, isolation, elevation; aqueous geochemistry keeps its hand-set weight)
                     matters, from NASA-recognised Earth-Moon/Mars analogue pairs, validated leave-one-pair-out
                     against the hand-set weights.

Input: the Finder's own data (public/data/finder: earth-grid.json, earth-core.bin, targets.json for M1, built by
scripts/build-finder.py from NASA MODIS, JAXA AW3D30, LRO and Mars Odyssey/TES/MOLA; earth-params.json,
earth-params.bin and lib/finder/params.generated.json for M2, built by scripts/build-finder-params.py from NASA POWER,
SoilGrids and AW3D30). The similarity maths below mirrors lib/finder/params.ts and model.ts, so a weight learned here
means exactly the same thing in the browser.

The same file runs locally (python -I ml/train.py) and inside the Colab notebook (ml/TwinWorlds_ML.ipynb, which
embeds this file). Training needs numpy only; matplotlib is used for the notebook's charts if it is installed.
"""

from __future__ import annotations

import json
import math
import struct
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

CORE = ["tmean", "swing", "ndvi", "ati", "freeze", "relief"]  # MODIS channels of earth-core.bin (M1)
EARTH_OBLIQUITY = 23.44


# --------------------------------------------------------------------------------------------- data


@dataclass
class Grid:
    header: dict
    n: int
    nx: int
    ny: int
    res: float
    grid_index: np.ndarray  # cell -> row * nx + col
    row: np.ndarray
    lat: np.ndarray
    lon: np.ndarray
    area: np.ndarray  # cos(lat), relative cell area
    q: dict  # core key -> uint8 quantised values (0 = no data)
    pct: dict  # core key -> float[256] area-weighted percentile of each level


def load_grid(data_dir: str | Path) -> tuple[Grid, dict]:
    d = Path(data_dir)
    header = json.loads((d / "earth-grid.json").read_text(encoding="utf-8"))
    targets = json.loads((d / "targets.json").read_text(encoding="utf-8"))
    raw = np.frombuffer((d / "earth-core.bin").read_bytes(), dtype=np.uint8)
    g = header["grid"]
    nx, ny, n, res = g["nx"], g["ny"], g["cells"], g["res"]
    # Land mask: one bit per grid point, little-endian within each byte (lib/finder/model.ts decodeGrid).
    bits = np.unpackbits(raw[: header["maskBytes"]], bitorder="little")[: nx * ny].astype(bool)
    grid_index = np.flatnonzero(bits)
    assert grid_index.size == n, (grid_index.size, n)
    row = grid_index // nx
    col = grid_index - row * nx
    lat = 90 - (row + 0.5) * res
    lon = -180 + (col + 0.5) * res
    q, pct = {}, {}
    for c in header["channels"]:
        if c["file"] != "core":
            continue
        q[c["key"]] = raw[c["byteOffset"] : c["byteOffset"] + n]
        if c.get("pct"):
            pct[c["key"]] = np.asarray(c["pct"], dtype=np.float64)
    grid = Grid(header, n, nx, ny, res, grid_index, row, lat, lon, np.cos(np.radians(lat)), q, pct)
    return grid, targets


def channel(grid: Grid, key: str) -> dict:
    return next(c for c in grid.header["channels"] if c["key"] == key)


def value_of(grid: Grid, key: str, q) -> np.ndarray:
    """Physical value of quantised bytes (NaN for 0 = no data), as lib/finder/model.ts valueOf."""
    c = channel(grid, key)
    q = np.asarray(q, dtype=np.float64)
    v = c["offset"] + (q - 1) * c["scale"]
    if c["log"]:
        v = 10**v - 1 if key == "relief" else 10**v
    return np.where(q == 0, np.nan, v)


def max_sun(lat, obliquity=EARTH_OBLIQUITY):
    return np.minimum(90.0, 90.0 - np.abs(lat) + obliquity)


def finder_score(sims: np.ndarray, w: np.ndarray) -> np.ndarray:
    """S = Σ w_d s_d / Σ w_d over the parameters the target has (missing ones drop out)."""
    has = ~np.isnan(sims)
    ww = np.where(has, w[None, :], 0.0)
    return (np.nan_to_num(sims) * ww).sum(1) / np.maximum(ww.sum(1), 1e-12)


def top_pct(scores: np.ndarray, area: np.ndarray, value: float) -> float:
    """Share of Earth's land area (%) scoring higher than `value` (+ half the ties), as scoreRanker."""
    tot = area.sum()
    return float((area[scores > value].sum() + 0.5 * area[scores == value].sum()) / tot * 100)


def haversine(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = np.sin((lat2 - lat1) * p / 2) ** 2 + np.cos(lat1 * p) * np.cos(lat2 * p) * np.sin((lon2 - lon1) * p / 2) ** 2
    return 2 * 6371 * np.arcsin(np.minimum(1, np.sqrt(a)))


def cells_near(grid: Grid, lat: float, lon: float, km: float = 50) -> np.ndarray:
    dist = haversine(lat, lon, grid.lat, grid.lon)
    near = np.flatnonzero(dist <= km)
    return near if near.size else np.array([int(np.argmin(dist))])


# ------------------------------------------------------------- Finder parameters (lib/finder/params.ts, model.ts)

# The slider parameters, in the browser's order. Aqueous geochemistry ("water") is known only at catalogued sites,
# which are exactly the training positives, so learning its weight would leak the answer: it is left out of M2.
PARAMS = ["tmean", "trange", "radiation", "slope", "sand", "pressure", "daylight", "precip", "rh", "aod", "isolation", "elev"]
SOURCE = {"tmean": "tmean", "trange": "trange", "radiation": "elev", "slope": "slope", "sand": "sand", "pressure": "ps",
          "daylight": "row", "precip": "precip", "rh": "rh", "aod": "aod", "isolation": "isolation", "elev": "elev"}
UNKNOWN = 0.5  # similarity of a cell with no Earth data

# lib/finder/params.ts DEFAULT_WEIGHTS (water included: it is part of the hand-set score M2 is compared with)
PARAM_WEIGHTS = {
    "moon": {"tmean": 1, "water": 1, "radiation": 0.7, "trange": 0.6, "pressure": 0.6, "daylight": 0.6, "precip": 0.5,
             "sand": 0.5, "slope": 0.5, "rh": 0.4, "isolation": 0.4, "aod": 0.3, "elev": 0.3},
    "mars": {"precip": 1, "water": 0.9, "rh": 0.8, "tmean": 0.7, "trange": 0.6, "sand": 0.6, "aod": 0.5, "pressure": 0.5,
             "slope": 0.5, "radiation": 0.4, "daylight": 0.4, "isolation": 0.4, "elev": 0.3},
}


@dataclass
class ParamGrid:
    q: dict  # channel -> uint8 per land cell (0 = no data)
    value: dict  # channel -> float[256] physical value of each level
    pct: dict  # channel -> float[256] area-weighted percentile of each level
    row_daylight: np.ndarray  # per grid row, hours on the longest day
    row_daylight_pct: np.ndarray
    curves: dict
    targets: dict  # target id -> parameter specs


def earth_dose(elev):
    """lib/finder/params.ts earthDose: UNSCEAR 2000 cosmic + terrestrial background, µSv/day."""
    z = np.maximum(0, np.nan_to_num(elev)) / 1000
    return ((36.5 * 2 ** (z / 1.5) + 41) * 24) / 1000


def longest_daylight(lat, obliquity=EARTH_OBLIQUITY, day=24.0):
    x = -np.tan(np.radians(np.abs(lat))) * np.tan(np.radians(obliquity))
    return np.where(x <= -1, day, np.where(x >= 1, 0.0, np.arccos(np.clip(x, -1, 1)) / np.pi * day))


def load_params(data_dir: str | Path, grid: Grid, generated: str | Path | None = None) -> ParamGrid:
    """earth-params.json/.bin from data_dir; params.generated.json from `generated` or data_dir."""
    d = Path(data_dir)
    meta = json.loads((d / "earth-params.json").read_text(encoding="utf-8"))
    gen = json.loads(Path(generated or d / "params.generated.json").read_text(encoding="utf-8"))
    raw = np.frombuffer((d / "earth-params.bin").read_bytes(), dtype=np.uint8)
    q, value, pct = {}, {}, {}
    levels = np.arange(256, dtype=np.float64)
    for c in meta["channels"]:
        q[c["key"]] = raw[c["byteOffset"] : c["byteOffset"] + grid.n]
        v = c["offset"] + (levels - 1) * c["scale"]
        value[c["key"]] = np.where(levels == 0, np.nan, 10**v - 1 if c["log"] else v)
        pct[c["key"]] = np.asarray(c["pct"], dtype=np.float64)
    # Daylight per row and its area percentile over Earth's land (as decodeGrid in model.ts).
    rows = 90 - (np.arange(grid.ny) + 0.5) * grid.res
    day = longest_daylight(rows)
    row_area = np.bincount(grid.row, weights=grid.area, minlength=grid.ny)
    tot = row_area.sum()
    day_pct = np.array([(row_area[day < x].sum() + 0.5 * row_area[day == x].sum()) / tot for x in day])
    return ParamGrid(q, value, pct, day, day_pct, gen["curves"], gen["targets"])


def param_similarity(pid: str, spec: dict, curve: dict, x: np.ndarray, p: np.ndarray) -> np.ndarray:
    """lib/finder/params.ts similarity: near (Gaussian on the curve's scale), toward (percentile), rank."""
    if spec["mode"] == "toward":
        return p if spec.get("dir", 1) > 0 else 1 - p
    if spec["mode"] == "rank":
        return np.exp(-0.5 * ((p - spec.get("pct", 0.5)) / curve["sigma"]) ** 2)
    tf = (lambda v: np.log10(np.maximum(0, v) + curve["log"])) if "log" in curve else (lambda v: v)  # noqa: E731
    with np.errstate(invalid="ignore", divide="ignore"):
        delta = tf(x) - tf(np.float64(spec["v"]))
        s = np.exp(-0.5 * (delta / curve["sigma"]) ** 2)
        if spec.get("min"):
            s = np.where(delta >= 0, 1.0, s)
    return np.where(np.isfinite(x), s, UNKNOWN)


def param_similarities(grid: Grid, pg: ParamGrid, target_id: str, cells=None) -> np.ndarray:
    """(cells, len(PARAMS)) per-parameter similarities, as the browser's lookup tables; NaN where the target has no
    value for the parameter."""
    idx = np.arange(grid.n) if cells is None else np.asarray(cells)
    specs = pg.targets.get(target_id, {})
    out = np.full((idx.size, len(PARAMS)), np.nan)
    for j, pid in enumerate(PARAMS):
        spec = specs.get(pid)
        if not spec:
            continue
        src = SOURCE[pid]
        if src == "row":
            lut = param_similarity(pid, spec, pg.curves[pid], pg.row_daylight, pg.row_daylight_pct)
            out[:, j] = lut[grid.row[idx]]
            continue
        x = pg.value[src]
        if pid == "radiation":
            x = np.where(np.isfinite(x), earth_dose(x), np.nan)
        lut = param_similarity(pid, spec, pg.curves[pid], x, pg.pct[src])
        lut[0] = UNKNOWN
        out[:, j] = lut[pg.q[src][idx]]
    return out


# --------------------------------------------------------------------------------------- M1 helpers


FEATURES = [
    ("tmean", "Mean surface temperature", "K"),
    ("swing", "Day–night swing", "K"),
    ("ndvi", "Vegetation (NDVI)", ""),
    ("log_ati", "Thermal inertia (log ATI)", "log10 1/K"),
    ("freeze", "Freezing (degree-months)", "K"),
    ("log_relief", "Relief (log m)", "log10 m"),
    ("maxsun", "Highest noon Sun", "°"),
]


def earth_features(grid: Grid) -> np.ndarray:
    """(cells, 7) physical environment of every land cell, in the order of FEATURES (NaN = no data)."""
    tmean = value_of(grid, "tmean", grid.q["tmean"])
    swing = value_of(grid, "swing", grid.q["swing"])
    ndvi = value_of(grid, "ndvi", grid.q["ndvi"])
    ati = value_of(grid, "ati", grid.q["ati"])
    freeze = value_of(grid, "freeze", grid.q["freeze"])
    relief = value_of(grid, "relief", grid.q["relief"])
    return np.column_stack([tmean, swing, ndvi, np.log10(ati), freeze, np.log10(relief + 1), max_sun(grid.lat)])


def value_at_pct(grid: Grid, key: str, p: float) -> float:
    """Earth's physical value at area percentile p of a role channel (the level whose percentile is nearest)."""
    pct = grid.pct[key].copy()
    pct[0] = np.inf
    q = int(np.argmin(np.abs(pct - p)))
    return float(value_of(grid, key, [q])[0])


def target_features(grid: Grid, t: dict) -> np.ndarray:
    """A Moon/Mars target translated into Earth's feature space, exactly as the Finder translates it: role
    dimensions become the Earth value at the same rank, absolute ones keep their value. NaN where unknown."""
    dims = t["dims"]
    f = np.full(len(FEATURES), np.nan)
    if "cold" in dims:
        f[0] = value_at_pct(grid, "tmean", dims["cold"]["earthPct"])
    if "swing" in dims:
        f[1] = value_at_pct(grid, "swing", dims["swing"]["earthPct"])
    if "bare" in dims:
        f[2] = dims["bare"].get("earthTarget", 0.0)
    if "inertia" in dims:
        f[3] = math.log10(value_at_pct(grid, "ati", dims["inertia"]["earthPct"]))
    if "ice" in dims:
        f[4] = value_at_pct(grid, "freeze", dims["ice"]["earthPct"])
    if "relief" in dims:
        f[5] = math.log10(dims["relief"]["earthTarget"] + 1)
    if "sun" in dims:
        f[6] = dims["sun"]["earthTarget"]
    return f


def weighted_mean_std(x: np.ndarray, w: np.ndarray):
    m = np.nansum(x * w[:, None], 0) / np.sum(w)
    v = np.nansum(((x - m) ** 2) * w[:, None], 0) / np.sum(w)
    return m, np.sqrt(v)


def sqdist(x: np.ndarray, c: np.ndarray) -> np.ndarray:
    """Squared distances between rows of x and rows of c, without the (n, k, d) temporary."""
    return np.maximum(0.0, (x * x).sum(1)[:, None] + (c * c).sum(1)[None, :] - 2 * x @ c.T)


def kmeans(x: np.ndarray, k: int, w: np.ndarray | None = None, seed: int = 0, iters: int = 100, n_init: int = 4):
    """Weighted k-means with k-means++ seeding; returns (centroids, labels, inertia) of the best restart."""
    rng = np.random.default_rng(seed)
    w = np.ones(len(x)) if w is None else w
    best = None
    for _ in range(n_init):
        c = np.empty((k, x.shape[1]))
        c[0] = x[rng.choice(len(x), p=w / w.sum())]
        d2 = ((x - c[0]) ** 2).sum(1)
        for j in range(1, k):
            p = d2 * w
            c[j] = x[rng.choice(len(x), p=p / p.sum())]
            d2 = np.minimum(d2, ((x - c[j]) ** 2).sum(1))
        for _ in range(iters):
            lab = sqdist(x, c).argmin(1)
            new = np.array([np.average(x[lab == j], axis=0, weights=w[lab == j]) if np.any(lab == j) else c[j] for j in range(k)])
            if np.allclose(new, c, atol=1e-6):
                break
            c = new
        inertia = float((((x - c[lab]) ** 2).sum(1) * w).sum())
        if best is None or inertia < best[2]:
            best = (c, lab, inertia)
    return best


def assign(x: np.ndarray, c: np.ndarray, chunk: int = 50000) -> np.ndarray:
    out = np.empty(len(x), dtype=np.int64)
    for s in range(0, len(x), chunk):
        out[s : s + chunk] = sqdist(x[s : s + chunk], c).argmin(1)
    return out


def adjusted_rand(a: np.ndarray, b: np.ndarray) -> float:
    """Adjusted Rand index between two labelings (1 = identical partitions, ~0 = chance)."""
    ka, kb = a.max() + 1, b.max() + 1
    table = np.zeros((ka, kb))
    np.add.at(table, (a, b), 1)
    comb = lambda n: n * (n - 1) / 2  # noqa: E731
    sum_ij = comb(table).sum()
    sum_a = comb(table.sum(1)).sum()
    sum_b = comb(table.sum(0)).sum()
    n = comb(len(a))
    expected = sum_a * sum_b / n
    return float((sum_ij - expected) / (0.5 * (sum_a + sum_b) - expected))


def silhouette(x: np.ndarray, lab: np.ndarray, sample: int = 3000, seed: int = 0) -> float:
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(x), size=min(sample, len(x)), replace=False)
    xs, ls = x[idx], lab[idx]
    d = np.sqrt(sqdist(xs, xs))
    s = []
    for i in range(len(xs)):
        same = ls == ls[i]
        same[i] = False
        if not same.any():
            continue
        a = d[i, same].mean()
        b = min(d[i, ls == j].mean() for j in np.unique(ls) if j != ls[i])
        s.append((b - a) / max(a, b))
    return float(np.mean(s))


# Environment-type names, decided from each centroid's physical values (never from where the cells are). Thresholds
# sit between the centroids k-means finds on Earth; NDVI is MODIS MOD13C2 (bare desert ~0.1, dense forest ~0.8).
def name_cluster(c: dict) -> tuple[str, str]:
    t, ndvi, sw, rel = c["tmean"] - 273.15, c["ndvi"], c["swing"], c["relief_m"]
    if t < -30 and ndvi < 0.1:
        return "Polar ice and cold desert", "Ice sheets and the coldest bare ground on Earth: frozen all year, no plants."
    if t < -8:
        return "Arctic tundra", "Long frozen winters over permafrost, sparse low plants, short summers."
    if t < 5:
        return "Boreal forest and cold land", "Snowy winters, conifer forest and cold grassland."
    if ndvi < 0.3 and t > 22:
        return "Hot desert", "Hot, very dry, mostly bare rock and sand with a big day–night swing."
    if ndvi < 0.35:
        return "Dry steppe and scrub", "Semi-arid uplands: sparse grass and shrubs, large day–night swing."
    if t > 21 and sw < 7:
        return "Tropical forest", "Warm and green all year with a small day–night swing."
    if rel > 120:
        return "Green hills and mountains", "Warm, vegetated, rugged terrain."
    return "Temperate and savanna lowlands", "Mild to warm green plains: farmland, grassland and open woodland."


# --------------------------------------------------------------------------------------------- M1


def train_analogue_space(grid: Grid, targets: dict, k: int = 8, sample: int = 60000, seed: int = 7, log=print) -> dict:
    rng = np.random.default_rng(seed)
    X = earth_features(grid)
    w_area = grid.area
    # Impute the few missing values with the area-weighted median of the channel (counted in the model card).
    missing = np.isnan(X).sum(0)
    for j in range(X.shape[1]):
        col = X[:, j]
        bad = np.isnan(col)
        if bad.any():
            order = np.argsort(col[~bad])
            cw = np.cumsum(w_area[~bad][order])
            med = col[~bad][order][np.searchsorted(cw, cw[-1] / 2)]
            col[bad] = med
    mean, std = weighted_mean_std(X, w_area)
    Z = (X - mean) / std

    # PCA from the area-weighted covariance (7 x 7), eigenvectors sorted by variance.
    cov = (Z * w_area[:, None]).T @ Z / w_area.sum()
    evals, evecs = np.linalg.eigh(cov)
    order = np.argsort(evals)[::-1]
    evals, evecs = evals[order], evecs[:, order]
    for j in range(evecs.shape[1]):  # sign convention: largest loading positive
        if evecs[np.argmax(np.abs(evecs[:, j])), j] < 0:
            evecs[:, j] *= -1
    explained = evals / evals.sum()
    P = Z @ evecs
    log(f"PCA explained variance: {np.round(explained * 100, 1)} %  (PC1+PC2 = {explained[:2].sum() * 100:.1f} %)")

    # Cluster in the full standardised space on an area-weighted sample, then assign every cell.
    sidx = rng.choice(grid.n, size=min(sample, grid.n), replace=False, p=w_area / w_area.sum())
    Zs = Z[sidx]
    k_scan = []
    for kk in range(4, 13):
        c, lab, inertia = kmeans(Zs, kk, seed=seed, n_init=2, iters=60)
        k_scan.append({"k": kk, "inertia": round(inertia / len(Zs), 4), "silhouette": round(silhouette(Zs, lab, 1500, seed), 4)})
        log(f"  k={kk:2d}  inertia/n={k_scan[-1]['inertia']:.3f}  silhouette={k_scan[-1]['silhouette']:.3f}")
    cents, _, _ = kmeans(Zs, k, seed=seed, n_init=6, iters=150)
    labels = assign(Z, cents)

    # Stability: re-fit on 10 bootstrap resamples with new seeds; compare the labels they give a held-out set.
    hold = rng.choice(grid.n, size=20000, replace=False)
    ref = assign(Z[hold], cents)
    aris = []
    for b in range(10):
        bi = rng.choice(len(Zs), size=len(Zs), replace=True)
        cb, _, _ = kmeans(Zs[bi], k, seed=seed + 101 + b, n_init=2, iters=80)
        aris.append(adjusted_rand(ref, assign(Z[hold], cb)))
    log(f"Cluster stability (adjusted Rand, 10 bootstraps): {np.mean(aris):.3f} ± {np.std(aris):.3f}")

    # Describe each cluster in physical units and name it.
    phys = mean + cents * std
    clusters = []
    tot = w_area.sum()
    for j in range(k):
        m = labels == j
        c = {
            "tmean": float(phys[j, 0]),
            "swing": float(phys[j, 1]),
            "ndvi": float(phys[j, 2]),
            "ati": float(10 ** phys[j, 3]),
            "freeze": float(phys[j, 4]),
            "relief_m": float(10 ** phys[j, 5] - 1),
            "maxsun": float(phys[j, 6]),
        }
        name, blurb = name_cluster(c)
        pc = (cents[j] @ evecs)[:2]
        clusters.append(
            {
                "id": j,
                "name": name,
                "blurb": blurb,
                "areaPct": round(float(w_area[m].sum() / tot * 100), 2),
                "cells": int(m.sum()),
                "pc": [round(float(pc[0]), 3), round(float(pc[1]), 3)],
                "centroid": {
                    "tmeanC": round(c["tmean"] - 273.15, 1),
                    "swingK": round(c["swing"], 1),
                    "ndvi": round(c["ndvi"], 3),
                    "ati": round(c["ati"], 4),
                    "freezeK": round(c["freeze"], 1),
                    "reliefM": round(c["relief_m"]),
                    "maxSunDeg": round(c["maxsun"], 1),
                },
                "latBand": [round(float(np.percentile(grid.lat[m], 10)), 1), round(float(np.percentile(grid.lat[m], 90)), 1)],
            }
        )
    # Make names unique (two clusters can share a description): add the more telling qualifier.
    seen: dict[str, int] = {}
    for c in sorted(clusters, key=lambda c: -c["areaPct"]):
        if c["name"] in seen:
            seen[c["name"]] += 1
            warm = c["centroid"]["tmeanC"] > np.mean([x["centroid"]["tmeanC"] for x in clusters if x["name"] == c["name"]])
            c["name"] = f"{c['name']} ({'warmer' if warm else 'colder'})"
        else:
            seen[c["name"]] = 1
    # Order types from coldest to warmest so colours and legend read as a scale.
    clusters.sort(key=lambda c: c["centroid"]["tmeanC"])
    remap = {c["id"]: i for i, c in enumerate(clusters)}
    for c in clusters:
        c["id"] = remap[c["id"]]
    labels = np.vectorize(remap.get)(labels)
    cents = cents[np.argsort([remap[i] for i in range(k)])]

    # Moon and Mars targets in the same space.
    tpoints = []
    for t in targets["targets"]:
        f = target_features(grid, t)
        known = ~np.isnan(f)
        z = np.where(known, (f - mean) / std, 0.0)  # unknown dims sit at Earth's mean
        p = z @ evecs
        dist = np.sqrt(((cents - z) ** 2).sum(1))
        nearest = int(np.argmin(dist))
        # Earth cells nearest the target in the full space (how far outside Earth's cloud it sits).
        dz = np.sqrt(((Z[:, known] - z[known]) ** 2).sum(1))
        tpoints.append(
            {
                "id": t["id"],
                "name": t["name"],
                "world": t["world"],
                "pc": [round(float(p[0]), 3), round(float(p[1]), 3)],
                "type": nearest,
                "typeDist": round(float(dist[nearest]), 3),
                "nearestEarth": {"lat": round(float(grid.lat[int(np.argmin(dz))]), 3), "lon": round(float(grid.lon[int(np.argmin(dz))]), 3), "dist": round(float(dz.min()), 3)},
                "featuresKnown": int(known.sum()),
            }
        )
        log(f"  {t['name']:28s} -> {clusters[nearest]['name']:32s} (distance {dist[nearest]:.2f} sd, nearest Earth cell {dz.min():.2f} sd)")

    # Sample of Earth points for the scatter: stratified so small types still show.
    per = 900
    pts = []
    for j in range(k):
        idx = np.flatnonzero(labels == j)
        take = rng.choice(idx, size=min(per, idx.size), replace=False, p=w_area[idx] / w_area[idx].sum())
        pts.extend(take.tolist())
    pts = np.array(pts)
    rng.shuffle(pts)

    return {
        "mean": mean,
        "std": std,
        "evecs": evecs,
        "explained": explained,
        "centroids": cents,
        "labels": labels,
        "P": P,
        "clusters": clusters,
        "targets": tpoints,
        "sample": pts,
        "k_scan": k_scan,
        "stability": aris,
        "missing": missing,
        "n": grid.n,
    }


def type_map_png(grid: Grid, labels: np.ndarray, colors: list[str]) -> bytes:
    """1440 x 720 RGBA PNG of Earth's land coloured by environment type (ocean transparent)."""
    rgba = np.zeros((grid.ny * grid.nx, 4), dtype=np.uint8)
    pal = np.array([[int(h[i : i + 2], 16) for i in (1, 3, 5)] + [235] for h in colors], dtype=np.uint8)
    rgba[grid.grid_index] = pal[labels]
    return png_bytes(rgba.reshape(grid.ny, grid.nx, 4))


def png_bytes(img: np.ndarray) -> bytes:
    h, w, _ = img.shape
    raw = b"".join(b"\x00" + img[r].tobytes() for r in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def export_analogue_space(m1: dict, grid: Grid, out_dir: str | Path, source_note: str = "") -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    k = len(m1["clusters"])
    colors = pick_colors(m1["clusters"])
    for c, col in zip(m1["clusters"], colors):
        c["color"] = col
    s = m1["sample"]
    P = m1["P"]
    points = {
        "fields": ["pc1", "pc2", "type", "lat", "lon"],
        "n": int(len(s)),
        "data": [[round(float(P[i, 0]), 3), round(float(P[i, 1]), 3), int(m1["labels"][i]), round(float(grid.lat[i]), 3), round(float(grid.lon[i]), 3)] for i in s],
    }
    (out / "points.json").write_text(json.dumps(points, separators=(",", ":")), encoding="utf-8")
    loadings = [{"feature": f[0], "label": f[1], "pc1": round(float(m1["evecs"][j, 0]), 3), "pc2": round(float(m1["evecs"][j, 1]), 3)} for j, f in enumerate(FEATURES)]
    (out / "clusters.json").write_text(
        json.dumps({"types": m1["clusters"], "targets": m1["targets"], "loadings": loadings}, indent=1, ensure_ascii=False), encoding="utf-8"
    )
    (out / "types-map.png").write_bytes(type_map_png(grid, m1["labels"], colors))
    ari = np.array(m1["stability"])
    card = {
        "id": "analogue-space",
        "name": "Analogue Space",
        "version": "1.0",
        "trained": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "task": "Unsupervised: group Earth's land into environment types and place Moon/Mars targets among them.",
        "data": {
            "earth": f"{m1['n']:,} land cells of 0.25° (about 28 km) from the Analog Finder grid: NASA MODIS MOD11C3 land surface temperature, MOD13C2 NDVI, MCD43C3 albedo (2024), JAXA AW3D30 elevation.",
            "targets": "16 Moon and Mars Finder targets from LRO Diviner/LOLA and Mars Odyssey GRS/NS, MGS TES and MOLA, translated into Earth units the same way the Finder does (role dimensions by rank).",
            "features": [{"id": f[0], "label": f[1], "units": f[2], "missingCells": int(m1["missing"][j])} for j, f in enumerate(FEATURES)],
            "note": source_note,
        },
        "method": [
            "Standardise each of the 7 features with area-weighted mean and standard deviation (cells near the poles are smaller).",
            "PCA on the area-weighted covariance matrix; the 2D chart shows PC1 and PC2.",
            f"Weighted k-means (k-means++ seeding, best of 6 restarts) with k = {k}, fitted on 60,000 area-weighted cells and applied to every cell.",
            "Each type is named from its centroid's physical values (temperature, vegetation, freezing, relief, swing), never from geography.",
            "Moon and Mars targets are mapped into the same standardised space; features a target lacks sit at Earth's mean.",
        ],
        "metrics": {
            "explainedVariance": [round(float(v), 4) for v in m1["explained"]],
            "pc12Variance": round(float(m1["explained"][:2].sum()), 4),
            "stabilityARI": {"mean": round(float(ari.mean()), 4), "std": round(float(ari.std()), 4), "runs": int(ari.size)},
            "kScan": m1["k_scan"],
        },
        "score": {
            "label": "Cluster stability",
            "value": round(float(ari.mean()), 3),
            "text": f"Adjusted Rand index {ari.mean():.2f} ± {ari.std():.2f} across 10 bootstrap re-fits (1 = identical types every time). PC1 and PC2 hold {m1['explained'][:2].sum() * 100:.0f} % of the variance.",
        },
        "limits": [
            "Seven climate-and-terrain features only: no chemistry, mineralogy, radar roughness or dust.",
            "Moon and Mars targets lie far outside Earth's range on temperature, so they sit at the edge of the cloud; the nearest type says which Earth environment is least unlike them, not that it matches.",
            "k = 8 is a readable choice, not a natural number of environments: the k scan shows no sharp elbow.",
            "0.25° cells blend small features (a crater, a dry valley) with their surroundings.",
            "MODIS observes at about 10:30 and 22:30, so the day–night swing understates the true daily range.",
        ],
        "outputs": ["points.json", "clusters.json", "types-map.png", "model-card.json"],
    }
    (out / "model-card.json").write_text(json.dumps(card, indent=1, ensure_ascii=False), encoding="utf-8")


TYPE_COLOR = {
    "Polar ice and cold desert": "#dce9ff",
    "Arctic tundra": "#8db4dc",
    "Boreal forest and cold land": "#3f9c98",
    "Hot desert": "#f2a14a",
    "Dry steppe and scrub": "#d8c27a",
    "Tropical forest": "#23874a",
    "Green hills and mountains": "#b58ad6",
    "Temperate and savanna lowlands": "#9fd36b",
}


def pick_colors(clusters: list[dict]) -> list[str]:
    """A colour per type that reads physically: icy blues, forest greens, desert sands, purple for rugged ground."""
    out = []
    for c in clusters:
        col = TYPE_COLOR.get(c["name"].split(" (")[0], "#cccccc")
        while col in out:  # the same family twice: darken the second one
            r, g, b = (int(col[i : i + 2], 16) for i in (1, 3, 5))
            col = "#%02x%02x%02x" % (max(0, r - 45), max(0, g - 45), max(0, b - 45))
        out.append(col)
    return out


# --------------------------------------------------------------------------------------------- M2


def pair_cells(grid: Grid, pair: dict, km: float = 50) -> np.ndarray:
    return cells_near(grid, pair["lat"], pair["lon"], km)


def build_training_set(grid: Grid, pg: ParamGrid, pairs: list[dict], negatives: int = 400, seed: int = 11):
    """For each pair: positives = land cells within 50 km of the Earth site (each pair weighs 1 in total),
    negatives = random land cells (area-weighted) scored against the same target."""
    rng = np.random.default_rng(seed)
    rows = []
    for pi, p in enumerate(pairs):
        pos = pair_cells(grid, p)
        neg = rng.choice(grid.n, size=negatives, replace=False, p=grid.area / grid.area.sum())
        sp = param_similarities(grid, pg, p["target"], pos)
        sn = param_similarities(grid, pg, p["target"], neg)
        rows.append((pi, sp, np.full(len(pos), 1.0 / len(pos)), 1))
        rows.append((pi, sn, np.full(negatives, 1.0 / negatives), 0))
    return rows


def features_from_sims(s: np.ndarray) -> np.ndarray:
    """Logistic-regression input: each similarity centred on 0.5, missing parameters (target has none) = 0."""
    return np.nan_to_num(s - 0.5, nan=0.0)


def fit_nonneg_logreg(X: np.ndarray, y: np.ndarray, sw: np.ndarray, lam: float = 0.05, iters: int = 4000, lr: float = 0.5):
    """min Σ sw·logloss(y, σ(Xw + b)) / Σ sw + λ‖w‖²  subject to w ≥ 0  (projected gradient descent, b free)."""
    w = np.full(X.shape[1], 0.5)
    b = 0.0
    tot = sw.sum()
    for it in range(iters):
        z = X @ w + b
        p = 1 / (1 + np.exp(-np.clip(z, -30, 30)))
        g = (p - y) * sw / tot
        gw = X.T @ g + 2 * lam * w
        gb = g.sum()
        step = lr / (1 + it / 1000)
        w = np.maximum(0.0, w - step * gw)
        b -= step * gb
    return w, b


def fit_pairs(rows, use: list[int], lam: float):
    X, y, sw = [], [], []
    for pi, s, wts, lab in rows:
        if pi not in use:
            continue
        X.append(features_from_sims(s))
        y.append(np.full(len(s), lab))
        # Balance classes: positives and negatives of each pair weigh the same.
        sw.append(wts)
    return fit_nonneg_logreg(np.vstack(X), np.concatenate(y).astype(float), np.concatenate(sw), lam=lam)


def pair_rank(grid: Grid, pair: dict, w: np.ndarray, sims_all: np.ndarray) -> float:
    """The Finder's own sanity-check rule: best cell within 50 km of the site, ranked against all Earth land."""
    scores = finder_score(sims_all, w)
    near = pair_cells(grid, pair)
    best = near[np.argmax(scores[near])]
    return top_pct(scores, grid.area, scores[best])


def train_learned_weights(grid: Grid, pg: ParamGrid, targets: dict, pairs: list[dict], lams=(0.01, 0.03, 0.1, 0.3), log=print) -> dict:
    tmap = {t["id"]: t for t in targets["targets"]}
    rows = build_training_set(grid, pg, pairs)
    sims_cache = {tid: param_similarities(grid, pg, tid) for tid in {p["target"] for p in pairs}}
    default_w = {wd: np.array([PARAM_WEIGHTS[wd][d] for d in PARAMS], dtype=float) for wd in PARAM_WEIGHTS}
    groups_site = {}
    for i, p in enumerate(pairs):
        groups_site.setdefault(p["earth"], []).append(i)

    def evaluate(lam, scheme="pair"):
        ranks = []
        for i, p in enumerate(pairs):
            held = groups_site[p["earth"]] if scheme == "site" else [i]
            w, _ = fit_pairs(rows, [j for j in range(len(pairs)) if j not in held], lam)
            if w.sum() <= 0:
                w = np.ones(len(PARAMS))
            ranks.append(pair_rank(grid, p, w, sims_cache[p["target"]]))
        return np.array(ranks)

    # Choose λ by leave-one-pair-out recall@5 % (ties: mean rank).
    scan = []
    for lam in lams:
        r = evaluate(lam)
        scan.append({"lambda": lam, "recall5": round(float((r <= 5).mean()), 4), "meanTopPct": round(float(r.mean()), 3)})
        log(f"  λ={lam:<5}  LOPO recall@5% = {scan[-1]['recall5'] * 100:.0f} %   mean top-% = {r.mean():.2f}")
    best = max(scan, key=lambda s: (s["recall5"], -s["meanTopPct"]))
    lam = best["lambda"]
    lopo = evaluate(lam, "pair")
    loso = evaluate(lam, "site")
    hand = np.array([pair_rank(grid, p, default_w[tmap[p["target"]]["world"]], sims_cache[p["target"]]) for p in pairs])
    equal = np.array([pair_rank(grid, p, np.ones(len(PARAMS)), sims_cache[p["target"]]) for p in pairs])
    w_full, b_full = fit_pairs(rows, list(range(len(pairs))), lam)
    w_norm = w_full / max(w_full.max(), 1e-12)
    log(f"Learned weights (λ={lam}): " + ", ".join(f"{d}={v:.2f}" for d, v in zip(PARAMS, w_norm)))
    log(f"Recall@top-5 %: learned LOPO {(lopo <= 5).mean() * 100:.0f} % · leave-one-site-out {(loso <= 5).mean() * 100:.0f} % · hand-set {(hand <= 5).mean() * 100:.0f} % · equal {(equal <= 5).mean() * 100:.0f} %")
    return {
        "weights": w_norm,
        "raw": w_full,
        "bias": b_full,
        "lambda": lam,
        "scan": scan,
        "lopo": lopo,
        "loso": loso,
        "hand": hand,
        "equal": equal,
    }


def export_learned_weights(m2: dict, pairs: list[dict], targets: dict, out_dir: str | Path) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    tmap = {t["id"]: t for t in targets["targets"]}
    r5 = lambda r: round(float((r <= 5).mean()), 4)  # noqa: E731
    weights = {d: round(float(v), 3) for d, v in zip(PARAMS, m2["weights"])}
    weights["water"] = None  # not learned: the browser keeps the hand-set weight
    per_pair = [
        {
            "earth": p["earth"],
            "target": p["target"],
            "targetName": tmap[p["target"]]["name"],
            "world": tmap[p["target"]]["world"],
            "learnedTopPct": round(float(m2["lopo"][i]), 3),
            "handTopPct": round(float(m2["hand"][i]), 3),
        }
        for i, p in enumerate(pairs)
    ]
    by_world = {}
    for wd in ("moon", "mars"):
        idx = [i for i, p in enumerate(pairs) if tmap[p["target"]]["world"] == wd]
        by_world[wd] = {"pairs": len(idx), "learned": r5(m2["lopo"][idx]), "hand": r5(m2["hand"][idx])}
    (out / "weights.json").write_text(
        json.dumps(
            {
                "weights": weights,
                "lambda": m2["lambda"],
                "recall5": {"learnedLOPO": r5(m2["lopo"]), "learnedLOSO": r5(m2["loso"]), "hand": r5(m2["hand"]), "equal": r5(m2["equal"])},
                "byWorld": by_world,
                "pairs": per_pair,
            },
            indent=1,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    card = {
        "id": "learned-weights",
        "name": "Learned weights",
        "version": "2.0",
        "trained": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "task": "Supervised: learn how much each Finder parameter matters for a real NASA analogue pair.",
        "data": {
            "positives": f"{len(pairs)} NASA-recognised Earth–Moon/Mars analogue pairs (each with a source URL in pairs.json); every land cell within 50 km of the Earth site, weighted so each pair counts once.",
            "negatives": "400 random land cells per pair (area-weighted), scored against the same target.",
            "features": "The Finder's per-parameter similarities (mean temperature, temperature range, radiation dose, terrain slope, soil sand, air pressure, daylight, precipitation, humidity, dust, isolation, elevation), computed exactly as in the browser. Aqueous geochemistry is left out: only catalogued sites carry it, and those are the positives.",
        },
        "method": [
            "Logistic regression with non-negative weights (more similarity can never count against a place) and an L2 penalty, fitted by projected gradient descent.",
            f"λ chosen from {[s['lambda'] for s in m2['scan']]} by leave-one-pair-out recall; chosen λ = {m2['lambda']}.",
            "The learned weights are plugged into the Finder's own score, S = Σ w·s / Σ w, so they mean exactly what the sliders mean.",
            "Validation: leave one pair out, train on the rest, then check whether the held-out Earth site's best cell within 50 km lands in Earth's top 5 % for its target. The same check is run for the hand-set weights.",
        ],
        "metrics": {
            "recall5": {"learnedLOPO": r5(m2["lopo"]), "learnedLeaveOneSiteOut": r5(m2["loso"]), "handSet": r5(m2["hand"]), "equalWeights": r5(m2["equal"])},
            "meanTopPct": {"learnedLOPO": round(float(m2["lopo"].mean()), 3), "handSet": round(float(m2["hand"].mean()), 3)},
            "byWorld": by_world,
            "lambdaScan": m2["scan"],
        },
        "score": {
            "label": "Recall at top 5 %",
            "value": r5(m2["lopo"]),
            "baseline": r5(m2["hand"]),
            "text": f"Held-out NASA analogue in Earth's top 5 %: {r5(m2['lopo']) * 100:.0f} % of pairs with learned weights (leave-one-pair-out) vs {r5(m2['hand']) * 100:.0f} % with the hand-set weights.",
        },
        "weights": weights,
        "limits": [
            f"Only {len(pairs)} positive pairs, several sharing an Earth site, so scores move a lot with one pair; leave-one-site-out ({r5(m2['loso']) * 100:.0f} %) is the stricter number.",
            "NASA picked many sites for chemistry, geology or logistics, which climate and terrain parameters cannot see; those pairs are hard for any weights.",
            "One weight set is learned for both worlds; Moon pairs are few.",
            "Random cells are not true negatives: some may be good analogues nobody has tested.",
        ],
        "outputs": ["weights.json", "pairs.json", "model-card.json"],
    }
    (out / "model-card.json").write_text(json.dumps(card, indent=1, ensure_ascii=False), encoding="utf-8")
    (out / "pairs.json").write_text(json.dumps({"pairs": pairs}, indent=1, ensure_ascii=False), encoding="utf-8")
