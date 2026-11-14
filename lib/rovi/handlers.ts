"use client";

import { useEffect, useRef } from "react";

/**
 * The page side of Rovi's action bus. A page registers a handler while it is mounted (useRoviHandler); an action that
 * navigates first waits until the page it needs has registered, then calls it. Handlers return an undo function.
 *
 * Names in use: "finder", "challenge", "moonbase", "explore:earth" | "explore:moon" | "explore:mars".
 */

export type Undo = () => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each handler has its own payload
type Handler = (payload: any) => Undo | void;

const handlers = new Map<string, Handler>();
const waiters = new Map<string, Set<() => void>>();

export function registerHandler(name: string, fn: Handler) {
  handlers.set(name, fn);
  waiters.get(name)?.forEach((w) => w());
  waiters.delete(name);
  return () => {
    if (handlers.get(name) === fn) handlers.delete(name);
  };
}

/** Resolves with the handler once its page is mounted, or rejects after `timeoutMs`. */
export function waitForHandler(name: string, timeoutMs = 12_000): Promise<Handler> {
  const now = handlers.get(name);
  if (now) return Promise.resolve(now);
  return new Promise((resolve, reject) => {
    const set = waiters.get(name) ?? new Set();
    waiters.set(name, set);
    const done = () => {
      clearTimeout(timer);
      set.delete(done);
      // Let the page finish its own mount effects (e.g. ExplorerShell's setWorld) before acting on it.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(handlers.get(name)!)));
    };
    const timer = setTimeout(() => {
      set.delete(done);
      reject(new Error(`The page for "${name}" did not open in time.`));
    }, timeoutMs);
    set.add(done);
  });
}

/** Register `fn` under `name` while the calling component is mounted. Always calls the latest `fn`. */
export function useRoviHandler(name: string, fn: Handler) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => registerHandler(name, (p) => ref.current(p)), [name]);
}

/** Resolves with the first element matching `selector`, polling while a page renders; null after `timeoutMs`. */
export function waitForElement(selector: string, timeoutMs = 8000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.getBoundingClientRect().height > 0) return resolve(el);
      if (performance.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 120);
    };
    tick();
  });
}
