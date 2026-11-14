"use client";

import { useEffect } from "react";
import { useExplorer, type QualityTier } from "./store";

/**
 * Picks a texture/effects tier once per session:
 *   low  → 1k textures, no extras (old phones, Save-Data, ≤ 4 GB RAM)
 *   mid  → 2k textures (default)
 *   high → 4k textures + bloom (strong desktop GPUs)
 * Benchmarks are served locally (copied by `npm run assets`) so there is no CDN round-trip.
 */
export function useQualityTier() {
  const setQuality = useExplorer((s) => s.setQuality);

  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

    if (nav.connection?.saveData || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4)) {
      setQuality("low");
      return;
    }

    import("detect-gpu")
      .then(({ getGPUTier }) => getGPUTier({ benchmarksURL: "/detect-gpu" }))
      .then(({ tier, isMobile }) => {
        if (cancelled) return;
        const next: QualityTier = tier >= 3 && !isMobile ? "high" : tier <= 1 ? "low" : "mid";
        setQuality(next);
      })
      .catch(() => {
        /* keep the default "mid" tier */
      });

    return () => {
      cancelled = true;
    };
  }, [setQuality]);
}
