# Manual downloads (need a free account or a normal browser)

Everything else in `assets-raw/nasa/` was downloaded automatically. Button names can differ slightly as these sites
update; look for the closest match.

## 1. NASA Earthdata (needed for the machine-learning step) — priority: HIGH

**Account (one time)**
1. Go to https://urs.earthdata.nasa.gov and click **Register**.
2. Fill in username, password, email; accept the terms; click **Register for Earthdata Login**.
3. Open the confirmation email and click the link.

**Easiest option:** after logging in at https://urs.earthdata.nasa.gov, open **Generate Token** (in the profile menu),
click **Generate Token**, and give the token to Claude through the secure secret prompt (never paste it in chat).
Claude can then download every file listed in `earth/earthdata/granules-by-site.json` automatically.

**Manual option (per dataset)**
1. Go to https://search.earthdata.nasa.gov and click **Earthdata Login** (top right); sign in.
2. In the search box type `MOD11A2` and press Enter. Click the result
   **"MODIS/Terra Land Surface Temperature/Emissivity 8-Day L3 Global 1km SIN Grid V061"**.
3. Click the **spatial** icon in the search bar → **Rectangle**, and drag a small box around the site
   (e.g. Atacama around −24.5, −69.25). Coordinates for all 18 sites are in `earth/worldview/manifest.json`.
4. Click the **calendar** icon → start `2024-01-01`, end `2024-12-31` → **Apply**.
5. Click the green **Download All** button → **Direct Download** → **Download Data**.
6. On the next page click **Download Script** (or the individual links). The first time, a page may ask you to
   **Authorize** the "LP DAAC" application — click **Authorize**.
7. Save the files to `assets-raw/nasa/earth/earthdata/granules/MOD11A2/<site>/`.
8. Repeat for `MOD13A2` (NDVI, save under `.../MOD13A2/<site>/`) and `ASTGTM` (ASTER 30 m DEM, one tile per site,
   save under `.../ASTGTM/<site>/`).

## 2. Copernicus Browser images (missing Svalbard image, clearer Pakistan images) — priority: MEDIUM
1. Go to https://dataspace.copernicus.eu → **Login** (top right) → **Register**; confirm the email.
2. Open https://browser.dataspace.copernicus.eu and log in.
3. Type the place in the search box at the top (e.g. `Bockfjorden, Svalbard`, `Hingol`, `Cholistan`).
4. In the left panel open the **Search** tab: data source **Sentinel-2 L2A**, **cloud cover** slider to 10 %, a date
   range (Svalbard: July–August 2024; Pakistan sites: November 2024–February 2025, the dry season) → **Search**.
5. Click a clear scene in the results → **Visualize**.
6. In the right-hand toolbar click **Download image** → tab **Basic** → format **JPG**, highest resolution offered
   → **Download**.
7. Save as `assets-raw/nasa/partners/copernicus/<site>/sentinel-2-browser.jpg` (site folder names as they already
   exist there).

## 3. Photos that were blocked on this network — priority: MEDIUM
Wikimedia Commons pages do not open here; use a phone hotspot or another network if needed.

For each Commons photo: open the category page → click a photo → on its file page click **Download** (top right)
→ choose **Original file** or **1280 px** → also copy the **Author** and **License** lines into
`assets-raw/photos/twins/CREDITS.csv`. Then run `npm run assets`.

| Need | Where | Save as |
|---|---|---|
| Haworth site image | https://lroc.im-ldi.com/images → search "Haworth" | `assets-raw/photos/sites/site-haworth.jpg` |
| Distinct images for Nobile Rim 1/2, Peak near Cabeus B, Mons Mouton | https://svs.gsfc.nasa.gov → search "Artemis III candidate landing regions" | overwrite the duplicate files in `assets-raw/photos/sites/` |
| Pilot Valley ground photo | https://commons.wikimedia.org/wiki/Category:Pilot_Valley | `assets-raw/photos/twins/pilot_valley.jpg` |
| Medicine Lake / Lava Beds lava-tube interior | https://www.nps.gov/labe/learn/photosmultimedia/photogallery.htm | `assets-raw/photos/twins/medicine_lake_lava_tube.jpg` |
| Askja caldera / ripples | https://commons.wikimedia.org/wiki/Category:Askja | `assets-raw/photos/twins/askja.jpg` |
| Cholistan desert landscape (current photo shows a fort) | https://commons.wikimedia.org/wiki/Category:Cholistan_Desert | `assets-raw/photos/twins/cholistan_desert.jpg` |
| Thar desert, high resolution | https://commons.wikimedia.org/wiki/Category:Thar_Desert | `assets-raw/photos/twins/thar_desert.jpg` |
| Katpana replacement (current one has unclear rights) | https://commons.wikimedia.org/wiki/Category:Katpana_Desert or your own photo | `assets-raw/photos/twins/katpana_cold_desert.jpg` |

## 4. RADARSAT-1 radar scene over an analogue site (optional) — priority: LOW
We already have three RCM radar samples. Only do this if you want radar over a specific site (e.g. Devon Island).
1. Go to https://www.eodms-sgdot.nrcan-rncan.gc.ca → **Register** (or **Login**).
2. In the search panel pick the collection **RADARSAT-1**.
3. Draw a box on the map around the site (Devon Island ≈ 75.4°N, 89.7°W) and click **Search**.
4. Tick a scene → **Add to Cart** → open the **Cart** → **Submit Order** (free).
5. When the "order ready" email arrives, download the zip to `assets-raw/nasa/partners/csa/radarsat1/<site>/`.

## Not needed
- **JAXA G-Portal**: the public JAXA Earth API (already listed in `partners/jaxa/`) gives us the DEM, soil moisture
  and rainfall without an account.
- **Full Sentinel-1/2 products** (about 1 GB each): only for later ML experiments; the quicklooks are enough for the
  website.
