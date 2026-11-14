"use client";

import type { BrainEvent, ChatTurn } from "./server/brain";
import { useRovi } from "./store";

/**
 * Ask the live brain (/api/rovi). Streams its events to `onEvent` and resolves "live" when it answered, or "demo"
 * when the browser should answer from its script instead (AI off, rate-limited, unreachable, or failed before any
 * text arrived).
 */
export async function askRemote(
  question: string,
  history: ChatTurn[],
  onEvent: (e: BrainEvent) => void,
  signal?: AbortSignal,
): Promise<"live" | "demo"> {
  const store = useRovi.getState();
  if (store.aiMode === "demo") return "demo";
  let res: Response;
  try {
    res = await fetch("/api/rovi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, history }),
      signal,
    });
  } catch {
    return "demo";
  }
  if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
    const body = (await res.json().catch(() => null)) as { mode?: string; reason?: string } | null;
    // AI switched off on the server: remember it for this visit. A rate limit is only for now.
    if (body?.mode === "demo" && body.reason !== "rate") useRovi.setState({ aiMode: "demo" });
    return "demo";
  }
  useRovi.setState({ aiMode: "live" });

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let answered = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const e = JSON.parse(line) as BrainEvent;
      if (e.type === "error" && e.fallback && !answered) return "demo";
      if (e.type === "text" || e.type === "action" || e.type === "explainer" || e.type === "refusal") answered = true;
      onEvent(e);
    }
  }
  return answered ? "live" : "demo";
}

/** The last few turns, as the brain wants them. */
export function historyForBrain(): ChatTurn[] {
  return useRovi
    .getState()
    .messages.filter((m) => m.text.trim() && !m.streaming)
    .slice(-7, -1)
    .map((m) => ({ role: m.role, text: m.text }));
}
