"use client";

import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { GLOBE_LAYERS } from "@/lib/data/globe";
import { stopInfo, stopLayer, TOUR, TOUR_LAYERS } from "@/lib/data/tour";
import { issLive } from "@/lib/issLive";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";

const DWELL_MS = 7000;
const LAYER = Object.fromEntries(GLOBE_LAYERS.map((l) => [l.id, l]));

/** Start the tour: panels out of the way, every layer it visits switched on, first stop. */
export function startTour() {
  const s = useExplorer.getState();
  s.showLayers(TOUR_LAYERS);
  s.setChromeHidden(true);
  s.setTourStep(0);
}

function stopTour() {
  const s = useExplorer.getState();
  s.setTourStep(null);
  s.selectSite(null);
  s.setChromeHidden(false);
}

/**
 * Caption overlay for the cinematic tour. Selecting each stop drives the camera (FlyToSelection), the twin arcs and
 * the DSN beams; the cards stay closed while touring. Arrow keys step, Space pauses, Escape ends.
 */
export function CinematicTour() {
  const step = useExplorer((s) => s.tourStep);
  const setTourStep = useExplorer((s) => s.setTourStep);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (to: number) => {
      if (to >= TOUR.length) return stopTour();
      // The live ISS stop needs orbit data; skip it if none arrived.
      const next = TOUR[Math.max(0, to)];
      if (next.id === "iss" && !issLive.get()) return setTourStep(to + 1 < TOUR.length ? to + 1 : null);
      setTourStep(Math.max(0, to));
    },
    [setTourStep],
  );

  // Select the stop so the camera flies there.
  useEffect(() => {
    if (step === null) return;
    const stop = TOUR[step];
    const s = useExplorer.getState();
    if (stop.kind === "site") s.selectSite(stop.id);
    else s.selectPlace(stop.id);
  }, [step]);

  // Auto-advance.
  useEffect(() => {
    if (step === null || paused) return;
    const t = setTimeout(() => go(step + 1), DWELL_MS);
    return () => clearTimeout(t);
  }, [step, paused, go]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopTour();
      else if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft") go(step - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else return;
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, go]);

  if (step === null) return null;
  const stop = TOUR[step];
  const info = stopInfo(stop);
  const layer = LAYER[stopLayer(stop)];

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center">
      <div
        key={step}
        role="status"
        aria-live="polite"
        className="glass pointer-events-auto relative w-full max-w-xl overflow-hidden rounded-2xl duration-500 animate-in fade-in slide-in-from-bottom-3"
      >
        <div className="flex gap-3 p-3 md:gap-4 md:p-4">
          {info.photo && (
            <span className="relative size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 md:size-20">
              <Image src={info.photo} alt="" fill sizes="80px" className="object-cover" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <span className="size-1.5 rounded-full" style={{ background: layer.color }} aria-hidden />
              {layer.label}
              <span className="hud ms-auto normal-case">
                {step + 1} / {TOUR.length}
              </span>
            </p>
            <h2 className="mt-0.5 truncate font-heading text-lg leading-tight font-semibold md:text-xl">{info.name}</h2>
            <p className="mt-1 text-sm leading-snug text-foreground/85">{stop.caption}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 border-t border-white/[0.07] px-2 py-1.5">
          <TourButton label="Previous stop" onClick={() => go(step - 1)} disabled={step === 0}>
            <ChevronLeft className="size-4" />
          </TourButton>
          <TourButton label={paused ? "Resume tour" : "Pause tour"} onClick={() => setPaused((p) => !p)}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </TourButton>
          <TourButton label="Next stop" onClick={() => go(step + 1)}>
            <ChevronRight className="size-4" />
          </TourButton>
          <span className="ms-2 hidden text-[11px] text-muted-foreground sm:inline">← → to step · Space to pause · Esc to exit</span>
          <button
            type="button"
            onClick={stopTour}
            className="ms-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
            End tour
          </button>
        </div>
        {/* Time left at this stop. */}
        <span
          aria-hidden
          className={cn("tour-progress absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary", paused && "[animation-play-state:paused]")}
          style={{ animationDuration: `${DWELL_MS}ms` }}
        />
      </div>
    </div>
  );
}

function TourButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg p-2 text-foreground/85 transition-[background-color,opacity,scale] duration-150 hover:bg-white/10 active:scale-95 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
