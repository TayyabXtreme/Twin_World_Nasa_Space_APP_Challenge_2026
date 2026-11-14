# TwinWorlds: showcase plan (features that impress judges)

Written 2026-11-14. Builds on `plan-final.md`; this file covers the "wow" layer: a living globe, a real backend,
an AI robot that acts on the site, an MCP server, and cinematic loading and transitions.

Facts checked before planning: React `<ViewTransition>` works in Next.js 16.4 with no config
(`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`); packages available: `convex` 1.50,
`mcp-handler` 2.4, `@modelcontextprotocol/sdk` 1.32, `@anthropic-ai/bedrock-sdk` 1.1.

---

## 1. Mission Control Globe (Explore 3D upgrade)  ·  ~1.5 days  ·  P0

The 3D Earth becomes a story map: every pin is a real place where something happened, with a photo.

| Layer | Pins | Card shows |
|---|---|---|
| **Analogue sites** | Atacama, Devon Island, McMurdo, Iceland, Hawaiʻi, Death Valley, Rio Tinto, Svalbard, Utah MDRS… | NASA photo, what NASA tested there, its Moon/Mars twin, "Open in Compare / Finder" |
| **Pakistan** | Hingol, Cholistan, Thar, Khewra, SUPARCO | Photo, Finder score, why it's an analogue |
| **Field campaigns** | Haughton-Mars Project, Desert RATS (Arizona), Artemis II geology training (Iceland), PISCES (Hawaiʻi), NEEMO (underwater) | Year, mission, photo |
| **Launch sites** | Kennedy, Baikonur, Kourou, Sriharikota, Jiuquan, Tanegashima | Famous launches, photo |
| **Deep Space Network** | Goldstone, Madrid, Canberra | Animated signal arcs to the Moon and Mars |
| **Live ISS** | ISS position computed from its public orbit data (TLE) | Moving pin with orbit trail |

- **Twin arcs:** select an analogue and a glowing arc rises from the Earth site toward the Moon or Mars, labelled with
  the shared feature.
- **Moon and Mars globes, exploration history:** every landing (Apollo 11–17, Luna, Chang'e 3–6, Chandrayaan-3, SLIM;
  Viking, Pathfinder, Spirit, Opportunity, Phoenix, Curiosity, InSight, Perseverance, Zhurong) with date and photo,
  plus a **timeline slider 1969 → 2026** that drops pins in order.
- **Cinematic tour** button: the camera flies pin to pin with captions (also used by the robot, §4).
- Photos from the NASA Image Library (same fetch script as Challenge), credited on every card.

## 2. Convex backend and database  ·  ~1 day  ·  P0

Convex gives a real-time database, server functions and file storage in TypeScript, with a free tier and Vercel
deployment. Everything stays anonymous (a display name, no login).

| Table | Powers |
|---|---|
| `scores` | **Global leaderboards** on /challenge, updating live (game, name, country, score) |
| `shares` | **Shareable results**: a Finder ranking, a Moon base site or a game result gets a short link and preview image |
| `suggestions` | **"Suggest an analogue"**: drop a pin, add a reason and a photo (file storage); others upvote; the Finder scores it |
| `activity` | **Live mission log** on the landing page ("Someone in Lahore scored 92 on Moon Base Scout") |
| `conversations` | The AI robot's memory and the 20-question evaluation log |

- Rate limiting and a word filter on anything user-written; nothing personal is stored.
- Setup needs a free Convex account: you run `npx convex dev` once to log in (it opens a browser).

## 3. TwinWorlds MCP server  ·  ~½ day  ·  P1

An MCP endpoint at `/api/mcp` (Streamable HTTP, `mcp-handler` + MCP SDK) so any AI assistant (Claude Desktop,
claude.ai custom connectors, other MCP clients) can use TwinWorlds' data directly.

- **Tools:** `find_analogues(target, weights)`, `sample_moon_point(lat, lon)`, `score_site(site, mission)`,
  `compare_sites(a, b)`, `get_dataset(id)`, `list_sites(world)`.
- **Resources:** the dataset catalogue and method notes.
- **The same tool layer powers the in-site robot** (§4): one source of truth, so the robot and external AIs give the
  same answers.
- **Demo for judges:** "Connect Claude to TwinWorlds" in two clicks, then ask "Which Earth place is most like a Moon
  base at Haworth, and why?" in Claude.

## 4. "Rovi", the AI mission robot  ·  ~1.5 days  ·  P0

A small animated robot that lives in the corner of every page, talks, and **does things on the site**.

- **Look:** built in 3D (react-three-fiber, already in the project): round head, glowing eyes that blink and follow the
  cursor, antenna that pulses while thinking, mouth bar that moves while speaking. Light: no new model download.
- **Acts (tool calls executed in the browser):** go to a page, fly the globe to a place, open a map layer, set the
  Finder target and weights, place a Moon base, start a game, start the cinematic tour.
- **Points at things:** a spotlight ring highlights the button or panel it is talking about (coach marks).
- **Guided tour mode:** "Show me around" → Rovi walks the judge through Finder → Moon Base → Radar Twins → Challenge.
- **Voice:** speech in and out with the browser's own speech APIs (free, no key); English and Urdu.
- **Brain:** Claude Opus 5.5 on AWS Bedrock (`anthropic.claude-opus-5-5`) via a server route, streaming, tools from §3;
  it may only quote numbers that come from tools. **Demo mode** with scripted answers when no key is set.
- Every action animates and has **Undo**.

## 5. Rocket loading screen and cinematic transitions  ·  ~1 day  ·  P0

- **Rocket launch loader** (first visit in a session): countdown T-3…1, engine glow, smoke particles, lift-off; the
  progress bar follows real asset loading. Skippable; reduced-motion users get a calm fade.
- **Route transitions with React `<ViewTransition>`:**
  - a warp / star-streak transition between pages,
  - shared-element morphs: a mission card's photo grows into the game stage; a landing feature card grows into its page
    hero; a globe pin card grows into the Compare page,
  - directional slides for forward and back.
- **Per-route loading screens** (`loading.tsx`): a small orbiting-rocket loader in place of "Loading…".
- **Small touches:** scroll-progress rocket in the top bar; a satellite that orbits the cursor on the landing hero;
  confetti on a new high score (already a dependency).
- All animations use transform and opacity only, and respect reduced motion.

## 6. Real About page  ·  ~½ day  ·  P0

- The story: why Earth analogues matter for a permanent Moon base and Mars.
- **Team** cards (names, roles, photos, links).
- Method in one diagram: data → processing → scoring → limits.
- Data credits by agency, the Space Apps challenge statement, the Pakistan angle, GitHub link.
- A build timeline (what we made, day by day).

---

## Order of work (about 6 days)

| Day | Work |
|---|---|
| 1 | Rocket loader, view transitions, per-route loaders, About page |
| 2–3 | Mission Control Globe: pin layers with photos, twin arcs, exploration-history timeline, ISS, cinematic tour |
| 4 | Convex: leaderboards, share links, live mission log, suggest-an-analogue |
| 5 | Rovi robot: 3D character, chat panel, site actions, tour, voice; demo mode |
| 6 | MCP server + Bedrock connection, evaluation run, polish, video |

## Needed from the team

1. **Convex:** create a free account and run `npx convex dev` once (browser login).
2. **AWS Bedrock:** region with Claude Opus 5.5 enabled, plus an IAM access key for the robot.
3. **About page:** team names, roles, photos (or initials), links.
4. **Robot:** keep the name "Rovi", or choose another.
