"use client";

import { Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect } from "react";
import { useRoviHandler } from "@/lib/rovi/handlers";
import { useExplorer } from "@/lib/store";
import { useQualityTier } from "@/lib/useQualityTier";
import type { World } from "@/lib/worlds";
import { CinematicTour } from "@/components/globe/CinematicTour";
import { Morph, PageTransition } from "@/components/motion/PageTransition";
import { ExplorationTimeline } from "@/components/globe/ExplorationTimeline";
import { LayerToggles } from "@/components/globe/LayerToggles";
import { LandingDrawer } from "@/components/site/LandingDrawer";
import { PlaceDrawer } from "@/components/site/PlaceDrawer";
import { PointDrawer } from "@/components/site/PointDrawer";
import { SiteDrawer } from "@/components/site/SiteDrawer";
import { Hud } from "./Hud";
import { InstrumentLoader } from "./InstrumentLoader";
import { LeftRail } from "./LeftRail";
import { SiteList } from "./SiteList";
import { TopBar } from "./TopBar";

function ViewportLoading() {
  return <InstrumentLoader label="Loading world" />;
}

// three.js and Leaflet only load on this screen, and only the one in use.
const GlobeCanvas = dynamic(() => import("@/components/globe/GlobeCanvas"), { ssr: false, loading: ViewportLoading });
const WorldMap = dynamic(() => import("@/components/map/WorldMap"), { ssr: false, loading: ViewportLoading });

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** If the 3D globe throws (e.g. WebGL is blocked even though a probe context worked), fall back to the 2D map. */
class ViewportBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ExplorerShell({ world }: { world: World }) {
  const view = useExplorer((s) => s.view);
  const setWorld = useExplorer((s) => s.setWorld);
  const setView = useExplorer((s) => s.setView);
  useQualityTier();

  const selectSite = useExplorer((s) => s.selectSite);
  const chromeHidden = useExplorer((s) => s.chromeHidden);
  const setChromeHidden = useExplorer((s) => s.setChromeHidden);
  const touring = useExplorer((s) => s.tourStep !== null);

  // H toggles the panels, F toggles full screen (both ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "h") setChromeHidden(!useExplorer.getState().chromeHidden);
      if (key === "f" && document.fullscreenEnabled) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setChromeHidden]);
  useEffect(() => {
    setWorld(world);
    // Deep link: /explore/mars?site=mars-jezero opens that site.
    const id = new URLSearchParams(window.location.search).get("site");
    if (id) selectSite(id);
  }, [world, setWorld, selectSite]);
  useEffect(() => {
    if (!hasWebGL()) setView("2d");
  }, [setView]);
  // Tell Rovi this world is ready for it (lib/rovi/actions.ts). Registered after setWorld above, so actions never race it.
  useRoviHandler(`explore:${world}`, () => {});

  // isolate: Leaflet panes use z-index 200–700; keep them inside this layer, below the panels.
  const viewport = (
    <div className="absolute inset-0 isolate z-0">
      <ViewportBoundary key={view} onError={() => setView("2d")}>
        {view === "3d" ? <GlobeCanvas world={world} /> : <WorldMap world={world} />}
      </ViewportBoundary>
    </div>
  );

  return (
    <PageTransition>
    <main className="relative h-dvh overflow-hidden bg-background" data-chrome={chromeHidden ? "hidden" : undefined}>
      <h1 className="sr-only">Explore {world}</h1>
      {/* The landing page's Explore card grows into the Earth globe (Moon and Mars switch with a slide instead). */}
      {world === "earth" ? <Morph name="feature-explore">{viewport}</Morph> : viewport}
      <TopBar world={world} />
      <LeftRail />
      <SiteList world={world} />
      {world === "earth" && view === "3d" && <LayerToggles />}
      {world !== "earth" && view === "3d" && <ExplorationTimeline world={world} />}
      <Hud world={world} />
      <SiteDrawer />
      <PlaceDrawer />
      <LandingDrawer />
      <PointDrawer />
      <CinematicTour />
      {chromeHidden && !touring && (
        <button
          type="button"
          onClick={() => setChromeHidden(false)}
          className="glass absolute end-3 top-3 z-40 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition-colors duration-150 animate-in fade-in hover:bg-white/10"
        >
          <Minimize2 className="size-4" aria-hidden />
          Show panels
          <span className="hud rounded border border-border px-1 text-[10px] text-muted-foreground">H</span>
        </button>
      )}
    </main>
    </PageTransition>
  );
}
