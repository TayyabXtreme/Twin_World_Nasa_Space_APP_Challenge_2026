"use client";

import { ChevronDown, CloudSun, Database, ExternalLink, Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CMR_COLLECTIONS, earthdataSearchUrl, formatSize, roundCoord, type CmrCollection, type GranuleResult } from "@/lib/cmr";
import { cn } from "@/lib/utils";

/**
 * "Get the data": for one spot, the NASA granules that cover it (MODIS LST and NDVI, ASTER GDEM, SMAP, HLS) via our
 * cached CMR route, each with dates and sizes, plus an Earthdata Search link filtered to the spot and collection.
 * Searching needs no login; downloads need a free Earthdata Login. Nothing is requested until the panel is on screen.
 */

type State = { status: "loading" } | { status: "ok"; data: GranuleResult } | { status: "error"; message: string };

/* Client cache: the same spot and collection is fetched once per session (the server also caches for hours). */
const cache = new Map<string, Promise<GranuleResult>>();
function load(c: CmrCollection, lat: number, lon: number, retry = false) {
  const key = `${c.conceptId}|${roundCoord(lat)}|${roundCoord(lon)}`;
  let p = retry ? undefined : cache.get(key);
  if (!p) {
    p = fetch(`/api/cmr/granules?c=${c.conceptId}&lat=${roundCoord(lat)}&lon=${roundCoord(lon)}`).then(async (r) => {
      const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body as GranuleResult;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

const day = (iso: string) => (iso ? iso.slice(0, 10) : "–");
function span(start: string, end: string | null) {
  if (!end || day(end) === day(start)) return day(start);
  return `${day(start)} → ${day(end)}`;
}

export function GetTheData({ lat, lon, name, className }: { lat: number; lon: number; name: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setVisible(true), io.disconnect()), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        NASA granules covering {name} ({lat.toFixed(3)}°, {lon.toFixed(3)}°), newest first, from the CMR catalogue. Searching is open; downloading needs a free{" "}
        <a href="https://urs.earthdata.nasa.gov/users/new" target="_blank" rel="noreferrer" className="text-primary hover:underline">
          Earthdata Login
        </a>
        .
      </p>
      {visible ? CMR_COLLECTIONS.map((c) => <CollectionRow key={c.conceptId} c={c} lat={lat} lon={lon} />) : <div className="h-40" aria-hidden />}
    </div>
  );
}

function CollectionRow({ c, lat, lon }: { c: CmrCollection; lat: number; lon: number }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    load(c, lat, lon, attempt > 0).then(
      (data) => live && setState({ status: "ok", data }),
      (e: Error) => live && setState({ status: "error", message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [c, lat, lon, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  };
  const data = state.status === "ok" ? state.data : null;
  const newest = data?.granules[0];

  return (
    <div className="rounded-xl bg-white/[0.035] ring-1 ring-white/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!data || data.granules.length === 0}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-start transition-colors duration-150 enabled:hover:bg-white/[0.04] disabled:cursor-default"
      >
        <Database className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-tight font-medium">{c.label}</span>
          <span className="block text-[11px] text-muted-foreground">
            {c.short} v{c.version} · {c.detail}
          </span>
          <span className="mt-1 block text-[11.5px] leading-snug">
            {state.status === "loading" && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Asking NASA CMR…
              </span>
            )}
            {state.status === "error" && <span className="text-warn">Search failed: {state.message}</span>}
            {data && data.hits === 0 && <span className="text-muted-foreground">No granules cover this spot (outside the product&apos;s coverage, or over water).</span>}
            {data && newest && (
              <span className="text-foreground/85">
                <span className="hud">{data.hits.toLocaleString("en-GB")}</span> {data.hits === 1 ? "granule" : "granules"} · newest {day(newest.start)} · {formatSize(newest.bytes)}
              </span>
            )}
          </span>
        </span>
        {data && data.granules.length > 0 && (
          <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
        )}
      </button>
      {state.status === "error" && (
        <button
          type="button"
          onClick={retry}
          className="ms-9 mb-2.5 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-primary ring-1 ring-primary/30 transition-colors duration-150 hover:bg-primary/10"
        >
          <RotateCw className="size-3" aria-hidden />
          Retry
        </button>
      )}

      {open && data && (
        <div className="border-t border-white/[0.07] px-3 pt-2 pb-3">
          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">{c.use}</p>
          <ul className="flex flex-col gap-1.5">
            {data.granules.map((g) => (
              <li key={g.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 text-[11.5px]">
                <span className="truncate font-mono text-[10.5px] text-foreground/85" title={g.name}>
                  {g.name}
                </span>
                <span className="hud text-muted-foreground">{formatSize(g.bytes)}</span>
                <span className="hud text-muted-foreground">
                  {span(g.start, g.end)}
                  {g.cloud !== null && (
                    <span className={cn("ms-2 inline-flex items-center gap-0.5", g.cloud > 50 ? "text-warn" : "")}>
                      <CloudSun className="size-3" aria-hidden />
                      {Math.round(g.cloud)}% cloud (whole tile)
                    </span>
                  )}
                </span>
                {g.url ? (
                  <a href={g.url} target="_blank" rel="noreferrer" className="text-end text-primary hover:underline" title="Needs Earthdata Login">
                    Download
                  </a>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
          {data.hits > data.granules.length && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Showing the newest {data.granules.length} of {data.hits.toLocaleString("en-GB")}.{c.static ? "" : " Earthdata Search lists them all with date filters."}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-3 py-1.5">
        <span className="text-[10.5px] text-muted-foreground">{data ? `Checked ${new Date(data.fetched).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : " "}</span>
        <a
          href={earthdataSearchUrl(c.conceptId, lat, lon)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          Open in Earthdata Search
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
