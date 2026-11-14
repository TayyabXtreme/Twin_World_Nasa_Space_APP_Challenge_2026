"use client";

import { roviSignal } from "./store";

/**
 * Speech in and out with the browser's own Web Speech APIs (free, no key, English). Speech recognition is Chrome,
 * Edge and Safari only; where it is missing the mic button explains that and typing still works.
 */

/* Minimal typings: SpeechRecognition is not in TypeScript's DOM library on every version. */
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionCtor() !== null;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Listen for one spoken question. `onText` gets the running transcript; `onDone` gets the final text (or "" when
 * nothing was heard) and, on failure, a short reason. Returns a function that stops listening early.
 */
export function listen(onText: (t: string) => void, onDone: (t: string, error?: string) => void): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    onDone("", "Voice input needs Chrome, Edge or Safari.");
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let text = "";
  let error: string | undefined;
  rec.onresult = (e) => {
    let all = "";
    for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript;
    text = all.trim();
    onText(text);
  };
  rec.onerror = (e) => {
    error =
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone access was blocked. Allow it in the address bar to talk to Rovi."
        : e.error === "no-speech"
          ? undefined
          : e.error === "network"
            ? "Voice input needs an internet connection in this browser."
            : `Voice input stopped (${e.error}).`;
  };
  rec.onend = () => onDone(text, error);
  try {
    rec.start();
  } catch {
    onDone("", "Voice input could not start.");
  }
  return () => rec.stop();
}

let voice: SpeechSynthesisVoice | null | undefined;
function pickVoice() {
  if (voice !== undefined && voice !== null) return voice;
  const all = speechSynthesis.getVoices();
  if (!all.length) return null;
  const en = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const prefer = ["Google US English", "Microsoft Aria", "Microsoft Jenny", "Samantha", "Microsoft Guy", "Google UK English Female"];
  voice = prefer.map((n) => en.find((v) => v.name.includes(n))).find(Boolean) ?? en.find((v) => v.lang === "en-US") ?? en[0] ?? null;
  return voice;
}

let mouthDecay = 0;
function pulseMouth(strength: number) {
  roviSignal.mouth = Math.min(1, Math.max(roviSignal.mouth, strength));
  cancelAnimationFrame(mouthDecay);
  const decay = () => {
    roviSignal.mouth *= 0.86;
    if (roviSignal.mouth > 0.02) mouthDecay = requestAnimationFrame(decay);
    else roviSignal.mouth = 0;
  };
  mouthDecay = requestAnimationFrame(decay);
}

/** Speak `text`; resolves when it finishes or is cancelled. The robot's mouth follows each word. */
export function speak(text: string): Promise<void> {
  if (!canSpeak()) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text.replace(/[·•]/g, ",").replace(/\s+/g, " "));
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? "en-US";
    u.rate = 1.04;
    u.pitch = 1.18;
    // Not every voice fires word boundaries; a steady chatter keeps the mouth moving either way.
    let chatter = 0;
    let gotBoundary = false;
    const startChatter = () => {
      chatter = window.setInterval(() => !gotBoundary && pulseMouth(0.45 + Math.random() * 0.5), 140);
    };
    u.onstart = startChatter;
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      gotBoundary = true;
      pulseMouth(0.65 + Math.random() * 0.35);
    };
    const end = () => {
      clearInterval(chatter);
      resolve();
    };
    u.onend = end;
    u.onerror = end;
    speechSynthesis.speak(u);
    // Chrome sometimes never fires onend for long text; never hang the conversation on it.
    window.setTimeout(end, 2500 + text.split(/\s+/).length * 520);
  });
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}

/** Voices load asynchronously in Chrome; ask early so the first answer already has a good one. */
export function warmVoices() {
  if (!canSpeak()) return;
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.("voiceschanged", () => {
    voice = undefined;
    pickVoice();
  });
}
