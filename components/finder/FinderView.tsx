"use client";

import { Atom, BookOpenText, ChevronDown, Crosshair, Gauge, Info, SlidersHorizontal, Table2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detailValues, getEngine, loadDetail, type FinderEngine } from "@/lib/finder/engine";
import { HEAT_CSS } from "@/lib/finder/model";
import { NAMED_SITES, distinctLabels, labelPlace, loadLabeller } from "@/lib/finder/places";
import { DEFAULT_WEIGHTS, confidence } from "@/lib/finder/text";
import type { CellResult, DimId, ScoreResult, Weights } from "@/lib/finder/types";
import { useRoviHandler } from "@/lib/rovi/handlers";
import type { Lookup } from "@/lib/lookup";
import { cn } from "@/lib/utils";
import { Reveal, SlideWords } from "@/components/landing/Reveal";
import { CandidateCard } from "./CandidateCard";
import { CandidateSummary } from "./CandidateSummary";
import { AnalogueSpace } from "./AnalogueSpace";
import { FinderTabs } from "./FinderTabs";
import { learnedFits, type LearnedWeights } from "./WeightPanel";
import type { FlyRequest, MapPin } from "./FinderMap";
import { MethodPanel, TargetProfile } from "./MethodPanel";
import { SiteTable, type SiteRow } from "./SiteTable";
import { SiteList } from "./SiteList";
import { TargetPicker } from "./TargetPicker";
import { WeightPanel } from "./WeightPanel";
import "./finder.css";
import { Morph } from "@/components/motion/PageTransition";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// Leaflet touches window on import: client only, after first paint.
const FinderMap = dynamic(() => import("./FinderMap"), { ssr: false, loading: () => null });

/** What the detail panel shows: the best named site (default), a named site, a new find, or a clicked point. */
type Selection =
  | { kind: "auto" }
  | { kind: "ref"; id: string }
  | { kind: "pick"; index: number }
  | { kind: "probe"; lat: number; lon: number };

type ListMode = "named" | "new";

const SITE_BY_ID = new Map(NAMED_SITES.map((s) => [s.id, s]));

function useHeatUrl(result: ScoreResult | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!result) return;
    let next: string;
    let revoke = false;
    if (result.heat instanceof Blob) {
      next = URL.createObjectURL(result.heat);
      revoke = true;
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = result.heat.width;
      canvas.height = result.heat.height;
      canvas.getContext("2d")?.putImageData(result.heat, 0, 0);
      next = canvas.toDataURL("image/png");
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is derived from an external Blob
    setUrl(next);
    return () => {
      // Leaflet swaps the image a frame later; free the old blob once it is surely unused.
      if (revoke) setTimeout(() => URL.revokeObjectURL(next), 1500);
    };
  }, [result]);
  return url;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** The target's name in the headline: the old one slides up and out, the new one rises in. */
function TargetName({ name }: { name: string | null }) {
  const reduce = useReducedMotion();
  return (
    <span className="-mb-[0.12em] inline-grid overflow-hidden pb-[0.12em] align-bottom">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={name ?? "none"}
          className="col-start-1 row-start-1 bg-gradient-to-r from-primary to-[oklch(0.85_0.12_220)] bg-clip-text text-transparent"
          initial={reduce ? false : { y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={reduce ? undefined : { y: "-100%", opacity: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          {name ?? "the Moon or Mars"}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function FinderView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [engine, setEngine] = useState<FinderEngine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [weightsByTarget, setWeightsByTarget] = useState<Record<string, Weights>>({});
  const [selection, setSelection] = useState<Selection>({ kind: "auto" });
  const [listMode, setListMode] = useState<ListMode>("named");
  const [probe, setProbe] = useState<CellResult | null>(null);
  const [detailBuf, setDetailBuf] = useState<ArrayBuffer | null>(null);
  const [fly, setFly] = useState<FlyRequest | null>(null);
  const [mode, setMode] = useState<"default" | "learned" | "custom">("default");
  const [learned, setLearned] = useState<LearnedWeights | null>(null);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const lastId = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    getEngine().then(
      (e) => live && setEngine(e),
      () => live && setError("Could not load the Earth feature grid."),
    );
    loadLabeller().then((l) => live && setLookup(() => l));
    fetch("/data/ml/learned-weights/weights.json")
      .then((r) => r.json())
      .then(
        (j) => live && setLearned(j),
        () => {},
      );
    return () => {
      live = false;
    };
  }, []);

  const targets = engine?.data.targets.targets;
  const target = useMemo(() => {
    if (!targets) return null;
    return targets.find((t) => t.id === params.get("t")) ?? targets.find((t) => t.id === "mars-jezero") ?? targets[0];
  }, [targets, params]);
  const weights = useMemo(() => {
    if (!target) return null;
    if (mode === "learned" && learnedFits(learned)) {
      // Parameters the model did not learn (null) keep their hand-set weight.
      const w = { ...DEFAULT_WEIGHTS[target.world] };
      for (const [d, v] of Object.entries(learned.weights)) if (v !== null) w[d as DimId] = v;
      return w;
    }
    return weightsByTarget[target.id] ?? DEFAULT_WEIGHTS[target.world];
  }, [target, mode, learned, weightsByTarget]);

  // Score whenever target or weights change. The engine keeps one job in flight, so results stream in.
  useEffect(() => {
    if (!engine || !target || !weights) return;
    engine.score(target, weights).then((r) => {
      if (!r || r.id < lastId.current) return;
      lastId.current = r.id;
      setResult(r);
    });
  }, [engine, target, weights]);

  // Re-probe a clicked point after every new ranking so its card follows the weights.
  const probeLat = selection.kind === "probe" ? selection.lat : null;
  const probeLon = selection.kind === "probe" ? selection.lon : null;
  useEffect(() => {
    if (!engine || probeLat === null || probeLon === null || !result) return;
    let live = true;
    engine.probe(probeLat, probeLon).then((r) => live && setProbe(r));
    return () => {
      live = false;
    };
  }, [engine, probeLat, probeLon, result]);

  // Display-only values load after the first ranking is on screen.
  useEffect(() => {
    if (!result || detailBuf) return;
    const id = setTimeout(() => loadDetail().then(setDetailBuf, () => {}), 400);
    return () => clearTimeout(id);
  }, [result, detailBuf]);

  const heatUrl = useHeatUrl(result);

  const setTarget = useCallback(
    (id: string) => {
      router.replace(`${pathname}?t=${id}`, { scroll: false });
      setSelection({ kind: "auto" });
    },
    [router, pathname],
  );

  // Rovi can set the target and the weights (lib/rovi/actions.ts); the returned function undoes it.
  useRoviHandler("finder", ({ targetId, weights: w }: { targetId?: string; weights?: Partial<Weights> }) => {
    const prevSearch = window.location.search;
    const prevWeights = weightsByTarget;
    const prevMode = mode;
    const id = targetId ?? target?.id;
    if (targetId && targetId !== target?.id) setTarget(targetId);
    if (id && w) {
      const world = targets?.find((t) => t.id === id)?.world ?? (id.startsWith("moon") ? "moon" : "mars");
      setWeightsByTarget((m) => ({
        ...m,
        [id]: { ...(m[id] ?? DEFAULT_WEIGHTS[world]), ...w } as Record<DimId, number>,
      }));
      // Learned weights would hide Rovi's sliders: switch to custom, like dragging a slider does.
      setMode("custom");
    }
    return () => {
      setWeightsByTarget(prevWeights);
      setMode(prevMode);
      if (targetId && window.location.search !== prevSearch)
        router.replace(`${pathname}${prevSearch}`, { scroll: false });
    };
  });

  const labels = useMemo(() => (result ? distinctLabels(result.top, lookup) : []), [result, lookup]);

  // The two ranked lists: named analogue sites (each scored by its best cell nearby) and new places found anywhere.
  const namedRows: SiteRow[] = useMemo(() => {
    if (!result || !target || !weights) return [];
    return NAMED_SITES.flatMap((s) => {
      const c = result.refs[s.id];
      if (!c) return [];
      return [
        {
          id: s.id,
          name: s.name,
          region: s.region,
          group: s.group,
          score: c.score * 100,
          confidence: confidence(c, target, weights),
          lat: c.lat,
          lon: c.lon,
          sims: c.sims,
        },
      ];
    }).sort((a, b) => b.score - a.score);
  }, [result, target, weights]);
  const newRows: SiteRow[] = useMemo(() => {
    if (!result || !target || !weights) return [];
    return result.top.map((c, i) => ({
      id: `pick-${i}`,
      name: labels[i]?.title ?? "…",
      region: labels[i]?.subtitle ?? "",
      score: c.score * 100,
      confidence: confidence(c, target, weights),
      lat: c.lat,
      lon: c.lon,
      sims: c.sims,
    }));
  }, [result, target, weights, labels]);

  const bestNamed = namedRows[0]?.id;
  const effective: Selection = useMemo(
    () =>
      selection.kind === "auto" ? (bestNamed ? { kind: "ref", id: bestNamed } : { kind: "pick", index: 0 }) : selection,
    [selection, bestNamed],
  );

  const current: CellResult | null = !result
    ? null
    : effective.kind === "pick"
      ? (result.top[effective.index] ?? null)
      : effective.kind === "ref"
        ? result.refs[effective.id]
        : effective.kind === "probe"
          ? probe
          : null;
  const currentLabel = useMemo(() => {
    if (!current) return null;
    if (effective.kind === "ref") {
      const s = SITE_BY_ID.get(effective.id);
      const base = labelPlace(current.lat, current.lon, lookup);
      return s ? { ...base, title: s.name, subtitle: `${s.region} · ${s.why}` } : base;
    }
    if (effective.kind === "pick") return labels[effective.index] ?? labelPlace(current.lat, current.lon, lookup);
    return labelPlace(current.lat, current.lon, lookup);
  }, [current, effective, labels, lookup]);
  const currentRank =
    effective.kind === "ref"
      ? namedRows.findIndex((r) => r.id === effective.id) + 1 || null
      : effective.kind === "pick"
        ? effective.index + 1
        : null;

  const rows = listMode === "named" ? namedRows : newRows;
  const selectedRowId =
    effective.kind === "ref" ? effective.id : effective.kind === "pick" ? `pick-${effective.index}` : null;

  const pins: MapPin[] = useMemo(() => {
    const list = listMode === "named" ? namedRows.slice(0, 10) : newRows;
    const out: MapPin[] = list.map((r, i) => ({
      id: r.id,
      lat: r.lat,
      lon: r.lon,
      rank: i + 1,
      label: r.name,
      kind: "pick",
    }));
    if (current && selectedRowId && !list.some((r) => r.id === selectedRowId))
      out.push({
        id: selectedRowId,
        lat: current.lat,
        lon: current.lon,
        label: currentLabel?.title ?? "",
        kind: "probe",
      });
    if (current && effective.kind === "probe")
      out.push({ id: "probe", lat: current.lat, lon: current.lon, label: currentLabel?.title ?? "", kind: "probe" });
    return out;
  }, [listMode, namedRows, newRows, current, selectedRowId, effective.kind, currentLabel]);
  const selectedPin = selectedRowId ?? "probe";

  const flyTo = (lat: number, lon: number) => setFly((f) => ({ lat, lon, n: (f?.n ?? 0) + 1 }));
  const showCard = () => {
    const el = cardRef.current;
    if (!el || window.innerWidth >= 1280) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const selectRow = (id: string) => {
    if (id.startsWith("pick-")) {
      const i = Number(id.slice(5));
      setSelection({ kind: "pick", index: i });
      const c = result?.top[i];
      if (c) flyTo(c.lat, c.lon);
    } else {
      setSelection({ kind: "ref", id });
      const c = result?.refs[id];
      if (c) flyTo(c.lat, c.lon);
    }
  };

  // Deep link from the globe: /finder?t=mars-gale&ref=pk-khewra selects that named site once scores arrive.
  const refParam = params.get("ref");
  const shownRef = useRef<string | null>(null);
  useEffect(() => {
    const c = refParam ? result?.refs[refParam] : null;
    if (!refParam || !c || shownRef.current === refParam) return;
    shownRef.current = refParam;
    setListMode("named");
    setSelection({ kind: "ref", id: refParam });
    setFly((f) => ({ lat: c.lat, lon: c.lon, n: (f?.n ?? 0) + 1 }));
    requestAnimationFrame(() => document.getElementById("finder-results")?.scrollIntoView({ block: "start" }));
  }, [result, refParam]);

  const detail = current && detailBuf && engine ? detailValues(engine.data.header, detailBuf, current.cell) : null;

  return (
    <div className="mx-auto max-w-[1680px]">
      <Morph name="feature-finder">
        <header>
          <Reveal y={10}>
            <p className="text-xs font-medium tracking-[0.14em] text-primary uppercase">Analog Finder</p>
          </Reveal>
          <h1 className="mt-2 font-heading text-[clamp(2rem,3.6vw,3rem)] leading-[1.08] font-semibold tracking-tight text-balance">
            <SlideWords text="Where on Earth is most like" onMount /> <TargetName name={target ? target.name : null} />?
          </h1>
          <Reveal delay={0.3} y={14}>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {NAMED_SITES.length} real analogue sites, and every 28 km of Earth&apos;s land, ranked against it with
              NASA data.
            </p>
          </Reveal>
        </header>
      </Morph>

      <div id="finder-target" className="scroll-mt-36">
        {targets && target ? (
          <TargetPicker targets={targets} current={target} onPick={setTarget} />
        ) : (
          <div className="mt-7 h-[5.5rem]" aria-hidden />
        )}
      </div>

      <Reveal y={36} className="mt-5">
        <div
          id="finder-stage"
          data-engine={engine?.mode}
          className="grid scroll-mt-24 gap-4 md:grid-cols-2 xl:h-[clamp(34rem,calc(100vh-18rem),46rem)] xl:grid-cols-[19rem_minmax(0,1fr)_23rem] 2xl:grid-cols-[21rem_minmax(0,1fr)_26rem]"
        >
          <div className="relative isolate h-[clamp(20rem,55vh,30rem)] overflow-hidden rounded-[1.6rem] shadow-[0_40px_100px_-50px_var(--primary)] ring-1 ring-white/10 md:col-span-2 xl:order-2 xl:col-span-1 xl:h-full">
            {engine && (
              <FinderMap
                heatUrl={heatUrl}
                pins={pins}
                selectedId={selectedPin}
                fly={fly}
                onPick={(id) => {
                  if (id !== "probe") selectRow(id);
                  showCard();
                }}
                onProbe={(lat, lon) => {
                  setSelection({ kind: "probe", lat, lon });
                  setProbe(null);
                  showCard();
                }}
              />
            )}
            {!result && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 text-center">
                <span className="finder-pulse size-10 rounded-full border border-primary/50" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  {error ?? "Loading the NASA Earth parameter grid (3.7 MB)…"}
                </p>
              </div>
            )}
            {result && target && (
              <>
                <button
                  type="button"
                  onClick={() => setWeightsOpen(true)}
                  className="absolute start-3 top-3 z-[500] inline-flex items-center gap-2 rounded-xl glass py-2 ps-3 pe-3.5 text-sm font-medium ring-1 ring-white/12 transition-[box-shadow,scale] duration-150 ease-out hover:ring-white/25 motion-safe:active:scale-[0.96]"
                >
                  <SlidersHorizontal className="size-4" aria-hidden />
                  Adjust what matters
                  {mode !== "default" && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                      {mode === "learned" ? "Learned" : "Custom"}
                    </span>
                  )}
                </button>
                <div className="pointer-events-none absolute start-3 bottom-3 z-[500] w-[min(18rem,calc(100%-1.5rem))] rounded-2xl glass px-3.5 py-3">
                  <p className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="font-medium text-foreground">Match to {target.name}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Crosshair className="size-3" aria-hidden /> tap to score
                    </span>
                  </p>
                  <div className="mt-2 h-2 rounded-full" style={{ backgroundImage: HEAT_CSS }} />
                  <p className="mt-1.5 flex justify-between text-[12px] text-muted-foreground">
                    <span>Unlike</span>
                    <span>Very similar</span>
                  </p>
                </div>
                <p className="pointer-events-none absolute end-3 bottom-3 z-[500] hidden items-center gap-2 rounded-full glass px-3 py-1.5 text-[11px] text-muted-foreground sm:flex">
                  <span className="size-1.5 rounded-full bg-ok" aria-hidden />
                  <span className="hud">{engine?.data.header.grid.cells.toLocaleString("en-US")}</span> cells in{" "}
                  <span className="hud">{Math.max(1, Math.round(result.ms))} ms</span>
                </p>
              </>
            )}
          </div>

          {result && target && engine ? (
            <>
              <div className="flex min-h-0 flex-col max-md:max-h-[28rem] md:max-xl:h-[34rem] xl:order-1">
                <SiteList
                  mode={listMode}
                  onMode={(m) => {
                    setListMode(m);
                    setSelection(m === "named" ? { kind: "auto" } : { kind: "pick", index: 0 });
                  }}
                  namedCount={namedRows.length}
                  newCount={newRows.length}
                  rows={rows}
                  selectedId={selectedRowId}
                  onSelect={(id) => {
                    selectRow(id);
                    showCard();
                  }}
                />
              </div>
              <div ref={cardRef} className="flex min-h-0 scroll-mt-24 flex-col md:max-xl:h-[34rem] xl:order-3">
                {current && currentLabel ? (
                  <CandidateSummary
                    cell={current}
                    label={currentLabel}
                    rank={currentRank}
                    target={target}
                    confidence={confidence(current, target, weights ?? DEFAULT_WEIGHTS[target.world])}
                    onFull={() => {
                      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                      document
                        .getElementById("finder-detail")
                        ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
                    }}
                  />
                ) : (
                  <p
                    className={cn(
                      "rounded-[1.6rem] bg-white/[0.03] p-6 text-sm text-muted-foreground ring-1 ring-white/10",
                      effective.kind === "probe" && "finder-pulse",
                    )}
                  >
                    {effective.kind === "probe"
                      ? "Scoring that spot…"
                      : "That place has no land cell in our grid (open water or a tiny island)."}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div
                className="hidden rounded-[1.6rem] bg-white/[0.03] ring-1 ring-white/10 md:block xl:order-1"
                aria-hidden
              />
              <div
                className="hidden rounded-[1.6rem] bg-white/[0.03] ring-1 ring-white/10 md:block xl:order-3"
                aria-hidden
              />
            </>
          )}
        </div>
      </Reveal>

      {target && weights && (
        <Sheet open={weightsOpen} onOpenChange={setWeightsOpen}>
          <SheetContent
            side="right"
            className="w-full overflow-y-auto overscroll-contain border-white/10 p-0 sm:max-w-md"
          >
            <SheetHeader className="border-b border-white/[0.07] px-6 pt-6 pb-5">
              <SheetTitle className="font-heading text-lg">Adjust what matters</SheetTitle>
              <SheetDescription>
                Weigh each of the 13 parameters for {target.name}. The map and the ranking update as you drag.
              </SheetDescription>
            </SheetHeader>
            <div className="px-6 pt-5 pb-8">
              <WeightPanel
                target={target}
                weights={weights}
                onChange={(w) => {
                  setWeightsByTarget((m) => ({ ...m, [target.id]: w }));
                  setMode("custom");
                }}
                onReset={() => {
                  setWeightsByTarget((m) => ({ ...m, [target.id]: DEFAULT_WEIGHTS[target.world] }));
                  setMode("default");
                }}
                mode={mode}
                onMode={setMode}
                learned={learned}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {result && target && engine && current && currentLabel && (
        <section id="finder-detail" aria-labelledby="detail-title" className="mt-14 scroll-mt-24">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 id="detail-title" className="font-heading text-xl font-semibold tracking-tight">
              Full breakdown
            </h2>
            <button
              type="button"
              onClick={() =>
                document.getElementById("finder-stage")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to map ↑
            </button>
          </div>
          <CandidateCard
            cell={current}
            label={currentLabel}
            rank={currentRank}
            target={target}
            params={engine.data.params}
            detail={detail}
            confidence={confidence(current, target, weights ?? DEFAULT_WEIGHTS[target.world])}
          />
        </section>
      )}

      {result && target && engine && (
        <>
          <details
            id="finder-method"
            className="group mt-12 scroll-mt-24 rounded-[1.6rem] bg-white/[0.025] ring-1 ring-white/10 open:bg-white/[0.035]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
              <span>
                <span className="block font-heading text-lg font-semibold">Go deeper</span>
                <span className="block text-[13px] text-muted-foreground">
                  Every site as a table (search, sort, CSV), the Analogue Space map, {target.name} in numbers, and the
                  full method.
                </span>
              </span>
              <ChevronDown
                className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="px-5 pb-5">
              <FinderTabs
                label="More about this ranking"
                tabs={[
                  {
                    id: "table",
                    label: "All sites",
                    icon: Table2,
                    render: () => (
                      <SiteTable
                        rows={rows}
                        selectedId={selectedRowId}
                        onSelect={(id) => {
                          selectRow(id);
                          document
                            .getElementById("finder-stage")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        targetName={target.name}
                        title={listMode === "named" ? "Ranked analogue sites" : "Best new places on Earth"}
                        note={
                          listMode === "named"
                            ? "Real field and analogue sites, each scored by its best land cell nearby."
                            : "The best-scoring 28 km cells anywhere on Earth, at least 350 km apart."
                        }
                      />
                    ),
                  },
                  {
                    id: "space",
                    label: "Analogue Space",
                    icon: Atom,
                    render: () => (
                      <AnalogueSpace
                        currentId={target.id}
                        onTarget={(id) => {
                          setTarget(id);
                          document
                            .getElementById("finder-stage")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        onEarth={(lat, lon) => {
                          flyTo(lat, lon);
                          document
                            .getElementById("finder-stage")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      />
                    ),
                  },
                  {
                    id: "target",
                    label: `${target.name} in numbers`,
                    icon: Gauge,
                    render: () => <TargetProfile target={target} />,
                  },
                  {
                    id: "method",
                    label: "Full method",
                    icon: BookOpenText,
                    render: () => <MethodPanel header={engine.data.header} params={engine.data.params} targets={engine.data.targets} />,
                  },
                ]}
              />
            </div>
          </details>
          <p className="mt-10 flex max-w-[70ch] items-start gap-2 border-t border-white/[0.07] pt-6 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            New finds carry approximate coordinates (cell centres, 0.25°) until checked against imagery. A high score
            says the measured conditions are similar for their world, never that Earth matches the Moon or Mars
            outright.
          </p>
        </>
      )}
    </div>
  );
}
