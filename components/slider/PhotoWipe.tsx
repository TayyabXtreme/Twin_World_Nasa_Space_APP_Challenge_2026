"use client";

import { ChevronsLeftRight, TriangleAlert } from "lucide-react";
import { animate, motionValue, useInView, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { siteById } from "@/lib/data/sites";
import { NASA_TWINS } from "@/lib/data/twins";
import { cn } from "@/lib/utils";
import { WORLD_CONFIG } from "@/lib/worlds";
import "./slider.css";

const PAIRS = NASA_TWINS.filter((t) => siteById(t.earthId)?.image && siteById(t.otherId)?.image);
const thumb = (src: string) => src.replace(/\.webp$/, ".thumb.webp");

/** Drag the divider to reveal Earth over its Moon or Mars twin. Works with pointer and arrow keys. */
export function PhotoWipe() {
  const [pairId, setPairId] = useState(PAIRS[0].id);
  const [pos, setPos] = useState(50);
  const [dragged, setDragged] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const inView = useInView(frame, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const pair = PAIRS.find((p) => p.id === pairId)!;
  const earth = siteById(pair.earthId)!;
  const other = siteById(pair.otherId)!;

  // First time the frame is properly on screen, the divider sweeps once to show it can be dragged.
  useEffect(() => {
    if (!inView || reduce || dragged) return;
    const mv = motionValue(50);
    const off = mv.on("change", (v) => setPos(v));
    const c = animate(mv, [50, 28, 72, 50], { duration: 2.2, ease: "easeInOut" });
    return () => {
      c.stop();
      off();
    };
  }, [inView, reduce, dragged]);

  const moveTo = (clientX: number) => {
    // Grabbing the handle ends the hint sweep (the effect's cleanup runs once `dragged` is set below).
    const r = frame.current!.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
    setDragged(true);
  };

  return (
    <section aria-labelledby="wipe-title">
      <h2 id="wipe-title" className="font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-tight">
        Drag between twins
      </h2>
      <p className="mt-2 max-w-[62ch] text-muted-foreground">Earth on the left, its Moon or Mars twin on the right. Look for the one feature they share.</p>

      <div className="-mx-4 mt-6 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0">
        <ul className="flex w-max gap-2.5">
          {PAIRS.map((p) => {
            const e = siteById(p.earthId)!;
            const o = siteById(p.otherId)!;
            const on = p.id === pairId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPairId(p.id);
                    setPos(50);
                  }}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl py-2 ps-2 pe-4 text-start ring-1 transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.97]",
                    on ? "bg-primary/10 ring-primary/55" : "bg-white/[0.035] ring-white/10 hover:bg-white/[0.07] hover:ring-white/20",
                  )}
                >
                  <span className="flex shrink-0" aria-hidden>
                    {[e, o].map((s, i) => (
                      <span key={s.id} className={cn("relative size-9 overflow-hidden rounded-full ring-2 ring-background", i === 1 && "-ms-3")}>
                        <Image src={thumb(s.image!.src)} alt="" fill sizes="36px" className="object-cover" />
                      </span>
                    ))}
                  </span>
                  <span>
                    <span className="block text-sm leading-tight font-medium">{e.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">with {o.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        ref={frame}
        className="relative mt-4 aspect-[16/9] touch-pan-y overflow-hidden rounded-3xl bg-white/5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)] ring-1 ring-white/10 select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && moveTo(e.clientX)}
      >
        <div key={`o-${pair.id}`} className="sl-wipe-in absolute inset-0">
          <Image src={other.image!.src} alt={other.image!.alt} fill sizes="(min-width: 1024px) 70vw, 100vw" className="object-cover" />
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <div key={`e-${pair.id}`} className="sl-wipe-in absolute inset-0">
            <Image src={earth.image!.src} alt={earth.image!.alt} fill sizes="(min-width: 1024px) 70vw, 100vw" className="object-cover" />
          </div>
        </div>

        <span className="glass absolute top-3 left-3 rounded-full px-3 py-1 text-xs transition-opacity duration-200" style={{ opacity: pos < 12 ? 0 : 1 }}>
          <span className="me-1.5 inline-block size-1.5 rounded-full bg-earth align-middle" aria-hidden />
          Earth · {earth.name}
        </span>
        <span className="glass absolute top-3 right-3 rounded-full px-3 py-1 text-xs transition-opacity duration-200" style={{ opacity: pos > 88 ? 0 : 1 }}>
          <span className={cn("me-1.5 inline-block size-1.5 rounded-full align-middle", other.world === "mars" ? "bg-mars" : "bg-moon")} aria-hidden />
          {WORLD_CONFIG[other.world].name} · {other.name}
        </span>

        {/* Divider: a lit seam with a handle that pings until someone drags it */}
        <div className="absolute inset-y-0 w-px bg-white shadow-[0_0_14px_2px_rgba(127,227,224,0.55)]" style={{ left: `${pos}%` }}>
          <button
            type="button"
            role="slider"
            aria-label="Reveal Earth or its twin"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
              if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
              setDragged(true);
            }}
            className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-[#05070d] shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition-transform duration-150 active:scale-95"
          >
            {!dragged && <span aria-hidden className="sl-handle-ring absolute inset-0 rounded-full ring-2 ring-white" />}
            <ChevronsLeftRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div key={pair.id} className="mt-5 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="sl-rise">
          <p className="text-sm text-ok">What they share</p>
          <p className="mt-1 font-heading text-xl font-semibold">{pair.feature}</p>
        </div>
        <div className="sl-rise flex gap-3 rounded-2xl bg-warn/[0.06] p-4 ring-1 ring-warn/25" style={{ "--i": 1 } as React.CSSProperties}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <p className="text-sm text-foreground/90">{pair.differences[0]}</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Images: {earth.image!.credit} · {other.image!.credit}
      </p>
    </section>
  );
}
