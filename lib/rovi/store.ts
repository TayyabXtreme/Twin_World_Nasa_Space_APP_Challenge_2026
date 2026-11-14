"use client";

import { create } from "zustand";
import type { ActionChip, ChatMessage, Mood } from "./types";

/** Live values the 3D robot reads every frame; kept out of React state so they never cause re-renders. */
export const roviSignal = {
  /** Mouth opening 0..1, pushed by speech boundary events and the typewriter. */
  mouth: 0,
  /** Set when an action starts: the robot does a little hop and spin. */
  hopAt: 0,
};

export interface Spot {
  selector: string;
  caption: string;
  nonce: number;
}

export interface Bubble {
  text: string;
  /** Guided tour position, when the bubble is narrating a tour stop. */
  tour?: { step: number; total: number; paused: boolean };
}

interface RoviState {
  open: boolean;
  mood: Mood;
  messages: ChatMessage[];
  /** Spotlight ring around one element of the page. */
  spot: Spot | null;
  /** Screen point the eyes look at instead of the pointer (the spotlight's centre). */
  lookAt: { x: number; y: number } | null;
  /** Speech bubble next to the robot while the panel is closed. */
  bubble: Bubble | null;
  voiceOut: boolean;
  /** Whether answers come from Claude on Bedrock ("live") or the built-in script ("demo"); unknown until asked. */
  aiMode: "unknown" | "live" | "demo";
  setOpen: (open: boolean) => void;
  patchMsg: (id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) => void;
  setMood: (mood: Mood) => void;
  push: (m: ChatMessage) => void;
  settle: (id: string) => void;
  addChip: (msgId: string, chip: ActionChip) => void;
  patchChip: (chipId: string, patch: Partial<ActionChip>) => void;
  setSpot: (selector: string | null, caption?: string) => void;
  setLookAt: (p: { x: number; y: number } | null) => void;
  setBubble: (b: Bubble | null) => void;
  setVoiceOut: (on: boolean) => void;
  clear: () => void;
}

const VOICE_KEY = "tw-rovi-voice";

export const useRovi = create<RoviState>()((set) => ({
  open: false,
  mood: "idle",
  messages: [],
  spot: null,
  lookAt: null,
  bubble: null,
  voiceOut: true,
  aiMode: "unknown",
  setOpen: (open) => set({ open }),
  patchMsg: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)),
    })),
  setMood: (mood) => set({ mood }),
  push: (m) => set((s) => ({ messages: [...s.messages, m] })),
  settle: (id) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, fresh: false } : m)) })),
  addChip: (msgId, chip) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === msgId ? { ...m, chips: [...(m.chips ?? []), chip] } : m)),
    })),
  patchChip: (chipId, patch) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.chips?.some((c) => c.id === chipId)
          ? { ...m, chips: m.chips.map((c) => (c.id === chipId ? { ...c, ...patch } : c)) }
          : m,
      ),
    })),
  setSpot: (selector, caption = "") =>
    set((s) => ({ spot: selector ? { selector, caption, nonce: (s.spot?.nonce ?? 0) + 1 } : null })),
  setLookAt: (lookAt) => set({ lookAt }),
  setBubble: (bubble) => set({ bubble }),
  setVoiceOut: (voiceOut) => {
    try {
      localStorage.setItem(VOICE_KEY, voiceOut ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (!voiceOut && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    set({ voiceOut });
  },
  clear: () => set({ messages: [] }),
}));

/** Read the saved voice preference once, after hydration. */
export function loadRoviPrefs() {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    if (v !== null) useRovi.setState({ voiceOut: v === "1" });
  } catch {
    /* private mode */
  }
}

let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
