import { InstrumentLoader } from "@/components/shell/InstrumentLoader";
import { cn } from "@/lib/utils";
import "./score.css";

/** Fixed space behind the page: drifting stars, a meteor now and then, and the chosen world's limb. */
export function ScoreBackdrop({ world }: { world?: "moon" | "mars" }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="score-stars" />
      <span className="score-meteor" />
      {world && (
        <div key={world} className={cn("score-planet", `score-planet-${world}`)}>
          <div className="score-planet-map" style={{ backgroundImage: `url(/textures/${world}/color-1k.webp)` }} />
        </div>
      )}
    </div>
  );
}

/** Shown while the page streams in: the same sky, the orbit loader, and the layout's silhouette. */
export function ScoreLoading() {
  return (
    <div className="mx-auto max-w-7xl">
      <ScoreBackdrop />
      <div className="score-skeleton h-12 w-80 max-w-full rounded-xl" />
      <div className="score-skeleton mt-4 h-5 w-[34rem] max-w-full rounded-lg" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="score-skeleton h-20 rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="score-skeleton relative aspect-[16/10] rounded-[1.75rem]">
          <InstrumentLoader label="Acquiring site telemetry" />
        </div>
        <div className="score-skeleton hidden rounded-[1.75rem] lg:block" />
      </div>
    </div>
  );
}
