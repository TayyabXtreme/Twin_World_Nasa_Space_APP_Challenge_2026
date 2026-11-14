# TwinWorlds v3: status, ML/AI and win plan

Written 2026-11-13 after the v2 build. Supersedes the "Build order" in `plan-v2.md`; the science method there still holds.
Loop for every item: **observe** (measure what exists) → **decide** (pick the smallest thing that moves a judging
criterion) → **improve** (build, verify, record the result here).

---

## 1. Where we stand (observed 2026-11-13)

### 1.1 Pages: 15 routes, production build passes
| Page | State | Notes |
|---|---|---|
| `/` Landing | ✅ v1 | Does **not** mention the Finder or Moon Base yet |
| `/explore/earth·moon·mars` | ✅ v1 + v2 | 3D globe, 2D map, **science layers with legends and click readouts** (new) |
| `/finder` Analog Finder | ✅ v2 | Ranks all of Earth's land against 16 Moon/Mars targets, worker scoring < 0.1 s, sanity check, Pakistan spotlight |
| `/moonbase` Moon Base Map | ✅ v2 | 9 layers, 9 Artemis III regions, live base-suitability score |
| `/score` Mission Score | ✅ v2 | Measured factors with dataset badges; new rocks and radar factors |
| `/compare` | ✅ v1 + v2 | Measured "Conditions on the ground"; old tag-based Twin Finder still there |
| `/data` Data Lab | ✅ v2 | 32 datasets catalogued; only build-checked, not visually checked |
| `/slider`, `/challenge` (3 games), `/learn`, `/about` | ✅ v1 | Games use simulated terrain, not real data; glossary +12 terms |

### 1.2 Data resources: 32 catalogued
| Status | Count | Which |
|---|---|---|
| Downloaded **and computed on** by a feature | **15** | Moon: Diviner PRP, rock, regolith temperature; LOLA 240 m elevation and slope; LOLA 16 ppd; Mini-RF CPR · Mars: GRS water, GRS elements, neutrons, TES thermal inertia, MOLA · Earth: MODIS LST, NDVI, albedo |
| Downloaded, **shown only as pictures** | 7 | Worldview snapshots (4 layers × 18 sites), **CSA RCM ×3**, **ESA Sentinel-1**, **ESA Sentinel-2** |
| Live tiles (no download) | 3 | Moon Trek, Mars Trek, GIBS (6 Earth science layers) |
| Needs a free account | 5 | MODIS 8-day, ASTER GDEM, SMAP, HLS (Earthdata); RADARSAT-1 archive (EODMS) |
| Catalogued only | 2 | ESA Open Science Catalog (111 products), JAXA Earth API (112 collections) |

### 1.3 Against the challenge's own resource list
| Challenge resource | Used? | Gap |
|---|---|---|
| NASA Earthdata Search | ✅ MODIS CMG | Finer 8-day/1 km products need a login |
| NASA Worldview | ✅ snapshots + live GIBS | none |
| NASA PDS | ✅ LRO, Odyssey, MGS | none |
| LRO: LROC, LOLA, Diviner, Mini-RF | ✅ (LROC via Trek WAC tiles) | **LEND not used: not downloaded** |
| LRO Diviner polar/resource products | ✅ PRP on Moon Base, Score, Finder | none |
| CSA RCM data | ⚠️ previews only | **No analysis**; our 3 samples are GRD (no phase) |
| CSA RADARSAT-1 | ❌ | Not downloaded |
| CSA SAR Python tutorial | ⚠️ repo downloaded, not used | **No feature built on it** |

**Biggest gap for judges: the partner-agency radar data is shown but never analysed.** Section 3.5 fixes it.

### 1.4 Machine learning / AI
Nothing trained yet. The Finder is a transparent, hand-weighted similarity metric (that is fine and honest; ML adds
to it, it doesn't replace it). No chatbot. `ANTHROPIC_API_KEY` not set.

Hardware: no NVIDIA GPU, 8 GB RAM, PyTorch 2.12 (CPU) and onnxruntime installed; scikit-learn not installed
(pip install is fine). **Every model below is sized to train on this CPU in minutes, not hours.**

---

## 2. How the judges score (Space Apps criteria) and what earns each point
| Criterion | What wins it | Our answer |
|---|---|---|
| **Impact** | Useful beyond the hackathon | Finder finds *new* analogues; dossier export a scientist could use |
| **Creativity** | Something nobody else does | Radar twins (same CPR maths on Earth and Moon), AI analyst that drives the maps, Pakistan spotlight, Urdu |
| **Validity** | Real data, sound method, honest limits | Measured values with dataset badges, sanity check, cross-validated ML, "breaks down at" |
| **Relevance** | Uses the challenge's listed resources | Every listed resource used (close the LEND, RCM, RADARSAT-1, SAR-tutorial gaps) |
| **Presentation** | Clear story, works live | Guided demo tour, deployed URL, 30-second video, no broken states |

---

## 3. ML / DL plan: what we train, on which dataset, how we prove it

All training scripts live in `ml/`, write results to `public/data/ml/`, and each writes a `report.json`
(metrics, data used, date) that the website shows on a **Model Card** (section 4.4). Rule: no number on the site
without its validation result next to it.

### 3.1 M1: Analogue Space (embedding + environment types) · numpy · ½ day · P0
- **Data**: the Finder's Earth grid (MODIS LST day/night, swing, seasonal range, NDVI, albedo, apparent thermal
  inertia, relief) + the 16 Moon/Mars target profiles (`public/data/finder/targets.json`).
- **Method**: standardise → PCA (2–3 components) → k-means (k≈8) into named **environment types**
  ("hyper-arid hot desert", "polar cold desert", "ice sheet", "volcanic highland"…). Project every Moon/Mars target
  into the same space by its role-matched values.
- **Validation**: explained variance; stability of clusters across seeds (adjusted Rand index).
- **On the site**: an interactive **Analogue Space** scatter: Earth's land as a cloud coloured by type, Moon and
  Mars sites as stars; click any point to fly the Finder there. Judges *see* why Atacama sits next to Jezero.

### 3.2 M2: Learned similarity weights · PyTorch/numpy logistic regression · ½ day · P0
- **Labels (positives)**: NASA-recognised analogue pairs: our 9 pairs in `lib/data/twins.ts` plus documented NASA
  analogue programmes (Devon Island/HMP, Atacama, McMurdo Dry Valleys, Rio Tinto, Svalbard/AMASE, Mauna Kea/PISCES,
  Kīlauea, Askja, Utah MDRS, Haughton) → about 20–25 (site, target) pairs.
- **Negatives**: random Earth cells per target (20:1).
- **Features**: per-dimension similarity (the same 7 dimensions the Finder already computes).
- **Model**: L2-regularised logistic regression, non-negative weights.
- **Validation**: leave-one-pair-out; report recall of the held-out analogue in Earth's top 5 %, against the
  hand-set default weights. Honest note on the page: ~25 labels is small, so these are *data-informed defaults*.
- **On the site**: a "Learned weights" button in the Finder, and the comparison on the Model Card.

### 3.3 M3: Lunar south-pole terrain classes and frost likelihood · ½–1 day · P1
- **Data** (all downloaded): Diviner PRP (max T, avg T, ice-stability depth), LOLA 240 m slope and elevation,
  Mini-RF CPR, + **LRO LEND** epithermal-neutron hydrogen map (new download, small, from PDS).
- **Unsupervised (certain to ship)**: Gaussian mixture model → polar terrain classes (sunlit ridge, cold trap,
  rough crater wall, smooth plain…), shown as a Moon Base layer.
- **Supervised (only if labels are obtained)**: labels = published Moon Mineralogy Mapper surface-ice detections
  (Li et al. 2018, *PNAS*). Model: gradient-boosted trees or a small MLP; **spatial block cross-validation** so
  neighbouring pixels never leak between train and test; report ROC-AUC. If the labels can't be obtained, we ship
  only the unsupervised classes and say so.

### 3.4 M4: Deep learning, a terrain-shape encoder trained by us · PyTorch CPU · 1 day · P1
- **Why**: the challenge says "think beyond visual similarity". Shape of the ground (crater, valley, plain) is
  physical, comparable across worlds, and not a photo.
- **Data**: elevation patches (64×64, normalised by their own relief so scale is comparable):
  Moon LOLA 240 m polar DEM (have), Mars MOLA (have), Earth **JAXA AW3D30** via the public JAXA Earth API
  (no login; new download at analogue sites + random land).
- **Model**: small convolutional autoencoder (≈200 k parameters) trained from scratch, ~20–40 k patches,
  ~15–30 min on CPU; 32-number embedding per patch.
- **Validation**: reconstruction error on held-out patches; retrieval test: do Earth crater patches (Haughton,
  Meteor Crater) retrieve lunar/Martian craters as nearest neighbours?
- **On the site**: "Terrain twins": pick a Moon/Mars spot, see the 6 Earth patches with the most similar shape.
  Exported to ONNX so it can even run in the browser (onnxruntime-web) for any clicked point.
- Optional add-on: pretrained **DINOv2-small** (ONNX, CPU) image embeddings of Worldview/Trek tiles as a separate,
  clearly-labelled "looks like" signal. Never mixed into the physical score.

### 3.5 Radar twins (CSA + NASA radar) · ½–1 day · P0 for partner relevance
- **Data**: Mini-RF CPR (have), **RCM compact-polarimetry** (our CH/CV sample over the Antarctic Peninsula +
  more from the CSA open-data folder), **RADARSAT-1** scenes over Devon Island / McMurdo / Atacama (open licence),
  processed following the **CSA SAR Python tutorial** (calibration to σ⁰, speckle filter, dB).
- **Science**: Mini-RF and RCM are both *compact-polarimetry* radars. True CPR needs the phase between channels,
  so it needs **SLC** products; our 3 samples are GRD (intensity only).
  - If CSA open data has an RCM compact-pol **SLC** sample → compute real CPR on Earth with the same Stokes
    formula as Mini-RF → **the same quantity on both worlds**.
  - If not → use calibrated backscatter and the cross-pol ratio as a roughness proxy, clearly labelled "not CPR".
- **On the site**: a Radar Twins section (Compare or its own page): Earth radar scene beside the Mini-RF crater,
  CPR histograms side by side, and the honest "rough rock or ice? radar alone can't tell" explanation.

### 3.6 Training data summary
| Model | Inputs | Labels | Source | Status |
|---|---|---|---|---|
| M1 Analogue Space | MODIS grid + targets | none (unsupervised) | Earthdata, PDS | data ready |
| M2 Learned weights | 7 similarity dims | ~25 NASA analogue pairs | twins.ts + NASA analogue programme | labels to compile |
| M3 Lunar classes / frost | PRP, LOLA, Mini-RF, LEND | M3 ice detections (optional) | PDS; Li et al. 2018 | LEND + labels to download |
| M4 Terrain encoder | DEM patches, 3 worlds | self-supervised | LOLA, MOLA, JAXA AW3D30 | Earth DEM to download |
| Radar twins | RCM, RADARSAT-1, Mini-RF | none | CSA open data, EODMS, PDS | SLC sample to find |

---

## 4. AI: the interactive features that impress judges

### 4.1 "Ask TwinWorlds", an AI mission analyst that uses our data · P0 · 1 day
- **Model**: Claude via the Anthropic API (a fast model for chat; a stronger one for dossiers), called only from a
  server route (`app/api/chat/route.ts`), key in `ANTHROPIC_API_KEY`, never sent to the browser.
- **Grounded by tools, not memory**: the model may only state numbers that come from tool calls into our own code:
  `run_finder(target, weights)`, `sample_point(world, lat, lon)` (every layer value), `score_site(site, mission)`,
  `compare(a, b)`, `get_dataset(id)`, `ml_result(model)`.
- **Agentic UI** (the wow moment): tools that **drive the website**: `fly_to(world, lat, lon)`,
  `set_finder(target, weights)`, `open_layer(id)`. A judge types "Where on Earth is most like a Mars base at
  Arcadia, and why?", and the Finder re-weights, the map flies, the answer cites datasets with badges.
- Streams answers; shows each tool call as a small "used: MODIS LST, Odyssey neutrons" chip.
- Guardrails: refuses to invent values, says "no data" when a tool returns null; English and **Urdu** replies;
  **voice input** with the browser's Web Speech API (free, no key).
- **Demo-safe**: suggested questions have cached answers, so the demo still works offline or if the key is
  rate-limited.
- **Eval**: 20 test questions with expected tool calls and numbers, run by a script before every deploy.

### 4.2 "Explain this point" · P0 · ½ day
Click anywhere on Moon Base, Explore or Finder → a 3-sentence plain-English briefing built from the sampled values
("Cold trap: annual max 62 K, ice stable at the surface; slope 3°; but 2 km from sunlight…").

### 4.3 AI Analogue Dossier · P1 · ½ day
One click on a Finder candidate → a shareable report page + PDF: similar / different / breaks down at / what to test
here / data used, written by the AI **from computed numbers only**, with every number linked to its dataset.

### 4.4 Model Card + "How the AI works" page · P1 · ¼ day
Each model's data, method, validation score and limits; what the chatbot can and can't do. Judges reward honesty.

---

## 5. Everything remaining, in priority order

| # | Item | Criterion | Size | Needs |
|---|---|---|---|---|
| 1 | **Deploy** (Vercel) + check every page on a real phone | Presentation | ¼ day | Vercel account |
| 2 | **Ask TwinWorlds** chat with tools + agentic UI (4.1) | Creativity, Presentation | 1 day | `ANTHROPIC_API_KEY` |
| 3 | **M1 Analogue Space** scatter (3.1) | Validity, Creativity | ½ day | nothing |
| 4 | **M2 Learned weights** + validation (3.2) | Validity | ½ day | compile analogue pair list |
| 5 | **Radar twins** with CSA RCM / RADARSAT-1 + SAR tutorial (3.5) | Relevance | ½–1 day | find RCM SLC sample; EODMS for RADARSAT-1 |
| 6 | **LEND** hydrogen layer (Moon Base, Finder ice dimension) | Relevance | ¼ day | PDS download (small) |
| 7 | Explain-this-point (4.2) | Presentation | ½ day | item 2 |
| 8 | Landing leads with Finder + Moon Base; guided **demo tour** | Presentation | ½ day | nothing |
| 9 | Compare: replace old tag Twin Finder with Finder link | Validity | ¼ day | nothing |
| 10 | **M4 Terrain encoder** (3.4) | Creativity, Validity | 1 day | JAXA AW3D30 patches |
| 11 | **M3 Lunar classes** (+ frost model if labels) (3.3) | Validity | ½–1 day | LEND; M3 labels optional |
| 12 | AI Dossier export (4.3) + Model Card (4.4) | Impact | ¾ day | items 2–4 |
| 13 | Games on real data (Touchdown on a real LOLA profile) | Creativity | ½ day | nothing |
| 14 | Urdu toggle for key pages + chat | Creativity | ½ day | translations |
| 15 | Visual QA pass of Finder + Data Lab on mobile | Presentation | ¼ day | nothing |
| 16 | Submission: 30-second video, slides, README, project page text | Presentation | ½ day | check current Space Apps rules |
| 17 | Earthdata login → 1 km MODIS + ASTER/SMAP (finer Finder) | Validity | ½ day | free Earthdata account |

**Done: 13 features** (8 from v1, 5 from v2) · **Remaining: 17 items** above (about 9–10 working days in total;
items 1–8 are the "must ship" core, about 4–5 days).

---

## 6. Decisions needed from the team
1. **AI key**: is there an Anthropic API key (or should the chat run in demo mode with cached answers only)?
2. **Deadline**: how many days until submission? That decides where to cut the list in section 5.
3. **Accounts**: Earthdata Login (unlocks 4 datasets) and EODMS (RADARSAT-1); both free.
4. **Deploy target**: Vercel (recommended, works with Next.js 16 as-is).

---

## 7. UI readiness for ML models and AI (AWS Bedrock or any provider)

Live site: https://nasa-space-app-hazel-three.vercel.app (all 13 pages and data files return 200, checked 2026-11-13).

Goal: build the UI and the "sockets" now, so a trained model or an AI provider can be plugged in later by adding a
data file or an environment variable, with no UI rework. Until then every socket shows an honest "demo" or
"coming soon" state.

### 7.1 Foundations (build first, everything else uses them)
| # | What | Where | Why |
|---|---|---|---|
| F1 | **AI provider layer**: one `AIProvider` interface, implementations `bedrock` (AWS SDK Bedrock Runtime, Converse/ConverseStream with tool use), `anthropic`, `mock` (cached answers). Chosen by `AI_PROVIDER` env | `lib/ai/provider/*` | Swap Bedrock ↔ Anthropic ↔ demo without touching UI |
| F2 | **Streaming chat route** (server only; keys never reach the browser) | `app/api/ai/chat/route.ts` | Bedrock credentials stay on Vercel |
| F3 | **Tool registry** shared by server and UI: data tools (`run_finder`, `sample_point`, `score_site`, `compare`, `get_dataset`, `ml_result`) and UI tools (`fly_to`, `set_finder`, `open_layer`, `open_site`, `set_mission`) | `lib/ai/tools.ts` | AI answers only with our numbers and can drive the site |
| F4 | **Page context store**: each page publishes what's on screen (world, site, Finder target and weights, map centre, active layer, clicked point) | `lib/ai/context.ts` (Zustand) | "Explain *this*" works everywhere |
| F5 | **UI action bus**: pages subscribe to AI actions, animate the change, and show an "Undo" toast | `lib/ai/actions.ts` + Sonner | Agentic UI, safe and reversible |
| F6 | **ML model registry**: `public/data/ml/<model>/model-card.json` (status planned/ready, metrics, data, limits, output files) read by a typed loader | `lib/ml/registry.ts` | Drop in a trained model's files and the UI lights up |
| F7 | **Badge system**, four kinds that look clearly different: *Measured* (dataset), *Rule*, *ML estimate* (model + score), *AI-written* | `components/ui/provenance-badge.tsx` | Judges always see where a number came from |
| F8 | **Feature flags**: `NEXT_PUBLIC_AI_ENABLED`, `NEXT_PUBLIC_ML_ENABLED`, demo mode | `lib/flags.ts` | Ship sockets before models exist |

Environment variables (Vercel → Settings → Environment Variables): `AI_PROVIDER=bedrock`, `AWS_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (an IAM user allowed only `bedrock:InvokeModel*`), `BEDROCK_MODEL_ID`;
or `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`; or `AI_PROVIDER=mock`.

### 7.2 AI interface (global)
| # | UI update | Details |
|---|---|---|
| A1 | **"Ask TwinWorlds" dock** on every page | Floating button + side panel on desktop, bottom sheet (vaul) on mobile; shortcut Ctrl+J; also "Ask AI…" in Ctrl+K search |
| A2 | Chat messages | Streaming text, tool-call chips ("used: MODIS LST, Odyssey neutrons"), provenance badges on numbers, "AI-written" label, copy, thumbs up/down |
| A3 | Suggested questions per page | e.g. Finder: "Why is Atacama a match for Jezero?"; Moon Base: "Best Artemis region for a base?" |
| A4 | Voice + language | Mic button (browser Web Speech API), EN / اردو toggle (RTL already set up in shadcn) |
| A5 | States | Demo-mode banner, thinking, streaming, tool running, no-data, rate-limited, offline, error + retry; `aria-live` for screen readers |
| A6 | Landing entry | Hero "Ask TwinWorlds" input + Finder and Moon Base teaser cards |

### 7.3 Per-page updates
| Page | AI sockets | ML sockets |
|---|---|---|
| **Finder** | "Explain this match" on candidate cards; **Generate dossier** button | Weights toggle *Default ↔ Learned (M2)*; **Analogue Space** tab (M1 scatter); **Terrain twins** strip in candidate card (M4) |
| **Moon Base** | "Explain this point" in the readout | New layer group **Model estimates**: terrain classes (M3), frost likelihood (M3), with ML badge and uncertainty legend |
| **Explore 2D** | "Explain this point" next to the pinned value | ML layers appear in the Science list from the registry |
| **Score** | "Why this score?" per factor | Optional ML factor slot (e.g. frost likelihood) with ML badge |
| **Compare** | "Ask about this pair" | **Radar twins** section (RCM / RADARSAT-1 vs Mini-RF) |
| **Data Lab** | — | Models listed next to the datasets they were trained on |
| **New `/models`** | "How the AI works": tools it can use, what it refuses | **Model cards**: data, method, validation score, limits, status |
| **New `/dossier?…`** | AI-written report from computed numbers only | Embeds ML results; print styles → PDF |

### 7.4 Order of work
1. F1–F8 with `AI_PROVIDER=mock` (fully demoable, no AWS needed).
2. A1–A5 dock + Finder/Moon Base "Explain" buttons.
3. Plug in Bedrock (env vars only) → run the 20-question eval.
4. As each model in §3 is trained, drop its files into `public/data/ml/` → its UI socket turns on.
