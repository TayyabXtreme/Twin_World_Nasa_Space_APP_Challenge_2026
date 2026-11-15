"""
Train both TwinWorlds models and write their outputs where the site reads them.

  python -I ml/train.py                 # both models, outputs in public/data/ml/
  python -I ml/train.py --only m1       # Analogue Space only
  python -I ml/train.py --data path     # another copy of the Finder data (default public/data/finder)

Same code as the Colab notebook (ml/TwinWorlds_ML.ipynb). numpy only.
"""

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import twinworlds_ml as tw  # noqa: E402

ROOT = HERE.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "public" / "data" / "finder"))
    ap.add_argument("--out", default=str(ROOT / "public" / "data" / "ml"))
    ap.add_argument("--only", choices=["m1", "m2"])
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    t0 = time.time()
    grid, targets = tw.load_grid(a.data)
    print(f"Loaded {grid.n:,} Earth land cells and {len(targets['targets'])} Moon/Mars targets")

    if a.only in (None, "m1"):
        print("\n== M1 Analogue Space ==")
        m1 = tw.train_analogue_space(grid, targets)
        tw.export_analogue_space(m1, grid, Path(a.out) / "analogue-space", source_note="Trained locally with ml/train.py.")
        for c in m1["clusters"]:
            print(f"  type {c['id']}: {c['name']:34s} {c['areaPct']:5.1f} % of land  centroid {c['centroid']}")

    if a.only in (None, "m2"):
        print("\n== M2 Learned weights ==")
        pairs = json.loads((HERE / "pairs.json").read_text(encoding="utf-8"))["pairs"]
        pg = tw.load_params(a.data, grid, ROOT / "lib" / "finder" / "params.generated.json")
        m2 = tw.train_learned_weights(grid, pg, targets, pairs)
        tw.export_learned_weights(m2, pairs, targets, Path(a.out) / "learned-weights")

    print(f"\nDone in {time.time() - t0:.0f} s -> {a.out}")


main()
