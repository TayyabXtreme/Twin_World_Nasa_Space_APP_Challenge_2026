"use client";

import { ArrowRight, ExternalLink, Radar, Satellite, ScanSearch, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GetTheData } from "@/components/data/GetTheData";
import { SatelliteView } from "@/components/satellite/SatelliteView";
import { MeasuredPanel } from "@/components/score/MeasuredPanel";
import { photoViews, type PhotoView } from "@/lib/data/globe";
import { measured } from "@/lib/data/metrics";
import { siteById, terrainFor } from "@/lib/data/sites";
import { sourceById } from "@/lib/data/sources";
import { twinsForSite } from "@/lib/data/twins";
import type { Site, TwinLink } from "@/lib/data/types";
import { finderRefFor } from "@/lib/finder/places";
import { formatLat, formatLon } from "@/lib/geo";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";
import { WORLD_CONFIG } from "@/lib/worlds";
import { EvidenceTag } from "./EvidenceTag";

const KIND: Record<Site["kind"], string> = {
  analogue: "Earth analogue",
  landing_candidate: "Landing candidate",
  mission_site: "Mission site",
  science_target: "Science target",
};

const WORLD_DOT = { earth: "bg-earth", moon: "bg-moon", mars: "bg-mars" } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="hud text-base text-foreground">{value}</dd>
      {note && <dd className="text-[11px] leading-snug text-muted-foreground">{note}</dd>}
    </div>
  );
}

const VIEW_ICON = { s2: Satellite, wv: Satellite, s1: Radar, ground: null } as const;

/**
 * Earth sites: the site photo plus orbital views (Sentinel-2, MODIS, Sentinel-1 radar). Only the chosen view is
 * in the DOM, so the others are fetched only if someone opens them.
 */
function PhotoGallery({ views }: { views: PhotoView[] }) {
  const [i, setI] = useState(0);
  const view = views[Math.min(i, views.length - 1)];
  if (!view) return null;
  return (
    <figure className="mb-4">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10">
        <Image
          key={view.src}
          src={view.src}
          alt={view.alt}
          fill
          sizes="(max-width: 767px) 100vw, 400px"
          className="object-cover duration-300 animate-in fade-in"
        />
        {views.length > 1 && (
          <div role="tablist" aria-label="Photo views" className="absolute inset-x-2 bottom-2 flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {views.map((v, j) => {
              const Icon = VIEW_ICON[v.kind];
              return (
                <button
                  key={v.src}
                  type="button"
                  role="tab"
                  aria-selected={j === i}
                  onClick={() => setI(j)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-md transition-[background-color,color,scale] duration-150 active:scale-95",
                    j === i ? "bg-white text-background" : "bg-black/45 text-white/85 hover:bg-black/60",
                  )}
                >
                  {Icon && <Icon className="size-3" aria-hidden />}
                  {v.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <figcaption className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        {view.credit}
        {view.date && <span className="hud"> · {view.date}</span>}
        {view.note && <span className="block">{view.note}</span>}
      </figcaption>
    </figure>
  );
}

/** One Moon/Mars twin of an Earth site: its photo, the shared feature, and a link into Compare. */
function TwinCard({ twin }: { twin: TwinLink }) {
  const other = siteById(twin.otherId)!;
  return (
    <Link
      href={`/compare?a=${twin.earthId}&b=${twin.otherId}`}
      className="group flex items-center gap-3 rounded-xl bg-white/[0.035] p-2 pe-3 ring-1 ring-white/10 transition-[background-color,box-shadow] duration-150 hover:bg-white/[0.07] hover:ring-white/20"
    >
      <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-white/5">
        {other.image && <Image src={other.image.src} alt="" fill sizes="56px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span className={cn("size-1.5 rounded-full", WORLD_DOT[other.world])} aria-hidden />
          {WORLD_CONFIG[other.world].name}
        </span>
        <span className="block truncate text-sm font-medium">{other.name}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{twin.feature}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-primary transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export function SiteDrawer() {
  const selectedId = useExplorer((s) => s.selectedSiteId);
  const selectSite = useExplorer((s) => s.selectSite);
  const touring = useExplorer((s) => s.tourStep !== null);
  const site = selectedId && !touring ? siteById(selectedId) : undefined;

  useEffect(() => {
    if (!site) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && selectSite(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [site, selectSite]);

  if (!site) return null;
  const terrain = terrainFor(site.id);
  const twins = twinsForSite(site.id);
  const localSlope = measured(site.id, "slopeLOLA");
  const earthTwins = site.world === "earth" ? twins.filter((t) => t.earthId === site.id) : [];
  const proposed = earthTwins.some((t) => t.proposed);
  const finderRef = site.world === "earth" ? finderRefFor(site.id) : undefined;

  return (
    <aside
      key={site.id}
      aria-label={`${site.name} details`}
      className={cn(
        "pointer-events-auto absolute z-30 flex flex-col overflow-hidden glass",
        "inset-x-0 bottom-0 max-h-[72dvh] animate-in rounded-t-2xl duration-200 fade-in slide-in-from-bottom-6",
        "md:inset-x-auto md:end-3 md:top-[4.25rem] md:bottom-[7rem] md:max-h-none md:w-[400px] md:rounded-2xl md:slide-in-from-bottom-0 md:slide-in-from-right-6",
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className={cn("size-2 rounded-full", WORLD_DOT[site.world])} aria-hidden />
        <span className="text-xs text-muted-foreground">
          {WORLD_CONFIG[site.world].name} · {KIND[site.kind]}
        </span>
        <EvidenceTag evidence={site.evidence} className="ms-auto" />
        <button
          type="button"
          onClick={() => selectSite(null)}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground"
          aria-label="Close details"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
        {site.world === "earth" ? (
          <PhotoGallery views={photoViews(site)} />
        ) : site.image && (
          <figure className="mb-4">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl ring-1 ring-white/10">
              <Image src={site.image.src} alt={site.image.alt} fill sizes="400px" className="object-cover" />
            </div>
            <figcaption className="mt-1 text-[11px] text-muted-foreground">Image: {site.image.credit}</figcaption>
          </figure>
        )}

        <h2 className="font-heading text-2xl font-semibold tracking-tight">{site.name}</h2>
        <p className="text-sm text-muted-foreground">{site.region}</p>
        <p className="mt-1 hud text-xs text-muted-foreground">
          {formatLat(site.lat)} · {formatLon(site.lon)}
          {!site.coordsVerified && " · approximate"}
        </p>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-foreground/90">{site.summary}</p>

        <div className="mt-5 flex flex-col gap-4">
          {site.world === "earth" && (
            <Section title="Satellite view">
              <SatelliteView lat={site.lat} lon={site.lon} name={site.name} />
            </Section>
          )}

          {site.world === "earth" && (
            <Section title="Get the data">
              <GetTheData lat={site.lat} lon={site.lon} name={site.name} />
            </Section>
          )}

          {(terrain || site.elevationM !== undefined) && (
            <Section title="Terrain">
              <dl className="grid grid-cols-3 gap-3">
                <Stat
                  label="Elevation"
                  value={`${(terrain?.elevationM ?? site.elevationM)!.toLocaleString("en-GB")} m`}
                />
                {terrain && (
                  <>
                    <Stat
                      label="Regional slope"
                      value={terrain.slopeDeg === null ? "n/a" : `${terrain.slopeDeg}°`}
                      note={
                        terrain.slopeDeg === null
                          ? localSlope
                            ? "see LOLA 240 m below"
                            : "not computed this close to the pole"
                          : undefined
                      }
                    />
                    <Stat label="Roughness" value={`±${terrain.roughnessM} m`} />
                  </>
                )}
              </dl>
              {terrain && (
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  Computed from {terrain.source} at about {terrain.pixelKm} km per pixel: a regional view, not a
                  landing-scale hazard map.
                </p>
              )}
            </Section>
          )}

          {site.world !== "earth" && (
            <Section title="Measured here">
              <MeasuredPanel site={site} />
            </Section>
          )}

          <Section title="Landforms and geology">
            <p className="text-sm leading-relaxed">{site.landforms.join(" · ")}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{site.geology.join(" · ")}</p>
          </Section>

          {site.resources.length > 0 && (
            <Section title="Resources">
              <ul className="flex flex-col gap-2">
                {site.resources.map((r) => (
                  <li key={r.label} className="flex items-start justify-between gap-3 text-sm">
                    <span>{r.label}</span>
                    <EvidenceTag evidence={r.evidence} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {earthTwins.length > 0 && (
            <>
              <Section title={proposed ? "Why it could be an analogue" : "What NASA tested here"}>
                {proposed && (
                  <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 text-[11px] font-medium text-warn ring-1 ring-warn/25">
                    Proposed by TwinWorlds · not a NASA field site
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {[...new Set(earthTwins.map((t) => t.nasaUse.replace(/^Not a NASA field site\.\s*/, "")))].map((use) => (
                    <li key={use} className="text-sm leading-relaxed text-foreground/90">
                      {use}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title={earthTwins.length > 1 ? "Twins on other worlds" : "Twin on another world"}>
                <div className="flex flex-col gap-2">
                  {earthTwins.map((t) => (
                    <TwinCard key={t.id} twin={t} />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    href={`/compare?a=${site.id}&b=${earthTwins[0].otherId}`}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary ring-1 ring-primary/25 transition-colors duration-150 hover:bg-primary/15"
                  >
                    Open in Compare
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link
                    href={`/finder?t=${earthTwins[0].otherId}${finderRef ? `&ref=${finderRef}` : ""}`}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm font-medium ring-1 ring-white/10 transition-colors duration-150 hover:bg-white/[0.08]"
                  >
                    <ScanSearch className="size-4 text-muted-foreground" aria-hidden />
                    {finderRef ? "Finder score" : "Open in Finder"}
                  </Link>
                </div>
              </Section>
            </>
          )}

          {site.world !== "earth" && twins.length > 0 && (
            <Section title="Earth twins">
              <ul className="flex flex-col gap-1">
                {twins.map((t) => {
                  const otherId = t.earthId === site.id ? t.otherId : t.earthId;
                  const other = siteById(otherId);
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/compare?a=${t.earthId}&b=${t.otherId}`}
                        className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-white/5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{other?.name}</span>
                          <span className="block text-xs text-muted-foreground">{t.feature}</span>
                        </span>
                        <ArrowRight
                          className="size-4 text-primary transition-transform duration-150 group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {site.world !== "earth" && (
            <Link
              // The mission score lives on Compare: pair the site with its NASA Earth twin (or the Atacama).
              href={`/compare?a=${twins.find((t) => t.otherId === site.id)?.earthId ?? "earth-atacama"}&b=${site.id}#mission-score`}
              className="flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary ring-1 ring-primary/25 transition-colors duration-150 hover:bg-primary/15"
            >
              Mission suitability score
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}

          <Section title="Sources">
            <ul className="flex flex-col gap-1.5">
              {site.sourceIds.map((id) => {
                const s = sourceById(id);
                return s ? (
                  <li key={id}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-start gap-1.5 text-sm text-foreground/90 hover:text-primary"
                    >
                      <span>
                        {s.title} <span className="text-muted-foreground">· {s.org}</span>
                      </span>
                      <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
                    </a>
                  </li>
                ) : null;
              })}
            </ul>
          </Section>
        </div>
      </div>
    </aside>
  );
}
