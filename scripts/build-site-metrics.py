"""
Sample measured NASA values at every Moon and Mars site in lib/data/sites.ts and write
lib/data/site-metrics.generated.json for the Mission Score, the site drawer and Compare.

Every value is { value, units, dataset, datasetId, resolution, sample, sd?, range?, n?, note? }.
A value of null always carries a note saying why (masked, outside coverage, still downloading).

Datasets (all read-only from assets-raw/nasa):
  Mars  Odyssey GRS 5x5 deg element maps (H2O, Fe, Cl, Si, K, Th), Odyssey Neutron Spectrometer epithermal
        flux (0.5 deg), MGS TES thermal inertia day/night (20 px/deg) with its interpolation masks.
  Moon  Diviner rock abundance and regolith temperature anomaly (32 px/deg, 60S-60N only), LOLA 240 m polar
        elevation and slope (south of 75S), and - only once fully downloaded - the Diviner Polar Resource
        Product (south) and the Mini-RF global CPR mosaic.

Files that are still downloading are skipped unless their size equals the final size exactly, so this script
can simply be re-run later.  Usage:  python -I scripts/build-site-metrics.py
"""

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
NASA = ROOT / "assets-raw" / "nasa"
OUT = ROOT / "lib" / "data" / "site-metrics.generated.json"

R_MOON = 1737.4
R_MARS = 3396.0

# Final byte sizes of the two Moon files that may still be downloading.
PRP_TAB = NASA / "moon" / "diviner" / "polar-resource" / "dlre_prp_south.tab"
PRP_SIZE = 604_800_210
CPR_IMG = NASA / "moon" / "minirf" / "global_cpr_32ppd_simp_0c.img"
CPR_SIZE = 265_420_800

DATASETS = {
    "odyssey-grs": {
        "name": "Mars Odyssey Gamma Ray Spectrometer, 5° element maps",
        "short": "Odyssey GRS",
        "instrument": "GRS",
        "pds": "ODY-M-GRS-5-ELEMENTS-V1.0",
        "url": "https://pds-geosciences.wustl.edu/missions/odyssey/grs_elements.html",
    },
    "odyssey-ns": {
        "name": "Mars Odyssey Neutron Spectrometer epithermal flux (first 25.7 days of mapping)",
        "short": "Odyssey NS",
        "instrument": "NS",
        "pds": "ODY-M-GRS-5-NEUTRON-V1.0",
        "url": "https://pds-geosciences.wustl.edu/missions/odyssey/grs_neutron.html",
    },
    "mgs-tes-ti": {
        "name": "MGS TES thermal inertia maps (Putzig & Mellon 2007)",
        "short": "MGS TES",
        "instrument": "TES",
        "pds": "MGS-M-TES-5-TIMAP-V1.0",
        "url": "https://pds-geosciences.wustl.edu/missions/mgs/tes_tiamap.html",
    },
    "diviner-gdr": {
        "name": "LRO Diviner global rock abundance and regolith temperature (Bandfield et al. 2011)",
        "short": "LRO Diviner",
        "instrument": "Diviner",
        "pds": "LRO-L-DLRE-5-GDR-V1.0",
        "url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
    },
    "diviner-prp": {
        "name": "LRO Diviner Polar Resource Product, south (Paige et al.)",
        "short": "Diviner PRP",
        "instrument": "Diviner",
        "pds": "LRO-L-DLRE-5-PRP-V2.0",
        "url": "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
    },
    "lola-polar": {
        "name": "LRO LOLA south polar 240 m elevation and slope (LDEM/LDSM_75S_240M)",
        "short": "LOLA 240 m",
        "instrument": "LOLA",
        "pds": "LRO-L-LOLA-4-GDR-V1.0",
        "url": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
    },
    "minirf-cpr": {
        "name": "LRO Mini-RF global circular polarisation ratio mosaic (S-band, 32 px/deg)",
        "short": "LRO Mini-RF",
        "instrument": "Mini-RF",
        "pds": "LRO-L-MRFLRO-5-GLOBAL-MOSAIC-V1.0",
        "url": "https://pds-geosciences.wustl.edu/missions/lro/mrflro.htm",
    },
}


# ---------------------------------------------------------------- helpers

def pds3_label(path: Path):
    """The keywords we need from a PDS3 .lbl (first image object). Units in <...> are kept separately."""
    text = path.read_text(encoding="latin-1")

    def kw(name, cast=str, default=None):
        m = re.search(rf"^\s*{name}\s*=\s*\"?([^\"\r\n<]+?)\"?\s*(<([^>]*)>)?\s*$", text, re.M)
        if not m:
            return default
        try:
            return cast(m.group(1).strip())
        except ValueError:
            return default

    def unit(name):
        m = re.search(rf"^\s*{name}\s*=\s*[^\r\n<]*<([^>]*)>", text, re.M)
        return m.group(1).strip().lower() if m else ""

    scale = kw("MAP_SCALE", float)
    scale_km = scale / 1000 if scale is not None and unit("MAP_SCALE").startswith("m") else scale
    return {
        "lines": kw("LINES", int),
        "samples": kw("LINE_SAMPLES", int),
        "type": kw("SAMPLE_TYPE", str, "").upper(),
        "bits": kw("SAMPLE_BITS", int, 16),
        "scale": kw("SCALING_FACTOR", float, 1.0),
        "offset": kw("OFFSET", float, 0.0),
        "missing": kw("MISSING_CONSTANT", str),
        "ppd": kw("MAP_RESOLUTION", float),
        "scale_km": scale_km,
        "line_off": kw("LINE_PROJECTION_OFFSET", float),
        "samp_off": kw("SAMPLE_PROJECTION_OFFSET", float),
        "maxlat": kw("MAXIMUM_LATITUDE", float, 90.0),
        "minlat": kw("MINIMUM_LATITUDE", float, -90.0),
        "westlon": kw("WESTERNMOST_LONGITUDE", float, -180.0),
    }


def open_img(img: Path, lab: dict):
    t = lab["type"]
    big = "MSB" in t or "SUN" in t or t == "IEEE_REAL"
    if "REAL" in t:
        dt = (">" if big else "<") + "f" + str(lab["bits"] // 8)
    else:
        kind = "u" if "UNSIGNED" in t else "i"
        dt = (">" if big else "<") + kind + str(lab["bits"] // 8)
    return np.memmap(img, dtype=dt, mode="r", shape=(lab["lines"], lab["samples"]))


def complete(path: Path, size: int | None = None, lab: dict | None = None) -> bool:
    if not path.exists():
        return False
    if size is not None:
        return path.stat().st_size == size
    if lab is not None:
        return path.stat().st_size >= lab["lines"] * lab["samples"] * lab["bits"] // 8
    return True


def gc_km(lat1, lon1, lat2, lon2, r):
    """Great-circle distance (haversine), vectorised over lat2/lon2."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(lon2 - lon1)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def cyl_disc(a, lab, lat, lon, radius_km, r_body):
    """All pixels of a simple-cylindrical grid within radius_km of (lat, lon). Works up to the pole."""
    ppd = lab["ppd"] or lab["samples"] / 360.0
    maxlat, minlat = lab["maxlat"], lab["minlat"]
    if not (minlat <= lat <= maxlat):
        return None
    dlat = math.degrees(radius_km / r_body)
    r0 = max(0, int(math.floor((maxlat - (lat + dlat)) * ppd)))
    r1 = min(lab["lines"] - 1, int(math.floor((maxlat - (lat - dlat)) * ppd)))
    rows = np.arange(r0, r1 + 1)
    row_lat = maxlat - (rows + 0.5) / ppd
    out = []
    west = lab["westlon"] if lab["westlon"] is not None else 0.0
    for r, plat in zip(rows, row_lat):
        coslat = max(math.cos(math.radians(plat)), 1e-6)
        dlon = min(180.0, math.degrees(radius_km / (r_body * coslat)))
        c_centre = ((lon - west) % 360) * ppd
        if dlon >= 180:
            cols = np.arange(lab["samples"])
        else:
            cols = np.arange(int(math.floor(c_centre - dlon * ppd)), int(math.ceil(c_centre + dlon * ppd)) + 1) % lab["samples"]
        plon = west + (cols + 0.5) / ppd
        d = gc_km(lat, lon, plat, plon, r_body)
        keep = cols[d <= radius_km]
        if keep.size:
            out.append(np.asarray(a[r, keep], dtype=float))
    return np.concatenate(out) if out else None


def stats(v):
    v = v[np.isfinite(v)]
    if v.size == 0:
        return None
    return {
        "mean": float(np.mean(v)),
        "sd": float(np.std(v)),
        "p10": float(np.percentile(v, 10)),
        "p90": float(np.percentile(v, 90)),
        "n": int(v.size),
    }


def rnd(x, nd):
    return None if x is None else round(float(x), nd)


def metric(value, units, ds, resolution, sample, nd=2, st=None, note=None, **extra):
    m = {
        "value": rnd(value, nd),
        "units": units,
        "dataset": DATASETS[ds]["name"],
        "datasetId": ds,
        "resolution": resolution,
        "sample": sample,
    }
    if st is not None and value is not None:
        m["sd"] = rnd(st["sd"], nd)
        m["range"] = [rnd(st["p10"], nd), rnd(st["p90"], nd)]
        m["n"] = st["n"]
    if note:
        m["note"] = note
    m.update(extra)
    return m


def missing(units, ds, resolution, note):
    return metric(None, units, ds, resolution, "—", note=note)


def polar_xy(lat, lon):
    """South polar stereographic, km, spherical Moon (matches LOLA LDEM/LDSM and the Diviner PRP grid)."""
    rho = 2 * R_MOON * np.tan(np.radians(90 + np.asarray(lat, dtype=float)) / 2)
    return rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))


# ---------------------------------------------------------------- sites

def read_sites():
    text = (ROOT / "lib" / "data" / "sites.ts").read_text(encoding="utf-8")
    out = []
    for world in ("moon", "mars"):
        for m in re.finditer(rf'id: "({world}-[^"]+)",\s*world: "{world}",\s*name: "([^"]+)".*?lat: ([-\d.]+),\s*lon: ([-\d.]+)', text, re.S):
            out.append({"id": m.group(1), "world": world, "name": m.group(2), "lat": float(m.group(3)), "lon": float(m.group(4))})
        if world == "moon":  # the Artemis III regions are generated from a tuple list in sites.ts
            for m in re.finditer(r'\["(moon-[^"]+)",\s*"([^"]+)",\s*([-\d.]+),\s*([-\d.]+)', text):
                if not any(s["id"] == m.group(1) for s in out):
                    out.append({"id": m.group(1), "world": "moon", "name": m.group(2), "lat": float(m.group(3)), "lon": float(m.group(4))})
    return out


SITES = read_sites()
RESULT: dict = {s["id"]: {"world": s["world"], "name": s["name"], "lat": s["lat"], "lon": s["lon"], "metrics": {}} for s in SITES}
STATUS: dict = {}


def put(site, key, m):
    RESULT[site["id"]]["metrics"][key] = m


def world_sites(world):
    return [s for s in SITES if s["world"] == world]


# ---------------------------------------------------------------- Mars

GRS = {
    # key, file, label, units
    "waterGRS": ("h2o_sr_5x5.tab", "wt %"),
    "ironGRS": ("fe_sr_5x5.tab", "wt %"),
    "chlorineGRS": ("cl_sr_5x5.tab", "wt %"),
    "siliconGRS": ("si_sr_5x5.tab", "wt %"),
    "potassiumGRS": ("k_sr_5x5.tab", "wt %"),
    "thoriumGRS": ("th_sr_5x5.tab", "ppm"),
}


def mars_grs():
    d = NASA / "mars" / "odyssey-grs"
    for key, (fname, units) in GRS.items():
        tab = d / fname
        if not tab.exists():
            STATUS[key] = "file missing"
            continue
        rows = np.loadtxt(tab, usecols=(0, 1, 2, 3))
        val = np.full((36, 72), np.nan)
        sig = np.full((36, 72), np.nan)
        for lat, lon, v, s in rows:
            r, c = int((90 - lat) // 5), int((lon % 360) // 5)
            if v < 9000:
                val[r, c] = v
                sig[r, c] = s if s < 9000 else np.nan
        smoothing = "10° boxcar" if key not in ("potassiumGRS", "thoriumGRS") else "5° boxcar"
        res = f"5° bins (~300 km), {smoothing}-smoothed"
        for s in world_sites("mars"):
            r, c = int((90 - s["lat"]) // 5), int((s["lon"] % 360) // 5)
            v = val[r, c]
            if np.isnan(v):
                note = ("Masked in the archived map: this far north or south (beyond roughly 45–60°, depending on "
                        "longitude) the ground is ice-rich, which does not fit the evenly mixed soil model used to turn "
                        "gamma-ray counts into concentrations. The neutron data below still cover it.")
                put(s, key, missing(units, "odyssey-grs", res, note))
            else:
                extra = {"sigma": rnd(sig[r, c], 3)} if not np.isnan(sig[r, c]) else {}
                note = None
                if key == "waterGRS":
                    note = ("Water-equivalent hydrogen in roughly the top metre; at low latitudes this is mostly water "
                            "bound in minerals, not ice.")
                put(s, key, metric(v, units, "odyssey-grs", res, "5° bin containing the site", nd=3 if units == "ppm" else 2, note=note, **extra))
        STATUS[key] = "ok"
        print(f"  GRS {key}: valid {np.nanmin(val):.3g}–{np.nanmax(val):.3g} {units}")


def mars_neutron():
    tab = NASA / "mars" / "odyssey-grs" / "ns_epithermal_020917.tab"
    if not tab.exists():
        STATUS["epithermalNS"] = "file missing"
        return
    lon, lat, v = np.loadtxt(tab, delimiter=",").T
    grid = np.full((360, 720), np.nan)
    rows = ((90 - lat) / 0.5).astype(int).clip(0, 359)
    cols = ((lon % 360) / 0.5).astype(int).clip(0, 719)
    grid[rows, cols] = np.where(v > 0, v, np.nan)
    p2, p98 = np.nanpercentile(grid, 2), np.nanpercentile(grid, 98)
    print(f"  NS epithermal: {p2:.2f}–{p98:.2f} counts/s (2–98 %)")
    for s in world_sites("mars"):
        r, c = int((90 - s["lat"]) / 0.5), int((s["lon"] % 360) / 0.5)
        block = grid[max(0, r - 2): r + 3, [(c + k) % 720 for k in range(-2, 3)]]
        st = stats(block.ravel())
        res = "0.5° grid; the instrument footprint is ~600 km"
        if st is None:
            put(s, "epithermalNS", missing("counts/s", "odyssey-ns", res, "No coverage at this point."))
            continue
        put(s, "epithermalNS", metric(st["mean"], "counts/s", "odyssey-ns", res, "2.5° × 2.5° window (5 × 5 cells)", st=st,
                                       note="Fewer epithermal neutrons escape where the ground holds more hydrogen, so lower means wetter.",
                                       globalRange=[rnd(p2, 2), rnd(p98, 2)]))
    STATUS["epithermalNS"] = "ok"


def mars_tes():
    d = NASA / "mars" / "mgs-tes" / "mgst_9001" / "data"
    for key, part in (("thermalInertiaDay", "day"), ("thermalInertiaNight", "night")):
        lbl = d / f"global_ti_{part}_2007.lbl"
        if not lbl.exists():
            STATUS[key] = "file missing"
            continue
        lab = pds3_label(lbl)
        img = lbl.with_suffix(".img")
        if not complete(img, lab=lab):
            STATUS[key] = "incomplete"
            continue
        a = open_img(img, lab)
        mlbl = d / f"global_ti_msk_{part}_2007.lbl"
        mask = None
        if mlbl.exists():
            mlab = pds3_label(mlbl)
            mlab["type"] = mlab["type"] or "UNSIGNED_INTEGER"
            if complete(mlbl.with_suffix(".img"), lab=mlab):
                mask = open_img(mlbl.with_suffix(".img"), mlab)
        for s in world_sites("mars"):
            v = cyl_disc(a, lab, s["lat"], s["lon"], 10.0, R_MARS)
            if v is None:
                continue
            v = np.where(v > 0, v, np.nan)
            st = stats(v)
            res = "20 px/° (~3 km)"
            if st is None:
                put(s, key, missing("tiu", "mgs-tes-ti", res, "No valid pixels within 10 km."))
                continue
            extra = {}
            if mask is not None:
                mv = cyl_disc(mask, mlab, s["lat"], s["lon"], 10.0, R_MARS)
                if mv is not None and mv.size:
                    extra["interpolatedShare"] = rnd(float(np.mean(mv == 0)), 2)
            note = ("Thermal inertia: how well the ground holds heat. Low values mean fine dust (big day–night swings); "
                    "high values mean rock, crust or ice-cemented soil. Units J m⁻² K⁻¹ s⁻½ (tiu).")
            put(s, key, metric(st["mean"], "tiu", "mgs-tes-ti", res, "10 km radius", nd=0, st=st, note=note, **extra))
        STATUS[key] = "ok"
        print(f"  TES thermal inertia ({part}): sampled")


# ---------------------------------------------------------------- Moon

def moon_diviner_gdr():
    d = NASA / "moon" / "diviner" / "global-maps"
    spec = (
        ("rockAbundance", "dgdr_ra_avg_cyl_032_img.lbl", "%", 100.0, 2,
         "Share of the surface covered by rocks larger than about 1 m, from how slowly the ground cools at night."),
        ("regolithTempAnomaly", "dgdr_st_avg_cyl_032_img.lbl", "K", 1.0, 1,
         "Night-time temperature of the rock-free soil relative to the lunar average at the same local time "
         "(positive = warmer). Not an absolute temperature."),
    )
    for key, fname, units, mult, nd, note in spec:
        lbl = d / fname
        if not lbl.exists():
            STATUS[key] = "file missing"
            continue
        lab = pds3_label(lbl)
        img = lbl.with_suffix(".img")
        if not complete(img, lab=lab):
            STATUS[key] = "incomplete"
            continue
        a = open_img(img, lab)
        miss = -32768
        res = "32 px/° (~950 m)"
        for s in world_sites("moon"):
            if not (lab["minlat"] <= s["lat"] <= lab["maxlat"]):
                put(s, key, missing(units, "diviner-gdr", res,
                                    f"This Diviner map covers {abs(lab['minlat']):.0f}°S–{lab['maxlat']:.0f}°N only; the product "
                                    "leaves out higher latitudes."))
                continue
            v = cyl_disc(a, lab, s["lat"], s["lon"], 3.0, R_MOON)
            if v is None:
                continue
            v = np.where(v == miss, np.nan, v * lab["scale"] + lab["offset"]) * mult
            st = stats(v)
            if st is None:
                put(s, key, missing(units, "diviner-gdr", res, "No valid pixels within 3 km."))
                continue
            put(s, key, metric(st["mean"], units, "diviner-gdr", res, "3 km radius", nd=nd, st=st, note=note))
        STATUS[key] = "ok"
        print(f"  Diviner {key}: sampled")


def moon_lola():
    d = NASA / "moon" / "lola-south-pole"
    for key, kind, units in (("elevationLOLA", "ldem", "m"), ("slopeLOLA", "ldsm", "°")):
        lbl = d / f"{kind}_75s_240m.lbl"
        img = lbl.with_suffix(".img")
        if not lbl.exists():
            STATUS[key] = "file missing"
            continue
        lab = pds3_label(lbl)
        if not complete(img, lab=lab):
            STATUS[key] = "incomplete"
            continue
        a = open_img(img, lab)
        km = lab["scale_km"]  # 0.24
        radius = 1.0
        res = "240 m/pixel"
        for s in world_sites("moon"):
            if s["lat"] > lab["maxlat"]:
                continue  # outside the polar tile; Marius Hills uses the global terrain grid instead
            x, y = polar_xy(s["lat"], s["lon"])
            col = lab["samp_off"] + x / km - 0.5
            row = lab["line_off"] - y / km - 0.5
            k = int(math.ceil(radius / km))
            r0, c0 = int(round(row)), int(round(col))
            rr, cc = np.mgrid[r0 - k: r0 + k + 1, c0 - k: c0 + k + 1]
            inside = ((rr - row) ** 2 + (cc - col) ** 2) * km * km <= radius * radius
            block = np.asarray(a[r0 - k: r0 + k + 1, c0 - k: c0 + k + 1], dtype=float)[inside]
            v = block * lab["scale"] + lab["offset"]
            if kind == "ldem":
                v = v - lab["offset"] if lab["offset"] > 1e5 else v  # LDEM: height = DN * 0.5 m (offset is the reference radius)
            st = stats(v)
            if st is None:
                continue
            if kind == "ldem":
                put(s, key, metric(st["mean"], units, "lola-polar", res, "1 km radius", nd=0, st=st,
                                   note="Height above the 1737.4 km reference sphere."))
            else:
                put(s, key, metric(st["mean"], units, "lola-polar", res, "1 km radius", nd=1, st=st,
                                   note="Slope measured over ~30–120 m laser-shot baselines, mapped at 240 m; steeper than "
                                        "the 2 km regional slope because it sees smaller features.",
                                   p90=rnd(st["p90"], 1)))
        STATUS[key] = "ok"
        print(f"  LOLA {kind}: sampled")


def read_prp(tab: Path):
    """Fixed-width ASCII table (210-byte records incl. CRLF, one header record). Returns lat, lon, tavg, tmax, ice."""
    raw = np.fromfile(tab, dtype=np.uint8)
    rec = 210
    raw = raw[: (raw.size // rec) * rec].reshape(-1, rec)
    header = bytes(raw[0]).decode("ascii").rstrip("\r\n")
    names = [h.strip() for h in header.split(",")]
    first = bytes(raw[1]).decode("ascii")
    # Field boundaries from the commas of the first data record.
    edges, start = [], 0
    for i, ch in enumerate(first.rstrip("\r\n") + ","):
        if ch == ",":
            edges.append((start, i))
            start = i + 1
    body = raw[1:]
    out = {}
    for name in ("tri_clon", "tri_clat", "temp_avg", "temp_max", "ice_depth"):
        a, b = edges[names.index(name)]
        out[name] = np.ascontiguousarray(body[:, a:b]).view(f"S{b - a}").ravel().astype(np.float32)
    return out["tri_clat"], out["tri_clon"], out["temp_avg"], out["temp_max"], out["ice_depth"]


def moon_prp():
    keys = ("maxTempPRP", "avgTempPRP", "iceDepthPRP", "iceStableShare", "coldTrapShare")
    res = "triangle mesh, ~0.5 km spacing"
    if not complete(PRP_TAB, size=PRP_SIZE):
        why = "The Diviner Polar Resource file is still downloading; re-run scripts/build-site-metrics.py when it completes."
        for k in keys:
            STATUS[k] = "pending download"
        for s in world_sites("moon"):
            if s["lat"] <= -75:
                for k, u in zip(keys, ("K", "K", "m", "%", "%")):
                    put(s, k, missing(u, "diviner-prp", res, why) | {"pending": True})
        print("  Diviner PRP: still downloading, skipped")
        return
    lat, lon, tavg, tmax, ice = read_prp(PRP_TAB)
    x, y = polar_xy(lat, lon)
    radius = 5.0
    for s in world_sites("moon"):
        if s["lat"] > -75:
            continue
        sx, sy = polar_xy(s["lat"], s["lon"])
        near = (np.abs(x - sx) < radius) & (np.abs(y - sy) < radius)
        near &= (x - sx) ** 2 + (y - sy) ** 2 <= radius * radius
        if not near.any():
            continue
        tm, ta, ic = tmax[near].astype(float), tavg[near].astype(float), ice[near].astype(float)
        # ice_depth codes: -999 = ice not stable within 2.8738 m (documented); 0 = stable at the surface
        # (documented); -1 is not described in the label but occurs only where Tmax < 101.3 K, i.e. colder than the
        # documented depth-0 ground (101.3-130 K), so we read it as "stable at the surface" too.
        stable = ic > -900
        ic = np.where(stable, np.maximum(ic, 0.0), ic)
        put(s, "maxTempPRP", metric(tm.mean(), "K", "diviner-prp", res, "5 km radius", nd=0, st=stats(tm),
                                    note="Annual maximum surface temperature, averaged over the area.", peak=rnd(tm.max(), 0)))
        put(s, "avgTempPRP", metric(ta.mean(), "K", "diviner-prp", res, "5 km radius", nd=0, st=stats(ta),
                                    note="Annual average temperature 2 cm below the surface (model-fitted to Diviner)."))
        if stable.any():
            put(s, "iceDepthPRP", metric(float(np.median(ic[stable])), "m", "diviner-prp", res, "5 km radius, where ice is stable",
                                         nd=2, st=stats(ic[stable]), note="Depth below which water ice would stay frozen for "
                                         "billions of years (thermal model; 0 = stable right at the surface). Stable does not "
                                         "mean ice is actually there.", surfaceShare=rnd(float(np.mean(ic[stable] == 0)), 3)))
        else:
            put(s, "iceDepthPRP", missing("m", "diviner-prp", res, "Ice is not thermally stable within ~3 m anywhere in this 5 km area."))
        put(s, "iceStableShare", metric(100 * stable.mean(), "%", "diviner-prp", res, "5 km radius", nd=1,
                                        note="Share of ground where ice would be stable within the top ~3 m.", n=int(near.sum())))
        put(s, "coldTrapShare", metric(100 * float(np.mean(tm < 110)), "%", "diviner-prp", res, "5 km radius", nd=1,
                                       note="Share of ground that never warms above 110 K, cold enough to keep surface ice.",
                                       n=int(near.sum())))
    for k in keys:
        STATUS[k] = "ok"
    print("  Diviner PRP: sampled")


def moon_minirf():
    key = "cprMiniRF"
    lbl = CPR_IMG.with_suffix(".lbl")
    res = "32 px/° (~950 m)"
    if not lbl.exists() or not complete(CPR_IMG, size=CPR_SIZE):
        STATUS[key] = "pending download"
        for s in world_sites("moon"):
            put(s, key, missing("ratio", "minirf-cpr", res,
                                "The Mini-RF mosaic is still downloading; re-run scripts/build-site-metrics.py when it completes.") | {"pending": True})
        print("  Mini-RF CPR: still downloading, skipped")
        return
    lab = pds3_label(lbl)
    a = open_img(CPR_IMG, lab)
    for s in world_sites("moon"):
        v = cyl_disc(a, lab, s["lat"], s["lon"], 3.0, R_MOON)
        if v is None:
            continue
        v = np.where(np.isfinite(v) & (v >= 0) & (v < 10), v, np.nan)
        st = stats(v)
        if st is None:
            put(s, key, missing("ratio", "minirf-cpr", res, "No radar coverage within 3 km."))
            continue
        put(s, key, metric(st["mean"], "ratio", "minirf-cpr", res, "3 km radius", nd=2, st=st,
                           note="Circular polarisation ratio. High values (near or above 1) can mean ice, but rough, "
                                "rocky ground gives the same signal, so it is ambiguous on its own.",
                           highShare=rnd(float(np.mean(v[np.isfinite(v)] > 1.0)), 3)))
    STATUS[key] = "ok"
    print("  Mini-RF CPR: sampled")


# ---------------------------------------------------------------- main

if __name__ == "__main__":
    print(f"{len(SITES)} Moon/Mars sites from lib/data/sites.ts")
    print("Mars")
    mars_grs()
    mars_neutron()
    mars_tes()
    print("Moon")
    moon_diviner_gdr()
    moon_lola()
    moon_prp()
    moon_minirf()
    out = {
        "_meta": {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
            "script": "scripts/build-site-metrics.py",
            "note": ("Values sampled at the coordinates in lib/data/sites.ts. For the Artemis III regions these are the "
                     "namesake feature's centre, not a landing ellipse. 'value' is the mean over 'sample'; 'sd' and "
                     "'range' (10th–90th percentile) describe the spread inside that area."),
            "status": STATUS,
        },
        "datasets": DATASETS,
        "sites": RESULT,
    }
    # One site per line: compact enough to ship to the browser, still diff-able.
    body = ",\n".join(f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False, separators=(',', ':'))}" for k, v in RESULT.items())
    head = {k: v for k, v in out.items() if k != "sites"}
    text = json.dumps(head, ensure_ascii=False, indent=1)[:-2] + ',\n "sites":{\n' + body + "\n}}\n"
    json.loads(text)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.1f} KB)")
