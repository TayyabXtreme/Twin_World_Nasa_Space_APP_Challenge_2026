# TwinWorlds: next tasks, one chat each

Each task is self-contained. Start a new chat, paste the prompt under the task, and let it run.
Order = best value first. Every task names the challenge resource it uses (NASA Earthdata Search, NASA Worldview,
NASA PDS, LRO instruments: LROC, LOLA, Diviner, LEND, Mini-RF; CSA RCM, RADARSAT-1, SAR Python tutorial).

**Shared context (already included in each prompt):** project at `E:\Hacathon\SpaceApps2026`, Next.js 16.4 with Cache
Components, React 19.3, Tailwind v4, shadcn + Magic UI, react-three-fiber, Leaflet, Zustand, motion. Read `AGENTS.md`
(Next.js has breaking changes: check `node_modules/next/dist/docs/`), `plan-final.md` and `plan-showcase.md` first.
Live site https://nasa-space-app-hazel-three.vercel.app deploys on push to `main`.

| # | Task | Challenge resource | Size | Needs |
|---|---|---|---|---|
| 1 | Rocket loader + page transitions | NASA Image Library (Artemis I launch photo) | 1 day | — |
| 2 | Real About page | All resources, credited | ½ day | Team names |
| 3 | Globe: analogue + Pakistan photo pins, twin arcs | Worldview snapshots, NASA images, ESA/CSA quicklooks | 1 day | — |
| 4 | Globe: Moon + Mars landing history, 1969→2026 timeline | PDS, LROC (landing-site images) | 1 day | — |
| 5 | Globe: field campaigns, launch sites, DSN arcs, live ISS, cinematic tour | NASA Image Library | 1 day | — |
| 6 | Worldview live view for any place | NASA Worldview / GIBS | ½ day | — |
| 7 | "Get the data" with Earthdata Search | NASA Earthdata Search (CMR) | ½ day | — |
| 8 | ML M1: Analogue Space chart | Earthdata MODIS grid + PDS targets | ½ day | — |
| 9 | ML M2: Learned weights + Model cards page | Earthdata MODIS + PDS | 1 day | — |
| 10 | LROC close-ups of Artemis III regions | LRO LROC, LOLA (Moon Trek) | ½ day | — |
| 11 | RADARSAT-1 scene for an analogue site | CSA RADARSAT-1, SAR Python tutorial | ½ day | Free EODMS account |
| 12 | Convex: live leaderboards + mission log | — (backend) | 1 day | Convex account |
| 13 | Convex: share links + "Suggest an analogue" | Finder (Earthdata + PDS) | 1 day | Task 12 |
| 14 | Rovi robot: 3D character + site actions (demo mode) | All pages | 1 day | — |
| 15 | Rovi brain on AWS Bedrock + evaluation | All data tools | 1 day | Bedrock key |
| 16 | TwinWorlds MCP server | All data tools | ½ day | — |
| 17 | Sharing basics + phone and speed check | — | ½ day | — |
| 18 | Submission pack: judges' README, video script, slides | All | ½ day | — |

---

## 1. Rocket loader + page transitions
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026 (Next.js 16.4, React 19.3, Tailwind v4, motion). Read AGENTS.md,
plan-showcase.md §5 and node_modules/next/dist/docs/01-app/02-guides/view-transitions.md first.
Build: (1) a rocket-launch loading screen on the first visit per session: countdown T-3..1, engine glow, smoke
particles, lift-off, progress tied to real asset loading, skippable, calm fade for reduced motion; reuse or replace
components/landing/SpaceLoader.tsx. (2) Route transitions with React <ViewTransition>: a warp/star-streak between
pages, shared-element morphs (Challenge mission card photo -> game stage; landing feature card -> page hero),
directional slides for back/forward. (3) loading.tsx for /finder, /moonbase, /data, /explore/* with a small orbiting
rocket instead of "Loading…". Transform/opacity only. Verify with tsc, eslint, next build and a few screenshots
(desktop + 390 px). Do not commit until I say.
```

## 2. Real About page
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and plan-showcase.md §6. app/about/page.tsx is still a
placeholder (SectionPlaceholder). Build a real About page in the site's dark style: the story (why Earth analogues
matter for a permanent Moon base and Mars), team cards (ask me for names/roles/photos; use initials until then),
the method as one diagram (data -> processing -> scoring -> limits), data credits grouped by agency from
lib/data/datasets.ts (NASA Earthdata, Worldview, PDS, LRO LROC/LOLA/Diviner/LEND/Mini-RF, CSA RCM/RADARSAT-1/SAR
tutorial, ESA, JAXA), the Space Apps challenge statement, the Pakistan angle, GitHub link, and a build timeline.
Verify (tsc, eslint, build, desktop + mobile screenshot). Do not commit until I say.
```

## 3. Globe: analogue + Pakistan photo pins, twin arcs
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026 (react-three-fiber globe in components/globe, pins in SiteMarkers.tsx;
no drei <Html> — pins are DOM elements positioned by a per-frame projector). Read AGENTS.md and plan-showcase.md §1.
Add layer toggles and photo pins on the Earth globe: Analogue sites (all Earth sites in lib/data/sites.ts) and a
Pakistan layer (Hingol, Cholistan, Thar, Khewra — add them to lib/data/sites.ts with verified coordinates). Clicking a
pin opens a card with a photo (public/photos, Worldview snapshots in assets-raw/nasa/earth, Copernicus/CSA
quicklooks in assets-raw/nasa/partners), what NASA tested there, its Moon/Mars twin, and links to Compare/Finder.
Selecting an analogue draws a glowing arc up toward its twin world. Keep 60 fps; lazy-load photos. Verify with
screenshots desktop + mobile. Do not commit until I say.
```

## 4. Globe: Moon + Mars landing history and timeline
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and plan-showcase.md §1. On the Moon and Mars globes
(Explore 3D), add an "Exploration history" layer: every successful landing with date, agency, coordinates and a photo
(Moon: Apollo 11-17, Luna 9/16/17/20/21/24, Chang'e 3/4/5/6, Chandrayaan-3, SLIM; Mars: Viking 1/2, Pathfinder,
Spirit, Opportunity, Phoenix, Curiosity, InSight, Perseverance, Zhurong). Verify coordinates from NASA/PDS or USGS
sources and cite them. Photos from the NASA Image Library API (see scripts/fetch-challenge-photos.py) incl. LROC
images of landing sites. Add a 1969 -> 2026 timeline slider that drops pins in order with a play button. Verify and
screenshot. Do not commit until I say.
```

## 5. Globe: field campaigns, launch sites, DSN, live ISS, cinematic tour
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and plan-showcase.md §1. Add Earth-globe layers:
NASA field campaigns (Haughton-Mars Project, Desert RATS Arizona, Artemis II geology training Iceland, PISCES Hawai'i,
NEEMO), launch sites (Kennedy, Baikonur, Kourou, Sriharikota, Jiuquan, Tanegashima), Deep Space Network antennas
(Goldstone, Madrid, Canberra) with animated signal arcs, and a live ISS position computed client-side from a public
TLE (no new paid service; small dependency OK if justified) with an orbit trail. Photos from the NASA Image Library
API with credits. Add a "Cinematic tour" button that flies the camera pin to pin with captions. Verify, screenshot.
Do not commit until I say.
```

## 6. Worldview live view for any place
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md. Use NASA Worldview / GIBS (WMS or WMTS snapshot,
no login; layer IDs in lib/layers.ts) to show recent satellite imagery of any place: in Finder candidate cards, the
site drawer and globe pin cards, add a "Satellite view" with a date picker (true colour MODIS/VIIRS, plus land
temperature and NDVI options) and an "Open in Worldview" deep link with the right location, layers and date. Handle
cloud/no-data honestly. Verify tile requests return 200. Screenshot. Do not commit until I say.
```

## 7. "Get the data" with NASA Earthdata Search
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md. For any Finder candidate, Earth site or clicked map
point, add a "Get the data" panel that queries NASA's CMR API (no login needed for search) for granules covering that
spot (MODIS LST/NDVI, ASTER GDEM, SMAP, HLS) and lists them with dates and sizes, plus a deep link into NASA Earthdata
Search pre-filtered to that location and collection. Cache responses; handle errors. Add it to the Data Lab too.
Verify with real CMR requests. Do not commit until I say.
```

## 8. ML M1: Analogue Space chart
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and plan-final.md §3 (M1). Train the "Analogue
Space" model in ml/ with numpy only: standardise the Finder Earth grid (public/data/finder, MODIS-derived) -> PCA ->
k-means (~8 named environment types), project the 16 Moon/Mars targets into the same space, report explained
variance and cluster stability, write public/data/ml/analogue-space/ (points sample, clusters, model-card.json).
Add an "Analogue Space" tab to /finder: interactive scatter (Earth cloud by type, Moon/Mars stars, click -> fly the
Finder there). Verify and screenshot. Do not commit until I say.
```

## 9. ML M2: Learned weights + Model cards page
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and plan-final.md §3 (M2). Compile ~25 NASA-recognised
analogue pairs (lib/data/twins.ts + NASA analogue programme sites, each with a source URL). Train a non-negative,
L2-regularised logistic regression on the Finder's 7 per-dimension similarities vs random cells; leave-one-pair-out
validation reporting recall@top-5 % against the hand-set weights. Save to public/data/ml/learned-weights/ with
model-card.json. In /finder add a Default <-> Learned weights switch with the test score. Create /models: a model
card page for every model (data, method, score, limits) and what the AI can and can't do. Verify. Do not commit
until I say.
```

## 10. LROC close-ups of the Artemis III regions
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md. On /moonbase, add a close-up view per Artemis III
region (lib/moonbase/regions.ts) using LRO LROC imagery (Moon Trek polar tile services or LROC products; verify the
service and layer IDs return 200) with the LOLA hillshade and our layers as overlays, plus a short "what a crew would
see" description. Credit LRO LROC/LOLA. Verify and screenshot. Do not commit until I say.
```

## 11. RADARSAT-1 scene for an analogue site
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and look at scripts/build-radar-twins.py and
components/compare/RadarTwins.tsx. Find a RADARSAT-1 scene (open data: CSA EODMS / the public AWS bucket) over one of
our analogue sites (Devon Island, McMurdo or Atacama preferred), process it following CSA's SAR Python tutorial
(assets-raw/nasa/partners/csa/repos/Synthetic_Aperture_Radar_Tutorial), and add it to Radar Twins as a third Earth
scene with its own readout and histogram. If an account is required, tell me exactly what to do. Do not commit until
I say.
```

## 12. Convex: live leaderboards + mission log
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and plan-showcase.md §2. Add Convex (npm package
convex) to the Next.js app: schema + functions for `scores` (game, display name, country, score, createdAt) and
`activity`. Live global leaderboards on /challenge for all five games (top 10, today / all time) with a name prompt
after a game; a "live mission log" ticker on the landing page. Rate limiting and a word filter; no personal data.
I will run `npx convex dev` to log in when you tell me. Add the env vars to Vercel instructions. Verify. Do not commit
until I say.
```

## 13. Convex: share links + "Suggest an analogue"
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026 (Convex already set up in task 12). Read plan-showcase.md §2.
(1) Shareable results: Finder ranking, Moon Base Scout site and game results get a short link (/s/[id]) and a
generated Open Graph image. (2) "Suggest an analogue": drop a pin on a map, add a reason and a photo (Convex file
storage), others upvote; each suggestion is scored with the Finder grid and shown on the globe as a community layer.
Moderation: rate limit, word filter, size limits. Verify. Do not commit until I say.
```

## 14. Rovi robot: 3D character + site actions (demo mode)
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and plan-showcase.md §4. Build "Rovi": a small 3D robot
(react-three-fiber primitives, no new model download) docked bottom-right on every page: eyes follow the cursor and
blink, antenna pulses while thinking, mouth moves while speaking. Chat panel (bottom sheet on phones). A client action
bus so Rovi can: navigate, fly the globe, open a map layer, set Finder target/weights, place a Moon base, start a
game, start a guided tour; each action animates, spotlights the UI it talks about, and offers Undo. Voice in/out with
the browser speech APIs (English + Urdu). Run in demo mode with scripted answers for 10 suggested questions. Verify.
Do not commit until I say.
```

## 15. Rovi's brain on AWS Bedrock + evaluation
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026 (Rovi UI from task 14). Read AGENTS.md and plan-final.md §6. Add a
server route that streams Claude Opus 5.5 on AWS Bedrock (@anthropic-ai/bedrock-sdk, AnthropicBedrockMantle, model
anthropic.claude-opus-5-5) with tool use over our data tools (find_analogues, sample_moon_point, score_site,
compare_sites, get_dataset, list_sites) and the client action tools. Numbers only from tools; handle refusals;
AI_MODE=demo fallback. Env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BEDROCK_MODEL_ID. Write a
20-question evaluation script and report results. Do not commit until I say.
```

## 16. TwinWorlds MCP server
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md and plan-showcase.md §3. Add an MCP server at
/api/mcp (Streamable HTTP, mcp-handler + @modelcontextprotocol/sdk) exposing the same data tools Rovi uses
(find_analogues, sample_moon_point, score_site, compare_sites, get_dataset, list_sites) and the dataset catalogue as
resources; share one tool module between the robot and MCP. Add a "Connect Claude to TwinWorlds" section with setup
steps for Claude Desktop and claude.ai custom connectors. Test with the MCP Inspector. Do not commit until I say.
```

## 17. Sharing basics + phone and speed check
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read AGENTS.md. Add an Open Graph image (1200x630) and per-page
metadata, an app icon set (replace the default favicon), metadataBase, sitemap and robots. Then check every page at
390 px and fix layout issues (Data Lab, Finder, landing sections, Learn worlds section), and run Lighthouse on the
built site; fix the biggest performance and accessibility problems (Moon Base layer sizes, Explore 3D). Report
before/after scores. Do not commit until I say.
```

## 18. Submission pack
```
Project TwinWorlds at E:\Hacathon\SpaceApps2026. Read plan-final.md, plan-showcase.md and the site. Write: a README
for judges (what TwinWorlds does, every NASA/partner resource used and where, what is measured vs estimated, how to
run and rebuild data), a 30-second demo video script with shot list (live site URL), 7 slides worth of content, and
the Space Apps project page text. Check the current Space Apps submission rules first. Do not commit until I say.
```
