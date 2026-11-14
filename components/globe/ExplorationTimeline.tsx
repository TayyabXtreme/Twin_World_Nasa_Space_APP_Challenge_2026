"use client";

import { Check, History, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo } from "react";
import { AGENCIES, decimalYear, landedBy, landingsFor, timelineStart, TIMELINE_END, type Agency, type LandingWorld } from "@/lib/data/landings";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Playback speed in years per second: quick across empty decades, slow enough near a landing to watch it drop. */
const SLOW = 1.5;
const FAST = 9;

/**
 * Exploration history on the Moon and Mars globes: a timeline from the first landing's year to 2026 that drops the
 * landing pins in order, with play and pause. Bottom-left panel on wide screens; a compact bar under the top bar on
 * phones.
 */
export function ExplorationTimeline({ world }: { world: LandingWorld }) {
  const landings = landingsFor(world);
  const start = timelineStart(world);
  const t = useExplorer((s) => s.timelineT);
  const playing = useExplorer((s) => s.timelinePlaying);
  const setTimeline = useExplorer((s) => s.setTimeline);
  const on = useExplorer((s) => !s.hiddenLayers.includes("landings"));
  const toggleLayer = useExplorer((s) => s.toggleLayer);
  const selectPlace = useExplorer((s) => s.selectPlace);
  const selectedPlaceId = useExplorer((s) => s.selectedPlaceId);

  const years = useMemo(() => landings.map((l) => decimalYear(l.date)), [landings]);
  const agencies = useMemo(() => [...new Set(landings.map((l) => l.agency))] as Agency[], [landings]);
  const shown = landedBy(world, t);
  const latest = shown > 0 ? landings[shown - 1] : undefined;
  const value = t ?? TIMELINE_END;
  const pct = (y: number) => ((y - start) / (TIMELINE_END - start)) * 100;

  // Playback: advance the year every frame; the pins themselves only change when a landing is crossed.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cur = useExplorer.getState().timelineT ?? start;
      const next = years.find((y) => y > cur);
      const speed = next !== undefined && next - cur < 1.2 ? SLOW : FAST;
      const t2 = cur + dt * speed;
      if (t2 >= TIMELINE_END) return setTimeline(null, false);
      setTimeline(t2, true);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, years, start, setTimeline]);

  const play = () => {
    if (playing) return setTimeline(t, false);
    if (!on) toggleLayer("landings");
    // From the end (or "all"), start over; otherwise carry on from where the slider is.
    setTimeline(t === null || t >= TIMELINE_END - 0.01 ? start : t, true);
  };

  const onToggle = () => {
    // Hiding the layer closes an open landing card.
    if (on && selectedPlaceId && landings.some((l) => l.id === selectedPlaceId)) selectPlace(null);
    toggleLayer("landings");
  };

  const year = Math.floor(value);

  return (
    <div
      role="group"
      aria-label="Exploration history"
      className={cn(
        "chrome glass pointer-events-auto absolute z-20 flex items-center gap-2 rounded-2xl p-1.5",
        "inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)]",
        "md:inset-x-auto md:start-[4.75rem] md:top-auto md:bottom-3 md:w-80 md:flex-col md:items-stretch md:gap-0 md:p-3",
      )}
    >
      {/* Header (wide screens): title and the layer switch. */}
      <div className="hidden items-center gap-2 md:flex">
        <History className="size-3.5 text-primary" aria-hidden />
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Exploration history</span>
        <LayerSwitch on={on} onToggle={onToggle} className="ms-auto" />
      </div>

      <button
        type="button"
        onClick={play}
        aria-label={playing ? "Pause timeline" : "Play timeline"}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]",
          "transition-[background-color,scale] duration-150 ease-(--ease-out) hover:bg-primary/90 active:scale-[0.95] md:hidden",
        )}
      >
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-px" aria-hidden />}
      </button>

      {/* Year readout and the newest landing. */}
      <div className="flex shrink-0 items-baseline gap-2 md:mt-3 md:items-end md:justify-between">
        <span className="hud text-lg leading-none font-semibold text-foreground tabular-nums md:text-4xl" aria-live="off">
          {t === null ? TIMELINE_END : year}
        </span>
        <span className="hidden text-end text-xs leading-tight text-muted-foreground md:block">
          <span className="hud text-foreground">{shown}</span> of {landings.length} landings
          {latest && (
            <span className="block truncate text-[11px]" style={{ color: AGENCIES[latest.agency].color }}>
              Latest: {latest.mission}
            </span>
          )}
        </span>
      </div>

      {/* Slider with a coloured tick per landing. */}
      <div className={cn("relative min-w-0 flex-1 md:mt-3 md:flex-none", !on && "opacity-50")}>
        <div className="pointer-events-none absolute inset-x-[7px] top-0 h-2.5" aria-hidden>
          {landings.map((l, i) => (
            <span
              key={l.id}
              className={cn("absolute top-0 h-2.5 w-[3px] -translate-x-1/2 rounded-full transition-opacity duration-200", i < shown ? "opacity-100" : "opacity-30")}
              style={{ left: `${pct(years[i])}%`, background: AGENCIES[l.agency].color }}
            />
          ))}
        </div>
        <input
          type="range"
          min={start}
          max={TIMELINE_END}
          step={1 / 12}
          value={value}
          disabled={!on}
          onChange={(e) => {
            const v = Number(e.target.value);
            setTimeline(v >= TIMELINE_END ? null : v, false);
          }}
          aria-label={`Timeline year, ${start} to ${TIMELINE_END}`}
          aria-valuetext={`${t === null ? TIMELINE_END : year}, ${shown} of ${landings.length} landings`}
          className="timeline-range mt-2.5 block w-full"
          style={{ "--fill": `${pct(value)}%` } as React.CSSProperties}
        />
        <div className="hud mt-1 hidden justify-between text-[10px] text-muted-foreground md:flex" aria-hidden>
          <span>{start}</span>
          <span>{Math.round((start + TIMELINE_END) / 2)}</span>
          <span>{TIMELINE_END}</span>
        </div>
      </div>

      <LayerSwitch on={on} onToggle={onToggle} className="md:hidden" />

      {/* Controls and legend (wide screens). */}
      <div className="mt-3 hidden items-center gap-2 md:flex">
        <button
          type="button"
          onClick={play}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]",
            "transition-[background-color,scale] duration-150 ease-(--ease-out) hover:bg-primary/90 active:scale-[0.97]",
          )}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {playing ? "Pause" : t === null ? `Play from ${start}` : "Play"}
        </button>
        <button
          type="button"
          onClick={() => setTimeline(null, false)}
          disabled={t === null}
          title="Show every landing"
          aria-label="Show every landing"
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground ring-1 ring-white/10 transition-[background-color,color,opacity] duration-150 hover:bg-white/5 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="mt-3 hidden flex-wrap gap-x-3 gap-y-1 md:flex" aria-label="Agencies">
        {agencies.map((a) => (
          <li key={a} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: AGENCIES[a].color }} aria-hidden />
            {AGENCIES[a].label}
          </li>
        ))}
      </ul>
      {world === "moon" && (
        <p className="mt-2 hidden text-[10.5px] leading-snug text-muted-foreground/80 md:block">
          Starts in 1966: Luna 9 landed three years before Apollo 11.
        </p>
      )}
    </div>
  );
}

function LayerSwitch({ on, onToggle, className }: { on: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={on ? "Hide landing pins" : "Show landing pins"}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground",
        className,
      )}
    >
      <span
        className="flex size-4 items-center justify-center rounded-full ring-2 ring-primary transition-colors duration-150"
        style={{ backgroundColor: on ? "var(--primary)" : "transparent" }}
        aria-hidden
      >
        <Check className={cn("size-3 text-background transition-[opacity,scale] duration-150", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={3} />
      </span>
      <span className="hidden sm:inline md:inline">Pins</span>
    </button>
  );
}
