"use client";

import { useSyncExternalStore } from "react";

/**
 * The ISS position currently shown on the globe, updated once a second by the ISS layer (components/globe/IssLayer).
 * A tiny external store so the pin, the projector and the details card share one fix without re-rendering React
 * trees every second unless they ask to.
 */

export interface IssLive {
  lat: number;
  lon: number;
  altKm: number;
  speedKms: number;
  periodMin: number;
  /** Time of this fix, ms since 1970. */
  at: number;
  /** TLE epoch, ms since 1970. */
  epoch: number;
  source: string;
  stale: boolean;
}

let state: IssLive | null = null;
const listeners = new Set<() => void>();

export const issLive = {
  get: () => state,
  set(next: IssLive | null) {
    state = next;
    for (const l of listeners) l();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

/** The live fix (re-renders every update). */
export const useIssLive = () => useSyncExternalStore(issLive.subscribe, issLive.get, () => null);

/** Only whether a fix exists (re-renders when the ISS appears or goes away). */
export const useIssReady = () => useSyncExternalStore(issLive.subscribe, () => state !== null, () => false);
