"use client";

import { Layers, MapPinned, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { InstrumentLoader } from "@/components/shell/InstrumentLoader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cellAt, cellCentre, toLatLon } from "@/lib/moonbase/projection";
import { useMoonbase, type MapPoint } from "@/lib/moonbase/store";
import { SUIT_RAMP, computeSuitability, paintScores, rampLut, topSpots } from "@/lib/moonbase/suitability";
import { useMoonData } from "@/lib/moonbase/useMoonData";
import { ARTEMIS_REGIONS } from "@/lib/moonbase/regions";
import { useRoviHandler } from "@/lib/rovi/handlers";
import { cn } from "@/lib/utils";
import { Explainer } from "./Explainer";
import { LayerPanel } from "./LayerPanel";
import { MapLegend } from "./MapLegend";
import { MapHud, Readout, nearestRegion } from "./Readout";
import { RegionCloseup } from "./RegionCloseup";
import { RegionPanel } from "./RegionPanel";
import { ScorePanel, type SpotInfo } from "./ScorePanel";
import type { TopSpot } from "./PolarMap";
import "./moonbase.css";
import { Morph } from "@/components/motion/PageTransition";

// Leaflet touches window on import, so the map only ever loads in the browser.
const PolarMap = dynamic(() => import("./PolarMap"), {
  ssr: false,
  loading: () => <InstrumentLoader label="Loading the south pole" />,
});

const LUT = rampLut(SUIT_RAMP);

type Tab = "layers" | "score" | "regions";

export function MoonbaseView() {
  const { manifest, siteValues, grids, floats, error, loaded, expected, wanted, requestGrids } = useMoonData();
  const activeLayer = useMoonbase((s) => s.activeLayer);
  const setActiveLayer = useMoonbase((s) => s.setActiveLayer);
  const weights = useMoonbase((s) => s.weights);
  const [tab, setTab] = useState<Tab>("layers");
  const [canvas] = useState<HTMLCanvasElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("canvas"),
  );
  const [scores, setScores] = useState<Float32Array | null>(null);
  const [spots, setSpots] = useState<SpotInfo[]>([]);
  const size = manifest?.grid.size ?? 953;
  const pixelKm = (manifest?.grid.pixelM ?? 960) / 1000;

  // Re-score every cell when the weights or the loaded grids change (one pass per frame at most).
  useEffect(() => {
    if (!canvas || !floats.slope) return;
    const id = requestAnimationFrame(() => {
      const { scores: s } = computeSuitability(floats, weights, size);
      paintScores(canvas, s, size, LUT);
      setScores(s);
      setSpots(
        topSpots(s, size, pixelKm).map((t) => {
          const [x, y] = cellCentre(t.row, t.col, size);
          const [lat, lon] = toLatLon(x, y);
          const n = nearestRegion(x, y);
          const near = n.inside ? `inside ${n.region.name}` : `${n.km.toFixed(0)} km from ${n.region.name}`;
          return { x, y, lat, lon, score: t.score, near };
        }),
      );
    });
    return () => cancelAnimationFrame(id);
  }, [canvas, floats, weights, size, pixelKm]);

  const scoreAt = useMemo(
    () => (p: MapPoint) => {
      if (!scores) return null;
      const c = cellAt(p.x, p.y, size);
      if (!c) return null;
      const v = scores[c.row * size + c.col];
      return Number.isNaN(v) ? null : v;
    },
    [scores, size],
  );

  const layers = useMemo(() => manifest?.layers.filter((l) => !l.hidden) ?? [], [manifest]);
  const readoutLayers = useMemo(
    () => manifest?.layers.filter((l) => l.status === "ready" || !l.hidden) ?? [],
    [manifest],
  );
  const loadedLayers = useMemo(() => new Set(Object.keys(floats)), [floats]);
  const mapSpots: TopSpot[] = useMemo(() => spots.map(({ x, y, score }) => ({ x, y, score })), [spots]);
  const active = manifest?.layers.find((l) => l.id === activeLayer);
  const suit = activeLayer === "suitability";

  const pickTab = (t: Tab) => {
    requestGrids();
    setTab(t);
    if (t === "score") setActiveLayer("suitability");
    else if (t === "layers" && suit) setActiveLayer("elevation");
  };

  // Rovi places a base at an Artemis III region (lib/rovi/actions.ts); the returned function puts things back.
  useRoviHandler("moonbase", ({ regionId }: { regionId: string }) => {
    const r = ARTEMIS_REGIONS.find((x) => x.id === regionId);
    if (!r) throw new Error(`No Artemis III region called "${regionId}".`);
    const s = useMoonbase.getState();
    const prev = { pinned: s.pinned, focus: s.focusRegion, tab, layer: s.activeLayer };
    requestGrids();
    setTab("regions");
    s.setFocusRegion(r.id);
    s.setPinned({ x: r.x, y: r.y, lat: r.lat, lon: r.lon });
    s.fly(r.x, r.y, 2.4);
    return () => {
      const t = useMoonbase.getState();
      t.setPinned(prev.pinned);
      t.setFocusRegion(prev.focus);
      t.setActiveLayer(prev.layer);
      setTab(prev.tab);
    };
  });

  const ready = manifest?.layers.filter((l) => l.status === "ready" && !l.hidden).length ?? 0;
  const datasets = new Set(manifest?.layers.filter((l) => l.status === "ready").map((l) => l.dataset.name)).size;

  return (
    <div className="mx-auto max-w-[1440px]">
      <Morph name="feature-bases">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="max-w-2xl">
          <p className="hud text-xs tracking-[0.14em] text-moon uppercase">Moon · South Pole · 75°S to 90°S</p>
          <h1 className="mt-2 font-heading text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.05] font-semibold tracking-tight">
            Moon Base Map
          </h1>
          <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
            Where would you build the first Moon base? Explore NASA orbital data for the lunar south pole, read every
            layer at any point, and weigh slope, ice and sunlight to see where a base could work.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center sm:gap-3">
          {[
            [String(ready || "–"), "layers live"],
            ["9", "Artemis III regions"],
            [String(datasets || "–"), "NASA datasets"],
          ].map(([n, l]) => (
            <div key={l} className="min-w-24 rounded-xl glass px-3 py-2.5">
              <dt className="sr-only">{l}</dt>
              <dd className="hud text-xl font-semibold">{n}</dd>
              <dd className="text-[11px] text-muted-foreground">{l}</dd>
            </div>
          ))}
        </dl>
      </header>
      </Morph>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div
          id="moonbase-map"
          onPointerEnter={requestGrids}
          onTouchStart={requestGrids}
          onFocusCapture={requestGrids}
          className="relative isolate h-[min(74dvh,600px)] min-h-[380px] scroll-mt-24 overflow-hidden rounded-3xl ring-1 ring-white/10 sm:h-[min(78dvh,860px)] sm:min-h-[460px]"
        >
          {error ? (
            <p className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Could not load the base map data ({error}). Run{" "}
              <code className="mx-1 hud">python -I scripts/build-moon-layers.py</code>.
            </p>
          ) : manifest ? (
            <PolarMap manifest={manifest} activeLayer={activeLayer} canvas={canvas} spots={mapSpots} />
          ) : (
            <InstrumentLoader label="Loading the south pole" />
          )}
          <div className="pointer-events-none absolute top-3 left-3 z-[500] max-w-[calc(100%-1.5rem)]">
            <MapHud
              layer={active}
              grid={active ? grids[active.id] : undefined}
              errGrid={active ? grids[`${active.id}:err`] : undefined}
              score={scoreAt}
              loading={wanted && loaded < expected}
            />
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
            <MapLegend layer={active} suitability={suit} />
          </div>
          {manifest && wanted && loaded < expected && (
            <div className="pointer-events-none absolute top-3 right-3 z-[500] hidden rounded-full glass px-3 py-1.5 hud text-[11px] text-muted-foreground sm:block">
              readout data {loaded}/{expected}
            </div>
          )}
        </div>

        <aside
          onPointerEnter={requestGrids}
          onTouchStart={requestGrids}
          onFocusCapture={requestGrids}
          className="flex min-h-0 flex-col rounded-3xl glass lg:h-[min(78dvh,860px)] lg:min-h-[460px]"
        >
          <Tabs value={tab} onValueChange={(v) => pickTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="m-3 mb-0 grid h-9 w-auto grid-cols-3 bg-white/[0.05]">
              <TabsTrigger value="layers" className="text-xs">
                <Layers aria-hidden /> Layers
              </TabsTrigger>
              <TabsTrigger value="score" className="text-xs">
                <SlidersHorizontal aria-hidden /> Base score
              </TabsTrigger>
              <TabsTrigger value="regions" className="text-xs">
                <MapPinned aria-hidden /> Regions
              </TabsTrigger>
            </TabsList>
            <div className={cn("min-h-0 flex-1 p-4 lg:overflow-y-auto", "[scrollbar-gutter:stable]")}>
              {manifest && (
                <>
                  <TabsContent value="layers">
                    <LayerPanel layers={layers} onPickScore={() => pickTab("score")} />
                  </TabsContent>
                  <TabsContent value="score">
                    <ScorePanel layers={manifest.layers} loadedLayers={loadedLayers} spots={spots} />
                  </TabsContent>
                  <TabsContent value="regions">
                    <RegionPanel siteValues={siteValues} />
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </aside>
      </div>

      {manifest && (
        <div className="mt-4">
          <Readout layers={readoutLayers} grids={grids} score={scoreAt} />
        </div>
      )}

      <RegionCloseup manifest={manifest} siteValues={siteValues} />

      <Explainer manifest={manifest} siteValues={siteValues} />
    </div>
  );
}
