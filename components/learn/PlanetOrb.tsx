"use client";

import { motion, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A planet drawn in plain DOM: the equirectangular texture slides behind a round mask (two copies side by side, so
 * sliding by half the strip wraps seamlessly), with a day/night terminator and an atmosphere glow on top. Only
 * `transform` moves, so it scrolls at full frame rate without a WebGL context.
 */
export function PlanetOrb({
  texture,
  spin,
  glow,
  className,
  style,
  priority,
}: {
  texture: string;
  /** Horizontal slide of the texture strip, "0%" to "-50%" for one full turn. */
  spin?: MotionValue<string> | string;
  glow: string;
  className?: string;
  style?: React.ComponentProps<typeof motion.div>["style"];
  priority?: boolean;
}) {
  return (
    <motion.div
      aria-hidden
      className={cn("learn-orb relative aspect-square rounded-full", className)}
      style={{ ...style, "--glow": glow } as typeof style}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full bg-black">
        {/* The strip is 4 orbs wide: each texture copy is 2:1, so its visible half fills the orb exactly. */}
        <motion.div className="absolute inset-y-0 left-0 flex w-[400%]" style={{ x: spin ?? "0%" }}>
          {[0, 1].map((i) => (
            // eslint-disable-next-line @next/next/no-img-element -- 1k planet texture, used as a sliding strip
            <img
              key={i}
              src={texture}
              alt=""
              className="h-full w-1/2 max-w-none object-cover"
              decoding="async"
              loading={priority ? "eager" : "lazy"}
              draggable={false}
            />
          ))}
        </motion.div>
        <div className="learn-orb-shade absolute inset-0 rounded-full" />
      </div>
    </motion.div>
  );
}
