"use client";

import { useEffect, useRef, useState } from "react";
import { useRovi } from "@/lib/rovi/store";

const HOLD_MS = 4600;
const PAD = 10;

/**
 * Coach-mark ring around whatever Rovi is talking about. Scrolls the element into view, follows it while the page
 * moves (written straight to the DOM each frame, no re-renders) and points Rovi's eyes at it. Click-through.
 */
export function Spotlight() {
  const spot = useRovi((s) => s.spot);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (!spot) return;
    const el = document.querySelector<HTMLElement>(spot.selector);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const r0 = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r0.top < 72 || r0.bottom > vh - 24) {
      // Tall things: show their top; short things: centre them.
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: r0.height > vh * 0.7 ? "start" : "center" });
    }
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(4, r.left - PAD);
      const y = Math.max(4, r.top - PAD);
      const w = Math.min(window.innerWidth - 8, r.right + PAD) - x;
      const h = Math.min(window.innerHeight - 8, r.bottom + PAD) - y;
      if (ring.current) {
        ring.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        ring.current.style.width = `${Math.max(0, w)}px`;
        ring.current.style.height = `${Math.max(0, h)}px`;
      }
      if (label.current) {
        const above = y > 44;
        label.current.style.transform = `translate3d(${Math.min(x, window.innerWidth - 260)}px, ${above ? y - 36 : y + h + 8}px, 0)`;
      }
      useRovi.getState().setLookAt({ x: r.left + r.width / 2, y: r.top + Math.min(r.height, vh) / 2 });
      if (now - start < HOLD_MS) raf = requestAnimationFrame(frame);
      else {
        setShown(null);
        useRovi.getState().setLookAt(null);
      }
    };
    raf = requestAnimationFrame((now) => {
      setShown(spot.nonce);
      frame(now);
    });
    return () => {
      cancelAnimationFrame(raf);
      useRovi.getState().setLookAt(null);
    };
  }, [spot]);

  const on = spot !== null && shown === spot.nonce;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[46]" data-on={on || undefined}>
      <div ref={ring} key={spot?.nonce} className="rovi-spot" data-on={on || undefined}>
        <span className="rovi-spot-pulse" />
      </div>
      {spot?.caption && (
        <div ref={label} key={`l${spot.nonce}`} className="rovi-spot-label" data-on={on || undefined}>
          <span className="rovi-spot-dot" />
          {spot.caption}
        </div>
      )}
    </div>
  );
}
