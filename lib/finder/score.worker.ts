import type { InitRequest, ProbeRequest, ScoreRequest } from "./model";
import { createScorer, type Scorer } from "./scorer";

/** Analog Finder worker: runs the scoring session (lib/finder/scorer.ts) off the main thread. */

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<InitRequest | ScoreRequest | ProbeRequest>) => void) | null;
}
const scope = self as unknown as WorkerScope;

let scorer: Scorer | null = null;

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    scorer = createScorer(msg.header, msg.core, msg.refs);
    scope.postMessage({ type: "ready", cells: scorer.cells });
  } else if (msg.type === "score" && scorer) {
    scorer.score(msg.id, msg.target, msg.weights).then((result) => scope.postMessage({ type: "score", result }));
  } else if (msg.type === "probe") {
    scope.postMessage({ type: "probe", id: msg.id, result: scorer?.probe(msg.lat, msg.lon) ?? null });
  }
};
