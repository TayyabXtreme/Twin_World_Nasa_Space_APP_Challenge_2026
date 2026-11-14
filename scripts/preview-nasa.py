"""
Look inside the downloaded challenge datasets: render a preview PNG of each one and sample its values at the
app's Moon and Mars sites. Output: assets-raw/nasa/_previews/*.png and assets-raw/nasa/site-samples.json.
Sections whose files are not downloaded yet are skipped.  Usage: python scripts/preview-nasa.py
"""

import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NASA = ROOT / "assets-raw" / "nasa"
PREV = NASA / "_previews"
PREV.mkdir(parents=True, exist_ok=True)

# A perceptual dark→bright ramp (approximately viridis), and a cold→hot ramp for temperatures.
VIRIDIS = [(68, 1, 84), (59, 82, 139), (33, 145, 140), (94, 201, 98), (253, 231, 37)]
THERMAL = [(10, 20, 80), (40, 90, 200), (90, 200, 220), (250, 220, 90), (230, 70, 40)]


def ramp(v, stops, lo, hi):
    """Map array v to RGB with a piecewise-linear colour ramp; NaN becomes transparent."""
    nan = np.isnan(v)
    t = np.clip(np.nan_to_num((v - lo) / (hi - lo)), 0, 1)
    seg = len(stops) - 1
    idx = np.minimum((t * seg).astype(int), seg - 1)
    f = (t * seg - idx)[..., None]
    a = np.array(stops, dtype=float)
    rgb = a[idx] * (1 - f) + a[idx + 1] * f
    alpha = np.where(nan, 0, 255)[..., None]
    return np.concatenate([np.nan_to_num(rgb), alpha], axis=-1).astype(np.uint8)


def save_png(rgba, name, max_w=1440):
    im = Image.fromarray(rgba, "RGBA")
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(PREV / name)
    print(f"  preview {name} {im.width}x{im.height}")


def pds3_label(path: Path):
    """Read the few keywords we need from a PDS3 .lbl (first image object)."""
    text = path.read_text(encoding="latin-1")
    def kw(name, cast=str, default=None):
        m = re.search(rf"^\s*{name}\s*=\s*\"?([^\"\r\n]+?)\"?\s*(<[^>]*>)?\s*$", text, re.M)
        return cast(m.group(1).strip()) if m else default
    return {
        "lines": kw("LINES", int),
        "samples": kw("LINE_SAMPLES", int),
        "type": kw("SAMPLE_TYPE", str, ""),
        "bits": kw("SAMPLE_BITS", int, 16),
        "scale": kw("SCALING_FACTOR", float, 1.0),
        "offset": kw("OFFSET", float, 0.0),
        "missing": kw("MISSING_CONSTANT", str, None),
        "proj": kw("MAP_PROJECTION_TYPE", str, ""),
        "res": kw("MAP_RESOLUTION", float, None),
        "scale_km": kw("MAP_SCALE", float, None),
        "lat0": kw("CENTER_LATITUDE", float, 0.0),
        "lon0": kw("CENTER_LONGITUDE", float, 0.0),
        "line_off": kw("LINE_PROJECTION_OFFSET", float, None),
        "samp_off": kw("SAMPLE_PROJECTION_OFFSET", float, None),
        "maxlat": kw("MAXIMUM_LATITUDE", float, 90.0),
        "westlon": kw("WESTERNMOST_LONGITUDE", float, -180.0),
        "radius": kw("A_AXIS_RADIUS", float, None),
        "text": text,
    }


def read_img(img: Path, lab: dict):
    t = lab["type"].upper()
    if "REAL" in t:
        dt = ">f4" if ("MSB" in t or "SUN" in t or t == "IEEE_REAL") else "<f4"
    else:
        signed = "UNSIGNED" not in t
        size = lab["bits"] // 8
        kind = "i" if signed else "u"
        dt = (">" if "MSB" in t or "SUN" in t else "<") + kind + str(size)
    a = np.memmap(img, dtype=dt, mode="r", shape=(lab["lines"], lab["samples"]))
    return a


def sites(world):
    text = (ROOT / "lib" / "data" / "sites.ts").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(rf'id: "({world}-[^"]+)",\s*world: "{world}",\s*name: "([^"]+)".*?lat: ([-\d.]+),\s*lon: ([-\d.]+)', text, re.S):
        out.append({"id": m.group(1), "name": m.group(2), "lat": float(m.group(3)), "lon": float(m.group(4))})
    # The South Pole candidate regions are generated in a loop in sites.ts; read their coordinates too.
    if world == "moon":
        for m in re.finditer(r'\["(moon-[^"]+)",\s*"([^"]+)",\s*([-\d.]+),\s*([-\d.]+)', text):
            if not any(s["id"] == m.group(1) for s in out):
                out.append({"id": m.group(1), "name": m.group(2), "lat": float(m.group(3)), "lon": float(m.group(4))})
    return out


def sample_cyl(a, lat, lon, ppd, westlon=-180.0, maxlat=90.0, win=2, scale=1.0, offset=0.0, bad=None):
    """Mean of a small window around (lat, lon) in a simple-cylindrical global grid."""
    lon = ((lon - westlon) % 360)
    r = int((maxlat - lat) * ppd)
    c = int(lon * ppd)
    block = np.asarray(a[max(0, r - win): r + win + 1, max(0, c - win): c + win + 1], dtype=float)
    if bad is not None:
        block = np.where(np.isin(block, bad), np.nan, block)
    v = np.nanmean(block) * scale + offset if block.size and not np.all(np.isnan(block)) else None
    return None if v is None or math.isnan(v) else round(float(v), 3)


SAMPLES: dict = {}


def put(world, site, key, value):
    SAMPLES.setdefault(world, {}).setdefault(site["id"], {"name": site["name"], "lat": site["lat"], "lon": site["lon"]})[key] = value


# ---------------- Mars ----------------

def mars_grs():
    tab = NASA / "mars" / "odyssey-grs" / "h2o_sr_5x5.tab"
    if not tab.exists():
        return
    rows = np.loadtxt(tab, usecols=(0, 1, 2))
    grid = np.full((36, 72), np.nan)
    for lat, lon, v in rows:
        if v < 9000:
            grid[int((90 - lat) // 5), int((lon % 360) // 5)] = v
    # Smooth upscale for the preview (the data are 5° bins)
    im = Image.fromarray(np.nan_to_num(grid, nan=-1).astype(np.float32), "F").resize((1440, 720), Image.BICUBIC)
    up = np.array(im)
    up[up < 0] = np.nan
    save_png(ramp(up, VIRIDIS, 0, 12), "mars-grs-water-wt-percent.png")
    for s in sites("mars"):
        v = grid[int((90 - s["lat"]) // 5), int((s["lon"] % 360) // 5)]
        put("mars", s, "grs_water_wt_percent", None if np.isnan(v) else round(float(v), 2))
    print(f"  GRS water: {np.nanmin(grid):.1f}–{np.nanmax(grid):.1f} wt% (polar latitudes masked in this product)")


def mars_tes():
    lbl = NASA / "mars" / "mgs-tes" / "mgst_9001" / "data" / "global_ti_night_2007.lbl"
    if not lbl.exists():
        return
    lab = pds3_label(lbl)
    a = read_img(lbl.with_suffix(".img"), lab)
    small = np.asarray(a[::5, ::5], dtype=float)
    small[small <= 0] = np.nan
    print(f"  TES thermal inertia (night): {np.nanpercentile(small, 2):.0f}–{np.nanpercentile(small, 98):.0f} tiu (2–98%)")
    save_png(ramp(small, VIRIDIS, 30, 600), "mars-tes-thermal-inertia-night.png")
    for s in sites("mars"):
        put("mars", s, "tes_thermal_inertia_night", sample_cyl(a, s["lat"], s["lon"], 20, westlon=-180, bad=[0]))


def mars_neutron():
    """Odyssey neutron spectrometer epithermal flux on a 0.5° grid. Fewer epithermal neutrons = more hydrogen,
    so this shows the ice-rich high latitudes that the GRS water-concentration product masks out."""
    tab = NASA / "mars" / "odyssey-grs" / "ns_epithermal_020917.tab"
    if not tab.exists():
        return
    lon, lat, v = np.loadtxt(tab, delimiter=",").T
    grid = np.full((360, 720), np.nan)
    rows = ((90 - lat) / 0.5).astype(int).clip(0, 359)
    cols = (((lon % 360)) / 0.5).astype(int).clip(0, 719)
    grid[rows, cols] = np.where(v > 0, v, np.nan)
    print(f"  NS epithermal: {np.nanpercentile(grid, 2):.1f}–{np.nanpercentile(grid, 98):.1f} counts/s (lower = more hydrogen)")
    # Reverse the ramp so hydrogen-rich (low flux) areas are bright.
    save_png(ramp(-grid, VIRIDIS, -np.nanpercentile(grid, 98), -np.nanpercentile(grid, 2)), "mars-neutron-hydrogen-epithermal.png")
    for s in sites("mars"):
        r, c = int((90 - s["lat"]) / 0.5), int((s["lon"] % 360) / 0.5)
        block = grid[max(0, r - 2): r + 3, max(0, c - 2): c + 3]
        put("mars", s, "ns_epithermal_counts_s", None if np.all(np.isnan(block)) else round(float(np.nanmean(block)), 2))


# ---------------- Moon ----------------

def moon_diviner_prp():
    tab = NASA / "moon" / "diviner" / "polar-resource" / "dlre_prp_south.tab"
    if not tab.exists() or tab.stat().st_size < 604_000_000:
        print("  Diviner PRP: not fully downloaded yet")
        return
    cache = PREV.parent / "moon" / "diviner" / "polar-resource" / "prp_south_lonlat_tavg_tmax_ice.npy"
    if cache.exists():
        d = np.load(cache)
    else:
        d = np.loadtxt(tab, delimiter=",", skiprows=1, usecols=(9, 10, 12, 13, 14), dtype=np.float32)
        np.save(cache, d)
    lon, lat, tavg, tmax, ice = d.T
    # Polar stereographic grid 85°S–90°S, 2.5 km pixels, as preview and for site sampling.
    R = 1737.4
    rho = 2 * R * np.tan(np.radians(90 + lat) / 2)
    x = rho * np.sin(np.radians(lon))
    y = rho * np.cos(np.radians(lon))
    half = 2 * R * np.tan(np.radians(5) / 2)  # 85°S
    n = 600
    px = ((x + half) / (2 * half) * n).astype(int)
    py = ((half - y) / (2 * half) * n).astype(int)
    ok = (px >= 0) & (px < n) & (py >= 0) & (py < n)

    def grid(vals, how):
        g = np.full((n, n), np.nan)
        v = vals[ok]
        flat = py[ok] * n + px[ok]
        if how == "max":
            out = np.full(n * n, -np.inf)
            np.maximum.at(out, flat, v)
            out[np.isinf(out)] = np.nan
        else:
            s = np.bincount(flat, v, n * n)
            c = np.bincount(flat, None, n * n)
            with np.errstate(invalid="ignore"):
                out = s / c
        return out.reshape(n, n)

    gmax = grid(tmax, "max")
    gavg = grid(tavg, "mean")
    ice_ok = np.where(ice < 0, np.nan, ice)
    stable = np.where(ice < 0, 0.0, 1.0)  # share of triangles with ice within 2.87 m
    gice_share = grid(stable, "mean")
    save_png(ramp(gmax, THERMAL, 40, 330), "moon-south-diviner-max-temp.png", 900)
    save_png(ramp(gavg, THERMAL, 30, 250), "moon-south-diviner-avg-temp.png", 900)
    save_png(ramp(gice_share, VIRIDIS, 0, 1), "moon-south-diviner-ice-stable-share.png", 900)
    cold = np.where(np.isnan(gmax), np.nan, (gmax < 110).astype(float))
    save_png(ramp(cold, [(20, 20, 30), (120, 230, 255)], 0, 1), "moon-south-cold-traps-tmax-below-110K.png", 900)
    print(f"  Diviner: {ok.sum():,} triangles within 85°S; cold-trap area share {np.nanmean(cold) * 100:.1f}%")

    # Site sampling: all triangles within 3 km of each site.
    xs, ys = x, y
    for s in sites("moon"):
        if s["lat"] > -75:
            continue
        r0 = 2 * R * np.tan(np.radians(90 + s["lat"]) / 2)
        sx, sy = r0 * np.sin(np.radians(s["lon"])), r0 * np.cos(np.radians(s["lon"]))
        m = (np.abs(xs - sx) < 3) & (np.abs(ys - sy) < 3)
        if not m.any():
            continue
        put("moon", s, "diviner_tmax_K", round(float(np.max(tmax[m])), 1))
        put("moon", s, "diviner_tavg_K", round(float(np.mean(tavg[m])), 1))
        share = float(np.mean(ice[m] >= 0))
        put("moon", s, "diviner_ice_within_2_87m_share", round(share, 3))
        if share > 0:
            put("moon", s, "diviner_ice_depth_min_m", round(float(np.min(ice_ok[m][~np.isnan(ice_ok[m])])), 3))
        put("moon", s, "diviner_cold_trap_share", round(float(np.mean(tmax[m] < 110)), 3))


def moon_cyl(name, rel, key, stops, lo, hi, scale_hint=None):
    lbl = NASA / "moon" / rel
    if not lbl.exists() or not lbl.with_suffix(".img").exists():
        return
    lab = pds3_label(lbl)
    img = lbl.with_suffix(".img")
    expected = lab["lines"] * lab["samples"] * lab["bits"] // 8
    if img.stat().st_size < expected:
        print(f"  {name}: not fully downloaded yet")
        return
    a = read_img(img, lab)
    step = max(1, lab["samples"] // 2880)
    small = np.asarray(a[::step, ::step], dtype=float) * lab["scale"] + lab["offset"]
    bad = None
    if lab["missing"]:
        try:
            bad = float(lab["missing"].replace("16#", "").split("#")[0]) if "#" not in lab["missing"] else None
        except ValueError:
            bad = None
    small[(small < -1e30) | (small > 1e30)] = np.nan
    if bad is not None:
        small[small == bad * lab["scale"] + lab["offset"]] = np.nan
    print(f"  {name}: {lab['lines']}x{lab['samples']} {lab['type']} {lab['bits']}b · {np.nanpercentile(small, 2):.3g}–{np.nanpercentile(small, 98):.3g} (2–98%)")
    save_png(ramp(small, stops, lo, hi), f"{key}.png")
    ppd = lab["res"] or lab["samples"] / 360
    for s in sites("moon"):
        put("moon", s, key, sample_cyl(a, s["lat"], s["lon"], ppd, westlon=lab["westlon"] if lab["westlon"] is not None else 0, maxlat=lab["maxlat"], scale=lab["scale"], offset=lab["offset"]))
    return lab


def moon_lola():
    for kind, stops, lo, hi in (("ldem", THERMAL, -6, 3), ("ldsm", VIRIDIS, 0, 30)):
        lbl = NASA / "moon" / "lola-south-pole" / f"{kind}_75s_240m.lbl"
        img = lbl.with_suffix(".img")
        if not lbl.exists() or not img.exists():
            continue
        lab = pds3_label(lbl)
        if img.stat().st_size < lab["lines"] * lab["samples"] * lab["bits"] // 8:
            print(f"  LOLA {kind}: not fully downloaded yet")
            continue
        a = np.asarray(read_img(img, lab), dtype=float) * lab["scale"] + lab["offset"]
        unit = "km" if kind == "ldem" else "deg"
        print(f"  LOLA {kind}: {lab['lines']}x{lab['samples']} {lab['proj']} · {np.nanpercentile(a, 2):.3g}–{np.nanpercentile(a, 98):.3g} {unit}")
        save_png(ramp(a, stops, lo, hi), f"moon-south-lola-{kind}-240m.png", 1000)
        # Polar stereographic sampling (scale in km/pixel, pole at the projection offset)
        R = lab["radius"] or 1737.4
        for s in sites("moon"):
            if s["lat"] > -75:
                continue
            rho = 2 * R * np.tan(np.radians(90 + s["lat"]) / 2)
            xk, yk = rho * np.sin(np.radians(s["lon"])), rho * np.cos(np.radians(s["lon"]))
            col = int(lab["samp_off"] + xk / lab["scale_km"])
            row = int(lab["line_off"] - yk / lab["scale_km"])
            win = a[max(0, row - 4): row + 5, max(0, col - 4): col + 5]
            if win.size:
                put("moon", s, f"lola_{'elevation_km' if kind == 'ldem' else 'slope_deg_mean'}", round(float(np.nanmean(win)), 3))


if __name__ == "__main__":
    print("Mars");  mars_grs(); mars_tes(); mars_neutron()
    print("Moon");  moon_diviner_prp()
    moon_cyl("Diviner rock abundance", "diviner/global-maps/dgdr_ra_avg_cyl_032_img.lbl", "moon-diviner-rock-abundance", VIRIDIS, 0, 0.02)
    moon_cyl("Diviner regolith temperature", "diviner/global-maps/dgdr_st_avg_cyl_032_img.lbl", "moon-diviner-regolith-temperature", THERMAL, 50, 120)
    moon_cyl("Mini-RF CPR", "minirf/global_cpr_32ppd_simp_0c.lbl", "moon-minirf-cpr", VIRIDIS, 0, 1.2)
    moon_lola()
    (NASA / "site-samples.json").write_text(json.dumps(SAMPLES, indent=2), encoding="utf-8")
    print(f"site samples written for {sum(len(v) for v in SAMPLES.values())} sites")
