"use client";

import { useEffect } from "react";
import { isAmbientPlaying, playCue, setAmbient } from "@/lib/audio";
import { useExplorer } from "@/lib/store";

const STORAGE_KEY = "tw-sound";

/**
 * Connects the sound toggle to real audio, app-wide: ambience follows `soundOn`, and short cues play on
 * world changes, site selection, view toggles and hiding panels. The choice is remembered per browser.
 */
export function SoundSync() {
  useEffect(() => {
    // Restore the visitor's choice. Browsers only allow audio after a gesture, so a remembered "on"
    // starts on the first click or key press.
    let remembered = false;
    try {
      remembered = localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      /* storage unavailable: start muted */
    }
    if (remembered) useExplorer.setState({ soundOn: true });

    const unlock = () => {
      if (useExplorer.getState().soundOn && !isAmbientPlaying()) setAmbient(true);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const unsubscribe = useExplorer.subscribe((state, prev) => {
      if (state.soundOn !== prev.soundOn) {
        try {
          localStorage.setItem(STORAGE_KEY, state.soundOn ? "on" : "off");
        } catch {
          /* ignore */
        }
        setAmbient(state.soundOn);
        if (state.soundOn) playCue("confirm");
        return;
      }
      if (!state.soundOn) return;
      if (state.world !== prev.world) playCue("warp");
      else if (state.selectedSiteId && state.selectedSiteId !== prev.selectedSiteId) playCue("select");
      else if (!state.selectedSiteId && prev.selectedSiteId) playCue("close");
      else if (state.view !== prev.view) playCue("toggle");
      else if (state.chromeHidden !== prev.chromeHidden) playCue(state.chromeHidden ? "close" : "open");
    });

    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
