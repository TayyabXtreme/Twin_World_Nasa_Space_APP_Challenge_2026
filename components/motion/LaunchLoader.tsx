"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { boot, useBoot, watchDocument } from "@/lib/boot";
import { OrbitLoader } from "./OrbitLoader";

/**
 * Rocket-launch loading screen, first visit of a session only (any entry page). Rendered on the server, so the
 * countdown, ignition and smoke (CSS, transform/opacity only) run from the very first paint, before React hydrates.
 * React then holds at T-0 until the real assets are in (lib/boot: document, fonts, eager images, three.js textures,
 * the landing scene), lifts off and fades. Click, any key or the Skip button ends it at once.
 * Reduced motion: no countdown or lift-off, just progress and a calm fade.
 *
 * The inline script in app/layout.tsx marks later visits (`data-boot="seen"`) before paint so the loader never
 * flashes; on later visits to the landing page it shows a small cover (`data-boot="cover"`) until the 3D scene is ready.
 */

const COUNTDOWN_MS = 1800; // T-3, T-2, T-1 at 600 ms each (matches .ll-count in app/transitions.css)
const LIFTOFF_MS = 1150;
const FADE_MS = 450;
const WATCHDOG_MS = 15_000; // never trap anyone behind a stalled request

type Phase = "countdown" | "hold" | "liftoff" | "fade" | "gone";
type BootMode = "launch" | "cover" | "seen";

const noop = () => () => {};
const readMode = (): BootMode => (document.documentElement.dataset.boot as BootMode | undefined) ?? "launch";

/*
 * Deterministic star field and smoke so server and client markup match. Every value is rounded to a fixed string:
 * Math.sin/cos can differ in the last digit between Node (server) and the browser, which broke hydration.
 */
const f = (v: number, digits = 2) => v.toFixed(digits);
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const r1 = rng(42);
const STARS = Array.from({ length: 70 }, () => ({ x: f(r1() * 100), y: f(r1() * 78), s: r1() < 0.15 ? 2 : 1, d: f(r1() * 4), o: f(0.35 + r1() * 0.6) }));
const r2 = rng(7);
const SMOKE = Array.from({ length: 22 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  return { x: f(side * (40 + r2() * 260), 1), y: f(-(r2() * 70), 1), s: f(2.2 + r2() * 3), t: f(1.8 + r2() * 1.2), d: f(1.2 + r2() * 1.6) };
});
const BURST = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI;
  return { x: f(Math.cos(a) * (180 + r2() * 160), 1), y: f(-Math.sin(a) * 50 - r2() * 30, 1), s: f(3 + r2() * 3), d: f(r2() * 0.25) };
});

function finish() {
  try {
    sessionStorage.setItem("tw-launched", "1");
  } catch {
    /* private mode */
  }
  document.documentElement.dataset.boot = "seen";
}

export function LaunchLoader() {
  const mode = useSyncExternalStore(noop, readMode, () => "launch" as BootMode);
  const progress = useBoot();
  const [phase, setPhase] = useState<Phase>("countdown");

  // Launch: count down (already running in CSS), hold until assets are in, lift off, fade.
  useEffect(() => {
    if (mode !== "launch") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = watchDocument();
    const timers: number[] = [];
    let countdownOver = reduce;
    let launched = false;
    const launch = () => {
      if (launched) return;
      launched = true;
      if (reduce) {
        setPhase("fade");
        timers.push(window.setTimeout(() => (finish(), setPhase("gone")), 400));
        return;
      }
      setPhase("liftoff");
      timers.push(window.setTimeout(() => setPhase("fade"), LIFTOFF_MS));
      timers.push(window.setTimeout(() => (finish(), setPhase("gone")), LIFTOFF_MS + FADE_MS));
    };
    const check = () => {
      if (countdownOver && boot.get().done) launch();
    };
    const unsub = boot.subscribe(check);
    timers.push(
      window.setTimeout(
        () => {
          countdownOver = true;
          if (!boot.get().done) setPhase("hold");
          check();
        },
        reduce ? 0 : Math.max(0, COUNTDOWN_MS - performance.now()),
      ),
    );
    timers.push(window.setTimeout(launch, WATCHDOG_MS));
    check();
    return () => {
      stop();
      unsub();
      timers.forEach(clearTimeout);
    };
  }, [mode]);

  // Cover (later visits to the landing page): wait for the page's covering task, then fade.
  useEffect(() => {
    if (mode !== "cover") return;
    const timers: number[] = [];
    let ending = false;
    const end = () => {
      if (ending) return;
      ending = true;
      setPhase("fade");
      timers.push(window.setTimeout(() => (finish(), setPhase("gone")), FADE_MS));
    };
    const check = () => !boot.get().cover && end();
    const unsub = boot.subscribe(check);
    // Give the page a moment to register its task; if it never does, there is nothing to cover.
    timers.push(window.setTimeout(check, 400));
    timers.push(window.setTimeout(end, WATCHDOG_MS));
    return () => {
      unsub();
      timers.forEach(clearTimeout);
    };
  }, [mode]);

  // Skip: any key or click.
  useEffect(() => {
    if (mode === "seen" || phase === "gone" || phase === "fade") return;
    const skip = () => {
      setPhase("fade");
      window.setTimeout(() => (finish(), setPhase("gone")), 300);
    };
    window.addEventListener("keydown", skip, { once: true });
    return () => window.removeEventListener("keydown", skip);
  }, [mode, phase]);

  if (mode === "seen" || phase === "gone") return null;
  const pct = Math.round(progress.progress * 100);
  const skip = () => {
    setPhase("fade");
    window.setTimeout(() => (finish(), setPhase("gone")), 300);
  };

  return (
    <div className="launch-loader" data-phase={phase} data-mode={mode} onPointerDown={skip} role="status" aria-live="polite" aria-label={`Loading TwinWorlds, ${pct}%`}>
      {/* Later visits: a small orbit loader over the landing page while its scene loads. */}
      <div className="ll-cover">
        <OrbitLoader label="Loading the solar system" />
      </div>

      <div className="ll-scene" aria-hidden>
        <div className="ll-stars">
          {STARS.map((s, i) => (
            <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o, animationDelay: `${s.d}s` }} />
          ))}
        </div>
        <div className="ll-ground" />
        <div className="ll-pad">
          <svg className="ll-tower" viewBox="0 0 60 300">
            <g stroke="#4a5568" strokeWidth="2" fill="none">
              <path d="M10 300V20M40 300V20" />
              {Array.from({ length: 14 }, (_, i) => (
                <path key={i} d={`M10 ${30 + i * 19}L40 ${49 + i * 19}M40 ${30 + i * 19}L10 ${49 + i * 19}`} strokeOpacity="0.55" />
              ))}
              <path d="M6 20h38" strokeWidth="4" />
            </g>
            <g className="ll-arm">
              <rect x="40" y="128" width="36" height="6" rx="2" fill="#5b6678" />
            </g>
            <circle cx="25" cy="14" r="3" className="ll-beacon" fill="#ff5d5d" />
          </svg>
          <div className="ll-glow" />
          <div className="ll-smoke">
            {SMOKE.map((p, i) => (
              <span key={i} style={{ "--x": `${p.x}px`, "--y": `${p.y}px`, "--s": p.s, animationDuration: `${p.t}s`, animationDelay: `${p.d}s` } as React.CSSProperties} />
            ))}
          </div>
          <div className="ll-burst">
            {BURST.map((p, i) => (
              <span key={i} style={{ "--x": `${p.x}px`, "--y": `${p.y}px`, "--s": p.s, animationDelay: `${p.d}s` } as React.CSSProperties} />
            ))}
          </div>
          <div className="ll-rocket">
            <svg viewBox="0 0 100 330" className="ll-rocket-svg">
              <defs>
                <linearGradient id="ll-body" x1="0" x2="1">
                  <stop offset="0" stopColor="#c7d0dc" />
                  <stop offset="0.45" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#aeb9c8" />
                </linearGradient>
                <linearGradient id="ll-flame" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#fff6d8" />
                  <stop offset="0.35" stopColor="#ffc35a" />
                  <stop offset="0.75" stopColor="#ff6a2b" stopOpacity="0.8" />
                  <stop offset="1" stopColor="#ff6a2b" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="ll-core" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g className="ll-flame">
                <path d="M31 222C35 262 44 292 50 322C56 292 65 262 69 222Z" fill="url(#ll-flame)" />
                <path d="M40 222C43 248 47 266 50 288C53 266 57 248 60 222Z" fill="url(#ll-core)" />
              </g>
              <path d="M36 200H64L70 224H30Z" fill="#5b6678" />
              <path d="M26 148L7 198V218L26 204Z" fill="#ff7a4d" />
              <path d="M74 148L93 198V218L74 204Z" fill="#ff7a4d" />
              <path d="M50 4C68 30 74 62 74 102V204H26V102C26 62 32 30 50 4Z" fill="url(#ll-body)" />
              <path d="M37 44Q50 38 63 44L66 56Q50 50 34 56Z" fill="#5fe0d0" />
              <circle cx="50" cy="98" r="11" fill="#0b1424" stroke="#8fd3ff" strokeWidth="3" />
              <path d="M44 93a8 8 0 0 1 8-4" stroke="#cdeaff" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M50 150V204" stroke="#000" strokeOpacity="0.08" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="ll-count">
          <span>T-3</span>
          <span>T-2</span>
          <span>T-1</span>
          <span>Ignition</span>
        </div>
        <p className="ll-hold">Holding at T-0 · waiting for the last assets</p>
        <p className="ll-liftoff">Lift-off</p>
      </div>

      <div className="ll-ui">
        <p className="ll-brand">
          TwinWorlds<span>Earth · Moon · Mars</span>
        </p>
        <div className="ll-progress">
          <span className="hud">
            {progress.total ? `${Math.floor(progress.loaded)} of ${progress.total} assets` : "Preparing"} · {pct}%
          </span>
          <span className="ll-bar">
            <span style={{ transform: `scaleX(${Math.max(0.04, progress.progress)})` }} />
          </span>
        </div>
        <button
          type="button"
          className="ll-skip"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            skip();
          }}
        >
          Skip intro
        </button>
      </div>
    </div>
  );
}
