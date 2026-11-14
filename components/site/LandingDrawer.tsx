"use client";

import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { AGENCIES, formatLandingDate, landedBy, landingById, landingsFor, type Landing, type LandingPhoto } from "@/lib/data/landings";
import { formatLat, formatLon } from "@/lib/geo";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Card for a Moon or Mars landing pin (exploration-history layer). */
export function LandingDrawer() {
  const placeId = useExplorer((s) => s.selectedPlaceId);
  const selectPlace = useExplorer((s) => s.selectPlace);
  const landing = placeId ? landingById(placeId) : undefined;

  useEffect(() => {
    if (!landing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && selectPlace(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [landing, selectPlace]);

  if (!landing) return null;
  return <LandingCard key={landing.id} landing={landing} onClose={() => selectPlace(null)} />;
}

function LandingCard({ landing, onClose }: { landing: Landing; onClose: () => void }) {
  const agency = AGENCIES[landing.agency];
  const all = landingsFor(landing.world);
  const index = all.findIndex((l) => l.id === landing.id);
  const [view, setView] = useState<"photo" | "orbit">("photo");
  const photo: LandingPhoto = view === "orbit" && landing.orbit ? landing.orbit : landing.photo;

  // Previous / next landing on this world. Make sure its pin is on the globe: layer on, timeline far enough along.
  const go = (to: Landing) => {
    const s = useExplorer.getState();
    if (s.hiddenLayers.includes("landings")) s.toggleLayer("landings");
    if (landedBy(to.world, s.timelineT) <= all.indexOf(to)) s.setTimeline(null, false);
    s.selectPlace(to.id);
  };
  const prev = all[index - 1];
  const next = all[index + 1];

  return (
    <aside
      aria-label={`${landing.mission} details`}
      className={cn(
        "pointer-events-auto absolute z-30 flex flex-col overflow-hidden glass",
        "inset-x-0 bottom-0 max-h-[72dvh] animate-in rounded-t-2xl duration-200 fade-in slide-in-from-bottom-6",
        "md:inset-x-auto md:end-3 md:top-[4.25rem] md:bottom-[7rem] md:max-h-none md:w-[400px] md:rounded-2xl md:slide-in-from-bottom-0 md:slide-in-from-right-6",
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="size-2 rounded-full" style={{ background: agency.color }} aria-hidden />
        <span className="text-xs text-muted-foreground">
          Exploration history · <span className="hud">{index + 1}</span> of <span className="hud">{all.length}</span>
        </span>
        <div className="ms-auto flex items-center">
          <button
            type="button"
            onClick={() => prev && go(prev)}
            disabled={!prev}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label={prev ? `Previous landing: ${prev.mission}` : "No earlier landing"}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => next && go(next)}
            disabled={!next}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label={next ? `Next landing: ${next.mission}` : "No later landing"}
          >
            <ChevronRight className="size-4" />
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground" aria-label="Close details">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
        <figure className="mb-4">
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10">
            <Image key={photo.src} src={photo.src} alt={photo.title || landing.mission} fill sizes="(max-width: 767px) 100vw, 400px" className="object-cover duration-300 animate-in fade-in" />
            {landing.orbit && (
              <div className="absolute start-2 bottom-2 flex gap-0.5 rounded-lg bg-black/55 p-0.5 text-[11px] backdrop-blur-sm" role="group" aria-label="Photo">
                {(["photo", "orbit"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cn("rounded-md px-2 py-1 transition-colors duration-150", view === v ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {v === "photo" ? "On the surface" : "From orbit"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <figcaption className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            <span className="block text-foreground/80">{photo.title}</span>
            <a href={photo.page} target="_blank" rel="noreferrer" className="hover:text-primary">
              {photo.credit}
              {photo.nasaId ? " · NASA Image Library" : ""}
            </a>
          </figcaption>
        </figure>

        <p className="text-xs font-medium tracking-wide uppercase" style={{ color: agency.color }}>
          {agency.label} · {landing.date.slice(0, 4)}
        </p>
        <h2 className="mt-0.5 font-heading text-2xl font-semibold tracking-tight">{landing.mission}</h2>
        <p className="text-sm text-muted-foreground">
          {landing.craft && <>{landing.craft} · </>}
          {landing.site}
        </p>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-foreground/90">{landing.summary}</p>

        <div className="mt-5 flex flex-col gap-4">
          <Section title="Landing">
            <dl className="flex flex-col gap-2.5">
              {[
                ["Landed", `${formatLandingDate(landing.date)} (UTC)`],
                ["Agency", agency.label],
                ["Where", landing.site],
                ["Coordinates", `${formatLat(landing.lat)} · ${formatLon(landing.lon)}${landing.approx ? " (approximate)" : ""}`],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-3 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className={cn(k === "Coordinates" && "hud")}>{v}</dd>
                </div>
              ))}
            </dl>
            {landing.approx && (
              <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
                Luna 9 has not been found in LRO images, so this is the published estimate, not a measured position.
              </p>
            )}
          </Section>

          <Section title="Coordinate sources">
            <ul className="flex flex-col gap-2">
              {landing.coordSources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="group flex items-start gap-1.5 text-sm text-foreground/90 hover:text-primary">
                    <span>{s.label}</span>
                    <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">Planetocentric latitude, longitude positive east.</p>
          </Section>
        </div>
      </div>
    </aside>
  );
}
