import { DATASETS, formatMetric, gapNote, measured, type DatasetId } from "./data/metrics";
import { terrainFor } from "./data/sites";
import type { Evidence, Site } from "./data/types";

/**
 * Mission Suitability Score: an educational 0–100 index, not NASA site selection.
 * Factors use measured NASA values where we have them (LOLA, Diviner, Mini-RF, Odyssey GRS/NS, MGS TES, MOLA)
 * and fall back to a plain rule on the site's sourced facts otherwise. Each result says which it is.
 */

export type Mission = "landing" | "rover" | "human";
export type FactorId =
  | "slope"
  | "roughness"
  | "rocks"
  | "radar"
  | "hazards"
  | "air"
  | "power"
  | "comms"
  | "dust"
  | "water"
  | "temperature"
  | "science";
export type Confidence = "high" | "medium" | "low";
/**
 * measured: the value comes from a NASA dataset at this site.
 * context:  the value is still the rule, but a dataset is shown alongside to explain it.
 * rule:     a rule on the site's listed facts.
 */
export type Basis = "measured" | "context" | "rule";

export interface FactorResult {
  id: FactorId;
  value: number;
  confidence: Confidence;
  why: string;
  basis: Basis;
  /** Datasets behind the value (measured) or shown alongside it (context). */
  datasets: DatasetId[];
}

export const FACTOR_INFO: Record<FactorId, { label: string; rule: string }> = {
  slope: {
    label: "Slope safety",
    rule: "1 at 2° or less, falling to 0 at 15°. Polar Moon sites: mean slope within 1 km on the LOLA 240 m polar map; elsewhere the regional slope from 16 px/° LOLA/MOLA grids.",
  },
  roughness: {
    label: "Smooth ground",
    rule: "1 for ±20 m roughness, falling to 0 at ±400 m (spread of elevation around the site).",
  },
  rocks: {
    label: "Few boulders",
    rule: "Moon only, from Diviner rock abundance: 1 when 0.5 % or less of the ground is covered by metre-size rocks (typical plains), 0 at 5 % or more (fresh crater ejecta). The map covers 60°S–60°N only.",
  },
  radar: {
    label: "Radar smoothness",
    rule: "Moon only, from Mini-RF CPR averaged within 3 km: 1 at CPR 0.4 or less, 0 at 1.2. High CPR means rough, blocky ground or possibly ice, which radar alone cannot separate, so this factor always has low confidence.",
  },
  hazards: {
    label: "Known local hazards",
    rule: "1 with none listed; −0.25 for each of steep walls, collapse, rocks or loose sand (small features the terrain grids cannot see).",
  },
  air: {
    label: "Air to slow a landing",
    rule: "Mars only: lower ground has more air above it. 1 at −7 km, 0 at +2 km (MOLA elevation).",
  },
  power: {
    label: "Sunlight for power",
    rule: "Moon: long-sunlit polar ridges score high, a 14-day lunar night scores low. Mars: falls with latitude, less in dusty regions.",
  },
  comms: {
    label: "Contact with Earth",
    rule: "Moon: Earth stays in view from the near side; it sits low on the horizon at the pole. Mars: relay orbiters (simplified).",
  },
  dust: {
    label: "Firm, clean ground",
    rule: "Lower when dust storms, loose sand or clinging dust are listed hazards.",
  },
  water: {
    label: "Water or ice nearby",
    rule: "Mars: Odyssey neutron counts scaled from 0 at the driest 2 % of Mars to 1 at the most hydrogen-rich 2 %. Moon (Diviner Polar Resource Product, 5 km around the site): 0.15 + 0.55 × the share where ice is thermally stable in the top ~3 m + 0.3 × the share of cold traps that never top 110 K. Without data: confirmed 1, evidence for 0.75, candidate 0.5, none 0.15.",
  },
  temperature: {
    label: "Temperature stress",
    rule: "Moon polar sites with Diviner data: 1 when the annual average is 250 K, falling by 0.1 per 20 K away from it, minus 0.1 if the ground tops 350 K. Otherwise extreme cold 0.3, cold 0.5, else 0.7.",
  },
  science: {
    label: "Science value",
    rule: "More science features (delta, ancient water, shadowed ice, lava tubes, layered rock…) score higher.",
  },
};

export const MISSIONS: Record<Mission, { label: string; weights: Partial<Record<FactorId, number>> }> = {
  landing: {
    label: "Landing",
    weights: {
      slope: 0.25,
      roughness: 0.15,
      rocks: 0.1,
      hazards: 0.15,
      air: 0.15,
      power: 0.15,
      comms: 0.15,
      radar: 0.05,
    },
  },
  rover: {
    label: "Rover driving",
    weights: { slope: 0.3, roughness: 0.2, rocks: 0.15, hazards: 0.15, dust: 0.15, power: 0.2, radar: 0.05 },
  },
  human: {
    label: "Human base",
    weights: { water: 0.25, power: 0.2, temperature: 0.15, comms: 0.15, slope: 0.15, science: 0.1 },
  },
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const EVIDENCE_VALUE: Record<Evidence, number> = { confirmed: 1, evidence_for: 0.75, candidate: 0.5, estimate: 0.4 };
const SCIENCE_TAGS = new Set([
  "delta",
  "lakebed",
  "ancient-water",
  "psr",
  "ice",
  "lava-tube",
  "sediment-layers",
  "perchlorate",
  "ground-ice",
  "minerals",
  "life-detection",
]);
const terrainDataset = (site: Site): DatasetId[] => (site.world === "mars" ? ["mola"] : ["lola-svs"]);

function waterRule(site: Site, datasets: DatasetId[] = [], extra = ""): FactorResult {
  const watery = site.resources.filter((r) => /ice|water|lake/i.test(r.label));
  const basis: Basis = datasets.length ? "context" : "rule";
  if (!watery.length)
    return {
      id: "water",
      value: 0.15,
      confidence: "medium",
      why: `No water or ice listed for this site.${extra}`,
      basis,
      datasets,
    };
  const best = watery.reduce((a, r) => (EVIDENCE_VALUE[r.evidence] > EVIDENCE_VALUE[a.evidence] ? r : a));
  return {
    id: "water",
    value: EVIDENCE_VALUE[best.evidence],
    confidence: best.evidence === "confirmed" ? "high" : "medium",
    why: `${best.label}.${extra}`,
    basis,
    datasets,
  };
}

export function factor(site: Site, id: FactorId): FactorResult | null {
  const t = terrainFor(site.id);
  const has = (h: string) => site.hazards.includes(h);
  switch (id) {
    case "slope": {
      const lola = measured(site.id, "slopeLOLA");
      if (lola) {
        const p90 = lola.p90 !== undefined ? ` 90 % of it is under ${lola.p90}°.` : "";
        return {
          id,
          value: clamp(1 - (lola.value - 2) / 13),
          confidence: "high",
          why: `Mean slope ${formatMetric("slopeLOLA", lola)} within 1 km on the LOLA 240 m polar map.${p90}`,
          basis: "measured",
          datasets: ["lola-polar"],
        };
      }
      if (!t || t.slopeDeg === null)
        return {
          id,
          value: 0.5,
          confidence: "low",
          why: "No reliable slope this close to the pole, so a neutral 0.5 is used.",
          basis: "rule",
          datasets: [],
        };
      return {
        id,
        value: clamp(1 - (t.slopeDeg - 2) / 13),
        confidence: "high",
        why: `Regional slope ${t.slopeDeg}° from ${t.source}.`,
        basis: "measured",
        datasets: terrainDataset(site),
      };
    }
    case "roughness":
      if (!t) return null;
      return {
        id,
        value: clamp(1 - (t.roughnessM - 20) / 380),
        confidence: "high",
        why: `Elevation varies about ±${t.roughnessM} m around the site.`,
        basis: "measured",
        datasets: terrainDataset(site),
      };
    case "rocks": {
      const ra = measured(site.id, "rockAbundance");
      if (!ra) return null;
      return {
        id,
        value: clamp(1 - (ra.value - 0.5) / 4.5),
        confidence: "high",
        why: `Rocks larger than ~1 m cover ${formatMetric("rockAbundance", ra, 2)} of the ground within 3 km (Diviner, ~950 m pixels; single boulders are not resolved).`,
        basis: "measured",
        datasets: ["diviner-gdr"],
      };
    }
    case "radar": {
      const cpr = measured(site.id, "cprMiniRF");
      if (!cpr) return null;
      const high = cpr.highShare !== undefined ? `, ${Math.round(cpr.highShare * 100)} % of it above 1` : "";
      return {
        id,
        value: clamp(1 - (cpr.value - 0.4) / 0.8),
        confidence: "low",
        why: `Mean CPR ${formatMetric("cprMiniRF", cpr)} within 3 km${high}. High CPR can mean blocky ground or ice; radar alone cannot tell which.`,
        basis: "measured",
        datasets: ["minirf-cpr"],
      };
    }
    case "hazards": {
      const local = ["steep-slopes", "collapse", "rocks", "sand"].filter(has);
      const names: Record<string, string> = {
        "steep-slopes": "steep walls or slopes",
        collapse: "collapse risk",
        rocks: "rocks",
        sand: "loose sand",
      };
      return {
        id,
        value: clamp(1 - 0.25 * local.length),
        confidence: "medium",
        why: local.length ? `Listed: ${local.map((h) => names[h]).join(", ")}.` : "No small-scale hazards listed.",
        basis: "rule",
        datasets: [],
      };
    }
    case "air":
      if (site.world !== "mars" || !t) return null;
      return {
        id,
        value: clamp((2000 - t.elevationM) / 9000),
        confidence: "high",
        why: `Elevation ${t.elevationM.toLocaleString("en-GB")} m on MOLA.`,
        basis: "measured",
        datasets: ["mola"],
      };
    case "power":
      if (site.world === "moon") {
        const polar = site.tags.includes("polar");
        return polar
          ? {
              id,
              value: 0.8,
              confidence: "medium",
              why: "Polar ridges can see the Sun for long periods (NASA).",
              basis: "rule",
              datasets: [],
            }
          : {
              id,
              value: 0.35,
              confidence: "medium",
              why: "Away from the poles, night lasts about 14 Earth days.",
              basis: "rule",
              datasets: [],
            };
      }
      return {
        id,
        value: clamp(1 - (Math.abs(site.lat) / 90) * 0.7 - (has("dust-storms") ? 0.1 : 0)),
        confidence: "medium",
        why: `Latitude ${Math.abs(site.lat).toFixed(0)}°${has("dust-storms") ? ", dust storms reduce sunlight" : ""}.`,
        basis: "rule",
        datasets: [],
      };
    case "comms":
      if (site.world === "moon")
        return site.tags.includes("polar")
          ? {
              id,
              value: 0.55,
              confidence: "low",
              why: "Earth sits low on the horizon at the pole; terrain can block it.",
              basis: "rule",
              datasets: [],
            }
          : {
              id,
              value: 0.9,
              confidence: "medium",
              why: "On the near side, Earth stays in the sky.",
              basis: "rule",
              datasets: [],
            };
      return {
        id,
        value: 0.7,
        confidence: "low",
        why: "Simplified: relays through Mars orbiters.",
        basis: "rule",
        datasets: [],
      };
    case "dust": {
      const value = has("sand") ? 0.45 : has("dust-storms") ? 0.6 : has("dust") ? 0.65 : 0.85;
      return {
        id,
        value,
        confidence: "medium",
        why: has("sand")
          ? "Loose sand and dunes on the route."
          : has("dust-storms")
            ? "Dust storms are a listed hazard."
            : has("dust")
              ? "Fine, clinging regolith dust."
              : "No dust hazard listed.",
        basis: "rule",
        datasets: [],
      };
    }
    case "water": {
      if (site.world === "mars") {
        const ns = measured(site.id, "epithermalNS");
        if (ns) {
          const [wet, dry] = ns.globalRange ?? [1.52, 9.39];
          const grs = measured(site.id, "waterGRS");
          const grsText = grs
            ? ` GRS: ${formatMetric("waterGRS", grs)} water-equivalent${grs.value < 6 && Math.abs(site.lat) < 45 ? ", mostly bound in minerals" : ""}.`
            : " GRS water is masked here (ice-rich latitudes).";
          return {
            id,
            value: clamp((dry - ns.value) / (dry - wet)),
            confidence: "high",
            why: `${formatMetric("epithermalNS", ns)} epithermal neutrons (Mars spans ${wet}–${dry}; lower means more hydrogen).${grsText} Footprint ~600 km.`,
            basis: "measured",
            datasets: grs ? ["odyssey-ns", "odyssey-grs"] : ["odyssey-ns"],
          };
        }
        return waterRule(site);
      }
      const share = measured(site.id, "iceStableShare");
      if (share) {
        const cold = measured(site.id, "coldTrapShare");
        const depth = measured(site.id, "iceDepthPRP");
        const bits = [
          `Ice would be stable in the top ~3 m under ${formatMetric("iceStableShare", share)} of the ground within 5 km`,
          cold ? `${formatMetric("coldTrapShare", cold)} stays below 110 K all year (cold traps)` : "",
          depth
            ? depth.value === 0
              ? "stable right at the surface"
              : `median stability depth ${formatMetric("iceDepthPRP", depth)}`
            : "",
        ].filter(Boolean);
        return {
          id,
          // Buried stability counts most; surface cold traps add the rest (they can hold exposed ice).
          value: clamp(0.15 + 0.55 * (share.value / 100) + 0.3 * ((cold?.value ?? 0) / 100)),
          confidence: "medium",
          why: `${bits.join("; ")}. Stable does not mean ice is there.`,
          basis: "measured",
          datasets: ["diviner-prp"],
        };
      }
      const pending = gapNote(site.id, "iceStableShare");
      return waterRule(site, [], pending ? " Diviner ice-stability data are still downloading." : "");
    }
    case "temperature": {
      const avg = site.world === "moon" ? measured(site.id, "avgTempPRP") : undefined;
      if (avg) {
        const max = measured(site.id, "maxTempPRP");
        const hot = max && max.value > 350 ? 0.1 : 0;
        return {
          id,
          value: clamp(1 - Math.abs(avg.value - 250) / 200 - hot),
          confidence: "high",
          why: `Annual average ${formatMetric("avgTempPRP", avg)}${max ? `, maximum ${formatMetric("maxTempPRP", max)}` : ""} within 5 km (Diviner).`,
          basis: "measured",
          datasets: ["diviner-prp"],
        };
      }
      const value = has("extreme-cold") ? 0.3 : has("cold") ? 0.5 : 0.7;
      const base = has("extreme-cold")
        ? "Extreme cold in shadowed areas."
        : has("cold")
          ? "Cold most of the time."
          : "No extreme temperature listed.";
      if (site.world === "mars") {
        const ti = measured(site.id, "thermalInertiaNight");
        if (ti) {
          const reading =
            ti.value < 150
              ? "loose, fine ground: large day–night swings"
              : ti.value > 300
                ? "firm or rocky ground that damps the day–night swing"
                : "average ground";
          return {
            id,
            value,
            confidence: "medium",
            why: `${base} TES thermal inertia ${formatMetric("thermalInertiaNight", ti)} (${reading}); no measured temperature map is used, so the rule stands.`,
            basis: "context",
            datasets: ["mgs-tes-ti"],
          };
        }
      }
      if (site.world === "moon") {
        const st = measured(site.id, "regolithTempAnomaly");
        if (st)
          return {
            id,
            value,
            confidence: "medium",
            why: `${base} Diviner: night-time soil is ${formatMetric("regolithTempAnomaly", st)} relative to the lunar average (context only).`,
            basis: "context",
            datasets: ["diviner-gdr"],
          };
        if (gapNote(site.id, "avgTempPRP"))
          return {
            id,
            value,
            confidence: "medium",
            why: `${base} Diviner polar temperatures are still downloading.`,
            basis: "rule",
            datasets: [],
          };
      }
      return { id, value, confidence: "medium", why: base, basis: "rule", datasets: [] };
    }
    case "science": {
      const n = site.tags.filter((t) => SCIENCE_TAGS.has(t)).length;
      return {
        id,
        value: clamp(0.25 + 0.2 * n),
        confidence: "low",
        why: `${n} science feature${n === 1 ? "" : "s"} listed.`,
        basis: "rule",
        datasets: [],
      };
    }
  }
}

/** Why a weighted factor has no value at this site (shown instead of silently dropping it), or null. */
export function factorGap(site: Site, id: FactorId): string | null {
  if (factor(site, id)) return null;
  switch (id) {
    case "rocks":
      if (site.world === "mars")
        return "No Mars rock-abundance map in our data yet; TES thermal inertia appears under temperature.";
      return gapNote(site.id, "rockAbundance") ?? "No Diviner rock data here.";
    case "radar":
      if (site.world === "mars") return "Mini-RF is a lunar radar.";
      return gapNote(site.id, "cprMiniRF") ?? "No Mini-RF coverage here.";
    case "air":
      return "The Moon has no air to brake a landing.";
    case "roughness":
      return "No terrain grid for this site.";
    default:
      return null;
  }
}

/** Short dataset name for badges ("LRO LOLA"), with the full name for tooltips. */
export const datasetLabel = (id: DatasetId) => DATASETS[id];

export interface ScoreResult {
  score: number;
  rows: (FactorResult & { weight: number; contribution: number })[];
}

/** Weighted mean over the factors that apply to this site; weights are re-normalised when one is missing. */
export function scoreSite(site: Site, weights: Partial<Record<FactorId, number>>): ScoreResult {
  const rows = (Object.keys(weights) as FactorId[])
    .map((id) => ({ f: factor(site, id), w: weights[id] ?? 0 }))
    .filter((r): r is { f: FactorResult; w: number } => r.f !== null && r.w > 0);
  const total = rows.reduce((s, r) => s + r.w, 0) || 1;
  const out = rows.map(({ f, w }) => ({ ...f, weight: w / total, contribution: (f.value * w) / total }));
  return { score: Math.round(out.reduce((s, r) => s + r.contribution, 0) * 100), rows: out };
}
