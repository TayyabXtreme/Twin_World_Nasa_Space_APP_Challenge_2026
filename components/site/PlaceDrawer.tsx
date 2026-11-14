"use client";

import { ArrowRight, ExternalLink, X } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";
import { GetTheData } from "@/components/data/GetTheData";
import { SatelliteView } from "@/components/satellite/SatelliteView";
import { GLOBE_LAYERS } from "@/lib/data/globe";
import { placeById, type GlobePlace } from "@/lib/data/globePlaces";
import { siteById } from "@/lib/data/sites";
import { formatLat, formatLon } from "@/lib/geo";
import { useIssLive } from "@/lib/issLive";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";

const LAYER = Object.fromEntries(GLOBE_LAYERS.map((l) => [l.id, l]));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Live readout for the ISS card: position, height, speed, and how old the orbit data is. */
function IssReadout() {
  const fix = useIssLive();
  if (!fix) return <p className="text-sm text-muted-foreground">Computing position…</p>;
  const ageH = (fix.at - fix.epoch) / 3_600_000;
  const rows = [
    ["Latitude", formatLat(fix.lat)],
    ["Longitude", formatLon(fix.lon)],
    ["Height", `${Math.round(fix.altKm).toLocaleString("en-GB")} km`],
    ["Speed", `${fix.speedKms.toFixed(2)} km/s · ${Math.round(fix.speedKms * 3600).toLocaleString("en-GB")} km/h`],
    ["One orbit", `${fix.periodMin.toFixed(1)} min`],
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className={cn(k === "Speed" && "col-span-2")}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="hud text-base text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Orbit data from {fix.source}, epoch {ageH < 48 ? `${ageH.toFixed(1)} hours` : `${(ageH / 24).toFixed(1)} days`} old
        {fix.stale && " (bundled copy: CelesTrak was unreachable)"}. Propagated with SGP4 in this browser, updated every second; the trail shows
        45 minutes behind and ahead.
      </p>
    </>
  );
}

export function PlaceDrawer() {
  const placeId = useExplorer((s) => s.selectedPlaceId);
  const touring = useExplorer((s) => s.tourStep !== null);
  const selectPlace = useExplorer((s) => s.selectPlace);
  const selectSite = useExplorer((s) => s.selectSite);
  const place = placeId ? placeById(placeId) : undefined;

  useEffect(() => {
    if (!place || touring) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && selectPlace(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [place, touring, selectPlace]);

  if (!place || touring) return null;
  return <PlaceCard key={place.id} place={place} onClose={() => selectPlace(null)} onSite={selectSite} />;
}

function PlaceCard({ place, onClose, onSite }: { place: GlobePlace; onClose: () => void; onSite: (id: string) => void }) {
  const layer = LAYER[place.layer];
  const site = place.siteId ? siteById(place.siteId) : undefined;
  const live = place.layer === "iss";
  return (
    <aside
      aria-label={`${place.name} details`}
      className={cn(
        "pointer-events-auto absolute z-30 flex flex-col overflow-hidden glass",
        "inset-x-0 bottom-0 max-h-[72dvh] animate-in rounded-t-2xl duration-200 fade-in slide-in-from-bottom-6",
        "md:inset-x-auto md:end-3 md:top-[4.25rem] md:bottom-[7rem] md:max-h-none md:w-[400px] md:rounded-2xl md:slide-in-from-bottom-0 md:slide-in-from-right-6",
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="size-2 rounded-full" style={{ background: layer.color }} aria-hidden />
        <span className="text-xs text-muted-foreground">{layer.label}</span>
        {live && (
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] leading-none text-muted-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-75 motion-reduce:animate-none" />
              <span className="relative size-1.5 rounded-full bg-ok" />
            </span>
            Live
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className={cn("rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground", !live && "ms-auto")}
          aria-label="Close details"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
        <figure className="mb-4">
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10">
            <Image src={place.photo.src} alt={place.photo.title || place.name} fill sizes="(max-width: 767px) 100vw, 400px" className="object-cover duration-300 animate-in fade-in" />
          </div>
          <figcaption className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            <a href={place.photo.page} target="_blank" rel="noreferrer" className="hover:text-primary">
              {place.photo.credit} · NASA Image Library
            </a>
            {place.photo.date && <span className="hud"> · {place.photo.date}</span>}
            {place.photoNote && <span className="block">{place.photoNote}</span>}
          </figcaption>
        </figure>

        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{place.kicker}</p>
        <h2 className="mt-0.5 font-heading text-2xl font-semibold tracking-tight">{place.name}</h2>
        <p className="text-sm text-muted-foreground">{place.region}</p>
        {!live && (
          <p className="mt-1 hud text-xs text-muted-foreground">
            {formatLat(place.lat)} · {formatLon(place.lon)}
            {place.approx && " · field area, approximate"}
          </p>
        )}
        <p className="mt-3 text-[0.95rem] leading-relaxed text-foreground/90">{place.summary}</p>

        <div className="mt-5 flex flex-col gap-4">
          {live ? (
            <Section title="Right now">
              <IssReadout />
            </Section>
          ) : (
            <Section title="Key facts">
              <dl className="flex flex-col gap-2.5">
                {place.facts.map((f) => (
                  <div key={f.label} className="grid grid-cols-[6.5rem_1fr] gap-3 text-sm">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {!live && (
            <Section title="Satellite view">
              <SatelliteView lat={place.lat} lon={place.lon} name={place.name} />
            </Section>
          )}

          {!live && (
            <Section title="Get the data">
              <GetTheData lat={place.lat} lon={place.lon} name={place.name} />
            </Section>
          )}

          {site && (
            <Section title="Nearby analogue">
              <button
                type="button"
                onClick={() => onSite(site.id)}
                className="group flex w-full items-center gap-3 rounded-xl bg-white/[0.035] p-2 pe-3 text-start ring-1 ring-white/10 transition-[background-color,box-shadow] duration-150 hover:bg-white/[0.07] hover:ring-white/20"
              >
                <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-white/5">
                  {site.image && <Image src={site.image.src} alt="" fill sizes="56px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{site.name}</span>
                  <span className="block text-xs text-muted-foreground">Open its card, Moon/Mars twin and arc</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-primary transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
              </button>
            </Section>
          )}

          <Section title="Source">
            <a href={place.source.url} target="_blank" rel="noreferrer" className="group flex items-start gap-1.5 text-sm text-foreground/90 hover:text-primary">
              <span>{place.source.label}</span>
              <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
            </a>
          </Section>
        </div>
      </div>
    </aside>
  );
}
