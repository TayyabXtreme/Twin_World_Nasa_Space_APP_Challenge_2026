"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errKey, loadGrid, loadManifest, loadSiteValues, toFloat } from "./grids";
import type { Grid, Manifest, SiteValues } from "./types";

/** Decoded physical values per grid, computed once. */
const FLOATS = new WeakMap<Grid, Float32Array>();

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Loads the base map manifest and site values first (~30 kB). The value grids (several MB in all) only start
 * once the visitor touches the map or the side panel (`requestGrids`), so first load stays small: until then the
 * map is just its display image. Grids then stream two at a time, the ones the readout and score need first.
 */
export function useMoonData() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [siteValues, setSiteValues] = useState<SiteValues | null>(null);
  const [grids, setGrids] = useState<Record<string, Grid>>({});
  const [error, setError] = useState<string | null>(null);
  const [wanted, setWanted] = useState(false);
  const requestGrids = useCallback(() => setWanted(true), []);

  useEffect(() => {
    let alive = true;
    loadManifest()
      .then((m) => alive && setManifest(m))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    loadSiteValues()
      .then((v) => alive && setSiteValues(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!manifest || !wanted) return;
    let alive = true;
    const first = ["slope", "elevation", "trapdist", "tavg", "icedepth"];
    const rank = (id: string) => (first.includes(id) ? first.indexOf(id) : first.length);
    const ready = manifest.layers.filter((l) => l.status === "ready" && l.grid).sort((a, b) => rank(a.id) - rank(b.id));
    // Uncertainty grids (LEND) load after every value grid, under `${id}:err`.
    const errors = ready.filter((l) => l.errorGrid).map((l) => ({ ...l, id: errKey(l.id), grid: l.errorGrid }));
    const layers = [...ready, ...errors];
    const start = async () => {
      // two at a time keeps the image request for the visible layer from queueing behind every grid
      const queue = [...layers];
      const worker = async () => {
        for (let l = queue.shift(); l && alive; l = queue.shift()) {
          try {
            const g = await loadGrid(l);
            if (alive) setGrids((prev) => ({ ...prev, [l.id]: g }));
          } catch {
            /* a missing grid only blanks that layer's readout */
          }
        }
      };
      await Promise.all([worker(), worker()]);
    };
    const w = window as IdleWindow;
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(() => void start(), { timeout: 600 })
      : window.setTimeout(() => void start(), 50);
    return () => {
      alive = false;
      if (w.cancelIdleCallback) w.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, [manifest, wanted]);

  const floats = useMemo(() => {
    const out: Record<string, Float32Array> = {};
    for (const [id, g] of Object.entries(grids)) {
      let f = FLOATS.get(g);
      if (!f) FLOATS.set(g, (f = toFloat(g)));
      out[id] = f;
    }
    return out;
  }, [grids]);

  const ready = manifest?.layers.filter((l) => l.status === "ready" && l.grid) ?? [];
  const expected = ready.length + ready.filter((l) => l.errorGrid).length;
  return {
    manifest,
    siteValues,
    grids,
    floats,
    error,
    loaded: Object.keys(grids).length,
    expected,
    wanted,
    requestGrids,
  };
}
