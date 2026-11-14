import type { NextRequest } from "next/server";
import { aiMode, runBrain, type ChatTurn } from "@/lib/rovi/server/brain";

/**
 * Rovi's brain over HTTP.
 *  GET  /api/rovi → { mode: "live" | "demo" }
 *  POST /api/rovi { question, history } → newline-delimited JSON events (lib/rovi/server/brain.ts BrainEvent), or
 *       { mode: "demo" } when the AI is off (AI_MODE=demo or no AWS credentials), so the browser answers from its script.
 */

export function GET() {
  return Response.json({ mode: aiMode() });
}

// A small per-visitor budget so a public demo cannot run up the Bedrock bill: 12 questions a minute.
const WINDOW_MS = 60_000;
const LIMIT = 12;
const hits = new Map<string, number[]>();
function allowed(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length <= LIMIT;
}

function parseBody(body: unknown): { question: string; history: ChatTurn[] } | null {
  if (!body || typeof body !== "object") return null;
  const { question, history } = body as { question?: unknown; history?: unknown };
  if (typeof question !== "string" || !question.trim() || question.length > 600) return null;
  const turns = Array.isArray(history)
    ? history
        .filter((t): t is ChatTurn => (t?.role === "user" || t?.role === "rovi") && typeof t?.text === "string")
        .slice(-6)
    : [];
  return { question: question.trim(), history: turns };
}

export async function POST(req: NextRequest) {
  if (aiMode() === "demo") return Response.json({ mode: "demo" });
  const input = parseBody(await req.json().catch(() => null));
  if (!input) return Response.json({ error: "Send { question, history }." }, { status: 400 });

  const who = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowed(who)) return Response.json({ mode: "demo", reason: "rate" });

  const encoder = new TextEncoder();
  const events = runBrain(input.history, input.question, req.signal);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) return controller.close();
      // Tool traces are for the evaluation script only; the browser never needs raw tool output.
      if (value.type !== "tool") controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
    },
    cancel() {
      void events.return(undefined);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-rovi-mode": "live" },
  });
}
