"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};

/** Browser full screen for the whole page. `supported` is false where the API is missing (e.g. iPhone Safari). */
export function useFullscreen() {
  const active = useSyncExternalStore(subscribe, () => Boolean(document.fullscreenElement), () => false);
  const supported = useSyncExternalStore(subscribe, () => Boolean(document.fullscreenEnabled), () => false);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  return { active, supported, toggle };
}
