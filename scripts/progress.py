"""Progress bars for the challenge downloads.  Usage: python scripts/progress.py"""

import json
import os
import time
from pathlib import Path

NASA = Path(__file__).resolve().parent.parent / "assets-raw" / "nasa"
MOON = [
    ("Moon · Diviner ice + temperature", "moon/diviner/polar-resource/dlre_prp_south.tab", 604_800_210),
    ("Moon · Diviner rock abundance", "moon/diviner/global-maps/dgdr_ra_avg_cyl_032_img.img", 88_473_600),
    ("Moon · Diviner regolith temp", "moon/diviner/global-maps/dgdr_st_avg_cyl_032_img.img", 88_473_600),
    ("Moon · LOLA elevation", "moon/lola-south-pole/ldem_75s_240m.img", 29_062_688),
    ("Moon · LOLA slope", "moon/lola-south-pole/ldsm_75s_240m.img", 29_062_688),
    ("Moon · Mini-RF radar", "moon/minirf/global_cpr_32ppd_simp_0c.img", 265_420_800),
]
NAMES = {"global/MOD11C3": "Earth · Temperature", "global/MOD13C2": "Earth · Vegetation", "global/MCD43C3": "Earth · Albedo"}
MONTH = {"001": "Jan", "008": "15 Jan", "092": "Apr", "183": "Jul", "190": "15 Jul", "275": "Oct"}


def items():
    out = [(n, NASA / p, t) for n, p, t in MOON]
    plan = NASA / "earth" / "earthdata" / "download-plan.json"
    if plan.exists():
        for g in json.loads(plan.read_text(encoding="utf-8")):
            doy = g["title"].split(".")[1][-3:]
            name = f"{NAMES.get(g['folder'], g['folder'])} {MONTH.get(doy, doy)}"
            out.append((name, NASA / "earth" / "earthdata" / g["folder"] / g["url"].rsplit("/", 1)[1], int(g["mb"] * 1_048_576)))
    return out


def size(p: Path):
    return p.stat().st_size if p.exists() else 0


def bar(done, total, width=24):
    k = min(1, done / total) if total else 0
    full = int(k * width)
    return "█" * full + "░" * (width - full), k


if __name__ == "__main__":
    rows = items()
    before = sum(size(p) for _, p, _ in rows)
    time.sleep(20)
    have = total = 0
    lines = []
    for name, path, t in rows:
        raw = size(path)
        s = min(raw, t)
        have += s
        total += t
        b, k = bar(s, t)
        # Bigger than expected means overlapping writes corrupted the file (1% slack: Earthdata sizes are rounded).
        too_big = raw > t * 1.01
        mark = "!" if too_big else "✓" if k >= 0.995 else " "
        note = "  TOO BIG, re-download" if too_big else ""
        lines.append(f"{mark} {name:<34} {b} {k * 100:5.1f}%  {s / 1e6:6.0f} / {t / 1e6:4.0f} MB{note}")
    rate = max(0, (sum(size(p) for _, p, _ in rows) - before) / 20)
    left = total - have
    b, k = bar(have, total, 40)
    print("\n".join(lines))
    print(f"\nTOTAL {b} {k * 100:5.1f}%   {have / 1e6:,.0f} / {total / 1e6:,.0f} MB   {left / 1e6:,.0f} MB left")
    eta = f"~{left / rate / 60:,.0f} min" if rate > 0 else "measuring…"
    print(f"Speed {rate / 1024:,.0f} KB/s   Time left {eta}")
