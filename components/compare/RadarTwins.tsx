"use client";

import { ArrowRight, Crosshair, Layers, Radar } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState, type PointerEvent } from "react";
import radar from "@/lib/data/radar.generated.json";
import { toLatLon } from "@/lib/moonbase/projection";
import { decodeGreyPng } from "@/lib/moonbase/png";
import { cn } from "@/lib/utils";

/**
 * Radar Twins: CSA RADARSAT Constellation Mission radar over the Canadian Arctic next to NASA LRO Mini-RF radar of the
 * Moon. Images, value grids and histograms come from scripts/build-radar-twins.py (calibrated sigma nought, noise
 * floor removed, multilooked, geolocated with the product's tie points).
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const VIRIDIS =
  "linear-gradient(90deg,#440154,#482878,#3e4989,#31688e,#26828e,#1f9e89,#35b779,#6ece58,#b5de2b,#fde725)";
const ICE = "linear-gradient(90deg,#05070d,#1b2433,#34445a,#5a6f86,#8aa2b8,#c4d4e2,#f2f7fb)";

type GridMeta = { file: string; scale: number; offset: number; nodata: number; width: number; height: number };
type Hist = { lo: number; hi: number; counts: number[]; median: number | null; n: number };
type Grid = { w: number; h: number; data: Uint8Array | Uint16Array };

const gridCache = new Map<string, Promise<Grid>>();
function loadGrid(file: string) {
  let p = gridCache.get(file);
  if (!p) {
    p = fetch(`/data/radar/${file}`)
      .then((r) => r.arrayBuffer())
      .then(decodeGreyPng)
      .then(({ width, height, data }) => ({ w: width, h: height, data }));
    p.catch(() => gridCache.delete(file));
    gridCache.set(file, p);
  }
  return p;
}

function valueAt(grid: Grid | null, meta: GridMeta, u: number, v: number) {
  if (!grid) return null;
  const x = Math.min(grid.w - 1, Math.max(0, Math.floor(u * grid.w)));
  const y = Math.min(grid.h - 1, Math.max(0, Math.floor(v * grid.h)));
  const dn = grid.data[y * grid.w + x];
  return dn === meta.nodata ? null : meta.offset + dn * meta.scale;
}

const evalPoly = (coef: number[][], u: number, v: number) => coef.reduce((s, [i, j, c]) => s + c * u ** i * v ** j, 0);
const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? "S" : "N"}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? "W" : "E"}`;

/** Hover/tap readout over an image whose box has exactly the grid's aspect ratio. */
function useProbe(grids: Record<string, GridMeta>) {
  const [loaded, setLoaded] = useState<Record<string, Grid>>({});
  const [probe, setProbe] = useState<{ u: number; v: number } | null>(null);
  const want = useCallback(() => {
    for (const g of Object.values(grids)) {
      if (!loaded[g.file]) void loadGrid(g.file).then((grid) => setLoaded((prev) => ({ ...prev, [g.file]: grid })));
    }
  }, [grids, loaded]);
  const onMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = (e.clientY - r.top) / r.height;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) setProbe({ u, v });
  }, []);
  return { loaded, probe, setProbe, want, onMove };
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs transition-colors duration-150",
            value === o.id
              ? "bg-white/[0.1] text-foreground ring-1 ring-white/15"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Legend({ ramp, lo, hi, left, right }: { ramp: string; lo: string; hi: string; left: string; right: string }) {
  return (
    <div className="mt-3">
      <div className="h-2 rounded-full" style={{ background: ramp }} aria-hidden />
      <div className="mt-1.5 flex justify-between gap-3 hud text-[10.5px] text-muted-foreground">
        <span>
          {lo} · {left}
        </span>
        <span className="text-end">
          {right} · {hi}
        </span>
      </div>
    </div>
  );
}

function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "csa" | "nasa" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1",
        tone === "csa" && "bg-[oklch(0.62_0.2_25/0.14)] text-[oklch(0.82_0.12_25)] ring-[oklch(0.62_0.2_25/0.35)]",
        tone === "nasa" && "bg-[oklch(0.6_0.15_255/0.15)] text-[oklch(0.82_0.1_255)] ring-[oklch(0.6_0.15_255/0.35)]",
        tone === "default" && "bg-white/[0.05] text-muted-foreground ring-white/10",
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------- Earth panel */

const EARTH = radar.earth;

function EarthPanel() {
  const [mode, setMode] = useState<"ratio" | "hh">("ratio");
  const [outline, setOutline] = useState(false);
  const grids = EARTH.grids as unknown as { hh: GridMeta; ratio: GridMeta };
  const { loaded, probe, setProbe, want, onMove } = useProbe({ hh: grids.hh, ratio: grids.ratio });
  const [land, setLand] = useState<Grid | null>(null);
  useEffect(() => {
    if (probe && !land) void loadGrid(EARTH.grids.land.file).then(setLand);
  }, [probe, land]);
  const meta = grids[mode];
  const v = probe ? valueAt(loaded[meta.file] ?? null, meta, probe.u, probe.v) : null;
  const isLand =
    probe && land
      ? land.data[
          Math.min(land.h - 1, Math.floor(probe.v * land.h)) * land.w +
            Math.min(land.w - 1, Math.floor(probe.u * land.w))
        ] > 127
      : null;
  const reduce = useReducedMotion();

  return (
    <article className="flex flex-col rounded-[1.6rem] bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="csa">CSA · Earth</Chip>
        <Chip>RADARSAT Constellation · C-band 5.6 cm</Chip>
      </div>
      <h3 className="mt-3 font-heading text-xl font-semibold tracking-tight">Canadian Arctic islands</h3>
      <p className="text-sm text-muted-foreground">
        {EARTH.date} · {EARTH.mode} · {EARTH.pixel.split(" (")[0]} pixels
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Earth radar layer"
          value={mode}
          onChange={setMode}
          options={[
            { id: "ratio", label: "Roughness · HV/HH" },
            { id: "hh", label: "Brightness · HH" },
          ]}
        />
        <button
          type="button"
          aria-pressed={outline}
          onClick={() => setOutline(!outline)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs ring-1 transition-colors duration-150",
            outline
              ? "bg-[oklch(0.75_0.15_60/0.14)] text-[oklch(0.86_0.11_70)] ring-[oklch(0.75_0.15_60/0.35)]"
              : "text-muted-foreground ring-white/10 hover:text-foreground",
          )}
        >
          <Layers className="size-3.5" aria-hidden /> Land outline
        </button>
      </div>

      <div
        className="relative mt-3 w-full cursor-crosshair touch-none overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
        style={{ aspectRatio: `${grids.hh.width} / ${grids.hh.height}` }}
        onPointerEnter={want}
        onPointerDown={(e) => {
          want();
          onMove(e);
        }}
        onPointerMove={onMove}
        onPointerLeave={(e) => e.pointerType === "mouse" && setProbe(null)}
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={mode}
            src={EARTH.images[mode]}
            alt={
              mode === "ratio"
                ? "RCM cross-polarisation ratio (HV/HH) of the Canadian Arctic islands"
                : "RCM HH backscatter of the Canadian Arctic islands"
            }
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            draggable={false}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          />
        </AnimatePresence>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-[oklch(0.78_0.16_60)] transition-opacity duration-300",
            outline ? "opacity-25" : "opacity-0",
          )}
          style={{
            maskImage: `url(/data/radar/${EARTH.grids.land.file})`,
            WebkitMaskImage: `url(/data/radar/${EARTH.grids.land.file})`,
            maskMode: "luminance",
            maskSize: "100% 100%",
            WebkitMaskSize: "100% 100%",
          }}
        />
        <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
          N ↑
        </span>
        {probe && (
          <>
            <span
              className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/90"
              style={{ left: `${probe.u * 100}%`, top: `${probe.v * 100}%` }}
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl glass px-3 py-2 hud text-[11px]">
              <span>
                {fmtLat(evalPoly(EARTH.geo.lat, probe.u, probe.v))} {fmtLon(evalPoly(EARTH.geo.lon, probe.u, probe.v))}
              </span>
              <span className="text-primary">
                {v === null ? (loaded[meta.file] ? "no data" : "loading…") : `${v.toFixed(1)} dB`}
              </span>
              {isLand !== null && <span className="text-muted-foreground">{isLand ? "land" : "sea ice"}</span>}
            </div>
          </>
        )}
      </div>

      {mode === "ratio" ? (
        <Legend
          ramp={VIRIDIS}
          lo={`${EARTH.ranges.ratio[0]} dB`}
          hi={`${EARTH.ranges.ratio[1]} dB`}
          left="smooth, flat ice"
          right="rough rock, ridged old ice"
        />
      ) : (
        <Legend
          ramp={ICE}
          lo={`${EARTH.ranges.hh[0]} dB`}
          hi={`${EARTH.ranges.hh[1]} dB`}
          left="dark: smooth"
          right="bright: rough or tilted"
        />
      )}
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        {mode === "ratio"
          ? "HV/HH compares echoes that come back with the polarisation turned against those that keep it. Rough, jumbled surfaces scramble polarisation, so they read higher: Earth's closest match to the Moon's CPR."
          : "HH is the plain echo strength: how much of the radar pulse bounces straight back. Ridged ice and rocky slopes are bright; young, flat ice is dark."}
      </p>
    </article>
  );
}

/* ---------------------------------------------------------------------------------------------- Moon panel */

const CROPS = radar.moon.crops;

function MoonPanel({ crop, onCrop }: { crop: number; onCrop: (i: number) => void }) {
  const c = CROPS[crop];
  const meta = c.grid as GridMeta;
  const { loaded, probe, setProbe, want, onMove } = useProbe({ [c.id]: meta });
  const v = probe ? valueAt(loaded[meta.file] ?? null, meta, probe.u, probe.v) : null;
  const reduce = useReducedMotion();
  let where = "";
  if (probe) {
    const half = c.bounds.halfWidthKm;
    const x = (probe.u - 0.5) * 2 * half;
    const y = (0.5 - probe.v) * 2 * half;
    if (c.id === "pole") {
      const [lat, lon] = toLatLon(x, y);
      where = `${fmtLat(lat)} ${fmtLon(lon)}`;
    } else if ("centre" in c.bounds && c.bounds.centre) {
      const [la0, lo0] = c.bounds.centre as number[];
      const kmDeg = (Math.PI * 1737.4) / 180;
      const lat = la0 + y / kmDeg;
      where = `${fmtLat(lat)} ${fmtLon(lo0 + x / (kmDeg * Math.cos((lat * Math.PI) / 180)))}`;
    }
  }

  return (
    <article className="flex flex-col rounded-[1.6rem] bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="nasa">NASA · Moon</Chip>
        <Chip>LRO Mini-RF · S-band 12.6 cm</Chip>
      </div>
      <h3 className="mt-3 font-heading text-xl font-semibold tracking-tight">{c.name}</h3>
      <p className="text-sm text-muted-foreground">
        {c.where} · {c.coverage} % covered by Mini-RF orbits
      </p>

      <div className="mt-4">
        <Segmented
          label="Moon radar crop"
          value={c.id}
          onChange={(id) => onCrop(CROPS.findIndex((k) => k.id === id))}
          options={CROPS.map((k) => ({
            id: k.id,
            label: k.id === "pole" ? "South pole" : k.name.replace(" crater", ""),
          }))}
        />
      </div>

      <div
        className="relative mt-3 aspect-square w-full cursor-crosshair touch-none overflow-hidden rounded-2xl bg-[#05070d] ring-1 ring-white/10"
        onPointerEnter={want}
        onPointerDown={(e) => {
          want();
          onMove(e);
        }}
        onPointerMove={onMove}
        onPointerLeave={(e) => e.pointerType === "mouse" && setProbe(null)}
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={c.id}
            src={c.image}
            alt={`Mini-RF circular polarisation ratio of ${c.name}`}
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            draggable={false}
            initial={reduce ? false : { opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        </AnimatePresence>
        <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
          {c.id === "pole" ? "0° ↑" : "N ↑"} · {2 * c.bounds.halfWidthKm} km
        </span>
        {probe && (
          <>
            <span
              className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/90"
              style={{ left: `${probe.u * 100}%`, top: `${probe.v * 100}%` }}
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl glass px-3 py-2 hud text-[11px]">
              <span>{where}</span>
              <span className="text-primary">
                {v === null ? (loaded[meta.file] ? "no data (orbit gap)" : "loading…") : `CPR ${v.toFixed(2)}`}
              </span>
            </div>
          </>
        )}
      </div>

      <Legend
        ramp={VIRIDIS}
        lo={String(radar.moon.range[0])}
        hi={String(radar.moon.range[1])}
        left="smooth regolith"
        right="rough rock, or ice?"
      />
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{c.caption}</p>
    </article>
  );
}

/* ---------------------------------------------------------------------------------------------- histograms */

function HistChart({
  a,
  b,
  labels,
  colors,
  unit,
  digits,
}: {
  a: Hist;
  b: Hist;
  labels: [string, string];
  colors: [string, string];
  unit: string;
  digits: number;
}) {
  const W = 320;
  const H = 110;
  const max = Math.max(...a.counts, ...b.counts) || 1;
  const path = (h: Hist) => {
    const n = h.counts.length;
    const pts = h.counts.map((c, i) => `${((i + 0.5) / n) * W},${H - (c / max) * (H - 8)}`);
    return `M0,${H} L${pts.join(" L")} L${W},${H} Z`;
  };
  const x = (h: Hist, value: number | null) => (value === null ? null : ((value - h.lo) / (h.hi - h.lo)) * W);
  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="w-full"
        role="img"
        aria-label={`${labels[0]} median ${a.median}${unit}, ${labels[1]} median ${b.median}${unit}`}
      >
        {[a, b].map((h, k) => (
          <path
            key={k}
            d={path(h)}
            fill={colors[k]}
            fillOpacity={0.28}
            stroke={colors[k]}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ))}
        {[a, b].map((h, k) => {
          const px = x(h, h.median);
          return px === null ? null : (
            <line key={k} x1={px} x2={px} y1={4} y2={H} stroke={colors[k]} strokeDasharray="3 3" strokeWidth={1.2} />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between hud text-[10.5px] text-muted-foreground" aria-hidden>
        <span>
          {a.lo}
          {unit}
        </span>
        <span>
          {a.hi}
          {unit}
        </span>
      </div>
      <figcaption className="mt-2 grid gap-1 text-[12px]">
        {[a, b].map((h, k) => (
          <span key={k} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ background: colors[k] }} aria-hidden />
              {labels[k]}
            </span>
            <span className="hud text-foreground">
              median {h.median?.toFixed(digits)}
              {unit}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------------------------------------- section */

const STEPS = [
  { t: "Read", d: "RCM GeoTIFF bands (16-bit amplitude), as in CSA's SAR Python tutorial" },
  { t: "Calibrate", d: "σ⁰ = DN² ÷ gain, from the product's lutSigma tables" },
  { t: "Denoise", d: "Subtract the instrument noise floor (NESZ ≈ −36 dB)" },
  { t: "Multilook", d: "Average 8 × 8 pixels: 40 m → 320 m, less speckle" },
  { t: "Geolocate", d: "169 tie points → lat/lon fit, accurate to ~20 m" },
];

const COMPARE = [
  {
    k: "Agency · craft",
    earth: "CSA · RADARSAT Constellation (3 satellites)",
    moon: "NASA · Lunar Reconnaissance Orbiter",
  },
  { k: "Wavelength", earth: "5.6 cm (C-band)", moon: "12.6 cm (S-band): sees larger blocks, slightly deeper" },
  {
    k: "Polarisation",
    earth: "Dual linear HH + HV (this scene); RCM also flies compact polarimetry",
    moon: "Hybrid (compact) polarimetry: transmit circular, receive H and V",
  },
  { k: "Roughness measure", earth: "HV/HH cross-polarisation ratio", moon: "Circular polarisation ratio (CPR)" },
  { k: "Pixel size", earth: "40 m (shown at 320 m)", moon: "~950 m mosaic (32 px/°)" },
  {
    k: "Can it prove ice?",
    earth: "No: old ridged sea ice and rock look alike",
    moon: "No: rough rock and ice both raise CPR",
  },
];

export function RadarTwins() {
  const [crop, setCrop] = useState(0);
  const c = CROPS[crop];
  const reduce = useReducedMotion();
  const eh = EARTH.hist.ratio as { land: Hist; sea: Hist };

  return (
    <section className="mt-20" aria-labelledby="radar-title">
      <div className="max-w-3xl">
        <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-primary uppercase">
          <Radar className="size-3.5" aria-hidden /> Radar twins · CSA × NASA
        </p>
        <h2
          id="radar-title"
          className="mt-2 font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight text-balance"
        >
          Two radars, one question: rough rock, or ice?
        </h2>
        <p className="mt-2 max-w-[66ch] text-muted-foreground">
          Radar sees through darkness and cloud, and it feels the surface: rough, blocky ground scrambles the
          echo&apos;s polarisation. Canada&apos;s RADARSAT Constellation maps Arctic ice this way; NASA&apos;s Mini-RF
          did the same at the Moon&apos;s poles, hunting for ice in craters that never see the Sun. Hover or tap either
          image to read the real values.
        </p>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <EarthPanel />
        <MoonPanel crop={crop} onCrop={setCrop} />
      </div>

      {/* What the numbers say */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.6rem] bg-white/[0.03] p-5 ring-1 ring-white/10">
          <p className="text-[11px] font-medium tracking-[0.14em] text-primary uppercase">
            Earth · roughness by surface
          </p>
          <div className="mt-3">
            <HistChart
              a={eh.land}
              b={eh.sea}
              labels={["Land (tundra, rock)", "Sea ice"]}
              colors={["#f5a35c", "#5ec8e5"]}
              unit=" dB"
              digits={1}
            />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Almost the same. In November the sea here is covered by old, ridged ice that is as rough to a 5.6 cm radar
            as frost-shattered rock. Radar measures roughness, not what the ground is made of.
          </p>
        </div>
        <div className="rounded-[1.6rem] bg-white/[0.03] p-5 ring-1 ring-white/10">
          <p className="text-[11px] font-medium tracking-[0.14em] text-primary uppercase">Moon · CPR at {c.name}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={c.id}
              className="mt-3"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              {c.hist && c.labels && (
                <HistChart
                  a={c.hist.rough as Hist}
                  b={c.hist.smooth as Hist}
                  labels={[c.labels.rough, c.labels.smooth]}
                  colors={["#fde725", "#3e4989"]}
                  unit=""
                  digits={2}
                />
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                {c.id === "pole"
                  ? "Cold traps read only a little higher than the rest of the polar ground. Ice could explain it, but so could rougher crater walls: the same ambiguity as on Earth, which is why Mini-RF is paired with Diviner temperatures and LEND neutrons on the Moon Base Map."
                  : "A clear jump: the young crater's blocky ejecta reads far rougher than the older plains. On the Moon, high CPR away from the poles is almost always rock, which is what makes the polar readings hard to interpret."}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Same physics, different radar */}
      <div className="mt-5 overflow-hidden rounded-[1.6rem] ring-1 ring-white/10">
        <div className="grid grid-cols-2 bg-white/[0.04] px-4 py-2.5 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase sm:grid-cols-[minmax(7rem,0.7fr)_1fr_1fr] sm:px-5">
          <span className="hidden sm:block" />
          <span>Earth · RCM</span>
          <span>Moon · Mini-RF</span>
        </div>
        <dl>
          {COMPARE.map((r) => (
            <div
              key={r.k}
              className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/[0.06] px-4 py-3 text-[13px] sm:grid-cols-[minmax(7rem,0.7fr)_1fr_1fr] sm:gap-3 sm:px-5"
            >
              <dt className="col-span-2 text-[11px] text-muted-foreground sm:col-span-1 sm:text-[13px]">{r.k}</dt>
              <dd className="text-foreground/90">{r.earth}</dd>
              <dd className="text-foreground/90">{r.moon}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Processing */}
      <div className="mt-5 rounded-[1.6rem] bg-white/[0.03] p-5 ring-1 ring-white/10">
        <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-primary uppercase">
          <Crosshair className="size-3.5" aria-hidden /> How we processed the CSA scene
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.07]">
              <span className="font-mono text-[10px] text-primary">0{i + 1}</span>
              <p className="mt-1 text-sm font-medium">{s.t}</p>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{s.d}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  className="absolute top-1/2 -right-3 hidden size-4 -translate-y-1/2 text-muted-foreground/60 lg:block"
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          Script: <code className="font-mono text-foreground/80">scripts/build-radar-twins.py</code>. Product{" "}
          {EARTH.product}, {EARTH.licence}.
        </p>
      </div>

      {/* More RCM scenes */}
      <div className="mt-5">
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          More RCM scenes from CSA open data
        </p>
        <ul className="mt-3 grid gap-4 sm:grid-cols-3">
          {radar.gallery.map((g) => (
            <li key={g.product} className="group overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
              <div className="relative aspect-[4/3] overflow-hidden bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element -- small static previews, already sized webp */}
                <img
                  src={g.image}
                  alt={`RCM preview: ${g.where}`}
                  loading="lazy"
                  className="size-full object-cover opacity-90 transition-transform duration-700 ease-out group-hover:scale-105"
                />
              </div>
              <div className="p-3.5">
                <p className="text-sm font-medium">{g.where}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {g.date} · {g.note}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
