/* Best scores: a per-browser convenience, so storage failures just mean no record is kept. */

export type BestId = "launch" | "land" | "rover" | "guess" | "scout";

const key = (id: BestId) => `tw-best-${id}`;

export function readBest(id: BestId) {
  try {
    return Number(localStorage.getItem(key(id)) ?? 0);
  } catch {
    return 0;
  }
}

export function writeBest(id: BestId, score: number) {
  try {
    localStorage.setItem(key(id), String(score));
  } catch {
    /* storage unavailable */
  }
}
