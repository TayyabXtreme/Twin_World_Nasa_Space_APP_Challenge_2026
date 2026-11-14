"""Builds ml/TwinWorlds_ML.ipynb: the training code embedded, so the notebook runs on its own in Google Colab."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
code = (HERE / "twinworlds_ml.py").read_text(encoding="utf-8")
pairs = (HERE / "pairs.json").read_text(encoding="utf-8")


def md(t):
    return {"cell_type": "markdown", "metadata": {}, "source": t.strip("\n").splitlines(True)}


def py(t):
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": t.strip("\n").splitlines(True)}


cells = [
    md("""
# TwinWorlds ML: Analogue Space + Learned Weights
Run all cells (Runtime → Run all). About 10 to 15 minutes on a free Colab CPU. The last cell downloads `twinworlds-ml-results.zip`; unzip it into the project's `public/data/ml/` folder.

**Models**
1. **M1 Analogue Space**: standardise every Earth land cell's MODIS-derived environment, PCA, k-means into ~8 environment types, and place the 16 Moon/Mars targets in the same space.
2. **M2 Learned weights**: non-negative, L2-regularised logistic regression on 23 NASA-recognised analogue pairs, validated leave-one-pair-out against the hand-set weights.

**Data used** (all already in the Finder grid, built by `scripts/build-finder.py`)
- Earth: NASA MODIS MOD11C3 land surface temperature, MOD13C2 NDVI, MCD43C3 albedo (2024) via NASA Earthdata; JAXA AW3D30 elevation.
- Moon: LRO Diviner polar/resource products and LOLA (NASA PDS). Mars: Mars Odyssey GRS/NS, MGS TES and MOLA (NASA PDS).
- Analogue pairs: NASA's Planetary Analog Explorer, NASA Astrobiology research locations, NASA NTRS, with a source URL for each pair.
"""),
    py("""
# 1. Get the Finder data. The repo is private, so upload finder-data.zip (made by `python -I ml/zip_data.py`, 4.7 MB):
#    it holds earth-grid.json, earth-core.bin and targets.json. (If the repo is public you can git clone it instead.)
import os, zipfile
from google.colab import files
if not os.path.exists('finder'):
    up = files.upload()
    zipfile.ZipFile(next(iter(up))).extractall('finder')
DATA = 'finder'
print(os.listdir(DATA))
"""),
    py("%%writefile twinworlds_ml.py\n" + code),
    py("%%writefile pairs.json\n" + pairs),
    py("""
import json, numpy as np, matplotlib.pyplot as plt
import twinworlds_ml as tw
grid, targets = tw.load_grid(DATA)
pairs = json.load(open('pairs.json', encoding='utf-8'))['pairs']
print(f'{grid.n:,} Earth land cells, {len(targets["targets"])} Moon/Mars targets, {len(pairs)} analogue pairs')
"""),
    md("## M1 · Analogue Space"),
    py("m1 = tw.train_analogue_space(grid, targets)"),
    py("""
cols = tw.pick_colors(m1['clusters'])
fig, ax = plt.subplots(1, 3, figsize=(18, 5))
s = m1['sample']
ax[0].scatter(m1['P'][s, 0], m1['P'][s, 1], c=[cols[i] for i in m1['labels'][s]], s=4)
for t in m1['targets']:
    ax[0].scatter(*t['pc'], marker='*', s=140, c='white' if t['world'] == 'moon' else 'tomato', edgecolors='k')
ax[0].set_title('Earth cloud by type, Moon (white) and Mars (red) stars'); ax[0].set_xlabel('PC1'); ax[0].set_ylabel('PC2')
ax[1].bar(range(1, 8), m1['explained'] * 100); ax[1].set_title('Explained variance per component (%)')
ax[2].plot([k['k'] for k in m1['k_scan']], [k['silhouette'] for k in m1['k_scan']], 'o-'); ax[2].set_title('Silhouette vs k'); ax[2].set_xlabel('k')
for a in ax: a.set_facecolor('#0b0f1a')
fig.patch.set_facecolor('#0b0f1a'); plt.show()
print('Stability (adjusted Rand):', round(np.mean(m1['stability']), 3), '+/-', round(np.std(m1['stability']), 3))
"""),
    md("## M2 · Learned weights (takes the longest: it re-trains once per held-out pair)"),
    py("m2 = tw.train_learned_weights(grid, targets, pairs)"),
    py("""
fig, ax = plt.subplots(1, 2, figsize=(14, 4.5))
ax[0].bar(tw.DIMS, m2['weights']); ax[0].set_title('Learned weights (0-1)')
x = np.arange(len(pairs)); ax[1].bar(x - 0.2, m2['hand'], 0.4, label='hand-set'); ax[1].bar(x + 0.2, m2['lopo'], 0.4, label='learned (held out)')
ax[1].axhline(5, color='r', ls='--'); ax[1].set_yscale('log'); ax[1].set_title('Held-out analogue: top-% of Earth land (lower is better, red line = 5 %)'); ax[1].legend()
plt.show()
for k, v in (('learned', m2['lopo']), ('hand-set', m2['hand']), ('equal', m2['equal'])):
    print(f'recall@top-5 % {k:9s}: {np.mean(v <= 5) * 100:.0f} %')
"""),
    md("## Export and download"),
    py("""
import shutil
tw.export_analogue_space(m1, grid, 'out/analogue-space', source_note='Trained in Google Colab (ml/TwinWorlds_ML.ipynb).')
tw.export_learned_weights(m2, pairs, targets, 'out/learned-weights')
shutil.make_archive('twinworlds-ml-results', 'zip', 'out')
from google.colab import files
files.download('twinworlds-ml-results.zip')
"""),
]
nb = {"cells": cells, "metadata": {"colab": {"name": "TwinWorlds_ML.ipynb"}, "kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
(HERE / "TwinWorlds_ML.ipynb").write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
print("wrote ml/TwinWorlds_ML.ipynb")
