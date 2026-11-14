"use client";

import { ChevronLeft, ChevronRight, CloudSun, ExternalLink, Loader2, Satellite, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Legend } from "@/lib/layers";
import {
  addDays,
  boxAround,
  domainUrl,
  isoDay,
  latestDate,
  measure,
  parseDomain,
  SAT_PRODUCTS,
  satProduct,
  snapDate,
  snapshotUrl,
  valueFromTable,
  worldviewLink,
  type ImageStats,
  type SatGroup,
  type SatProduct,
} from "@/lib/satellite";
import { cn } from "@/lib/utils";

/**
 * "Satellite view" of any Earth place: NASA GIBS snapshots with a date picker, true colour (VIIRS or MODIS), land
 * temperature and NDVI, and an "Open in Worldview" link to the same place, layer and date.
 *
 * Honest by construction: GIBS returns HTTP 200 even for empty images, so each image is measured in the browser
 * (no-data and bright-white fractions) and the card says what it shows: newest day with imagery here, polar night,
 * gaps between passes, cloud-or-snow, composite periods. Nothing loads until the card scrolls into view.
 */

const W = 640;
const H = 400;
const ASPECT = W / H;
const ZOOMS = [
  { km: 60, label: "Close" },
  { km: 150, label: "Area" },
  { km: 500, label: "Region" },
];
const GROUPS: { id: SatGroup; label: string }[] = [
  { id: "true", label: "True colour" },
  { id: "lst", label: "Land temp" },
  { id: "ndvi", label: "NDVI" },
];

type Intervals = ReturnType<typeof parseDomain>;

/* Shared caches: one DescribeDomains and one legend fetch per layer for the whole session. */
const domainCache = new Map<string, Promise<Intervals>>();
function domainFor(p: SatProduct) {
  let d = domainCache.get(p.id);
  if (!d) {
    d = fetch(domainUrl(p, p.start, isoDay(Date.now())))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(parseDomain);
    d.catch(() => domainCache.delete(p.id));
    domainCache.set(p.id, d);
  }
  return d;
}
const legendCache = new Map<string, Promise<Legend>>();
function legendFor(id: string) {
  let l = legendCache.get(id);
  if (!l) {
    l = fetch(`/data/layers/${id}.json`).then((r) => r.json() as Promise<Legend>);
    legendCache.set(id, l);
  }
  return l;
}

interface Measured {
  stats: ImageStats;
  centre: [number, number, number, number];
}

/** Load a GIBS snapshot with CORS and measure it. Resolves null if the request fails. */
function measureUrl(url: string, alphaMeansData: boolean): Promise<Measured | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0);
        const { data } = g.getImageData(0, 0, c.width, c.height);
        const mid = (Math.floor(c.height / 2) * c.width + Math.floor(c.width / 2)) * 4;
        resolve({ stats: measure(data, alphaMeansData), centre: [data[mid], data[mid + 1], data[mid + 2], data[mid + 3]] });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Sun never rises at local noon on this date: polar night, so no true-colour imagery can exist. */
function polarNight(lat: number, iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (284 + doy));
  return lat > 0 ? lat > 90 + decl - 0.8 : -lat > 90 - decl - 0.8;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const niceDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

interface Shown {
  /** The request this result answers (product, requested date, zoom), so a stale result is never shown as current. */
  key: string;
  url: string;
  date: string;
  requested: string;
  measured: Measured | null;
  /** True when we stepped back from the requested date because it had no imagery here. */
  steppedBack: boolean;
  error?: string;
}

export function SatelliteView({ lat, lon, name, className }: { lat: number; lon: number; name: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [group, setGroup] = useState<SatGroup>("true");
  const [trueId, setTrueId] = useState("viirs-noaa20");
  const [zoom, setZoom] = useState(1);
  const [requested, setRequested] = useState<string | null>(null); // null = newest with imagery here
  const [domains, setDomains] = useState<Record<string, Intervals | "error">>({});
  const [legends, setLegends] = useState<Record<string, Legend>>({});
  const [result, setResult] = useState<Shown | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const searchRun = useRef(0);

  const product = group === "true" ? satProduct(trueId) : SAT_PRODUCTS.find((p) => p.group === group)!;
  const box = useMemo(() => boxAround(lat, lon, ASPECT, ZOOMS[zoom].km), [lat, lon, zoom]);
  const domain = domains[product.id];
  const intervals = domain && domain !== "error" ? domain : null;
  const legend = product.legend ? (legends[product.legend] ?? null) : null;
  const key = `${product.id}|${requested ?? "auto"}|${zoom}`;
  const shown = result && result.key === key && !result.error ? result : null;
  const error = domain === "error" ? "Could not reach NASA GIBS to list available dates." : result?.key === key ? result.error : undefined;
  const busy = searching ? "search" : !error && !shown ? "load" : null;
  // While a new request loads, keep the previous image on screen under the loading veil.
  const display = shown ?? (result && !result.error ? result : null);
  const imgLoaded = display !== null && loadedUrl === display.url;
  const [today] = useState(() => isoDay(Date.now()));

  // Lazy: wait until the card is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setVisible(true), io.disconnect()), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Available dates (and the colour legend for composites), once per layer.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    domainFor(product).then(
      (d) => live && setDomains((m) => ({ ...m, [product.id]: d })),
      () => live && setDomains((m) => ({ ...m, [product.id]: "error" })),
    );
    const legendId = product.legend;
    if (legendId) legendFor(legendId).then((l) => live && setLegends((m) => ({ ...m, [legendId]: l })));
    return () => {
      live = false;
    };
  }, [visible, product]);

  // Resolve the requested date to an image, measure it, and (daily imagery, auto mode) walk back past empty days.
  useEffect(() => {
    if (!intervals) return;
    let live = true;
    const alpha = product.format === "image/png";
    (async () => {
      const first = snapDate(intervals, requested ?? latestDate(intervals) ?? today);
      if (!first) {
        const error = `${product.label} has no imagery on or before ${niceDate(requested ?? today)}.`;
        if (live) setResult({ key, url: "", date: "", requested: requested ?? today, measured: null, steppedBack: false, error });
        return;
      }
      let date = first;
      let m = await measureUrl(snapshotUrl(product, date, box, W, H), alpha);
      // The newest daily date is often only part-processed or misses this place, so walk back a few days.
      for (let i = 0; requested === null && product.periodDays === 1 && i < 8 && m && m.stats.noData > 0.6 && !polarNight(lat, date); i++) {
        const prev = snapDate(intervals, addDays(date, -1));
        if (!prev || !live) break;
        date = prev;
        m = await measureUrl(snapshotUrl(product, date, box, W, H), alpha);
      }
      if (!live) return;
      setResult({
        key,
        url: snapshotUrl(product, date, box, W, H),
        date,
        requested: requested ?? first,
        measured: m,
        steppedBack: date !== first,
        error: m ? undefined : "NASA GIBS did not return an image. It may be busy; try again in a moment.",
      });
    })();
    return () => {
      live = false;
    };
  }, [intervals, product, box, lat, requested, key, today]);

  /** Scan the last 10 available days at thumbnail size and pick the clearest (least no-data and bright white). */
  const findClearest = async () => {
    if (!intervals || !shown) return;
    const id = ++searchRun.current;
    setSearching(true);
    let date: string | null = shown.date;
    let best: { date: string; score: number } | null = null;
    for (let i = 0; i < 10 && date; i++) {
      const m = await measureUrl(snapshotUrl(product, date, box, 160, 100), false);
      if (id !== searchRun.current) return;
      if (m) {
        const score = m.stats.noData + m.stats.bright * (1 - m.stats.noData);
        if (!best || score < best.score) best = { date, score };
      }
      date = snapDate(intervals, addDays(date, -1));
    }
    setSearching(false);
    if (best) setRequested(best.date);
  };

  const step = (dir: -1 | 1) => {
    if (!intervals || !shown) return;
    const target = dir < 0 ? snapDate(intervals, addDays(shown.date, -1)) : nextDate(intervals, shown.date, product.periodDays);
    if (target) setRequested(target);
  };

  const notes = shown ? describe(product, shown, lat, legend) : [];
  const newest = intervals ? latestDate(intervals) : null;

  return (
    <div ref={ref} className={cn("satellite-view", className)}>
      {/* Product */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-label="Imagery type" className="flex rounded-lg bg-white/[0.05] p-0.5 ring-1 ring-white/10">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={group === g.id}
              onClick={() => {
                setGroup(g.id);
                setRequested(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                group === g.id ? "bg-white text-background" : "text-foreground/75 hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        {group === "true" && (
          <select
            aria-label="Satellite"
            value={trueId}
            onChange={(e) => {
              setTrueId(e.target.value);
              setRequested(null);
            }}
            className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs ring-1 ring-white/10 outline-none focus-visible:ring-primary"
          >
            {SAT_PRODUCTS.filter((p) => p.group === "true").map((p) => (
              <option key={p.id} value={p.id} className="bg-background">
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Image */}
      <div className="relative mt-2 aspect-[16/10] overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10">
        {display && (
          // eslint-disable-next-line @next/next/no-img-element -- live GIBS WMS snapshot, sized by the request
          <img
            key={display.url}
            src={display.url}
            crossOrigin="anonymous"
            alt={`Satellite view of ${name}, ${display.date}`}
            width={W}
            height={H}
            onLoad={() => setLoadedUrl(display.url)}
            className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
          />
        )}
        {/* Pin at the centre of the view. */}
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.6)]" />
        {busy && !error && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30 text-xs text-white/85">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {busy === "search" ? "Looking for a clearer day…" : "Loading from NASA GIBS…"}
          </span>
        )}
        {error && <span className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white/85">{error}</span>}
        <div className="absolute end-2 bottom-2 flex gap-1">
          {ZOOMS.map((z, i) => (
            <button
              key={z.km}
              type="button"
              onClick={() => setZoom(i)}
              aria-pressed={zoom === i}
              title={`About ${z.km} km tall`}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md transition-colors duration-150",
                zoom === i ? "bg-white text-background" : "bg-black/50 text-white/85 hover:bg-black/65",
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend for composites */}
      {product.legend && legend?.ramp && legend.range && (
        <div className="mt-2">
          <span className="block h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${legend.ramp.join(",")})` }} aria-hidden />
          <span className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
            <span>
              {legend.range[0]} {legend.units}
            </span>
            <span>
              {legend.range[1]} {legend.units}
            </span>
          </span>
        </div>
      )}

      {/* Date */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" aria-label="Earlier image" onClick={() => step(-1)} disabled={!shown || !!busy} className="rounded-lg p-1.5 ring-1 ring-white/10 transition-colors duration-150 hover:bg-white/10 disabled:opacity-40">
          <ChevronLeft className="size-3.5" />
        </button>
        <input
          type="date"
          aria-label="Image date"
          value={display?.date ?? ""}
          min={product.start}
          max={newest ?? today}
          onChange={(e) => e.target.value && setRequested(e.target.value)}
          className="hud rounded-lg bg-white/[0.05] px-2 py-1 text-xs ring-1 ring-white/10 outline-none [color-scheme:dark] focus-visible:ring-primary"
        />
        <button
          type="button"
          aria-label="Later image"
          onClick={() => step(1)}
          disabled={!shown || !!busy || (newest !== null && shown.date >= newest)}
          className="rounded-lg p-1.5 ring-1 ring-white/10 transition-colors duration-150 hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" />
        </button>
        {product.periodDays === 1 && (
          <button
            type="button"
            onClick={findClearest}
            disabled={!shown || !!busy}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary ring-1 ring-primary/30 transition-colors duration-150 hover:bg-primary/10 disabled:opacity-40"
          >
            <Sparkles className="size-3.5" aria-hidden />
            Clearest of last 10 days
          </button>
        )}
      </div>

      {/* What the image shows, honestly */}
      {notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {notes.map((n) => (
            <li key={n.text} className={cn("flex gap-1.5 text-[11.5px] leading-snug", n.tone === "warn" ? "text-warn" : "text-muted-foreground")}>
              {n.tone === "warn" ? <CloudSun className="mt-px size-3.5 shrink-0" aria-hidden /> : <Satellite className="mt-px size-3.5 shrink-0" aria-hidden />}
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>NASA GIBS · {product.label}</span>
        {shown && (
          <a href={worldviewLink(product, shown.date, box)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Open in Worldview
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

/** First available date after `iso` (Intervals snap down, so search forward a period at a time). */
function nextDate(intervals: Intervals, iso: string, periodDays: number) {
  for (let i = 1; i <= periodDays * 3 + 31; i++) {
    const d = addDays(iso, i);
    const s = snapDate(intervals, d);
    if (s && s > iso) return s;
  }
  return null;
}

function describe(p: SatProduct, s: Shown, lat: number, legend: Legend | null) {
  const out: { text: string; tone: "info" | "warn" }[] = [];
  const m = s.measured;
  if (p.periodDays > 1) {
    out.push({ text: `${p.periodDays}-day composite: ${niceDate(s.date)} to ${niceDate(addDays(s.date, p.periodDays - 1))}. ${p.note.split(",")[0]}.`, tone: "info" });
  } else if (s.steppedBack) {
    out.push({ text: `Newest image with data here: ${niceDate(s.date)} (later days are empty for this place: not processed yet or between satellite passes).`, tone: "info" });
  } else if (s.requested !== s.date) {
    out.push({ text: `No ${p.label} image for ${niceDate(s.requested)}; showing ${niceDate(s.date)}.`, tone: "info" });
  }
  if (!m) return out;
  const { noData, bright } = m.stats;
  if (noData >= 0.95) {
    if (p.group === "true" && polarNight(lat, s.date)) out.push({ text: `Polar night: at ${Math.abs(lat).toFixed(0)}° ${lat > 0 ? "N" : "S"} the Sun stays below the horizon on this date, so there is no true-colour image. Try land temperature, or a summer date.`, tone: "warn" });
    else if (p.group === "true") out.push({ text: "No imagery for this place on this date: it fell between satellite passes or has not been processed yet. Try the previous day.", tone: "warn" });
    else if (p.group === "lst") out.push({ text: "No temperature anywhere in view for this period: cloudy for all 8 days, open water, or polar night.", tone: "warn" });
    else out.push({ text: "No NDVI anywhere in view: NDVI is not computed over water or permanent ice, and cloud can blank a whole period.", tone: "warn" });
    return out;
  }
  if (noData >= 0.12) {
    const why = p.group === "true" ? "a gap between satellite passes" : p.group === "lst" ? "cloud on all 8 days, or water" : "water, ice or cloud";
    out.push({ text: `${pct(noData)} of the view has no data (${why}).`, tone: noData > 0.4 ? "warn" : "info" });
  }
  if (p.group === "true") {
    if (bright >= 0.5) out.push({ text: `${pct(bright)} of the image is bright white. That could be cloud, snow, ice or a salt flat: in true colour they look the same.`, tone: "warn" });
    else if (bright >= 0.15) out.push({ text: `${pct(bright)} bright white (cloud, snow, ice or salt).`, tone: "info" });
    else out.push({ text: `Mostly clear: ${pct(bright)} bright white.`, tone: "info" });
  }
  if (legend?.table && p.legend) {
    const [r, g, b, a] = m.centre;
    const v = a < 8 ? null : valueFromTable(legend.table, r, g, b);
    const fmt = (x: number) => (legend.units === "NDVI" ? x.toFixed(2) : `${Math.round(x)}`);
    out.push({
      text: v ? `At the pin: ${fmt(v.low)} to ${fmt(v.high)}${legend.units === "NDVI" ? "" : ` ${legend.units}`}.` : "At the pin: no value in this composite (gap).",
      tone: "info",
    });
  }
  return out;
}
