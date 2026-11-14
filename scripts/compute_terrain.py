"""
Build-time terrain numbers for Moon/Mars sites, from the full NASA elevation grids in assets-raw/.

  python scripts/compute_terrain.py        (needs numpy and ffmpeg on PATH)

Writes lib/data/terrain.generated.json:
  { siteId: { elevationM, slopeDeg | null, roughnessM, pixelKm, note } }

Grids (16 px/deg, 5760 x 2880, equirectangular):
  Moon: NASA SVS CGI Moon Kit ldem_16_uint.tif  -> metres = value * 0.5 - 10000 (relative to 1737.4 km)
  Mars: PDS MGS MOLA MEGDR megt90n000eb.img      -> metres relative to the areoid (big-endian int16, 0..360E)

Slope is the regional gradient over a 3x3 pixel window (about 6 km on the Moon, 11 km on Mars), so it is a
regional figure, not a landing-scale hazard map. Above 80 degrees latitude the equirectangular grid squeezes
east-west spacing, so slope is reported as null there.
"""

import json
import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets-raw" / "textures"
W, H = 5760, 2880
PPD = 16


def moon_grid():
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "moon.raw"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(RAW / "moon-kit" / "ldem_16_uint.tif"), "-f", "rawvideo", "-pix_fmt", "gray16le", str(out)],
            check=True,
        )
        a = np.fromfile(out, dtype="<u2").reshape(H, W).astype(np.float64)
    # The SVS kit is centred on 0 degrees longitude (column 0 = 180 W).
    return a * 0.5 - 10000.0, 1737.4, "centred"


def mars_grid():
    a = np.fromfile(RAW / "mars-mola" / "megt90n000eb.img", dtype=">i2").reshape(H, W).astype(np.float64)
    # Column 0 = 0 E; roll so column 0 = 180 W like the Moon grid.
    return np.roll(a, W // 2, axis=1), 3389.5, "centred"


def sample(grid, radius_km, lat, lon):
    row = int(np.clip((90 - lat) * PPD, 0, H - 1))
    col = int(((lon + 180) * PPD) % W)
    elev = grid[row, col]
    win = grid[max(0, row - 2) : row + 3, [(col + d) % W for d in range(-2, 3)]]
    rough = float(np.std(win))
    dy_km = (math.pi * radius_km / 180) / PPD
    dx_km = dy_km * math.cos(math.radians(lat))
    slope = None
    if abs(lat) <= 80:
        gx = (grid[row, (col + 1) % W] - grid[row, (col - 1) % W]) / (2 * dx_km * 1000)
        gy = (grid[min(H - 1, row + 1), col] - grid[max(0, row - 1), col]) / (2 * dy_km * 1000)
        slope = round(math.degrees(math.atan(math.hypot(gx, gy))), 2)
    return {"elevationM": round(float(elev)), "slopeDeg": slope, "roughnessM": round(rough), "pixelKm": round(dy_km, 2)}


def main():
    coords = json.loads((ROOT / "scripts" / "sites-coords.json").read_text(encoding="utf-8"))
    out = {}
    for world, loader in (("moon", moon_grid), ("mars", mars_grid)):
        grid, radius, _ = loader()
        for site, (lat, lon) in coords[world].items():
            r = sample(grid, radius, lat, lon)
            r["source"] = "LRO LOLA (NASA SVS CGI Moon Kit)" if world == "moon" else "MGS MOLA MEGDR (NASA PDS)"
            out[site] = r
            print(f"{site:28} elev {r['elevationM']:>7} m  slope {r['slopeDeg']}  rough {r['roughnessM']} m")
    dest = ROOT / "lib" / "data" / "terrain.generated.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print("wrote", dest.relative_to(ROOT))


if __name__ == "__main__":
    main()
