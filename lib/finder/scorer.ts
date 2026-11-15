import { buildLuts, cellResult, cellsNear, decodeGrid, paintHeat, scoreAll, scoreRanker, topPlaces, type Grid, type Luts } from "./model";
import type { CellResult, GridHeader, ParamsHeader, RefPoint, ScoreResult, Target, Weights } from "./types";

/**
 * The scoring session shared by the Web Worker and the main-thread fallback: holds the decoded grid, scores
 * every land cell, ranks distinct places, scores the reference sites and paints the heat image.
 */
export function createScorer(header: GridHeader, params: ParamsHeader, buf: ArrayBuffer, refs: RefPoint[]) {
  const grid: Grid = decodeGrid(header, params, buf);
  const refCells = refs.map((ref) => ({ ref, cells: cellsNear(grid, ref.lat, ref.lon, ref.radiusKm) }));
  const scores = new Float32Array(grid.n);
  const rgba = new Uint8ClampedArray(grid.nx * grid.ny * 4);
  let last: { target: Target; luts: Luts; rank: (s: number) => number } | null = null;

  async function score(id: number, target: Target, weights: Weights): Promise<ScoreResult> {
    const t0 = performance.now();
    const luts = buildLuts(grid, target, refCells);
    scoreAll(grid, luts, weights, scores);
    const { topPct, scoreAtTop } = scoreRanker(grid, scores);
    last = { target, luts, rank: topPct };

    const picks = topPlaces(grid, scores, scoreAtTop(0.04));
    const top: CellResult[] = picks.map((i) => cellResult(grid, target, luts, scores, topPct, i));
    const refOut: Record<string, CellResult | null> = {};
    for (const { ref, cells } of refCells) {
      let bi = -1;
      for (const i of cells) if (bi < 0 || scores[i] > scores[bi]) bi = i;
      refOut[ref.id] = bi < 0 ? null : cellResult(grid, target, luts, scores, topPct, bi);
    }

    // Heat ramp over Earth's best quarter of land, up to the best place, so every target uses the full colour
    // range and the colour never suggests a match where three quarters of the planet scores higher.
    const lo = scoreAtTop(0.25);
    const hi = Math.max(lo + 0.05, top[0]?.score ?? lo + 0.05);
    paintHeat(grid, scores, lo, hi, rgba);
    const image = new ImageData(new Uint8ClampedArray(rgba), grid.nx, grid.ny);
    const ms = performance.now() - t0;

    let heat: Blob | ImageData = image;
    if (typeof OffscreenCanvas !== "undefined") {
      try {
        const canvas = new OffscreenCanvas(grid.nx, grid.ny);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.putImageData(image, 0, 0);
          heat = await canvas.convertToBlob({ type: "image/png" });
        }
      } catch {
        heat = image;
      }
    }
    return { id, top, refs: refOut, heat, range: [lo, hi], ms };
  }

  function probe(lat: number, lon: number): CellResult | null {
    if (!last) return null;
    let bi = -1;
    let bd = Infinity;
    for (const i of cellsNear(grid, lat, lon, 20)) {
      const d = (grid.lat[i] - lat) ** 2 + (grid.lon[i] - lon) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi < 0 ? null : cellResult(grid, last.target, last.luts, scores, last.rank, bi);
  }

  return { cells: grid.n, score, probe };
}

export type Scorer = ReturnType<typeof createScorer>;
