# TwinWorlds

Interactive explorer of Earth analogues for the Moon and Mars (NASA Space Apps Challenge 2026).
Current plan: [`plan-final.md`](plan-final.md) (earlier plans are in [`docs/archive/`](docs/archive/)).

## Quick start

```bash
npm install          # Node 22+
npm run assets       # builds optimized textures, photos, models, audio, data into public/ (first run ~1 min)
npm run dev          # http://localhost:3000
```

`.env.local` (not committed) holds the Cesium ion token and Moon/Mars terrain asset IDs for the optional terrain-fly mode.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run assets` | `assets-raw/` → `public/` (only rebuilds stale files). Steps: `textures heightmaps data photos models audio`, e.g. `npm run assets -- models` |
| `npm run assets:force` | Rebuild every asset |
| `npm run typecheck` · `npm run lint` · `npm run format` | Quality checks |

## Raw data

Everything the website serves is committed in `public/`. The raw source data (`assets-raw/`, about 2.7 GB: NASA PDS,
Earthdata, CSA, ESA and JAXA files) is too big for git. Get it from the team Drive folder and unzip it into
`assets-raw/`: https://drive.google.com/drive/folders/1PM2xNfexc70k4MoYxb6B1MY_4sM-DNub
(or re-download with `bash scripts/fetch-nasa.sh`, `python -I scripts/fetch-earth.py`, `scripts/fetch-earthdata.py`
and `scripts/fetch-partners.py`). You only need it to rebuild data with `npm run assets` or `scripts/build-*.py`.

## Deploy

Vercel, from GitHub: import the repo, keep the defaults (framework Next.js, `npm run build`), no environment
variables needed. Every push to `main` redeploys.

## Stack

- **Next.js 16** (App Router, Cache Components) + **TypeScript** + **Tailwind CSS v4**
- **3D**: three.js via `@react-three/fiber` + `@react-three/drei` (`@react-three/postprocessing` for bloom on strong GPUs)
- **2D maps**: Leaflet + `react-leaflet` in EPSG:4326, with NASA Trek (Moon/Mars) and NASA GIBS (Earth) tiles
- **UI**: shadcn/ui (Radix, RTL-ready for Urdu) + Magic UI components in `components/ui/`
- **State**: Zustand · **Motion**: `motion` · **Audio**: Howler · **Geo**: d3-geo, topojson-client
- **Device tiers**: detect-gpu (benchmarks served locally from `/detect-gpu`)

> Next.js 16 differs from older versions. Read `node_modules/next/dist/docs/` before changing routing or caching (see `AGENTS.md`).

## Layout

```
app/                 routes: / (launch), /explore/{earth,moon,mars}, /compare, /score, /slider, /challenge, /learn, /about
components/globe/    3D globe (Planet, atmosphere and night-light shaders, GlobeCanvas)
components/map/      2D Leaflet map with NASA tile layers
components/shell/    TopBar, LeftRail, Hud, LayerDock, CommandSearch (Ctrl K), ExplorerShell
components/ui/       shadcn + Magic UI primitives (vendored)
lib/                 worlds config, geo math, NASA layer catalogue, Zustand store, quality tier hook
scripts/             build-assets.mjs (asset pipeline)
assets-raw/          source assets: never served; big raw files are git-ignored
public/              generated assets (git-ignored; rebuild with npm run assets)
.claude/skills/      design skills for the coding agent: impeccable, design-taste-frontend, Emil Kowalski's set
```

## Performance notes

- three.js (≈250 KB gz) and Leaflet load only on `/explore/*`, and only the active view.
- The globe renders on demand, clamps DPR, and drops to 1k textures if the frame rate collapses.
- Texture tiers: 1k / 2k (default) / 4k WebP. GLB models are meshopt-compressed with WebP textures (87 MB → 9.7 MB total).

## Data credits

NASA Trek, NASA GIBS/Worldview, NASA SVS CGI Moon Kit (LRO LOLA/LROC), NASA PDS MGS MOLA, NASA Image and Video Library,
USGS Gazetteer of Planetary Nomenclature, Natural Earth. Per-file credits: `assets-raw/photos/**/CREDITS.csv`,
`assets-raw/data/SOURCES.txt`, `assets-raw/textures/SOURCES_ELEVATION.txt`.
