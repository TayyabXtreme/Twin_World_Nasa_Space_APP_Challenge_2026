"use client";

import { Pause, Play, SkipForward, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { bindNav } from "@/lib/rovi/actions";
import { endTour, tourNext, tourTogglePause } from "@/lib/rovi/conductor";
import { loadRoviPrefs, useRovi } from "@/lib/rovi/store";
import { warmVoices } from "@/lib/rovi/voice";
import { useExplorer } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./ChatPanel";
import { RoviFace } from "./RoviFace";
import { Spotlight } from "./Spotlight";
import "./rovi.css";

// three.js loads only after the page itself is ready, and never blocks it; the 2D face stands in until then.
const RoviBot = dynamic(() => import("./RoviBot"), { ssr: false, loading: () => <RoviFace className="rovi-bot-face" /> });

const GREETED = "tw-rovi-greeted";
const noop = () => () => {};

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True once the launch screen is gone (components/motion/LaunchLoader sets data-boot="seen"). */
function useLaunched() {
  const [launched, setLaunched] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const check = () => html.dataset.boot === "seen" && setLaunched(true);
    check();
    const obs = new MutationObserver(check);
    obs.observe(html, { attributes: true, attributeFilter: ["data-boot"] });
    // Never keep Rovi away if the loader stalls.
    const t = setTimeout(() => setLaunched(true), 16_000);
    return () => {
      obs.disconnect();
      clearTimeout(t);
    };
  }, []);
  return launched;
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function TourControls({ paused, step, total }: { paused: boolean; step: number; total: number }) {
  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      <span className="hud me-auto text-[11px] text-muted-foreground">
        Stop {step + 1} of {total}
      </span>
      <button type="button" onClick={tourTogglePause} className="rovi-tour-btn" aria-label={paused ? "Resume tour" : "Pause tour"}>
        {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
      </button>
      <button type="button" onClick={tourNext} className="rovi-tour-btn rovi-tour-next">
        {step + 1 < total ? "Next" : "Finish"} <SkipForward className="size-3.5" aria-hidden />
      </button>
      <button type="button" onClick={() => endTour(true)} className="rovi-tour-btn" aria-label="End tour">
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Rovi, docked bottom-right on every page: the robot (3D once three.js is in, a 2D face before that or without
 * WebGL), a speech bubble while the chat is closed, the chat panel or phone sheet, and the spotlight ring.
 */
export function RoviDock() {
  const router = useRouter();
  const pathname = usePathname();
  const launched = useLaunched();
  const phone = useMedia("(max-width: 639px)");
  const reduce = useReducedMotion();
  const open = useRovi((s) => s.open);
  const setOpen = useRovi((s) => s.setOpen);
  const mood = useRovi((s) => s.mood);
  const bubble = useRovi((s) => s.bubble);
  const setBubble = useRovi((s) => s.setBubble);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [want3d, setWant3d] = useState(false);
  const [hover, setHover] = useState(false);

  const explore = pathname.startsWith("/explore");
  // On phones a site card fills the bottom of Explore; step aside while it is open.
  const cardOpen = useExplorer((s) => Boolean(s.selectedSiteId || s.selectedPlaceId || s.dataPoint));
  const hidden = explore && phone && cardOpen && !open;

  useEffect(() => {
    bindNav({ push: (href, transitionTypes) => router.push(href, { scroll: false, transitionTypes }) });
    return () => bindNav(null);
  }, [router]);

  useEffect(() => {
    loadRoviPrefs();
    warmVoices();
  }, []);

  // Load the 3D robot when the browser is idle after launch.
  useEffect(() => {
    if (!launched || !hasWebGL()) return;
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
    const cic = window.cancelIdleCallback ?? window.clearTimeout;
    const id = ric(() => setWant3d(true));
    return () => cic(id);
  }, [launched]);

  // Say hello once per session.
  useEffect(() => {
    if (!launched) return;
    try {
      if (sessionStorage.getItem(GREETED)) return;
      sessionStorage.setItem(GREETED, "1");
    } catch {
      return;
    }
    const show = setTimeout(() => {
      if (!useRovi.getState().open) setBubble({ text: "Hi, I'm Rovi! Ask me anything, or say “show me around”." });
    }, 1400);
    const hide = setTimeout(() => {
      const b = useRovi.getState().bubble;
      if (b && !b.tour && b.text.startsWith("Hi, I'm Rovi")) setBubble(null);
    }, 8400);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [launched, setBubble]);

  if (!mounted || !launched) return null;

  const showBubble = bubble && !open && !hidden;

  return (
    <div className="rovi-root" data-route={explore ? "explore" : pathname === "/" ? "home" : "page"}>
      <div
        className={cn("rovi-dock", hidden && "rovi-dock-away")}
        style={{ viewTransitionName: "rovi-dock" }}
      >
        <AnimatePresence>
          {showBubble && (
            <motion.div
              key={bubble.tour ? "tour" : "say"}
              className="rovi-bubble"
              role="status"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            >
              {!bubble.tour && (
                <button
                  type="button"
                  onClick={() => setBubble(null)}
                  className="absolute end-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
              <p className={cn("text-[13px] leading-relaxed", !bubble.tour && "pe-4")}>{bubble.text}</p>
              {bubble.tour && <TourControls {...bubble.tour} />}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {hover && !open && !showBubble && !phone && (
            <motion.span
              className="rovi-hint"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.16 }}
            >
              Ask Rovi
            </motion.span>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => {
            setOpen(!open);
            if (!open) setBubble(useRovi.getState().bubble?.tour ? useRovi.getState().bubble : null);
          }}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          aria-label={open ? "Close Rovi" : "Open Rovi, the TwinWorlds assistant"}
          aria-expanded={open}
          data-mood={mood}
          className="rovi-bot"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
          whileTap={{ scale: 0.93 }}
        >
          <span className="rovi-bot-glow" aria-hidden />
          {want3d ? <RoviBot /> : <RoviFace className="rovi-bot-face" />}
        </motion.button>
      </div>

      <ChatPanel phone={phone} />
      <Spotlight />
    </div>
  );
}
