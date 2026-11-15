import type Anthropic from "@anthropic-ai/sdk";
import { FINDER_TARGETS, PAGES, PIN_IDS, LAYER_IDS, REGION_IDS, SITE_IDS } from "@/lib/rovi/catalog";
import type { Explainer, MissionId, RoviAction } from "@/lib/rovi/types";
import { DIM_IDS, type DimId } from "@/lib/finder/types";
import type { Mission } from "@/lib/score";
import type { World } from "@/lib/worlds";
import {
  artemisRegions,
  compareSites,
  findAnalogues,
  getDataset,
  layerFacts,
  listSites,
  MISSION_IDS,
  pinFacts,
  regionFacts,
  sampleMoonPoint,
  scoreSiteTool,
  ToolInputError,
} from "./data";

/**
 * Rovi's tools for Claude. Data tools run here and return compact JSON; action tools do nothing on the server: they
 * become RoviActions streamed to the browser, which animates them with Undo (lib/rovi/actions.ts). Every schema is
 * strict and names only ids that exist (lib/rovi/catalog.ts). Tool order is fixed so the prompt cache stays warm.
 */

const WORLDS = ["earth", "moon", "mars"];
const TARGET_IDS = Object.keys(FINDER_TARGETS);

type Schema = Anthropic.Tool.InputSchema;
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string, values?: string[]) => (values ? { type: "string", enum: values, description } : { type: "string", description });
const num = (description: string) => ({ type: "number", description });

function tool(name: string, description: string, input_schema: Schema): Anthropic.Tool {
  return { name, description, input_schema, strict: true };
}

export const TOOLS: Anthropic.Tool[] = [
  /* ---------- data ---------- */
  tool(
    "find_analogues",
    "Rank every land cell on Earth against a Moon or Mars target with NASA measurements (the Analog Finder). Returns the top places with 0-100 similarity scores.",
    obj({
      target_id: str("Finder target", TARGET_IDS),
      weights: {
        type: "array",
        description:
          "Optional weight overrides, 0 to 1. Empty = defaults. Parameters: tmean mean temperature, trange temperature range, radiation dose, slope, sand soil composition, pressure, daylight, precip precipitation, rh humidity, aod dust, isolation, elev elevation, water aqueous geochemistry.",
        items: obj({ dim: str("Parameter", DIM_IDS), weight: num("0 to 1") }),
      },
      top: num("How many places, 1-8 (default 5)"),
    }),
  ),
  tool(
    "sample_moon_point",
    "Read every NASA LRO layer (elevation, slope, temperature, ice depth, cold traps, radar, hydrogen) at a lunar south-pole point, 75°S-90°S, plus the nearest Artemis III region.",
    obj({ lat: num("Latitude, -90 to -75"), lon: num("Longitude, -180 to 180") }),
  ),
  tool(
    "list_artemis_regions",
    "NASA's nine Artemis III candidate regions with approximate centres (for sample_moon_point or place_moon_base).",
    obj({}),
  ),
  tool(
    "score_site",
    "Mission Score (0-100) of a Moon or Mars site for landing, rover driving or a human base, with each factor and its basis.",
    obj({ site_id: str("Moon or Mars site", SITE_IDS.filter((id) => !id.startsWith("earth-"))), mission: str("Mission", MISSION_IDS) }),
  ),
  tool(
    "compare_sites",
    "Side-by-side facts and measured values for two sites, plus the analogue link between them if NASA or TwinWorlds pairs them.",
    obj({ a: str("First site", SITE_IDS), b: str("Second site", SITE_IDS) }),
  ),
  tool("get_dataset", "Look up a NASA/CSA/ESA/JAXA dataset the site uses: what it measures, resolution, caveats, link.", obj({ query: str("Dataset id, instrument or mission name") })),
  tool("list_sites", "List TwinWorlds' comparison sites, optionally for one world.", obj({ world: str("World, or 'all'", [...WORLDS, "all"]) })),

  /* ---------- actions on the user's screen ---------- */
  tool("navigate", "Open a page of the site.", obj({ page: str("Path", PAGES) })),
  tool("fly_globe", "Fly the 3D globe to a site, Earth place or landing and open its card.", obj({ world: str("World", WORLDS), pin_id: str("Pin", PIN_IDS) })),
  tool("open_map_layer", "Show a NASA map layer on the 2D map of a world.", obj({ world: str("World", WORLDS), layer_id: str("Layer", LAYER_IDS) })),
  tool(
    "set_finder",
    "Point the Analog Finder page at a target and/or set its weight sliders.",
    obj({
      target_id: str("Target, or 'current' to keep it", [...TARGET_IDS, "current"]),
      weights: { type: "array", description: "Slider changes, 0 to 1; empty for none", items: obj({ dim: str("Parameter", DIM_IDS), weight: num("0 to 1") }) },
    }),
  ),
  tool("place_moon_base", "Pin a Moon base at an Artemis III region on the south-pole map.", obj({ region_id: str("Region", REGION_IDS) })),
  tool("start_game", "Start a Mission Challenge game.", obj({ mission: str("guess=Earth or Elsewhere, scout=Moon Base Scout, land=Touchdown, rover=Sample Run, launch=Launch Window", ["guess", "scout", "land", "rover", "launch"]) })),
  tool("start_tour", "site = guided tour of TwinWorlds; globe = cinematic tour of the Earth globe.", obj({ tour: str("Tour", ["site", "globe"]) })),
  tool(
    "show_explainer",
    "Show an interactive explainer card in the chat when the user wants to learn how something works: the answer, 3-5 steps, and a small flow diagram (2-6 nodes) whose nodes light up per step.",
    obj({
      title: str("Short title"),
      answer: str("The conclusion in one sentence"),
      nodes: { type: "array", items: obj({ id: str("Short id"), label: str("2-4 words"), kind: str("Kind", ["data", "process", "result", "place"]) }) },
      edges: { type: "array", items: obj({ from: str("Node id"), to: str("Node id"), label: str("Optional, may be empty") }) },
      steps: { type: "array", items: obj({ title: str("2-5 words"), text: str("One or two plain sentences"), nodes: { type: "array", items: str("Node id") } }) },
    }),
  ),
];

/** Friendly progress line shown while a data tool runs. */
export const STATUS: Record<string, string> = {
  find_analogues: "Ranking Earth's land with NASA data…",
  sample_moon_point: "Reading LRO layers at that spot…",
  list_artemis_regions: "Looking up Artemis III regions…",
  score_site: "Working out the Mission Score…",
  compare_sites: "Comparing the two sites…",
  get_dataset: "Checking the data catalogue…",
  list_sites: "Listing sites…",
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
function weightMap(list: unknown): Partial<Record<DimId, number>> | undefined {
  if (!Array.isArray(list) || !list.length) return undefined;
  const out: Partial<Record<DimId, number>> = {};
  for (const w of list as { dim: DimId; weight: number }[]) if (DIM_IDS.includes(w.dim)) out[w.dim] = clamp01(w.weight);
  return Object.keys(out).length ? out : undefined;
}

export type ToolOutcome =
  | { kind: "data"; result: string; isError?: boolean }
  | { kind: "action"; action: RoviAction; result: string }
  | { kind: "explainer"; explainer: Explainer; result: string };

const DONE = "Done on the user's screen.";

/** Run one tool call. Never throws for bad input: the model gets an error result and can try again. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- inputs are validated by strict schemas plus the checks below
export async function runTool(name: string, input: any): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "find_analogues":
        return data(await findAnalogues(input.target_id, weightMap(input.weights), Math.round(input.top || 5)));
      case "sample_moon_point":
        return data(await sampleMoonPoint(Number(input.lat), Number(input.lon)));
      case "list_artemis_regions":
        return data(artemisRegions());
      case "score_site":
        return data(scoreSiteTool(input.site_id, input.mission as Mission));
      case "compare_sites":
        return data(compareSites(input.a, input.b));
      case "get_dataset":
        return data(getDataset(String(input.query)));
      case "list_sites":
        return data(listSites(input.world === "all" ? undefined : (input.world as World)));

      case "navigate":
        return act({ type: "navigate", href: input.page });
      case "fly_globe":
        return act({ type: "flyGlobe", world: input.world, id: input.pin_id }, pinFacts(input.pin_id));
      case "open_map_layer":
        return act({ type: "openLayer", world: input.world, layerId: input.layer_id }, await layerFacts(input.layer_id));
      case "set_finder":
        return act({ type: "setFinder", targetId: input.target_id === "current" ? undefined : input.target_id, weights: weightMap(input.weights) });
      case "place_moon_base":
        return act({ type: "placeMoonBase", regionId: input.region_id }, regionFacts(input.region_id));
      case "start_game":
        return act({ type: "startGame", mission: input.mission as MissionId });
      case "start_tour":
        return act({ type: "startTour", tour: input.tour });
      case "show_explainer": {
        const e = input as Explainer;
        const ids = new Set(e.nodes.map((n) => n.id));
        const explainer: Explainer = {
          ...e,
          nodes: e.nodes.slice(0, 6),
          edges: e.edges.filter((x) => ids.has(x.from) && ids.has(x.to)),
          steps: e.steps.slice(0, 5).map((s) => ({ ...s, nodes: s.nodes.filter((n) => ids.has(n)) })),
        };
        return { kind: "explainer", explainer, result: "Explainer shown. Now reply with one or two sentences only." };
      }
      default:
        return { kind: "data", result: `Unknown tool ${name}`, isError: true };
    }
  } catch (e) {
    if (e instanceof ToolInputError) return { kind: "data", result: e.message, isError: true };
    console.error(`[rovi] tool ${name} failed`, e);
    return { kind: "data", result: "That tool failed on the server. Answer without it, and do not guess numbers.", isError: true };
  }
}

const data = (v: unknown): ToolOutcome => ({ kind: "data", result: JSON.stringify(v) });
/** A screen action; `facts` (what the opened card or legend says) lets Rovi describe it without guessing. */
const act = (action: RoviAction, facts?: unknown): ToolOutcome => ({
  kind: "action",
  action,
  result: facts ? JSON.stringify({ status: DONE, showing: facts }) : DONE,
});
