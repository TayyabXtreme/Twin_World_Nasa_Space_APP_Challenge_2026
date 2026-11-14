import type { World } from "@/lib/worlds";
import type { Evidence } from "./types";

export interface EnvRow {
  key: string;
  label: string;
  /** Unit shown after numeric values. */
  unit?: string;
  values: Record<World, { text: string; value?: number; note?: string }>;
  /** Higher numbers are not "better"; bars only show magnitude on a shared scale. */
  bar?: boolean;
  evidence: Evidence;
  sourceIds: string[];
}

/**
 * World-level conditions for the comparison table. Each row names its statistic
 * (the brief: "do not compare temperature numbers unless the measurement type and units are clear").
 */
export const ENVIRONMENT: EnvRow[] = [
  {
    key: "gravity",
    label: "Surface gravity",
    unit: "m/s²",
    bar: true,
    values: {
      earth: { text: "9.81", value: 9.81 },
      moon: { text: "1.62", value: 1.62, note: "about one-sixth of Earth" },
      mars: { text: "3.71", value: 3.71, note: "about 38% of Earth" },
    },
    evidence: "confirmed",
    sourceIds: ["nasa-moon", "nasa-mars-facts"],
  },
  {
    key: "air",
    label: "Atmosphere",
    values: {
      earth: { text: "Nitrogen and oxygen, 1 bar" },
      moon: { text: "Exosphere only (not breathable)" },
      mars: { text: "Thin, mostly carbon dioxide", note: "less than 1% of Earth's surface pressure" },
    },
    evidence: "confirmed",
    sourceIds: ["nasa-moon", "nasa-mars-facts"],
  },
  {
    key: "temperature",
    label: "Temperature",
    values: {
      earth: { text: "about 15 °C", note: "global average" },
      moon: { text: "very hot by day, very cold at night", note: "permanently shadowed polar craters are among the coldest places known" },
      mars: { text: "about −65 °C", note: "commonly cited median; range roughly 20 °C to −153 °C" },
    },
    evidence: "confirmed",
    sourceIds: ["nasa-temps", "nasa-mars-facts", "nasa-moonbase-env"],
  },
  {
    key: "water",
    label: "Water",
    values: {
      earth: { text: "Liquid water, ice and vapour" },
      moon: { text: "Evidence for ice in permanently shadowed polar regions", note: "not every shadowed crater holds the same amount" },
      mars: { text: "Mostly ice, underground and at the poles", note: "ancient rivers, deltas and lakes" },
    },
    evidence: "evidence_for",
    sourceIds: ["nasa-moon-water", "nasa-mars-facts"],
  },
  {
    key: "day",
    label: "Length of day",
    values: {
      earth: { text: "24 hours" },
      moon: { text: "about 29.5 Earth days", note: "sunrise to sunrise" },
      mars: { text: "24 h 37 min", note: "one sol" },
    },
    evidence: "confirmed",
    sourceIds: ["nasa-moon", "nasa-mars-facts"],
  },
  {
    key: "light",
    label: "Light-travel time from Earth",
    values: {
      earth: { text: "—" },
      moon: { text: "about 1.3 seconds" },
      mars: { text: "3 to 22 minutes", note: "depends on where the planets are; see the live value on the home page" },
    },
    evidence: "confirmed",
    sourceIds: ["jpl-approx-pos"],
  },
];
