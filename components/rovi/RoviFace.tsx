"use client";

import { useEffect, useRef } from "react";
import { roviSignal, useRovi } from "@/lib/rovi/store";
import { cn } from "@/lib/utils";

/**
 * Rovi in 2D: shown while the 3D robot loads, where WebGL is missing, and as the small avatar in the chat header.
 * Same behaviour in miniature: eyes follow the pointer and blink, the mouth follows speech, the antenna pulses while
 * thinking. Transform and opacity only.
 */
export function RoviFace({ className, live = true }: { className?: string; live?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const eyes = useRef<HTMLDivElement>(null);
  const mouth = useRef<HTMLDivElement>(null);
  const mood = useRovi((s) => s.mood);

  useEffect(() => {
    if (!live) return;
    let px = -1;
    let py = -1;
    let raf = 0;
    let nextBlink = performance.now() + 1800;
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
    };
    const frame = (now: number) => {
      const box = root.current?.getBoundingClientRect();
      const look = useRovi.getState().lookAt ?? (px >= 0 ? { x: px, y: py } : null);
      if (box && eyes.current) {
        let dx = 0;
        let dy = 0;
        if (look) {
          dx = Math.max(-1, Math.min(1, (look.x - (box.left + box.width / 2)) / 400));
          dy = Math.max(-1, Math.min(1, (look.y - (box.top + box.height / 2)) / 320));
        }
        let lid = 1;
        if (now > nextBlink) {
          const p = (now - nextBlink) / 150;
          lid = p < 1 ? 1 - Math.sin(p * Math.PI) * 0.9 : 1;
          if (p >= 1) nextBlink = now + 2000 + Math.random() * 3000;
        }
        eyes.current.style.transform = `translate(${dx * 12}%, ${dy * 14}%) scaleY(${lid})`;
      }
      if (mouth.current) mouth.current.style.transform = `scaleY(${1 + roviSignal.mouth * 3})`;
      raf = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [live]);

  return (
    <div ref={root} className={cn("rovi-face", className)} data-mood={mood} aria-hidden>
      <span className="rovi-face-antenna" />
      <span className="rovi-face-head">
        <span className="rovi-face-visor">
          <span ref={eyes} className="rovi-face-eyes">
            <span />
            <span />
          </span>
          <span ref={mouth} className="rovi-face-mouth" />
        </span>
      </span>
    </div>
  );
}
