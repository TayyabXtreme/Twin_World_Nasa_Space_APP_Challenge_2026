import type { DimId } from "@/lib/finder/types";
import type { World } from "@/lib/worlds";

/** Missions on /challenge (components/challenge/Arcade.tsx). */
export type MissionId = "guess" | "scout" | "land" | "rover" | "launch";

/**
 * Everything Rovi can do on the site. Each action runs in the browser (lib/rovi/actions.ts): it animates, spotlights
 * the part of the page it is about and returns an Undo. A server-side brain later only has to emit these.
 */
export type RoviAction =
  | { type: "navigate"; href: string; spot?: string; caption?: string }
  | { type: "flyGlobe"; world: World; id: string }
  | { type: "openLayer"; world: World; layerId: string }
  | { type: "setFinder"; targetId?: string; weights?: Partial<Record<DimId, number>> }
  | { type: "placeMoonBase"; regionId: string }
  | { type: "startGame"; mission: MissionId }
  | { type: "startTour"; tour: "site" | "globe" }
  | { type: "spotlight"; selector: string; caption: string };

/**
 * A "learn it" card in the chat, after Archify's explainers (github.com/tt-a1i/archify): the answer first, then a few
 * steps beside a small flow diagram whose parts light up as each step is read.
 */
export interface Explainer {
  title: string;
  /** The conclusion, one sentence. */
  answer: string;
  nodes: { id: string; label: string; kind: "data" | "process" | "result" | "place" }[];
  edges: { from: string; to: string; label: string }[];
  /** Each step lights the diagram nodes it names. */
  steps: { title: string; text: string; nodes: string[] }[];
}

export interface RoviReply {
  text: string;
  actions: RoviAction[];
  /** Follow-up questions to offer as chips under the answer. */
  next?: string[];
  explainer?: Explainer;
}

export type ChipStatus = "running" | "done" | "failed" | "undone";

export interface ActionChip {
  id: string;
  label: string;
  status: ChipStatus;
  undoable: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "rovi";
  text: string;
  chips?: ActionChip[];
  next?: string[];
  /** Typed out letter by letter once, when it first appears. */
  fresh?: boolean;
  explainer?: Explainer;
  /** Live AI: what Rovi is doing right now ("Ranking Earth's land…"), shown under the bubble while it streams. */
  status?: string;
  /** Live AI: text is still arriving. */
  streaming?: boolean;
}

export type Mood = "idle" | "listening" | "thinking" | "speaking" | "acting";
