# TwinWorlds — Build Plan

> **Next phase:** see [`plan-v2.md`](plan-v2.md), the data-driven plan built on the official challenge resources (Analog Finder, Moon base map, measured data, ML).
**NASA Space Apps Challenge 2026 · Earth analogues for the Moon and Mars**

> One-line pitch: *An interactive space explorer where you fly between Earth, the Moon and Mars, hover over any country or crater, compare Earth places with Moon and Mars sites, and test whether a mission could land, drive or survive there. Every number links back to a NASA source.*

The site should not just show information. Users should be able to **explore, compare and decide** for themselves. Every screen below is built around that.

---

## 0. Guiding rules (read first)

1. **Fast first, pretty second.** The first page should load in under 3 s on a mid-range phone over 4G. 3D only loads when the user asks for it. Textures load in 2k first and swap to 4k only on strong devices.
2. **Scientific honesty is a feature.** The research PDF says an analogue is *never an exact copy*. Every comparison names **the feature being compared** and shows an **"Important difference"** box. Every fact carries an evidence tag: `Confirmed` · `Evidence for` · `Candidate` · `Educational estimate`.
3. **Keep the three worlds separate and color-coded.** Earth = blue, Moon = silver, Mars = rust. A user should never be unsure which world a number belongs to.
4. **Data-driven, not hard-coded.** Sites, twins, facts, glossary terms and challenge rules all live in JSON. The UI only renders them, so content can grow without code changes.
5. **Every fact, image and map has a source.** A `sources.json` registry holds them, and the UI links each one to its source by `id`.

---

## 1. What we already have (asset audit)

### 1.1 Already in `assets-raw/` before today
| Area | Files | Status / notes |
|---|---|---|
| Planet textures | `2k_/8k_` Earth day/night/clouds/normal/specular, Mars, Moon, Sun, Milky Way | ✅ Good. **Do not ship 8k by default.** The 8k Moon is 15 MB, so convert to WebP/KTX2 tiers. |
| Moon elevation (old) | `ldem_3_8bit.jpg` (111 KB) | ⚠️ Too low-res. Replaced by the new LOLA maps below. |
| 3D models | `astronaut.glb` 0.7 MB, `lander.glb` 0.7 MB, `perseverance.glb` 5 MB, `curiosity.glb` **11 MB** | ⚠️ Must be compressed (meshopt + WebP textures). Target is under 2 MB each. Load only on demand. |
| HDRI | `empty_workshop_1k.hdr`, `studio_small_01_1k.hdr` | ✅ For lighting the rover/lander model viewer. |
| Audio | `ambient, boot, correct, wrong, rover, scan, warp .mp3` + ~100 UI `.ogg` (Kenney-style) | ✅ Plenty. Ship only the ~12 that get used. `ambient.mp3` is 4.6 MB, so re-encode to ~96 kbps / mono, about 1 MB. |
| Site photos (Moon/Mars) | 16 files in `photos/sites/` | ⚠️ `nobile-rim-1/2` and `peak-near-cabeus-b` are **the same image**. `mons-mouton` and `mons-mouton-plateau` are also the same. `site-jezero.png` is 13.5 MB, so convert it. **Haworth is missing.** |
| Earth twin photos | 14 files in `photos/twins/` | ⚠️ `thar_desert.jpg` is only 250 px. `hawaii_lava_field` is 960×320. `katpana_cold_desert` has **unverified rights, so do not publish it**. `cholistan` shows a fort, not the desert. |
| Source manifest | `SOURCE_MANIFEST.csv`, `credits.txt` | ⚠️ Still says "JPG not bundled", but the JPGs are present. Update the `asset_status` column. |
| Map layer notes | `docs/notes.txt` | ✅ Verified NASA Trek + GIBS layer IDs. Used directly in §6. |
| Env | `.env.local` | Cesium ion token + Moon/Mars terrain asset IDs (`NEXT_PUBLIC_*`, Next.js style). **Never commit.** Restrict the token to your domain in the Cesium ion dashboard. |

### 1.2 Downloaded today (added to `assets-raw/`)
| New file(s) | Source | Why we need it |
|---|---|---|
| `data/geo/countries-110m.topo.json` (108 KB), `countries-50m.topo.json` | world-atlas / Natural Earth (public domain) | **Country hover on the Earth globe** |
| `data/geo/ne_110m_…geojson`, `ne_50m_…geojson` | Natural Earth | Country info in the tooltip: ISO code, continent, population |
| `data/nomenclature/mars_features.json` (2,055) + `.major.json` (641 features ≥100 km) | USGS Gazetteer of Planetary Nomenclature | **Hover craters, plains, valleys and mountains on Mars** |
| `data/nomenclature/moon_features.json` (9,087) + `.major.json` (391 ≥100 km) | same | **Hover craters and maria on the Moon** |
| `textures/moon-kit/moon_height_4k_16bit.png`, `moon_height_2k.png`, `moon_normal_4k.jpg`, `moon_lroc_color_4k.jpg` | NASA SVS CGI Moon Kit (LRO LOLA + LROC) | Real relief lighting, elevation readout, **live slope calculation** |
| `textures/mars-mola/mars_height_4k_16bit.png`, `mars_height_2k.png`, `mars_normal_4k.jpg`, `mars_height_range.txt` | NASA PDS MGS MOLA MEGDR 16 ppd | Same for Mars. Range is −8,177 m to +21,171 m. Aligned to `2k_mars.jpg` (I checked visually). |
| `photos/twins-nasa/*.jpg` (12) + `CREDITS.csv` | NASA Image & Video Library | Death Valley ×3 (incl. Mars 2020 test), Bonneville/Pilot Valley, Medicine Lake field geology, Iceland Artemis II training, Kīlauea ×2, Thar, Dry Valleys, lunar south pole, Mars pit craters |
| `data/SOURCES.txt`, `textures/SOURCES_ELEVATION.txt` | — | Provenance for everything above |

Raw source files (`ldem_16_uint.tif`, `lroc_color_poles_4k.tif`, `megt90n000eb.img`) stay in `assets-raw` only. **Never ship them.**

### 1.3 Still missing: download these manually (I couldn't from here)
Wikimedia Commons' API is blocked on this network (upload.wikimedia.org works, commons.wikimedia.org does not). Open these in a browser:

| Need | Where to get it | Save as |
|---|---|---|
| **Haworth** site image | NASA "Artemis III landing regions" page → regions map: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ , or LROC https://lroc.im-ldi.com/images (search "Haworth") | `photos/sites/site-haworth.jpg` |
| Separate images for **Nobile Rim 1/2, Peak near Cabeus B, Mons Mouton** (now duplicates) | NASA SVS, search "Artemis III candidate landing regions": https://svs.gsfc.nasa.gov/ . Or crop each region from the LROC South Pole mosaic you already have, using its coordinates. | overwrite the duplicate files |
| **Pilot Valley** ground photo (we only have an orbital Bonneville shot) | https://commons.wikimedia.org/wiki/Category:Pilot_Valley , or NASA Analog Explorer https://science.nasa.gov/solar-system/analog-explorer/ | `photos/twins/pilot_valley.jpg` |
| **Lava Beds / Medicine Lake lava-tube** interior | NPS gallery (public domain): https://www.nps.gov/labe/learn/photosmultimedia/photogallery.htm | `photos/twins/medicine_lake_lava_tube.jpg` |
| **Askja** ripples / caldera | https://commons.wikimedia.org/wiki/Category:Askja | `photos/twins/askja.jpg` |
| **Katpana** replacement (current one has unverified rights) | https://commons.wikimedia.org/wiki/Category:Katpana_Desert , or your own / team photo | `photos/twins/katpana_cold_desert.jpg` |
| **Cholistan** desert landscape (current is a fort) | https://commons.wikimedia.org/wiki/Category:Cholistan_Desert | `photos/twins/cholistan_desert.jpg` |
| Thar ground photo (hi-res) | https://commons.wikimedia.org/wiki/Category:Thar_Desert | `photos/twins/thar_desert.jpg` |
| *(optional)* Ingenuity, Artemis HLS, LRO 3D models | NASA 3D Resources: https://science.nasa.gov/3d-resources/ | `models/` |
| *(optional)* Earth elevation for Earth slope/elevation readout | NOAA ETOPO 2022, 60 arc-sec: https://www.ncei.noaa.gov/products/etopo-global-relief-model | `textures/earth-etopo/` |

For every Commons file, copy the **author + license** from its file page into `photos/twins/CREDITS.csv`.

---

## 2. Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript**, `output: 'export'` (static) | `.env.local` already uses `NEXT_PUBLIC_*`. Static export deploys free to Vercel or GitHub Pages with no server. |
| Styling | **Tailwind CSS v4** + CSS variables for world themes | Fast to build, consistent tokens |
| 3D engine | **three.js via @react-three/fiber + @react-three/drei** | Lightweight compared with Cesium. Full control of shaders for hover glow, atmosphere and day/night. |
| Camera | `camera-controls` (drei `<CameraControls>`) | Smooth "space engine" fly-to with damping |
| 2D maps | **Leaflet** (~40 KB) with `L.CRS.EPSG4326` | NASA Trek and GIBS both serve EPSG:4326 tiles, which Leaflet supports natively. Same component works for all 3 worlds. |
| Terrain fly mode (optional, P2) | **CesiumJS**, *lazy-loaded only on this one view* | You already have ion Moon/Mars terrain assets. Heavy (~3 MB), so it must stay opt-in. |
| State | **Zustand** | Selected world, site, layer and compare pair, all shared between the 3D, 2D and side panels |
| Geo math | `d3-geo`, `topojson-client` | Country polygons and projections |
| Charts | Hand-built SVG or `visx` (radar, bars) | Small and themeable |
| Motion | `motion` (Framer Motion) for UI only | Panel and page transitions. Respects `prefers-reduced-motion`. |
| Audio | `howler` | Sprites, mute toggle, autoplay-safe |
| i18n | `next-intl` (English + اردو) | Local-judge impact. RTL support for Urdu. |
| Icons / fonts | `lucide-react`; `next/font`: **Space Grotesk** (headings), **Inter** (body), **JetBrains Mono** (data/HUD) | No font files to download |
| Asset tools | `sharp`, `@gltf-transform/cli`, `ffmpeg` (already installed) | Build-time compression pipeline (§8) |

---

## 3. Information architecture

```
/                     Launch: cinematic intro → "Start Mission"
/explore/earth        3D globe ⇄ 2D map, hover countries, analogue markers
/explore/moon         3D globe ⇄ 2D map, hover craters/maria, Artemis candidate regions
/explore/mars         3D globe ⇄ 2D map, hover craters/plains, rover sites
/compare              Smart Comparison Tool        (?a=atacama&b=jezero)
/score                Mission Suitability Score    (?site=shackleton-rim&mission=human)
/slider               Earth vs Moon vs Mars slider
/challenge            Survival Challenge (game)
/learn                Facts · Glossary · Sources · "How we avoid overclaiming"
/learn/pakistan       Pakistan's Mars & Moon twins (spotlight)
/about                Team, data credits, methodology
```
All state lives in the URL, so **any view can be shared as a link**. Judges can open the exact screen you demoed.

---

## 4. The interface

### 4.1 Visual language: "mission control, not sci-fi clutter"
- **Background** `#05070D` deep space, with a subtle Milky Way skybox in 3D views.
- **Glass panels**: `rgba(12,18,32,0.72)` + `backdrop-blur(14px)` + 1 px border `rgba(255,255,255,0.08)`, radius 14 px.
- **World colors** (used everywhere: chips, chart lines, markers, borders):
  Earth `#4DA3FF` · Moon `#C9D1D9` · Mars `#E2603B`
- **Interaction accent** `#3FF2E0` (cyan) for hover and selection. **Warning** `#FFB547`. **Danger** `#FF5D5D`. **OK** `#45D483`.
- **Evidence tags**: Confirmed (green), Evidence for (cyan), Candidate (amber), Educational estimate (grey outline).
- **Type**: Space Grotesk 600 for titles; Inter 400/500 for body; JetBrains Mono for coordinates, elevation and live readouts (the "HUD" feel).
- Color-blind check: never use color alone. Every world also has an icon (🌍 ☾ ♂-style glyph) and a label.

### 4.2 Layout of the Explore screen (the core)
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ TwinWorlds   [ Earth | Moon | Mars ]   [ 3D ◐ 2D ]   ⌘K Search   🔊  اردو│  ← top bar
├────┬───────────────────────────────────────────────────────┬─────────────┤
│ 🧭 │                                                       │ SITE DRAWER │
│ ⚖️ │                                                       │ ─────────── │
│ 🎯 │                3D GLOBE  /  2D MAP                    │ Jezero      │
│ ⇆  │                                                       │ [Overview]  │
│ 🎮 │        ● markers   ◌ hover outline + tooltip          │ [Terrain]   │
│ 📚 │                                                       │ [Geology]   │
│    │                                                       │ [Resources] │
│    │                                                       │ [Score]     │
│    │                                                       │ [Sources]   │
├────┴───────────────────────────────────────────────────────┴─────────────┤
│ LAYERS: Color · Elevation · Relief · Temperature · Ice/PSR · Dust · Night │  ← layer dock
│ HUD:  LAT 18.38°N  LON 77.58°E  ELEV −2,612 m  SLOPE 2.1°  │  Jezero Crater │
└──────────────────────────────────────────────────────────────────────────┘
```
- **Left rail**: Explore, Compare, Score, Slider, Challenge, Learn. Icons with labels on hover; on mobile it becomes a bottom tab bar.
- **Hover tooltip** (follows the pointer, with a small delay so it doesn't flicker):
  - Earth: flag · country name · continent · population · "2 analogue sites here →"
  - Moon/Mars: feature name · type (crater, planitia, mons…) · diameter · elevation under the cursor · "named after…" (IAU origin)
- **Click** a country or feature → camera flies there and the drawer opens. **Click a marker** → full site drawer.
- **Mobile** (< 768 px): the drawer becomes a bottom sheet (peek → half → full), the layer dock becomes a horizontal scroller, and tap replaces hover (tap once = tooltip, tap again = open).

### 4.3 Launch screen ("space engine" moment)
1. Black screen → `boot.mp3` → mono text types out: `INITIALIZING TWINWORLDS… LINKING NASA TREK… OK`. Skippable; plays only on the first visit.
2. A scaled solar-system scene: Sun glow, Earth with Moon orbiting, Mars further out, thin orbit lines. A "not to scale" toggle sits in the corner.
3. Hover a body → it glows and shows its name, gravity and temperature. Click → `warp.mp3` + a camera dolly with a short star-streak effect → lands in `/explore/{world}`.
4. CTA buttons: **Start Exploring**, **Compare Worlds**, **Take the Survival Challenge**.

---

## 5. 3D globe engine: how it works

### 5.1 Scene per world
| Element | Earth | Moon | Mars |
|---|---|---|---|
| Color map | `earth_daymap` | `moon_lroc_color_4k` (LROC) | `mars` |
| Relief | `earth_normal_map` | `moon_normal_4k` (LOLA) | `mars_normal_4k` (MOLA) |
| Extra | night lights blended on the dark side, specular oceans, clouds sphere (slow rotation) | none (no atmosphere: sharp terminator) | thin dusty-pink atmosphere rim |
| Atmosphere | blue Fresnel glow shader | — | faint orange Fresnel |
| Optional displacement | — | 16-bit height, low amplitude (exaggeration slider 1×–10×) | same |

- Sun direction is a uniform. The day/night terminator is computed in the shader.
- Background: `stars_milky_way` on an inverted sphere.
- Renderer: `frameloop="demand"` (renders only when something changes), DPR clamped to `[1, 1.75]`, bloom post-processing only on high-tier GPUs.

### 5.2 Hover detection (fast, works at 60 fps)
**Earth countries: ID-map technique**
1. At build time, rasterize `countries-50m` into a **4096×2048 equirectangular PNG** where each country's fill color = its index (R + G·256). Use crisp edges, no anti-aliasing.
2. At runtime: raycast the pointer onto the sphere → UV → read the pixel from the ID map (kept in a `Uint8Array`) → country index. **O(1), no polygon math per frame.**
3. Pass `hoveredId` to the globe shader, which samples the same ID texture and draws a **glowing cyan outline + soft fill** around that country. Selected country gets a stronger outline.

**Moon/Mars features: nearest-feature lookup**
1. Load `*_features.major.json` (and the medium tier once zoomed in).
2. Build a simple lat/lon grid index (5°×5° buckets). On hover, check nearby buckets and pick the smallest feature whose radius (`diameter/2`) contains the point.
3. Draw a **glowing ring** on the sphere at the feature's center/radius (a geodesic circle line). Large regions like Terra/Planitia use their `bbox` as a soft ellipse.
4. Elevation under the cursor comes from the 16-bit heightmap (decoded once into a `Float32Array` in a Web Worker).

**Markers**: analogue/site pins are instanced sprites with labels via drei `<Html occlude>`. They cluster when zoomed out.

### 5.3 Live terrain metrics (judges will like this)
Using the LOLA/MOLA heightmaps in a worker:
- **Elevation** at any point (meters).
- **Regional slope** at a site, from the gradient using real meters per pixel (Moon ≈ 1.9 km/px, Mars ≈ 3.7 km/px at 16 ppd).
- **Roughness**: standard deviation of elevation in a 5×5 window.

UI label: *"Computed live from NASA LOLA/MOLA data · regional scale (~2–4 km per pixel), not a landing-scale hazard map."* This keeps the numbers honest.

### 5.4 3D model viewer (in the site drawer, P1)
A small canvas with HDRI lighting: Perseverance at Jezero, Curiosity at Gale, the lander at lunar south pole sites, and the astronaut for human-mission views. Click to rotate; it loads only when the user opens the tab.

---

## 6. 2D Interactive Map (Leaflet, NASA tiles)

The same `<WorldMap world="moon">` component serves all three worlds. It uses `L.CRS.EPSG4326` (zoom 0 = 2×1 tiles).

**Tile URL templates (verified HTTP 200 today):**
```
NASA Trek (Moon/Mars):
https://trek.nasa.gov/tiles/{Body}/EQ/{LAYER_ID}/1.0.0/default/default028mm/{z}/{y}/{x}.jpg

NASA GIBS (Earth):
https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{LAYER_ID}/default/{TIME}/{MATRIX_SET}/{z}/{y}/{x}.{jpg|png}
```
Some layers are PNG and have different max zoom or matrix sets. A build script (`scripts/fetch-layers.mjs`) reads each WMTSCapabilities.xml once and writes `public/data/layers.json` (format, maxZoom, matrixSet, time default).

| World | Layers (from `docs/notes.txt`) | Layer dock name |
|---|---|---|
| Moon | LRO WAC Mosaic · LOLA Color Hillshade · LOLA Slope · Diviner Max / Min Temp · PSR North / South | Color · Elevation · Slope · Temperature · Ice/PSR |
| Mars | Viking Color Mosaic · MOLA Color Hillshade · THEMIS Day IR · TES Dust Index | Color · Elevation · Thermal · Dust |
| Earth | Blue Marble · MODIS Land Surface Temp (Day) · VIIRS Black Marble · ASTER GDEM shaded relief | Color · Temperature · Night · Relief |

- **Opacity slider** per layer, and **swipe mode**: drag a vertical line to reveal layer B over layer A, e.g. Moon color vs. PSR.
- **Legend** for each colorized layer (temperature in K and °C, slope in degrees), with the source linked.
- **Fallback**: if Trek is slow or offline, the map falls back to the local equirectangular texture as a single image overlay, so the demo never breaks.
- **3D ⇄ 2D sync**: same selected site, same center. The toggle keeps the camera roughly in the same place.

---

## 7. Feature specs

### 7.1 Site Drawer (marker click)
Tabs follow the PDF's §8 data fields:
- **Overview**: hero photo (with credit), world chip, coordinates, one-paragraph "why this place matters", evidence tag.
- **Terrain**: elevation, live slope and roughness (§5.3), landforms (craters, ripples, lava, caves), mini elevation profile (drag a line on the map → profile chart).
- **Geology**: rock types, minerals, processes (volcanic, impact, sedimentary, salt).
- **Resources**: water/ice (with detection method and confidence), sunlight, minerals.
- **Score**: Mission Suitability ring (see §7.3) with a "See breakdown →" link.
- **Twins**: Earth analogues linked to this site, each with "Compare →".
- **Sources**: every claim on this site with its source link.

### 7.2 Smart Comparison Tool `/compare`
**Goal:** pick an Earth place and a Moon or Mars place and see *what is similar, what is different, and why NASA cares*.

Layout: **two columns** (Earth left in blue, Moon/Mars right in silver/rust), each with a mini globe or photo and a picker.

1. **Pickers**
   - Choose from the curated list, or **"Pick on globe"** (click any country or point on Earth, any crater on Moon/Mars).
   - **Suggested twins** chips straight from the PDF: Atacama ↔ Jezero/Gale (dryness, oxidized soils), McMurdo Dry Valleys ↔ Utopia/Arcadia (cold desert, ground ice), Askja ↔ Mars ripples / lunar buried ice (radar), Death Valley ↔ Utopia Planitia (rocky terrain, rover practice), Pilot Valley ↔ Phoenix perchlorates, Kīlauea ↔ lunar basalt, Medicine Lake caves ↔ Marius Hills Pit.
2. **Environment table**: rows for gravity, temperature range (with the statistic named, e.g. "median" or "range"), surface pressure, atmosphere composition, water/ice, day length, light delay to Earth, elevation, slope, rock type. Each row has **mini bars on a shared scale** and **unit toggles** (°C/K, m/km).
3. **Feature match radar**, per dimension: Dryness · Cold · Geology match · Terrain ruggedness · Salts/minerals · Ice. Caption: *"Similarity is per feature. There is no single 'same as Mars' score."*
4. **Shared features** (green chips) vs **Key differences** (amber chips), taken from the PDF text.
5. **"How NASA uses this place"**: short text + source (Analog Explorer, Astrobiology, etc.).
6. **Twin Finder** button: choose any Moon/Mars site → see Earth analogues **ranked by tag overlap** (Jaccard similarity on feature tags), each with its matched tags shown. This is transparent, simple, and explainable to judges.
7. **Export**: "Download comparison card" (PNG via `html-to-image`) and "Copy link".

### 7.3 Mission Suitability Score `/score`
**Goal:** a transparent 0–100 index for **Landing**, **Rover** and **Human base**, clearly labeled *Educational estimate, not NASA site selection.*

Each factor is normalized to 0–1 with a documented rule, then weighted:

| Factor | How we get it | Used in |
|---|---|---|
| Slope safety | live from LOLA/MOLA (§5.3): 1 at ≤2°, 0 at ≥15° | Landing 30%, Rover 35%, Human 15% |
| Roughness | live std-dev of elevation | Landing 20%, Rover 25% |
| Atmosphere for landing (Mars) | lower elevation = more air to slow down (MOLA elevation) | Landing 20% (Mars only; weight is shared out on the Moon) |
| Sunlight / power | Moon: polar illumination class from sources; Mars: latitude + dust index | Landing 15%, Rover 20%, Human 20% |
| Communications | Moon near side / Earth visibility; Mars: relay coverage (simplified) | Landing 15%, Human 15% |
| Dust / soft soil | Mars TES dust index class, Moon regolith | Rover 20% |
| Water / ice access | PSR proximity (Moon), ground-ice evidence (Mars), with confidence | Human 25% |
| Temperature stress | range from sources | Human 15% |
| Science value | evidence tags (delta, PSR, pit…) | Human 10% |

**UI:**
- Big **score ring** per mission type, plus a **breakdown bar** showing each factor's contribution.
- **Weight sliders** ("You are the mission planner"). Moving them updates the score live and shows "Your weights vs. default".
- **Confidence badge** per factor (High = computed from data; Medium = from source text; Low = estimate).
- **Leaderboard**: all sites ranked for the chosen mission. Click a site → fly to it.
- A "How is this calculated?" accordion with the exact formula. Openness is what makes the score credible.

### 7.4 Earth vs Moon vs Mars Slider `/slider`
1. **Image wipe slider** (drag a handle left/right) with curated pairs:
   - Atacama ↔ Mars terrain · Kīlauea basalt ↔ lunar mare · Death Valley ↔ Utopia Planitia · Iceland ripples ↔ Mars ripples · Medicine Lake lava tube ↔ Marius Hills Pit
   - Each pair has a caption: "Compare: **basaltic lava texture**. Different: gravity, air, scale."
2. **World spectrum bar**: one horizontal handle moves Earth → Moon → Mars, and the numbers morph smoothly:
   - Gravity 9.81 → 1.62 → 3.71 m/s² · Pressure 1013 hPa → ~0 (exosphere) → ~6 hPa · Day 24 h → ~29.5 Earth days → 24 h 37 m · One-way light delay 0 → ~1.3 s → 3–22 min
   - **"Your jump" animation**: a small astronaut jumps higher on the Moon (about 6× Earth) and Mars (about 2.6×).
   - **"Your weight" input**: type your weight and see it on each world.
   - Sky color swatch: blue → black → butterscotch.

### 7.5 Survival Challenge `/challenge` (the game)
**Goal:** the user reads a real environment briefing and makes decisions. Science becomes choices.

Flow (3 rounds, about 3 minutes):
1. **Choose a mission**: 🤖 Robotic rover or 👩‍🚀 Human crew. **Choose a site**: Shackleton Rim, Jezero, Hellas, Marius Hills Pit, etc.
2. **Briefing card** generated from the site JSON: temperature, light, dust, slope, ice, comms delay, radiation note.
3. **Round 1: Spot the hazards.** Pick the real hazards from 8 cards (e.g. "14-day lunar night", "global dust storm", "perchlorates in soil", "extreme cold in PSR", "steep crater walls"). Correct answers come from site tags.
4. **Round 2: Pack your kit** with a mass budget of 100 points: RTG vs. solar panels, heaters, dust seals, radiation shelter or lava-tube use, ice drill, comms relay, extra wheels… Each item counters certain hazards.
5. **Round 3: Random event**: a dust storm arrives, a long night falls, the rover hits a slope >15°. The outcome depends on your kit.
6. **Debrief**: score, a badge (Rookie → Flight Director), and **a one-line explanation + source for every answer**. Sounds: `correct.mp3` / `wrong.mp3`. Shareable result card.

Rules live in `challenges.json` (hazards, items, counters, events). Adding a new site needs no code changes.

### 7.6 Learn `/learn`
- **Fact cards** per world (flip cards, 2 lines each, with source chip).
- **Glossary**: regolith, exosphere, PSR, perchlorate, basalt, lava tube, analogue, sol, albedo, EDL, MOLA, LOLA, Diviner, THEMIS, HiRISE, delta, permafrost, ground-penetrating radar… **Glossary terms are auto-underlined across the whole site**; hovering shows the definition.
- **Sources**: the full NASA source list (12 from the PDF + data credits), searchable.
- **"How we avoid overclaiming"**: the PDF's §9 cautions turned into a short, friendly page. Judges value this.

### 7.7 Unique "wow" features (pick at least 3 for the demo)
1. **Live NASA data**: Trek/GIBS layers plus slope and elevation computed live from LOLA/MOLA, not typed by hand.
2. **Pakistan's Mars & Moon twins** (`/learn/pakistan`): Cholistan, Thar, Katpana cold desert, Hingol mud volcanoes, Khewra salt. Clearly tagged *"Educational analogue: not in NASA's published list"*. Local relevance that stays honest.
3. **Twin Finder**: an explainable ranking of Earth places for any Moon/Mars site.
4. **"Talk to Mars"**: type a message and watch it travel to the Moon (1.3 s) and Mars (current one-way delay, computed from date). Very memorable in a demo.
5. **Evidence tags on every fact** (Confirmed / Evidence for / Candidate / Estimate).
6. **English ⇄ اردو** toggle.
7. **Shareable deep links + PNG export** for comparisons and challenge results.
8. **Accessible**: full keyboard navigation, a "List view" alternative to the globe for screen readers, reduced-motion mode.

---

## 8. Asset pipeline (build-time scripts)

Everything in `assets-raw/` is source material. Scripts write **optimized** copies to `public/`.

```
scripts/
  build-textures.mjs   sharp → WebP tiers: 1k, 2k (default), 4k (high tier) per world/map
  build-heightmaps.mjs 16-bit PNG → keep as-is for workers (2k 16-bit for runtime ≈ 3–4 MB)
  build-idmap.mjs      countries-50m → 4096×2048 country ID PNG + countries.json (id → name, iso, pop)
  build-features.mjs   nomenclature → moon/mars features: tier-1 (≥100 km), tier-2 (≥20 km), compact keys
  build-photos.mjs     photos → 1600w WebP + 480w thumb + 16px blur placeholder (base64)
  build-models.mjs     gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 1024
  build-audio.mjs      ffmpeg → 96 kbps mono MP3/OGG; UI sounds into one audio sprite
  fetch-layers.mjs     read WMTS capabilities → public/data/layers.json
  validate-data.mjs    every site/fact must have source ids that exist; coords in range; images exist
```
Run all with `npm run assets`.

**Performance budget (checked before submission):**
| Item | Budget |
|---|---|
| Initial JS (gzip) on `/` | ≤ 200 KB (three.js loads only on 3D routes) |
| First Contentful Paint (4G, mid phone) | ≤ 1.8 s |
| 3D globe ready (2k textures) | ≤ 3.5 s |
| Per texture (2k WebP) | ≤ 600 KB |
| Per GLB model | ≤ 2 MB |
| Lighthouse Performance / Accessibility | ≥ 90 / ≥ 95 |

**Device tiers** (`detect-gpu` + `navigator.deviceMemory`): *Low* = 1k textures, no bloom, no clouds; *Mid* = 2k; *High* = 4k + bloom + displacement. **No WebGL** → automatic 2D map mode.

---

## 9. Data model (JSON in `public/data/`)

```ts
type World = 'earth' | 'moon' | 'mars';
type Evidence = 'confirmed' | 'evidence_for' | 'candidate' | 'estimate';

interface Site {
  id: string;                 // "jezero"
  world: World;
  name: string; nameUr?: string;
  kind: 'analogue' | 'landing_candidate' | 'mission_site' | 'science_target';
  lat: number; lon: number;   // degrees, lon −180..180 east-positive
  coordsVerified: boolean;
  country?: string;           // Earth only (ISO-A3)
  summary: string;
  tags: string[];             // ["dry","oxidized_soil","salts","delta","ice","basalt","lava_tube","psr","ripples"]
  terrain:   { elevationM?: number; slopeDeg?: number; landforms: string[]; computed?: boolean };
  geology:   { rocks: string[]; minerals: string[]; processes: string[] };
  resources: { waterIce?: { evidence: Evidence; method: string }; sunlight?: string; other?: string[] };
  environment?: { tempMinC?: number; tempMaxC?: number; tempStat?: string; pressureHpa?: number; dust?: string };
  operations?: { mobility?: string; comms?: string; power?: string };
  hazards: string[];          // ids used by the Survival Challenge
  images: { src: string; credit: string; sourceId: string }[];
  sourceIds: string[];
  evidence: Evidence;
}

interface TwinLink {          // Earth ↔ Moon/Mars pair
  earthId: string; otherId: string;
  compareFeature: string;     // "extreme dryness, oxidized soils"
  shared: string[]; differences: string[];
  nasaUse: string; sourceIds: string[];
}

interface Source { id: string; title: string; org: string; url: string; accessed: string; }
interface GlossaryTerm { id: string; term: string; termUr?: string; definition: string; sourceId?: string; }
interface Fact { id: string; world: World; text: string; evidence: Evidence; sourceId: string; }
```

**Starting dataset** (coordinates are approximate, so verify each one against its source page, then set `coordsVerified: true`):

| World | Sites |
|---|---|
| **Earth (NASA-backed, from PDF)** | Atacama Desert (−24.5, −69.3) · McMurdo Dry Valleys (−77.5, 162.0) · Askja, Iceland (65.0, −16.8) · Death Valley (36.2, −116.8) · Pilot Valley, Utah (41.0, −114.1) · Kīlauea (19.4, −155.3) · Medicine Lake lava caves (41.6, −121.6) |
| **Earth (extra twins, in your photos)** | Río Tinto · Salar de Uyuni · Danakil Depression · Qaidam Basin · Sahara · Hawaiʻi lava fields |
| **Earth (Pakistan spotlight)** | Cholistan · Thar · Katpana cold desert · Hingol mud volcanoes · Khewra salt mine |
| **Mars** | Jezero Crater (18.4, 77.6) · Gale Crater (−5.4, 137.8) · Utopia Planitia (Viking 2 ≈ 48.0, 134.3) · Arcadia Planitia (ground ice, ≈ 40–47 N) · Mawrth Vallis (22.6, −16.5) · Hellas Planitia (−42.4, 70.5) |
| **Moon** | Shackleton Rim (−89.9, 0) · Malapert Massif · Haworth · Nobile Rim 1 & 2 · de Gerlache Rim 2 · Mons Mouton · Peak near Cabeus B · Slater Plain · Marius Hills Pit (14.1, −56.8) |

Use the NASA Artemis III regions page and the USGS nomenclature JSON (already downloaded) to pin exact Moon coordinates.

---

## 10. Project structure

```
twinworlds/
├─ app/
│  ├─ layout.tsx               fonts, theme, i18n provider, audio provider
│  ├─ page.tsx                 Launch
│  ├─ explore/[world]/page.tsx
│  ├─ compare/page.tsx  score/page.tsx  slider/page.tsx  challenge/page.tsx
│  └─ learn/page.tsx  learn/pakistan/page.tsx  about/page.tsx
├─ components/
│  ├─ shell/       TopBar, LeftRail, CommandSearch (⌘K), LayerDock, Hud, BottomSheet
│  ├─ globe/       GlobeCanvas, Planet, Atmosphere, CountryHighlight, FeatureRing, Markers, SolarSystem
│  ├─ map/         WorldMap (Leaflet), LayerSwipe, Legend
│  ├─ site/        SiteDrawer, tabs/*, ModelViewer, ElevationProfile
│  ├─ compare/     Picker, EnvTable, RadarChart, ChipsSharedDiff, TwinFinder
│  ├─ score/       ScoreRing, Breakdown, WeightSliders, Leaderboard
│  ├─ slider/      ImageWipe, WorldSpectrum, JumpAnimation
│  ├─ challenge/   Briefing, HazardRound, KitRound, EventRound, Debrief
│  └─ ui/          GlassPanel, Chip, EvidenceTag, SourceLink, GlossaryTerm, Tooltip
├─ lib/
│  ├─ store.ts               Zustand (world, site, layer, hover, compare, weights)
│  ├─ geo.ts                 lat/lon ↔ vector3 ↔ uv, geodesic circle
│  ├─ terrain.worker.ts      heightmap decode, elevation, slope, roughness
│  ├─ hover.ts               ID-map lookup (Earth), feature grid index (Moon/Mars)
│  ├─ score.ts               normalization + weights (pure functions, unit-tested)
│  ├─ twinFinder.ts          tag-overlap ranking
│  ├─ lightDelay.ts          Earth–Mars distance by date → delay
│  └─ audio.ts               Howler sprite wrapper
├─ public/
│  ├─ textures/{earth,moon,mars,sky}/   (generated)
│  ├─ models/  audio/  photos/          (generated)
│  └─ data/ sites.json twins.json sources.json facts.json glossary.json challenges.json
│           layers.json countries.json idmap-countries.png moon-features.json mars-features.json
├─ messages/ en.json ur.json
├─ scripts/  (see §8)
├─ assets-raw/  (this folder: source assets, not shipped)
└─ .env.local   (git-ignored)
```

---

## 11. Build phases and priorities

**P0 = must have for submission · P1 = strong demo · P2 = only if time is left**

| # | Phase | Deliverable | Priority | Est. |
|---|---|---|---|---|
| 0 | Setup | Next.js + TS + Tailwind + lint, folder skeleton, `.gitignore` with `.env.local` and `assets-raw/**/*.tif,*.img`, deploy "hello" to Vercel | P0 | 1.5 h |
| 1 | Asset pipeline | textures/photos/models/audio scripts, ID map, features JSON, `layers.json` | P0 | 4 h |
| 2 | Data | `sites.json` (all sites above), `twins.json` (7 PDF pairs), `sources.json` (12 NASA + data credits), validator | P0 | 4 h |
| 3 | 3D globe | Planet shader (day/night, normal, atmosphere), camera fly-to, markers, **country hover (Earth)**, **feature hover (Moon/Mars)**, HUD readout | P0 | 8 h |
| 4 | Site drawer | Overview / Terrain / Geology / Resources / Sources tabs; live slope/elevation worker | P0 | 4 h |
| 5 | 2D map | Leaflet EPSG:4326, Trek/GIBS layers, legend, 3D⇄2D sync, fallback | P0 | 4 h |
| 6 | Compare | pickers, env table, shared/diff chips, radar, suggested twins | P0 | 5 h |
| 7 | Score | formula + ring + breakdown + weight sliders + leaderboard | P0 | 4 h |
| 8 | Slider | image wipe pairs + world spectrum + jump/weight | P1 | 3 h |
| 9 | Challenge | 3 rounds, data-driven rules, sounds, debrief, share card | P1 | 5 h |
| 10 | Learn | facts, glossary (auto-underline), sources, overclaiming page | P1 | 2.5 h |
| 11 | Launch screen | boot sequence + solar system + warp | P1 | 3 h |
| 12 | Extras | Pakistan spotlight, Twin Finder, Talk-to-Mars, Urdu, PNG export | P1/P2 | 4 h |
| 13 | Cesium terrain fly | lazy route using your ion Moon/Mars assets | P2 | 3 h |
| 14 | Polish | mobile pass, a11y pass, Lighthouse, error states, loading skeletons | P0 | 3 h |
| 15 | Submission | 30-sec / 2-min demo video, README, credits page, final deploy | P0 | 3 h |

**MVP cut line** (if time gets short, ship phases 0–7 + 14 + 15). That alone already covers explore, hover, map, compare and score.

**Team split (4 people):**
- **3D dev**: phases 3, 11, 13
- **Frontend/UI**: shell, 4, 6, 8, 14
- **Data/science lead**: 2, 10, fact-checking every claim, the sources page, the score formula doc
- **Full-stack / game**: 1, 5, 7, 9, 12, deploy

---

## 12. Demo script for judges (2 minutes)
1. **0:00** Launch → boot text → solar system → click Mars → warp. *"A space engine in the browser, loading in under 3 seconds."*
2. **0:20** Hover across Mars: crater names, elevation, slope update live. Toggle 2D → NASA Trek dust layer. *"Real NASA data, computed live."*
3. **0:45** Earth → hover Chile → click Atacama → **Compare with Jezero**. Shared vs. different chips. *"We always say what is similar and what is not."*
4. **1:10** **Mission Score** for Shackleton Rim, Human base. Drag the water-ice weight up and watch the leaderboard reshuffle. *"Transparent formula, educational estimate."*
5. **1:30** **Survival Challenge** quick round: dust storm event → debrief with sources.
6. **1:50** Pakistan spotlight + Urdu toggle → "every fact is sourced" (Sources page). End.

---

## 13. Risks and mitigations
| Risk | Mitigation |
|---|---|
| NASA Trek/GIBS slow or down during judging | Local texture fallback; cache tiles with a service worker (PWA) for demo areas |
| Heavy 3D on weak laptops/phones | Device tiers, 2D fallback, `frameloop="demand"`, lazy models |
| Wrong or overclaimed science | Evidence tags, "Important difference" boxes, data lead signs off on every fact, `validate-data.mjs` |
| Image licensing | Prefer NASA media; Commons only with recorded author/license; drop Katpana's current image |
| Cesium token leak | It is browser-visible by design. Restrict allowed URLs in ion and keep it out of git. |
| Time overrun | Strict P0/P1/P2 order and the MVP cut line |

---

## 14. Definition of done (submission checklist)
- [ ] Hover works on all three worlds (countries on Earth, named features on Moon/Mars) at 60 fps on a mid laptop
- [ ] Every marker opens a drawer with terrain, geology, elevation and resources, all with sources
- [ ] Compare, Score and Slider work and can be shared via URL
- [ ] Survival Challenge playable start to finish
- [ ] Glossary + Sources pages complete; every fact has an evidence tag
- [ ] Mobile layout usable; keyboard navigable; reduced-motion respected
- [ ] Lighthouse ≥ 90 performance on `/`; no 8k textures shipped by default
- [ ] Credits page lists every image/data source; no unverified-rights images
- [ ] `.env.local` not committed; README explains `npm i && npm run assets && npm run dev`
- [ ] Demo video recorded; deployed URL works in an incognito window
