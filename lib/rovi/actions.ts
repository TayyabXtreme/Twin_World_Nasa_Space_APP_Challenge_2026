"use client";

import { useMapLayers } from "@/components/map/science";
import { directionType } from "@/components/motion/PageTransition";
import { NAV_ITEMS } from "@/components/shell/nav";
import { landingById } from "@/lib/data/landings";
import { placeById } from "@/lib/data/globePlaces";
import { siteById } from "@/lib/data/sites";
import { TOUR_LAYERS } from "@/lib/data/tour";
import { layersFor } from "@/lib/layers";
import { useExplorer } from "@/lib/store";
import { WORLD_CONFIG } from "@/lib/worlds";
import { type Undo, waitForElement, waitForHandler } from "./handlers";
import { FINDER_TARGETS, MISSION_NAMES } from "./catalog";
import { roviSignal, useRovi } from "./store";
import type { RoviAction } from "./types";

/**
 * The browser side of Rovi's action bus: every RoviAction becomes real navigation and store changes, with a
 * spotlight on what changed and an Undo. Pages that own local state register handlers (lib/rovi/handlers.ts).
 */

export interface Nav {
  push: (href: string, transitionTypes?: string[]) => void;
}

let nav: Nav | null = null;
/** RoviDock hands in the Next.js router once it mounts. */
export const bindNav = (n: Nav | null) => {
  nav = n;
};

function pinName(id: string) {
  return siteById(id)?.name ?? placeById(id)?.name ?? landingById(id)?.mission ?? id;
}

/** Short label for the action chip and the Undo toast. */
export function describe(a: RoviAction): string {
  switch (a.type) {
    case "navigate": {
      const item = NAV_ITEMS.find((n) => a.href.startsWith(n.href.split("/").slice(0, 2).join("/")));
      return `Open ${item?.label ?? (a.href === "/" ? "Home" : a.href)}`;
    }
    case "flyGlobe":
      return `Fly the ${WORLD_CONFIG[a.world].name} globe to ${pinName(a.id)}`;
    case "openLayer":
      return `Show ${layersFor(a.world).find((l) => l.id === a.layerId)?.label ?? a.layerId}`;
    case "setFinder":
      return a.targetId
        ? `Finder target: ${FINDER_TARGETS[a.targetId] ?? a.targetId}${a.weights ? " + weights" : ""}`
        : "Set Finder weights";
    case "placeMoonBase":
      return "Place a Moon base";
    case "startGame":
      return `Start ${MISSION_NAMES[a.mission]}`;
    case "startTour":
      return a.tour === "site" ? "Guided tour" : "Cinematic globe tour";
    case "spotlight":
      return "Point it out";
  }
}

/* ---------- helpers ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const here = () => window.location.pathname + window.location.search;

function waitUntil(test: () => boolean, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (test()) return resolve(true);
      if (performance.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 80);
    };
    tick();
  });
}

const section = (path: string) => NAV_ITEMS.findIndex((n) => n.href.split("/")[1] === path.split("/")[1]);

/** Navigate unless already there. Resolves true once the new route is showing, false if nothing had to change. */
async function go(href: string): Promise<boolean> {
  const url = new URL(href, window.location.origin);
  if (url.pathname === window.location.pathname && (!url.search || url.search === window.location.search)) return false;
  if (!nav) throw new Error("Navigation is not ready yet.");
  const from = section(window.location.pathname);
  const to = section(url.pathname);
  nav.push(url.pathname + url.search, window.location.pathname === "/" ? ["warp"] : directionType(from, to));
  const ok = await waitUntil(() => window.location.pathname === url.pathname, 10_000);
  if (!ok) throw new Error("That page took too long to open.");
  return true;
}

/** Ring an element, scroll it into view and have Rovi look at it. Quietly skips if it never appears. */
export async function spotlight(selector: string, caption: string) {
  const el = await waitForElement(selector);
  if (!el) return;
  useRovi.getState().setSpot(selector, caption);
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/* ---------- the executor ---------- */

/**
 * Run one action. Resolves with its undo (or undefined when there is nothing to undo); throws a readable Error when
 * the action cannot be done.
 */
export async function perform(a: RoviAction): Promise<Undo | undefined> {
  roviSignal.hopAt = performance.now();
  const before = here();
  const back = (moved: boolean, local?: Undo): Undo => () => {
    if (moved) void go(before);
    else local?.();
  };

  switch (a.type) {
    case "navigate": {
      const moved = await go(a.href);
      if (a.spot) await spotlight(a.spot, a.caption ?? "");
      else if (moved) window.scrollTo({ top: 0 });
      return moved ? back(true) : undefined;
    }

    case "spotlight": {
      await spotlight(a.selector, a.caption);
      return undefined;
    }

    case "flyGlobe": {
      const moved = await go(`/explore/${a.world}`);
      await waitForHandler(`explore:${a.world}`);
      const s = useExplorer.getState();
      const prev = { site: s.selectedSiteId, place: s.selectedPlaceId, view: s.view, hidden: s.hiddenLayers };
      if (s.view === "2d" && hasWebGL()) s.setView("3d");
      const place = placeById(a.id);
      if (siteById(a.id)) s.selectSite(a.id);
      else if (place) {
        s.showLayers([place.layer]);
        s.selectPlace(a.id);
      } else if (landingById(a.id)) {
        s.setTimeline(null);
        s.selectPlace(a.id);
      } else throw new Error(`I don't know a pin called "${a.id}".`);
      // Let the camera start its flight, then point at the card that opened.
      await sleep(700);
      // Every card (site, place, landing) is an <aside aria-label="{name} details">.
      await spotlight(`aside[aria-label="${pinName(a.id).replace(/"/g, '\\"')} details"]`, pinName(a.id));
      return back(moved, () => {
        const t = useExplorer.getState();
        t.setView(prev.view);
        useExplorer.setState({ hiddenLayers: prev.hidden });
        if (prev.place) t.selectPlace(prev.place);
        else t.selectSite(prev.site);
      });
    }

    case "openLayer": {
      const layer = layersFor(a.world).find((l) => l.id === a.layerId);
      if (!layer) throw new Error(`There is no ${a.layerId} layer for ${a.world}.`);
      const moved = await go(`/explore/${a.world}`);
      await waitForHandler(`explore:${a.world}`);
      const s = useExplorer.getState();
      const prev = { view: s.view, active: s.activeLayerId };
      s.setView("2d");
      if (layer.group === "science") s.setActiveLayer(layer.id);
      else useMapLayers.getState().setBase(a.world, layer.id);
      const wide = window.matchMedia("(min-width: 768px)").matches;
      await spotlight(wide ? '[data-rovi-spot="map-layers"]' : 'button[aria-label="Map layers"]', layer.label);
      return back(moved, () => {
        const t = useExplorer.getState();
        t.setActiveLayer(prev.active);
        t.setView(prev.view);
      });
    }

    case "setFinder": {
      const moved = await go("/finder");
      const handler = await waitForHandler("finder");
      const undo = handler({ targetId: a.targetId, weights: a.weights }) as Undo | undefined;
      await sleep(350);
      await spotlight(
        a.weights ? 'section[aria-labelledby="weights-title"]' : "#finder-stage",
        a.weights ? "Weights changed" : `Ranking Earth against ${FINDER_TARGETS[a.targetId ?? ""] ?? "the target"}`,
      );
      return back(moved, undo);
    }

    case "placeMoonBase": {
      const moved = await go("/bases");
      const handler = await waitForHandler("moonbase");
      const undo = handler({ regionId: a.regionId }) as Undo | undefined;
      await sleep(400);
      await spotlight("#moonbase-map", "Base pinned here");
      return back(moved, undo);
    }

    case "startGame": {
      const moved = await go("/challenge");
      const handler = await waitForHandler("challenge");
      const undo = handler({ mission: a.mission }) as Undo | undefined;
      // The card photo morphs into the stage and the page scrolls to it (Arcade.pick); then press Start.
      await sleep(900);
      const start = await waitForElement("#challenge-stage .arcade-start", 4000);
      if (start) {
        await spotlight("#challenge-stage .arcade-start", "Starting!");
        await sleep(900);
        start.click();
      }
      return back(moved, undo);
    }

    case "startTour": {
      if (a.tour === "site") {
        const { startGuidedTour } = await import("./conductor");
        return startGuidedTour();
      }
      const moved = await go("/explore/earth");
      await waitForHandler("explore:earth");
      const s = useExplorer.getState();
      if (s.view === "2d" && hasWebGL()) s.setView("3d");
      // Same start as the globe's own Cinematic tour button (components/globe/CinematicTour.tsx).
      s.showLayers(TOUR_LAYERS);
      s.setChromeHidden(true);
      s.setTourStep(0);
      return () => {
        const t = useExplorer.getState();
        t.setTourStep(null);
        t.selectSite(null);
        t.setChromeHidden(false);
        if (moved) void go(before);
      };
    }
  }
}
