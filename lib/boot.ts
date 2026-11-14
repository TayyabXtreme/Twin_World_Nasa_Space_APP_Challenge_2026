"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Real loading progress for the launch screen (components/motion/LaunchLoader). Each task reports items loaded out of
 * items total: the document itself, web fonts, above-the-fold images, three.js textures (via the loading manager,
 * which 3D modules hand in, so this file never imports three) and anything a page registers (the landing scene).
 */

export interface BootTask {
  loaded: number;
  total: number;
  done: boolean;
  /** Pages can ask the loader to cover them on later visits too, until this task is done (landing 3D scene). */
  cover?: boolean;
}

export interface BootSnapshot {
  loaded: number;
  total: number;
  progress: number;
  done: boolean;
  cover: boolean;
}

const tasks = new Map<string, BootTask>();
const listeners = new Set<() => void>();
/** What the server rendered; hydration must see the same, even if loading already moved on in the browser. */
const INITIAL: BootSnapshot = { loaded: 0, total: 0, progress: 0, done: false, cover: false };
let snapshot: BootSnapshot = INITIAL;

function recompute() {
  let loaded = 0;
  let total = 0;
  let done = tasks.size > 0;
  let cover = false;
  for (const t of tasks.values()) {
    loaded += Math.min(t.loaded, t.total);
    total += t.total;
    done &&= t.done;
    if (t.cover && !t.done) cover = true;
  }
  snapshot = { loaded, total, progress: total ? loaded / total : 0, done, cover };
  for (const l of listeners) l();
}

export const boot = {
  set(id: string, task: BootTask) {
    const prev = tasks.get(id);
    if (prev && prev.loaded === task.loaded && prev.total === task.total && prev.done === task.done && prev.cover === task.cover) return;
    tasks.set(id, task);
    recompute();
  },
  remove(id: string) {
    if (tasks.delete(id)) recompute();
  },
  has: (id: string) => tasks.has(id),
  get: () => snapshot,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

export const useBoot = () => useSyncExternalStore(boot.subscribe, boot.get, () => INITIAL);

/** Register page-specific loading as one item filled by `progress` (0..1). Removed when the component unmounts. */
export function useBootTask(id: string, progress: number, done: boolean, cover = false) {
  useEffect(() => {
    boot.set(id, { loaded: done ? 1 : Math.min(0.99, progress), total: 1, done, cover });
  }, [id, progress, done, cover]);
  useEffect(() => () => boot.remove(id), [id]);
}

/* ---------------- three.js loading manager ---------------- */

interface LoadingManagerLike {
  onStart?: (url: string, loaded: number, total: number) => void;
  onProgress?: (url: string, loaded: number, total: number) => void;
  onLoad?: () => void;
  onError?: (url: string) => void;
}

const tracked = new WeakMap<LoadingManagerLike, Set<(loaded: number, total: number) => void>>();

/**
 * Report a three.js LoadingManager (usually THREE.DefaultLoadingManager) as the "textures" task, and fan its progress
 * out to extra listeners (the landing scene keeps its own). Safe to call from several modules.
 */
export function trackLoadingManager(manager: LoadingManagerLike, listener?: (loaded: number, total: number) => void) {
  let set = tracked.get(manager);
  if (!set) {
    const fan = new Set<(loaded: number, total: number) => void>();
    tracked.set(manager, fan);
    set = fan;
    const report = (loaded: number, total: number) => {
      boot.set("textures", { loaded, total, done: total > 0 && loaded >= total });
      for (const f of fan) f(loaded, total);
    };
    manager.onStart = (_u, loaded, total) => report(loaded, total);
    manager.onProgress = (_u, loaded, total) => report(loaded, total);
  }
  if (listener) set.add(listener);
}

/* ---------------- document, fonts, images ---------------- */

/** Start the built-in tasks. Returns a stop function. */
export function watchDocument() {
  const doc = () => {
    const s = document.readyState;
    boot.set("document", { loaded: s === "complete" ? 1 : s === "interactive" ? 0.6 : 0.2, total: 1, done: s === "complete" });
  };
  doc();
  document.addEventListener("readystatechange", doc);

  boot.set("fonts", { loaded: 0, total: 1, done: false });
  const fontsDone = () => boot.set("fonts", { loaded: 1, total: 1, done: true });
  if ("fonts" in document) document.fonts.ready.then(fontsDone, fontsDone);
  else fontsDone();

  // Images the browser loads up front (lazy images load later, on scroll, and are not part of the first view).
  const images = () => {
    const eager = [...document.images].filter((i) => i.loading !== "lazy");
    const loaded = eager.filter((i) => i.complete).length;
    boot.set("images", { loaded, total: eager.length, done: loaded === eager.length });
  };
  images();
  const poll = window.setInterval(images, 150);

  return () => {
    document.removeEventListener("readystatechange", doc);
    window.clearInterval(poll);
  };
}
