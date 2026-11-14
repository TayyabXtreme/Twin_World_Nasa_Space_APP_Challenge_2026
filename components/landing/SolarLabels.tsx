"use client";

import { useRouter } from "next/navigation";
import { solarAnchors, useSolar, type SolarWorld } from "@/lib/solar";
import { cn } from "@/lib/utils";

const LABEL: Record<SolarWorld, { name: string; fact: string }> = {
  earth: { name: "Earth", fact: "9.81 m/s² · our test bench" },
  moon: { name: "Moon", fact: "1.62 m/s² · evidence for polar ice" },
  mars: { name: "Mars", fact: "3.71 m/s² · thin CO₂ air" },
};

/**
 * Planet labels and the light-delay tag, rendered as ordinary page elements over the canvas.
 * SolarScene's projector positions them every frame (see solarAnchors).
 */
export function SolarLabels({ hidden }: { hidden: boolean }) {
  const hovered = useSolar((s) => s.hovered);
  const setHovered = useSolar((s) => s.setHovered);
  const setFlyTo = useSolar((s) => s.setFlyTo);
  const router = useRouter();

  return (
    <div
      aria-hidden={hidden || undefined}
      className={cn(
        "pointer-events-none absolute inset-0 z-[15] transition-opacity duration-300 max-lg:top-[var(--scene-top,0px)] max-lg:bottom-36 sm:max-lg:bottom-24",
        hidden && "opacity-0",
      )}
    >
      {(["earth", "moon", "mars"] as SolarWorld[]).map((id) => (
        <button
          key={id}
          ref={(el) => void (solarAnchors[id] = el)}
          type="button"
          tabIndex={hidden ? -1 : 0}
          className="solar-label pointer-events-auto absolute top-0 left-0"
          style={{ transform: "translate3d(-9999px, -9999px, 0)" }}
          data-side={id === "moon" ? "right" : undefined}
          data-active={hovered === id || undefined}
          onPointerEnter={() => {
            setHovered(id);
            router.prefetch(`/explore/${id}`);
          }}
          onPointerLeave={() => setHovered(null)}
          onFocus={() => setHovered(id)}
          onBlur={() => setHovered(null)}
          onClick={() => setFlyTo(id)}
          aria-label={`Fly to ${LABEL[id].name} and explore it`}
        >
          <span className="solar-label-name">{LABEL[id].name}</span>
          <span className="solar-label-fact">{LABEL[id].fact}</span>
        </button>
      ))}
      <span
        ref={(el) => void (solarAnchors.light = el)}
        className="solar-tag absolute top-0 left-0"
        style={{ transform: "translate3d(-9999px, -9999px, 0)" }}
      />
    </div>
  );
}
