"use client";

import { type InitRequest } from "./model";
import { withParams } from "./params";
import { REF_POINTS } from "./places";
import { createScorer } from "./scorer";
import type { CellResult, GridHeader, ParamsHeader, ScoreResult, Target, TargetsDoc, Weights } from "./types";

/**
 * Browser side of the Analog Finder. Fetches the grid and targets once per session (module-level cache),
 * starts the scoring worker (falling back to the main thread if workers fail), and exposes a backlog-free
 * score() and a probe() for any clicked point.
 */

const BASE = "/data/finder";

export interface FinderData {
  header: GridHeader;
  /** The Earth side of the thirteen parameters (earth-params.json). */
  params: ParamsHeader;
  targets: TargetsDoc;
}

let dataPromise: Promise<{ data: FinderData; buf: ArrayBuffer }> | null = null;
function loadData() {
  dataPromise ??= Promise.all([
    fetch(`${BASE}/earth-grid.json`).then((r) => r.json() as Promise<GridHeader>),
    fetch(`${BASE}/earth-params.json`).then((r) => r.json() as Promise<ParamsHeader>),
    fetch(`${BASE}/targets.json`).then((r) => r.json() as Promise<TargetsDoc>),
    fetch(`${BASE}/earth-params.bin`).then((r) => r.arrayBuffer()),
  ]).then(([header, params, targets, buf]) => ({ data: { header, params, targets: withParams(targets) }, buf }));
  dataPromise.catch(() => (dataPromise = null));
  return dataPromise;
}

let detailPromise: Promise<ArrayBuffer> | null = null;
/** Display-only MODIS channels (day/night/coldest surface temperatures, albedo, flags), fetched on demand. */
export function loadDetail() {
  detailPromise ??= fetch(`${BASE}/earth-detail.bin`).then((r) => r.arrayBuffer());
  detailPromise.catch(() => (detailPromise = null));
  return detailPromise;
}

export function detailValues(header: GridHeader, buf: ArrayBuffer, cell: number) {
  const bytes = new Uint8Array(buf);
  const out: Record<string, number> = {};
  for (const ch of header.channels) {
    if (ch.file !== "detail") continue;
    const q = bytes[ch.byteOffset + cell];
    out[ch.key] = q === 0 ? NaN : ch.key === "flags" ? q - 1 : ch.offset + (q - 1) * ch.scale;
  }
  return out;
}

/** The two operations a backend (worker or main thread) provides. */
interface Backend {
  score(id: number, target: Target, weights: Weights): Promise<ScoreResult>;
  probe(lat: number, lon: number): Promise<CellResult | null>;
  mode: "worker" | "main";
}

function mainBackend(data: FinderData, buf: ArrayBuffer): Backend {
  const s = createScorer(data.header, data.params, buf, REF_POINTS);
  return { mode: "main", score: (id, t, w) => s.score(id, t, w), probe: async (lat, lon) => s.probe(lat, lon) };
}

function workerBackend(data: FinderData, buf: ArrayBuffer): Promise<Backend> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./score.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Scoring worker did not start"));
    }, 15000);
    let seq = 0;
    const scores = new Map<number, (r: ScoreResult) => void>();
    const probes = new Map<number, (r: CellResult | null) => void>();
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || "Scoring worker failed"));
    };
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; result?: ScoreResult | CellResult | null; id?: number };
      if (m.type === "ready") {
        clearTimeout(timer);
        resolve({
          mode: "worker",
          score: (id, target, weights) =>
            new Promise((res) => {
              scores.set(id, res);
              worker.postMessage({ type: "score", id, target, weights });
            }),
          probe: (lat, lon) =>
            new Promise((res) => {
              const id = ++seq;
              probes.set(id, res);
              worker.postMessage({ type: "probe", id, lat, lon });
            }),
        });
      } else if (m.type === "score") {
        const r = m.result as ScoreResult;
        scores.get(r.id)?.(r);
        scores.delete(r.id);
      } else if (m.type === "probe" && m.id !== undefined) {
        probes.get(m.id)?.(m.result as CellResult | null);
        probes.delete(m.id);
      }
    };
    // The worker gets its own copy of the grid; the main thread keeps one for the fallback path.
    const init: InitRequest = { type: "init", header: data.header, params: data.params, buf: buf.slice(0), refs: REF_POINTS };
    worker.postMessage(init, [init.buf]);
  });
}

export interface FinderEngine {
  data: FinderData;
  mode: "worker" | "main";
  score(target: Target, weights: Weights): Promise<ScoreResult | null>;
  probe(lat: number, lon: number): Promise<CellResult | null>;
}

let enginePromise: Promise<FinderEngine> | null = null;

export function getEngine(): Promise<FinderEngine> {
  enginePromise ??= loadData().then(async ({ data, buf }) => {
    let backend: Backend;
    try {
      backend = await workerBackend(data, buf);
    } catch (e) {
      console.warn("Analog Finder: falling back to main-thread scoring.", e);
      backend = mainBackend(data, buf);
    }
    // One score job in flight; while it runs only the newest request waits (older waiting ones resolve
    // null). Dragging a slider therefore streams fresh results with no backlog.
    let seq = 0;
    let busy = false;
    let queued: { id: number; target: Target; weights: Weights; resolve: (r: ScoreResult | null) => void } | null = null;
    const run = (job: NonNullable<typeof queued>) => {
      busy = true;
      backend.score(job.id, job.target, job.weights).then(
        (r) => {
          job.resolve(r);
          busy = false;
          if (queued) {
            const next = queued;
            queued = null;
            run(next);
          }
        },
        () => {
          job.resolve(null);
          busy = false;
        },
      );
    };
    return {
      data,
      mode: backend.mode,
      score(target, weights) {
        return new Promise<ScoreResult | null>((resolve) => {
          const job = { id: ++seq, target, weights, resolve };
          if (busy) {
            queued?.resolve(null);
            queued = job;
          } else run(job);
        });
      },
      probe: (lat, lon) => backend.probe(lat, lon),
    };
  });
  enginePromise.catch(() => (enginePromise = null));
  return enginePromise;
}
