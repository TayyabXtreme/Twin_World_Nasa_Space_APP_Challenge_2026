"use client";

import { toast } from "sonner";
import { describe, perform, spotlight } from "./actions";
import type { Undo } from "./handlers";
import { historyForBrain, askRemote } from "./remote";
import { demoBrain, isUndo, SUGGESTIONS } from "./script";
import { roviSignal, uid, useRovi } from "./store";
import type { Explainer, RoviAction, RoviReply } from "./types";
import { canSpeak, speak, stopSpeaking } from "./voice";

/**
 * Runs a conversation turn: think → answer → act → speak. Actions run one after another while Rovi talks; each gets
 * a chip in the chat and an Undo (also offered in a toast). Also drives the guided tour.
 */

const undos = new Map<string, Undo>();
const undoOrder: string[] = [];
let turn = 0;
let speaking = false;
let acting = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isPhone = () => window.matchMedia("(max-width: 639px)").matches;

function syncMood() {
  const s = useRovi.getState();
  if (s.mood === "listening") return;
  s.setMood(acting > 0 ? "acting" : speaking ? "speaking" : "idle");
}

/** Say `text` aloud (if voice is on) or mime it while the typewriter runs. Resolves when done. */
async function say(text: string, token: number) {
  speaking = true;
  syncMood();
  const { voiceOut } = useRovi.getState();
  if (voiceOut && canSpeak()) {
    await speak(text);
  } else {
    // Match the typewriter in the chat (18 ms a letter, capped), moving the mouth like syllables.
    const until = performance.now() + Math.min(5200, text.length * 18);
    while (performance.now() < until && token === turn) {
      roviSignal.mouth = 0.35 + Math.random() * 0.6;
      await sleep(110);
      roviSignal.mouth = 0.1;
      await sleep(60);
    }
    roviSignal.mouth = 0;
  }
  if (token === turn) {
    speaking = false;
    syncMood();
  }
}

export function undoChip(chipId: string) {
  const fn = undos.get(chipId);
  if (!fn) return;
  undos.delete(chipId);
  const i = undoOrder.indexOf(chipId);
  if (i >= 0) undoOrder.splice(i, 1);
  useRovi.getState().setSpot(null);
  try {
    fn();
    useRovi.getState().patchChip(chipId, { status: "undone", undoable: false });
  } catch {
    toast.error("Rovi couldn't undo that one.");
  }
}

async function runChip(msgId: string, action: RoviAction) {
  const chip = { id: uid("chip"), label: describe(action), status: "running" as const, undoable: false };
  const s = useRovi.getState();
  s.addChip(msgId, chip);
  acting++;
  syncMood();
  try {
    const undo = await perform(action);
    if (undo) {
      undos.set(chip.id, undo);
      undoOrder.push(chip.id);
    }
    s.patchChip(chip.id, { status: "done", undoable: Boolean(undo) });
    if (undo && action.type !== "startTour") {
      toast(chip.label, {
        description: "Done by Rovi",
        action: { label: "Undo", onClick: () => undoChip(chip.id) },
        duration: 7000,
      });
    }
  } catch (e) {
    s.patchChip(chip.id, { status: "failed" });
    s.push({ id: uid("m"), role: "rovi", text: `Sorry, that didn't work: ${(e as Error).message}` });
  } finally {
    acting--;
    syncMood();
  }
}

let liveAbort: AbortController | null = null;

/** Plain text for the bubble and the voice, even if the model slips into markdown. */
const plain = (t: string) => t.replace(/\*\*|__|`/g, "").replace(/^#+\s*/gm, "");

/** Three suggested questions the visitor has not asked yet. */
function freshSuggestions() {
  const asked = new Set(useRovi.getState().messages.filter((m) => m.role === "user").map((m) => m.text.toLowerCase()));
  return SUGGESTIONS.map((s) => s.q).filter((q) => !asked.has(q.toLowerCase())).slice(0, 3);
}

/**
 * Try Claude on Bedrock (/api/rovi). Streams text into message `id` as it arrives, shows a status line while data
 * tools run, collects actions and the explainer. Returns null when the browser should answer in demo mode.
 */
async function askLive(question: string, token: number, id: string): Promise<RoviReply | null> {
  liveAbort?.abort();
  const abort = (liveAbort = new AbortController());
  const s = useRovi.getState();
  const history = historyForBrain();
  let text = "";
  let explainer: Explainer | undefined;
  const actions: RoviAction[] = [];
  const ensure = () => {
    if (!useRovi.getState().messages.some((m) => m.id === id)) s.push({ id, role: "rovi", text: "", streaming: true });
  };
  const mode = await askRemote(
    question,
    history,
    (e) => {
      if (token !== turn) return;
      if (e.type === "status") {
        ensure();
        s.patchMsg(id, { status: e.text });
      } else if (e.type === "text") {
        ensure();
        text += e.text;
        s.patchMsg(id, { text: plain(text), status: undefined });
        if (!useRovi.getState().voiceOut) roviSignal.mouth = 0.4 + Math.random() * 0.5;
      } else if (e.type === "reset") {
        // The model's lead-in before a tool call is dropped; the real answer follows.
        text = "";
        s.patchMsg(id, { text: "" });
      } else if (e.type === "action") {
        actions.push(e.action);
      } else if (e.type === "explainer") {
        ensure();
        explainer = e.explainer;
        s.patchMsg(id, { explainer });
      } else if (e.type === "refusal") {
        ensure();
        text = e.text;
        actions.length = 0;
        s.patchMsg(id, { text, status: undefined });
      } else if (e.type === "error") {
        text += text ? " (I lost the connection there, sorry.)" : "";
        s.patchMsg(id, { text: plain(text) });
      }
    },
    abort.signal,
  ).catch(() => "demo" as const);
  if (mode === "demo" || token !== turn) return null;
  return { text: plain(text) || (explainer ? explainer.answer : "Done."), actions, explainer };
}

/** Ask Rovi something. Cancels whatever it was saying before. */
export async function ask(raw: string) {
  const text = raw.trim();
  if (!text) return;
  const token = ++turn;
  const s = useRovi.getState();
  stopSpeaking();
  speaking = false;
  if (tour) endTour(false);
  s.push({ id: uid("m"), role: "user", text });

  if (isUndo(text)) {
    const last = undoOrder.at(-1);
    const msg = last ? "Undone." : "There's nothing for me to undo yet.";
    if (last) undoChip(last);
    s.push({ id: uid("m"), role: "rovi", text: msg, fresh: true });
    void say(msg, token);
    return;
  }

  s.setMood("thinking");
  const id = uid("m");
  const live = await askLive(text, token, id);
  if (token !== turn) return;

  let reply: RoviReply;
  if (live) {
    reply = live;
    s.patchMsg(id, { streaming: false, status: undefined, next: freshSuggestions() });
  } else {
    const [demo] = await Promise.all([demoBrain(text), sleep(650 + Math.random() * 450)]);
    if (token !== turn) return;
    reply = demo;
    const msg = { text: reply.text, fresh: true, next: reply.next, explainer: reply.explainer, streaming: false, status: undefined };
    // A live attempt that failed early may have left a placeholder (a status line): reuse it.
    if (useRovi.getState().messages.some((m) => m.id === id)) s.patchMsg(id, msg);
    else s.push({ id, role: "rovi", ...msg });
  }
  // On phones the sheet would hide what Rovi is doing: tuck it away and answer in the speech bubble instead.
  const tourAction = reply.actions.some((a) => a.type === "startTour" && a.tour === "site");
  if (reply.actions.length && isPhone() && !tourAction) {
    s.setOpen(false);
    s.setBubble({ text: reply.text });
  }
  if (tourAction) s.setOpen(false);

  const talking = tourAction ? Promise.resolve() : say(reply.text, token);
  for (const a of reply.actions) {
    if (token !== turn) break;
    await runChip(id, a);
  }
  await talking;
  // The chat may have been closed while it typed; never leave the answer half-typed for later.
  useRovi.getState().settle(id);
  if (token === turn && !tour) {
    await sleep(3500);
    if (token === turn && !tour && useRovi.getState().bubble?.tour === undefined) useRovi.getState().setBubble(null);
  }
}

/* ---------- guided tour: Finder → Moon Base → Radar Twins → Challenge ---------- */

interface TourStep {
  say: string;
  go: RoviAction;
}

const TOUR_STEPS: TourStep[] = [
  {
    // Cell count from public/data/finder/earth-grid.json.
    say: "Stop one, the Analog Finder. It scores all 354,342 land cells of a 0.25° Earth grid against a Moon base or Mars site, using NASA measurements, not photos. Bright means a close match.",
    go: { type: "navigate", href: "/finder", spot: "#finder-stage", caption: "Earth, scored live" },
  },
  {
    say: "Stop two, the Moon Base map: the lunar south pole from 75° south to the pole, with NASA's nine Artemis III candidate regions. Weigh slope, ice and sunlight to see where a base could work.",
    go: { type: "navigate", href: "/bases", spot: "#moonbase-map", caption: "Lunar south pole, NASA LRO data" },
  },
  {
    say: "Stop three, Radar Twins. Canada's RADARSAT Constellation maps Arctic ice by how radar echoes scramble; NASA's Mini-RF did the same at the Moon's poles, hunting for ice in craters that never see the Sun.",
    go: { type: "navigate", href: "/compare", spot: 'section[aria-labelledby="radar-title"]', caption: "Radar twins · CSA × NASA" },
  },
  {
    say: "Last stop, the Mission Challenge: five short missions built on real NASA photos, data and physics. That's the tour! Ask me anything, or tap a suggestion.",
    go: { type: "navigate", href: "/challenge", spot: '[aria-label="Choose a mission"]', caption: "Five missions" },
  },
];

let tour: { step: number; paused: boolean; startPath: string; token: number } | null = null;

function setTourBubble(text: string) {
  if (!tour) return;
  useRovi.getState().setBubble({ text, tour: { step: tour.step, total: TOUR_STEPS.length, paused: tour.paused } });
}

async function runStep(i: number) {
  if (!tour) return;
  const token = ++tour.token;
  tour.step = i;
  const step = TOUR_STEPS[i];
  const s = useRovi.getState();
  s.setOpen(false);
  setTourBubble(step.say);
  s.push({ id: uid("m"), role: "rovi", text: step.say });
  stopSpeaking();
  acting++;
  syncMood();
  const talking = say(step.say, turn);
  try {
    if (step.go.type === "navigate") {
      await perform({ ...step.go, spot: undefined });
      window.scrollTo({ top: 0 });
      if (step.go.spot) await spotlight(step.go.spot, step.go.caption ?? "");
    }
  } catch {
    /* a page that fails to open just leaves the narration */
  } finally {
    acting--;
    syncMood();
  }
  await talking;
  // Without a voice, give people time to read.
  if (!useRovi.getState().voiceOut || !canSpeak()) await sleep(Math.max(0, step.say.split(" ").length * 230 - 3000));
  await sleep(1600);
  // Never change pages in a background tab: pick the tour up again when the viewer comes back.
  while (document.visibilityState === "hidden" && tour?.token === token) await sleep(500);
  if (!tour || tour.token !== token || tour.paused) return;
  if (i + 1 < TOUR_STEPS.length) void runStep(i + 1);
  else endTour(false, true);
}

/** Start the guided tour; returns its undo (end the tour and go back to where it started). */
export function startGuidedTour(): Undo {
  const startPath = window.location.pathname + window.location.search;
  tour = { step: 0, paused: false, startPath, token: 0 };
  void runStep(0);
  return () => {
    endTour(false);
    // Plain navigation home through the bound router, via a harmless action.
    void perform({ type: "navigate", href: startPath });
  };
}

export function tourNext() {
  if (!tour) return;
  tour.paused = false;
  if (tour.step + 1 < TOUR_STEPS.length) void runStep(tour.step + 1);
  else endTour(true);
}

export function tourTogglePause() {
  if (!tour) return;
  tour.paused = !tour.paused;
  const text = useRovi.getState().bubble?.text ?? "";
  setTourBubble(text);
  if (tour.paused) stopSpeaking();
  else void runStep(Math.min(tour.step + 1, TOUR_STEPS.length - 1));
}

/** End the tour. `keepBubble` leaves the last line up for a moment (natural finish). */
export function endTour(byUser: boolean, keepBubble = false) {
  if (!tour) return;
  tour = null;
  const s = useRovi.getState();
  if (byUser) stopSpeaking();
  s.setSpot(null);
  if (keepBubble) {
    const text = s.bubble?.text ?? "";
    s.setBubble({ text });
    setTimeout(() => {
      if (!tour && useRovi.getState().bubble?.text === text) useRovi.getState().setBubble(null);
    }, 5000);
  } else s.setBubble(null);
}

export const tourRunning = () => tour !== null;
