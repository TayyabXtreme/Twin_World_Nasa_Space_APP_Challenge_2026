# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: NASA Space Apps Challenge 2026 judges evaluating the prototype in a few minutes, usually on a laptop, often in a quick demo or a link opened between other entries. Secondary: students and curious members of the public who explore longer and want to learn by doing.

## Product Purpose

TwinWorlds lets people explore Earth, the Moon and Mars side by side and discover the places on Earth (analogues) that NASA uses to study the Moon and Mars. Visitors hover countries and craters, open site details (geology, terrain, elevation, resources), compare an Earth place with a lunar or Martian site, check a mission suitability score, and play a survival challenge. Success: within the first screen a judge understands what it is and starts exploring a world; the product feels like hands-on exploration rather than a page of information.

## Positioning

Explore-and-compare built on real NASA data, with scientific honesty as a feature: every comparison names the specific feature being compared and shows the important difference, and every fact carries an evidence level (confirmed, evidence for, candidate, educational estimate) and a source. Terrain numbers (elevation, slope) are computed live from LOLA and MOLA elevation data.

## Operating Context

Judged as a hackathon entry: short demo video, a deployed URL opened in a browser, a 2-minute walkthrough. Runs on mid-range laptops and phones, sometimes on slow networks.

## Capabilities and Constraints

- Routes: landing, /explore/{earth,moon,mars} (3D globe and 2D NASA map), /compare, /score, /slider, /challenge, /learn, /about.
- Primary action on the landing page: choose a world and start exploring it.
- Loading/boot animation: plays on first visit per browser session, skippable by click or key, never blocks returning visitors.
- Performance: landing page must stay light; three.js and Leaflet load only on Explore. Texture tiers 1k/2k/4k by device.
- Data sources: NASA Trek, NASA GIBS, LRO LOLA/LROC, MGS MOLA, NASA Image Library, USGS planetary nomenclature, Natural Earth.
- Undecided: Urdu translation scope; Cesium terrain-fly mode (optional).

## Brand Commitments

- Name: TwinWorlds.
- The user asked for a space theme with an imaginative, lightweight solar-system visual on the landing page.
- Earth, Moon and Mars are always clearly labeled and kept separate; each world keeps one identity color everywhere.

## Evidence on Hand

- Research brief: `Mars_Moon_Earth_Analogue_Research_NASA_Sources(1)_261111_200514.pdf` (NASA-sourced analogue list and cautions).
- NASA imagery and data in `assets-raw/` with credits (`photos/**/CREDITS.csv`, `data/SOURCES.txt`, `textures/SOURCES_ELEVATION.txt`).
- No testimonials, users, partners, awards or usage numbers exist: never invent them.

## Product Principles

1. Explore first, read second: every screen invites an action.
2. Never overclaim: name the compared feature, show the difference, tag the evidence.
3. Every number and image traces to a source.
4. Fast on modest hardware; heavy things load only when asked for.
5. Judge-readable in seconds, rewarding to stay in for minutes.

## Accessibility & Inclusion

Keyboard navigable, reduced-motion respected, color never the only signal (worlds carry names and glyphs). Urdu (RTL) support planned.
