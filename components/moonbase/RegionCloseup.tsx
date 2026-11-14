"use client";

import { Eye, Layers3 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { OrbitLoader } from "@/components/motion/OrbitLoader";
import { CREW_NOTES, earthVisibility, nacCovers, shadowLength, sunMaxElevation, TREK } from "@/lib/moonbase/closeup";
import { DATA_BASE } from "@/lib/moonbase/grids";
import { formatLat, formatLon } from "@/lib/moonbase/projection";
import { ARTEMIS_REGIONS, type ArtemisRegion } from "@/lib/moonbase/regions";
import { useMoonbase } from "@/lib/moonbase/store";
import type { Manifest, SiteValues } from "@/lib/moonbase/types";
import { cn } from "@/lib/utils";
import type { CloseupState } from "./CloseupMap";

const CloseupMap = dynamic(() => import("./CloseupMap"), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center">
      <OrbitLoader label="Loading LRO imagery" />
    </div>
  ),
});

/** Our layers worth seeing at close range (display images, 480 m per pixel). */
const OUR_LAYERS = ["slope", "icedepth", "tavg", "tmax", "coldtrap", "cpr", "lend", "elevation"];

const BASES: { id: CloseupState["base"]; label: string }[] = [
  { id: "nac", label: "LROC NAC · 1 m" },
  { id: "wac", label: "LROC WAC" },
  { id: "hillshade", label: "LOLA hillshade" },
];

function CrewView({ region, siteValues }: { region: ArtemisRegion; siteValues: SiteValues | null }) {
  const sun = sunMaxElevation(region.lat);
  const earth = useMemo(() => earthVisibility(region.lat, region.lon), [region]);
  const sites = siteValues?.entries.find((e) => e.id === `artemis-${region.id}`)?.landingSites;
  const tavg = typeof sites?.tavgMean === "number" ? sites.tavgMean : null;
  const tmax = typeof sites?.tmaxMean === "number" ? sites.tmaxMean : null;
  const slope = typeof sites?.slopeMean === "number" ? sites.slopeMean : null;
  const c = (k: number) => Math.round(k - 273.15);
  return (
    <div className="flex flex-col gap-2.5 text-[13.5px] leading-relaxed text-foreground/90">
      <p>{CREW_NOTES[region.id]}</p>
      <p>
        <span className="font-medium text-foreground">Sun.</span> Never more than {sun.toFixed(1)}° above a flat horizon, circling the sky once every 29.5 days. A
        1.8 m astronaut&apos;s shadow is at least {Math.round(shadowLength(sun))} m long, and every boulder trails a long black streak.
      </p>
      <p>
        <span className="font-medium text-foreground">Earth.</span>{" "}
        {earth.share > 0.02
          ? `Above the horizon about ${Math.round(earth.share * 100)} % of the time, at most ${earth.maxElevation.toFixed(0)}° up, low over the horizon on the near-side direction.`
          : "Below the horizon almost all the time."}{" "}
        <span className="text-muted-foreground">(Smooth-horizon estimate from the Moon&apos;s libration; a ridge can still hide it.)</span>
      </p>
      {(tavg !== null || slope !== null) && (
        <p>
          <span className="font-medium text-foreground">Ground.</span>{" "}
          {tavg !== null && `About ${tavg.toFixed(0)} K (${c(tavg)} °C) on average${tmax !== null ? `, up to ${tmax.toFixed(0)} K (${c(tmax)} °C) in full sun` : ""}. `}
          {slope !== null && `Slopes of about ${slope.toFixed(1)}° at the published landing sites.`}
        </p>
      )}
    </div>
  );
}

/**
 * Close-up of each Artemis III region on LRO imagery (NASA Moon Trek south polar tiles): LROC NAC at 1 m where the
 * mosaic reaches (within about 136 km of the pole), LROC WAC everywhere, LOLA hillshade and our layers on top, and
 * a short "what a crew would see". The map only loads once the section scrolls into view.
 */
export function RegionCloseup({ manifest, siteValues }: { manifest: Manifest | null; siteValues: SiteValues | null }) {
  const focus = useMoonbase((s) => s.focusRegion);
  const setFocus = useMoonbase((s) => s.setFocusRegion);
  const region = ARTEMIS_REGIONS.find((r) => r.id === focus) ?? ARTEMIS_REGIONS[0];
  const nac = nacCovers(region);
  const [base, setBase] = useState<CloseupState["base"]>("nac");
  const [shade, setShade] = useState(0.45);
  const [sunlight, setSunlight] = useState(false);
  const [psr, setPsr] = useState(false);
  const [oursId, setOursId] = useState<string>("");
  const [oursOpacity, setOursOpacity] = useState(0.6);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setVisible(true), io.disconnect()), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const effectiveBase = base === "nac" && !nac ? "wac" : base;
  const ourLayers = (manifest?.layers ?? []).filter((l) => OUR_LAYERS.includes(l.id) && l.image && l.status === "ready");
  const ours = ourLayers.find((l) => l.id === oursId);
  const state: CloseupState = {
    base: effectiveBase,
    shade,
    sunlight,
    psr,
    ours: ours ? { src: `${DATA_BASE}/${ours.image}`, opacity: oursOpacity } : null,
  };
  const credits = [
    TREK[effectiveBase].credit,
    ...(effectiveBase !== "hillshade" && shade > 0 ? [TREK.hillshade.credit] : []),
    ...(sunlight ? [TREK.sunlight.credit] : []),
    ...(psr ? [TREK.psr.credit] : []),
    ...(ours ? [`${ours.label}: ${ours.source} (our 480 m layer)`] : []),
  ];

  return (
    <section ref={ref} aria-labelledby="closeup-title" className="mt-16 scroll-mt-24">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">Up close · LRO imagery</p>
        <h2 id="closeup-title" className="mt-2 font-heading text-[clamp(1.6rem,3vw,2.3rem)] leading-tight font-semibold tracking-tight">
          Region close-ups
        </h2>
        <p className="mt-2 text-muted-foreground">
          Each Artemis III candidate region on Lunar Reconnaissance Orbiter imagery, with our data layers on top and what a crew standing there would see.
        </p>
      </header>

      <div role="radiogroup" aria-label="Artemis III region" className="mt-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {ARTEMIS_REGIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={r.id === region.id}
            onClick={() => setFocus(r.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ring-1 transition-colors duration-150",
              r.id === region.id ? "bg-primary/15 text-primary ring-primary/50" : "text-muted-foreground ring-white/12 hover:text-foreground hover:ring-white/25",
            )}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative isolate h-[min(70dvh,560px)] min-h-[340px] overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
          {visible ? <CloseupMap region={region} state={state} /> : null}
          <div className="pointer-events-none absolute top-3 left-3 z-[500] rounded-xl glass px-3 py-2">
            <p className="text-sm font-medium">{region.name}</p>
            <p className="hud text-[11px] text-muted-foreground">
              ≈ {formatLat(region.lat, 2)} {formatLon(region.lon, 1)} · dots: published landing sites
            </p>
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl glass p-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Layers3 className="size-3.5 text-primary" aria-hidden /> Imagery
            </p>
            <div role="radiogroup" aria-label="Base imagery" className="grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-1">
              {BASES.map((b) => {
                const disabled = b.id === "nac" && !nac;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={effectiveBase === b.id}
                    disabled={disabled}
                    title={disabled ? "The 1 m NAC mosaic stops about 136 km from the pole (near 85.5°S); this region is outside it." : undefined}
                    onClick={() => setBase(b.id)}
                    className={cn(
                      "rounded-lg px-2 py-1.5 text-[11.5px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-35",
                      effectiveBase === b.id ? "bg-white text-background" : "text-foreground/80 hover:bg-white/5",
                    )}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              {nac
                ? "NAC: 1 m pixels, down to 4 m on screen. WAC: 268 m. LOLA hillshade: 134 m."
                : "Outside the 1 m NAC mosaic (it stops near 85.5°S), so the base is the WAC mosaic at 268 m per pixel."}
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Overlays</p>
            {effectiveBase !== "hillshade" && (
              <label className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0">LOLA hillshade</span>
                <input type="range" min={0} max={1} step={0.05} value={shade} onChange={(e) => setShade(Number(e.target.value))} className="w-full accent-[var(--primary)]" aria-label="LOLA hillshade strength" />
              </label>
            )}
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={sunlight} onChange={(e) => setSunlight(e.target.checked)} className="accent-[var(--primary)]" />
              Average sunlight <span className="text-[11px] text-muted-foreground">LOLA · 535 m</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={psr} onChange={(e) => setPsr(e.target.checked)} className="accent-[var(--primary)]" />
              Inside the shadows <span className="text-[11px] text-muted-foreground">NAC, brightened</span>
            </label>
            <div className="flex items-center gap-2">
              <select
                aria-label="Our data layer"
                value={oursId}
                onChange={(e) => setOursId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg bg-white/[0.05] px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none focus-visible:ring-primary"
              >
                <option value="" className="bg-background">
                  No data layer
                </option>
                {ourLayers.map((l) => (
                  <option key={l.id} value={l.id} className="bg-background">
                    {l.label}
                  </option>
                ))}
              </select>
              {ours && (
                <input type="range" min={0.1} max={1} step={0.05} value={oursOpacity} onChange={(e) => setOursOpacity(Number(e.target.value))} className="w-24 accent-[var(--primary)]" aria-label={`${ours.label} opacity`} />
              )}
            </div>
          </div>

          <div className="border-t border-white/[0.07] pt-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Eye className="size-3.5 text-primary" aria-hidden /> What a crew would see
            </p>
            <CrewView region={region} siteValues={siteValues} />
          </div>

          <ul className="mt-auto flex flex-col gap-1 border-t border-white/[0.07] pt-3 text-[10.5px] leading-snug text-muted-foreground">
            {credits.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
