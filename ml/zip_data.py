"""Zips the three Finder files the notebook needs into ml/finder-data.zip (upload it in Colab)."""
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "public" / "data" / "finder"
with zipfile.ZipFile(Path(__file__).resolve().parent / "finder-data.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for n in ("earth-grid.json", "earth-core.bin", "targets.json"):
        z.write(root / n, n)
print("wrote ml/finder-data.zip")
