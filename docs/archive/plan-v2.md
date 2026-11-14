# TwinWorlds v2 — Data-driven plan

Built on the official resources of the Space Apps 2026 challenge **"Identify Earth Locations that Analog the Permanent
Moon Base Locations and Mars"**. Version 1 (`plan.md`) built the explorer; this plan turns TwinWorlds into a tool that
**finds and characterises Earth analogues with data**, which is what the challenge actually asks for.

---

## 1. What the challenge asks (and how we will answer it)

From the Details tab, the judges want teams to:

| The challenge says | What TwinWorlds will do |
|---|---|
| "Search globally and systematically", find "previously unrecognized analogs", "not simply rediscover well-known analog sites" | **Analog Finder**: rank places across the whole Earth against a chosen Moon base or Mars site, not just a fixed list of famous sites |
| "Think beyond visual similarity", "use data to explain why" | Every match is scored per **dimension** (temperature, terrain, surface materials, ice, dryness, dust, radar) from measured data, never from photos alone |
| "Identify what is similar, how similar it is, and what is different" | Each candidate shows a **match bar per dimension** plus a **"where it breaks down"** list (gravity, vacuum, radiation, and any data dimension that scores low) |
| "Consider scale … a crater, valley, volcanic field" | Analyse Earth on a fine grid, then zoom into a site's real terrain and imagery |
| "Similarity metrics, machine learning, GIS, games" | Transparent similarity metric first, then a model that learns dimension weights from known NASA analogue pairs (Section 6) |
| "Connect your analog to exploration" | Each candidate gets "what you could test here" (drills, rovers, radar ice prospecting, landing hazards, habitat thermal design) |
| "Remember Earth's limits" | Already in Compare → *Conditions on the ground*; repeated on every candidate |
| "Surprise us", "places that have received much less attention" | **Pakistan spotlight**: Hingol mud volcanoes, Cholistan and Thar dunes, Khewra salt range, scored with the same method |

---

## 2. What we downloaded

All raw data sit in `assets-raw/nasa/` (see its `README.md` for a full table, licences and re-download commands).

### Moon (NASA LRO, PDS Geosciences Node)
| Dataset | What it gives us | Status |
|---|---|---|
| **Diviner Polar Resource Product (south)** | For 2.88 million triangles around the south pole: annual **max** surface temperature, annual **average** temperature at 2 cm, and **ice stability depth** (depth where buried water ice would survive; 0 = stable at the surface, > 2.87 m reported as "none") | downloading (605 MB) |
| **Diviner rock abundance** (32 px/°) | Fraction of the surface covered by large rocks → landing and driving hazard | downloading |
| **Diviner regolith temperature** (32 px/°) | Night-time temperature of the fine soil → thermal environment | downloading |
| **LOLA south-pole DEM and slope**, 75°S–90°S at 240 m | Elevation and slope under every Artemis III candidate region | downloading |
| **Mini-RF global CPR** (32 px/°) | Radar circular polarisation ratio: high values mean rough rocky ground *or* possible ice (ambiguous, we say so) | queued |

### Mars (NASA, PDS Geosciences Node)
| Dataset | What it gives us | Status |
|---|---|---|
| **Odyssey GRS water map** (5°) | Water-equivalent hydrogen, weight %, mid-latitudes | ✅ |
| **Odyssey neutron epithermal map** (0.5°) | Hydrogen including the ice-rich high latitudes (fewer epithermal neutrons = more hydrogen) | ✅ |
| **GRS element maps** (Fe, Cl, Si, K, Th) | Surface chemistry (salts, basalt) | ✅ |
| **MGS TES thermal inertia** (20 px/°, day and night) | Dust vs sand vs rock vs ice-cemented ground, in the same units Earth scientists use | ✅ |
| MOLA elevation (already in the app) | Terrain, slope, roughness | ✅ (v1) |

### Earth (NASA Earthdata / Worldview)
| Dataset | What it gives us | Status |
|---|---|---|
| **Worldview snapshots** for 18 sites (7 current + 11 new candidates): MODIS true colour (clearest of several days), land-surface temperature day and night, NDVI, ASTER relief | Visual and thermal character of each analogue | ✅ 90 images |
| **Earthdata CMR listings**: MOD11A2/MYD11A2 (LST), MOD13A2 (NDVI), ASTGTM (30 m DEM), SPL3SMP_E (soil moisture), HLSL30 | Exact granules per site for the ML pipeline (download needs a free Earthdata Login) | ✅ metadata |

### Partner agencies
| Agency | What we have | Status |
|---|---|---|
| **CSA** | RADARSAT-1 and RCM dataset records, three RCM radar sample scenes (Antarctic Peninsula, Canadian Arctic; previews, metadata, one full-resolution HH band), the official SAR tutorial and RADARSAT-1 script repos | ✅ |
| **ESA Copernicus** | Latest Sentinel-1 radar scene for all 18 analogue sites and the best low-cloud Sentinel-2 scene for 17 (Svalbard timed out), with quicklooks | ✅ |
| **ESA Open Science Catalog** | 111 products matching analogue themes (Greenland and Antarctic ice, wet snow, permafrost, glacier lakes, albedo …) | ✅ |
| **JAXA** | 112 JAXA Earth API collections (public, no login), including the **ALOS AW3D30 30 m global DEM**, **AMSR2 soil-moisture** climatology and **GSMaP precipitation** normals | ✅ |

**Needs a free account (documented, not downloaded):** Earthdata granules, Copernicus full products, RADARSAT-1 scenes by
location (EODMS search, then the public AWS bucket), JAXA G-Portal products.

---

## 3. First look: what the data already tell us

From `assets-raw/nasa/site-samples.json` (produced by `scripts/preview-nasa.py`).

### Mars sites
| Site | GRS water (wt %) | Neutron epithermal (counts/s, lower = more H) | TES thermal inertia (night) | Reading |
|---|---|---|---|---|
| Phoenix landing site | masked (polar) | **3.42** | 101 | Most hydrogen of all our sites, fine loose soil: matches the ice Phoenix actually dug up |
| Arcadia Planitia | masked (polar) | **4.85** | 215 | Hydrogen-rich mid-latitude plain: the "ice within reach" Mars base candidate |
| Utopia Planitia (Viking 2) | 4.58 | 5.17 | 244 | Moderate hydrogen |
| Mawrth Vallis | 5.46 | 5.46 | 245 | Clay-rich, moderate hydrogen |
| Gale Crater | 5.42 | 5.68 | 364 | Rockier, consolidated ground |
| Hellas Planitia | 4.16 | 7.27 | 201 | Low hydrogen at this resolution |
| Jezero Crater | 3.53 | **8.13** | 306 | Driest of our sites |

These numbers replace guesses in the Mission Score and drive the Mars side of the Analog Finder.

### Moon sites
Computed by the same script as soon as the Diviner, LOLA and Mini-RF files finish downloading: max/average
temperature, ice stability depth, share of permanently cold ground (cold traps, annual max < 110 K), slope, rock
abundance and radar CPR at every Artemis III candidate region.

### Earth sites
Worldview snapshots confirm the expected contrasts (Atacama hot by day and cool at night; McMurdo ice-cold with no
vegetation signal; Devon Island bare and dry in summer). Turning colours into numbers: GIBS publishes the colour
map for every layer, so a pixel's colour can be inverted back to a value bin (for example LST in kelvin) without a
login. For exact values the ML pipeline uses the Earthdata granules listed above.

---

## 4. What changes on the website

### P0 — the core of the submission

**4.1 Analog Finder (new flagship page, `/finder`)**
- Choose a **target**: a Moon base candidate (e.g. Shackleton rim, Malapert Massif, Mons Mouton) or a Mars site
  (Jezero, Arcadia, Phoenix …).
- Choose **dimensions** and weights: temperature extremes, day–night swing, dryness, terrain slope and roughness,
  surface materials (thermal inertia), ice/permafrost, radar roughness, dust.
- The **map** colours Earth by match score; a **ranked list** shows the top candidates, including places nobody has
  called an analogue before.
- Each **candidate card**: per-dimension match bars, "strong analogy for…", "breaks down at…", "what you could test
  here", Worldview imagery, Copernicus quicklook, and links to the data used.
- **Method, shown on the page** (no black box):
  - Absolute comparison where the quantity means the same thing on both worlds: slope and roughness, thermal
    inertia, dryness.
  - *Role* comparison where absolute values cannot match: e.g. Shackleton rim is among the coldest, most
    ice-favourable ground on the Moon, so we look for Earth ground that is among the coldest and most
    permafrost-rich on Earth (percentile matching), and say clearly that −170 °C does not exist on Earth.
  - **Sanity check**: the method must rediscover known NASA analogues (Atacama for dry Mars, Devon Island for
    impact craters in cold desert, Antarctica for polar ice) before we trust its new suggestions.
- Computation runs in the browser (Web Worker) on a precomputed Earth feature grid, so weights update instantly.

**4.2 Moon Base Map (south pole, inside Explore → Moon or `/finder` target view)**
- Polar map with switchable layers: ice stability depth, cold traps (< 110 K), max and average temperature, LOLA
  slope, rock abundance, Mini-RF CPR.
- Artemis III candidate regions outlined; click any point for a readout of every layer.
- "Base suitability" heat map from the same weights as the Mission Score (sunlit ridge + cold trap nearby + gentle
  slope + few rocks).

**4.3 Measured data everywhere**
- Mission Score factors switch from rules to **measured values**: water/ice (Diviner ice depth and cold-trap share;
  Mars GRS and neutron hydrogen), temperature (Diviner, TES), rocks (Diviner rock abundance; new factor), radar
  (Mini-RF CPR, flagged as ambiguous). Each factor shows its dataset badge.
- Site drawer and Compare's *Conditions on the ground* show the sampled values with units and sources.

**4.4 Science layers in Explore 2D**
- Moon: Diviner, LOLA slope, Mini-RF. Mars: GRS water, neutron hydrogen, TES thermal inertia.
- Earth: live GIBS layers (LST day/night, NDVI, snow cover, aerosol/dust) — no download needed, already supported by
  the map engine.
- Every layer gets a legend with units and a one-line "what this means".

### P1 — differentiators
- **Pakistan spotlight**: Hingol mud volcanoes, Cholistan and Thar dunes, Khewra salt range scored with the Finder,
  with honest "breaks down at" notes. This is our "surprise us".
- **Radar twins**: Mini-RF on the Moon vs RCM/Sentinel-1 on Earth; what CPR means; links to Askja radar ice work.
- **Data Lab page** (`/data`): every dataset with preview, coverage, resolution, licence and source link, generated
  from the manifests.
- **Games on real data**: Touchdown uses a real LOLA terrain profile at a chosen Artemis region; Sample Run places
  drill targets on the neutron hydrogen map.

### P2 — after the core works
- ML outputs on the site (Section 6): lunar surface-frost probability map, Mars ice-likelihood map, image-based
  analogue search.
- **Analogue dossier** export: one shareable page/PDF per candidate site.

### Pages that change
| Page | Change |
|---|---|
| Landing | Lead with "Find Earth's twin for a Moon base" and a live Finder teaser |
| Explore | Science layers and the Moon south-pole base map |
| Compare | Pairs stay; the old tag-based Twin Finder is replaced by a link to the Analog Finder |
| Score | Measured factors with dataset badges |
| Learn | New glossary terms: ice stability depth, cold trap, thermal inertia, CPR, epithermal neutrons |
| New | `/finder`, `/data` |

---

## 5. Data pipeline

```
scripts/fetch-nasa.sh        Moon + Mars raw data (PDS)            → assets-raw/nasa/moon, mars
scripts/fetch-earth.py       Worldview snapshots + CMR metadata    → assets-raw/nasa/earth
scripts/fetch-partners.py    CSA, Copernicus, ESA OSC, JAXA        → assets-raw/nasa/partners
scripts/preview-nasa.py      previews + values at our sites       → assets-raw/nasa/_previews, site-samples.json
scripts/build-data.py (new)  web-ready layers and grids           → public/data/
```

`build-data.py` outputs:
- **Display layers**: WebP images per layer (south-polar stereographic for the Moon, equirectangular −180…180 for
  Mars, standardised longitudes) with a small JSON legend (colour ramp, units, range).
- **Value grids** for in-browser maths: quantised 8/16-bit PNGs with scale/offset in JSON (lossless, cacheable).
- **Earth feature grid** for the Finder: one row per land cell (start at 0.25°), columns = normalised dimensions.
  Target size ≤ 2 MB.
- **site-metrics.json**: the sampled values the UI shows, each with dataset, units and evidence level.

Budget: the Finder page under 3 MB of data on first load; layers lazy-load when switched on.

---

## 6. Machine learning and deep learning plan

The challenge explicitly welcomes "similarity metrics, machine learning approaches". We stage it so something solid
ships during the hackathon and the ambitious parts are clearly marked as next steps.

### 6.1 Analogue similarity (hackathon, core)
- **Goal**: score how analogous an Earth location is to a target Moon/Mars site, per dimension.
- **Features** (per location):
  - Earth: MODIS LST day and night (MOD11A2/MYD11A2) → mean, day–night range; **apparent thermal inertia**
    from day–night LST and albedo (comparable to Mars TES thermal inertia); NDVI (MOD13A2) and SMAP soil moisture →
    dryness; ASTER GDEM → slope and roughness at matched baselines; Sentinel-1 / RCM backscatter → radar roughness;
    snow/permafrost (ESA CCI via the Open Science Catalog) → ice. JAXA Earth API (no login) adds the ALOS AW3D30
    30 m DEM, AMSR2 soil moisture and GSMaP precipitation normals, so terrain and dryness work even without an
    Earthdata account.
  - Moon: Diviner temperatures, ice stability depth, rock abundance; LOLA slope/roughness; Mini-RF CPR.
  - Mars: TES thermal inertia, GRS water and neutron hydrogen, MOLA slope/roughness, GRS chemistry.
- **Method**: z-score/percentile normalisation within each world → weighted distance per dimension → overall score.
- **Learning the weights**: the known NASA analogue pairs in our data (Atacama ↔ Jezero, McMurdo ↔ Arcadia/Phoenix,
  Death Valley ↔ Utopia, Askja ↔ Gale/Shackleton, Kīlauea/Medicine Lake ↔ Marius Hills…) are positives, random
  pairs are negatives; a regularised logistic regression on per-dimension differences learns which dimensions
  matter. Leave-one-pair-out validation; report how many known analogues it recovers in its top 20.
- **Tools**: Python, xarray/rasterio, scikit-learn; results exported to JSON for the website.

### 6.2 Lunar surface-frost likelihood (hackathon stretch)
- **Inputs**: Diviner max/average temperature and ice depth, LOLA slope and elevation, Mini-RF CPR (all downloaded),
  plus LEND neutron hydrogen (next download).
- **Labels**: published orbital detections of surface water ice at the poles (Moon Mineralogy Mapper results).
- **Model**: gradient-boosted trees (XGBoost/LightGBM) on a polar grid, spatial block cross-validation so neighbours
  never leak between train and test.
- **Output**: a probability layer on the Moon Base Map, labelled as a model estimate.

### 6.3 Mars ice likelihood (next step)
- **Inputs**: TES thermal inertia, neutron hydrogen, MOLA elevation/slope, latitude.
- **Labels**: the Mars Subsurface Water Ice Mapping (SWIM) project's ice consistency maps (USGS publishes the
  probabilistic SWIM work for 60°S–60°N).
- **Model**: gradient-boosted trees; validate against the Phoenix ground truth and new-impact ice exposures.

### 6.4 Deep learning: image-based analogue search (future)
- **Earth embeddings**: NASA–IBM **Prithvi-EO-2.0** foundation model (Hugging Face `ibm-nasa-geospatial`,
  Apache-2.0) on Harmonized Landsat-Sentinel (HLS) tiles → an embedding per Earth tile.
- **Planetary terrain**: train a terrain encoder on **AI4Mars** (NASA JPL; rover images labelled soil / bedrock /
  sand / big rock) and on lunar crater labels from the **Robbins Lunar Crater Database** (USGS; ~1.3 million craters).
- **Search**: nearest-neighbour retrieval in a shared terrain-class space ("show me Earth tiles that a Mars terrain
  classifier labels like this rover scene"), with the domain gap stated plainly.
- **Radar**: self-supervised (contrastive) learning on Sentinel-1/RCM patches and Mini-RF patches to group surfaces
  by radar texture (research-level; P2).

### 6.5 Landing hazard (future)
- Boulder/crater detection on LROC NAC images with Diviner rock abundance as weak labels; check against LOLA slope.

### Training data summary
| Task | Inputs | Labels | Where from |
|---|---|---|---|
| Similarity weights | Earth: MODIS LST/NDVI, ASTER, SMAP, Sentinel-1; Moon/Mars layers above | Known NASA analogue pairs | Earthdata, Copernicus, PDS (downloaded/listed) |
| Lunar frost | Diviner, LOLA, Mini-RF, LEND | Orbital surface-ice detections | PDS (downloaded) + published results |
| Mars ice | TES, GRS/neutrons, MOLA | SWIM ice consistency maps | PDS (downloaded) + USGS SWIM |
| Terrain encoder | Rover and orbital images | AI4Mars classes; Robbins craters | data.nasa.gov; USGS Astropedia |
| Earth embeddings | HLS tiles | self-supervised | Earthdata (HLSL30) + Prithvi-EO-2.0 |

---

## 7. Build order

| Phase | Work | Estimate |
|---|---|---|
| 1 | Finish downloads; `preview-nasa.py` Moon section; check every layer visually | 0.5 day |
| 2 | `build-data.py`: layers, value grids, site-metrics.json | 1 day |
| 3 | Measured factors in Score, drawer and Conditions | 0.5 day |
| 4 | Moon Base Map with layers and readout | 1 day |
| 5 | Earth feature grid (GIBS colour-map inversion first, Earthdata values when logged in) | 1 day |
| 6 | Analog Finder page: map, ranked list, candidate cards, method panel, sanity check | 1.5 days |
| 7 | Similarity weight learning (6.1) and validation report | 0.5 day |
| 8 | Pakistan spotlight, Data Lab, science layers in Explore | 1 day |
| 9 | Stretch: lunar frost model (6.2), games on real data | 1 day |

---

## 8. Honesty rules (unchanged, and stricter)

- Every number shows its dataset, units and evidence level; model outputs are labelled as estimates.
- Ambiguous signals are explained (Mini-RF CPR: rough rock *or* ice).
- Absolute temperatures are never compared as if Earth could match them; we compare roles and ranges and say why.
- Every candidate lists where the analogy breaks down, starting with gravity, vacuum/air and radiation.
- New candidate sites carry "approximate coordinates" until checked against imagery.
