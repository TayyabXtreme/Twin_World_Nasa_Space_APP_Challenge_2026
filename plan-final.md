# TwinWorlds: final plan (UI first)

Single source of truth from 2026-11-14 (`plan-final.md`). Older plans (`docs/archive/plan.md`, `plan-v2.md`, `plan-v3.md`)
are history; the science method in `docs/archive/plan-v2.md` §4.1 still describes how the Finder works.

Live site: https://nasa-space-app-hazel-three.vercel.app · repo: github.com/TayyabXtreme/NasaSpaceApp (push to `main`
redeploys).

---

## 1. What is built (9 pages)

| Page | What the user can do | NASA / partner data behind it |
|---|---|---|
| **Landing** `/` | 3D solar system, live numbers, Finder showcase, Moon pole map, 3D spacecraft, feature grid, agencies | Finder grid, LOLA, Diviner, NASA 3D models |
| **Explore** `/explore/*` | 3D globe + 2D map of Earth, Moon, Mars; science layers with legends and click readouts | Trek, GIBS, Diviner, Mini-RF, Odyssey GRS/NS, TES |
| **Analog Finder** `/finder` | Rank all Earth land against 16 Moon/Mars targets, tune weights, sanity check, Pakistan spotlight | MODIS LST/NDVI/albedo, LRO, Odyssey, TES |
| **Moon Base** `/moonbase` | South-pole layers, 9 Artemis III regions, live base-suitability score | Diviner PRP, LOLA 240 m, Mini-RF |
| **Compare** `/compare` | Earth site vs Moon/Mars site, conditions, Radar Twins, **mission score** (was /score), Analog Finder card | Measured site metrics, CSA RCM, Mini-RF |
| **Challenge** (5 games), **Learn** (incl. the Earth · Moon · Mars worlds section), **Data Lab** `/data`, **About** | Games, education, glossary, dataset catalogue | NASA photos, LRO grids, catalogue of all sources |

## 2. Challenge resources: coverage

| Resource the challenge lists | Status | Action |
|---|---|---|
| Earthdata Search, Worldview | ✅ used | — |
| PDS, LRO (LOLA, Diviner, Mini-RF, LROC) | ✅ used | **Add LEND** (only LRO instrument missing) |
| Diviner polar/resource products | ✅ used | — |
| CSA RCM | ⚠️ previews only | **Radar Twins** feature (§4.6) |
| CSA RADARSAT-1 | ❌ | Optional, needs free EODMS account |
| CSA SAR Python tutorial | ⚠️ downloaded, unused | Process our RCM scenes with it for Radar Twins |

---

## 3. ML: what we build and what we drop

Only two models. Both use data we already have, train on this CPU in minutes, and make the Finder (our core) more
credible. Everything else is dropped so time goes into the UI.

### KEEP
| Model | What it does | Data | Validation shown on the site |
|---|---|---|---|
| **M1 Analogue Space** | PCA + k-means: groups Earth's land into ~8 named environment types and places every Moon/Mars target in the same chart | Finder Earth grid (MODIS) + `targets.json` | Explained variance, cluster stability |
| **M2 Learned weights** | Logistic regression learns how much each dimension (cold, dryness, inertia, ice, sun, relief, swing) matters for a real analogue | ~25 NASA-recognised analogue pairs (Atacama–Jezero, McMurdo–Phoenix, Devon–Haughton, Rio Tinto, Svalbard, Mauna Kea, Kīlauea, Askja, Utah MDRS…) vs random cells | Leave-one-pair-out: is the held-out analogue in Earth's top 5 %? Compared with hand-set weights |

Scripts in `ml/`, outputs in `public/data/ml/<model>/` with a `model-card.json` (data, method, score, limits).

### DROP (not worth the time now)
- Lunar frost classifier (labels not available; Moon Base already shows measured ice).
- Terrain-shape CNN autoencoder (needs a new Earth DEM download, a day of work, risky).
- DINOv2 / Prithvi image embeddings (visual similarity; the challenge asks to go beyond it).
- Mars ice model, landing-hazard detector.

---

## 4. UI work remaining (main focus), in order

| # | UI feature | Where | Details | Size |
|---|---|---|---|---|
| 1 | **Ask TwinWorlds** AI dock | Every page | Floating button → side panel (bottom sheet on phones), streaming answers, "used: MODIS, Odyssey…" tool chips, dataset badges, suggested questions per page, demo mode with saved answers, error/limit states, Ctrl+J | 1 day |
| 2 | **Agentic actions** | Finder, Moon Base, Explore | The AI can move the map, set the Finder target/weights, open a layer; each change animates and shows an Undo toast | ½ day |
| 3 | **Explain this point** | Moon Base readout, Explore pinned value, Finder candidate | One button → 3-sentence briefing built from the sampled values | ½ day |
| 4 | **Analogue Space** tab (M1) | Finder | Interactive scatter: Earth cloud by environment type, Moon/Mars stars; click → fly to place | ½ day |
| 5 | **Learned weights** toggle (M2) | Finder | Default ↔ Learned switch + validation score chip | ¼ day |
| 6 | **Radar Twins** | Compare (new section) | RCM radar scene beside a Mini-RF crater, value histograms, "rough rock or ice?" explanation | ½–1 day |
| 7 | **LEND hydrogen layer** | Moon Base | New layer + legend | ¼ day |
| 8 | **Pakistan sites in Explore** | Explore, Compare | Hingol, Cholistan, Thar, Khewra as real sites with photos (we have Sentinel-2 and Worldview images) | ½ day |
| 9 | **Model cards / How it works** | New `/models` | Each model's data, method, test score, limits; what the AI can and can't do | ¼ day |
| 10 | **Compare clean-up** | Compare | Replace the old tag-based Twin Finder with a link card to the Analog Finder | ¼ day |
| 11 | **Share and SEO** | Site-wide | Open Graph image (1200×630), app icon set, `metadataBase`, sitemap, robots | ¼ day |
| 12 | **Mobile and quality pass** | All pages | Check every page at 390 px, loading/empty/error states, Lighthouse accessibility/performance | ½ day |
| 13 | Urdu toggle | Landing, Finder, chat | EN / اردو switch on key text (RTL already configured) | ½ day |
| 14 | Analogue dossier (PDF) | Finder | One-click AI report from computed numbers | ½ day (optional) |
| — | ~~Games on real data~~ | — | Dropped | — |

**Core = items 1–12 (about 5½ days).** Items 13–14 if time allows.

## 5. Assets still to get or make

| Asset | For | Source | Account needed |
|---|---|---|---|
| LEND south-pole hydrogen map | Moon Base layer | NASA PDS (small) | No |
| RCM compact-pol **SLC** sample (or use our 3 GRD scenes) | Radar Twins | CSA open data | No |
| RADARSAT-1 scene over Devon Island or McMurdo | Radar Twins (optional) | EODMS | Free EODMS |
| Pakistan site images (webp) | Explore/Compare | Already in `assets-raw` (Sentinel-2 quicklooks, Worldview) | No |
| ~25 NASA analogue pair list | M2 labels | NASA analogue programme pages + our `twins.ts` | No |
| Open Graph image, app icons | Sharing | Made from our own renders | No |
| Demo video + slides | Submission | Screen recording of the live site | No |
| ~~Earthdata 1 km MODIS, ASTER, SMAP~~ | — | Dropped (MODIS 0.05° is enough) | — |
| ~~JAXA AW3D30 DEM~~ | — | Dropped (was only for the CNN) | — |

---

## 6. AI on AWS Bedrock (the only AI provider)

**Model:** Claude Opus 5.5 on Bedrock, ID `anthropic.claude-opus-5-5`.
- Chat analyst with tools: effort `medium`.
- "Explain this point": same model, effort `low` (fast and short). A cheaper Claude Haiku 5.5
  (`anthropic.claude-haiku-5-5`) is possible later if cost matters; that is a team decision.

**SDK:** `@anthropic-ai/bedrock-sdk` → `new AnthropicBedrockMantle({ awsRegion })` (Bedrock's Messages-API endpoint).
Same request shape as the Anthropic API (tools, streaming); model IDs need the `anthropic.` prefix.

**Setup steps (one time):**
1. AWS account → Bedrock console → pick a region where Claude Opus 5.5 is offered → request/enable model access.
2. IAM: create a user (or role) allowed only to invoke Bedrock models; create an access key.
3. Vercel → Settings → Environment Variables:
   `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_MODEL_ID=anthropic.claude-opus-5-5`,
   `AI_MODE=bedrock` (or `demo` for saved answers only).
4. Redeploy. Keys stay on the server route (`app/api/ai/chat/route.ts`); the browser never sees them.

**Rules the AI follows:** numbers only from our tools (`run_finder`, `sample_point`, `score_site`, `compare`,
`get_dataset`, `ml_result`); says "no data" when a tool returns nothing; handles a `refusal` stop reason gracefully;
20-question test set run before each deploy.

---

## 7. Order of work

1. **Day 1:** AI dock UI + server route in demo mode (works without AWS) → connect Bedrock when keys are ready.
2. **Day 2:** Agentic actions + Explain this point.
3. **Day 3:** M1 Analogue Space + M2 Learned weights (scripts + Finder UI + model cards).
4. **Day 4:** LEND layer, Radar Twins, Pakistan sites.
5. **Day 5:** Compare clean-up, Share/SEO, mobile and quality pass.
6. **Then:** demo video, slides, submission text; Urdu and dossier if time remains.
