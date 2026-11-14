import Anthropic, { betaRefusalFallbackMiddleware } from "@anthropic-ai/sdk";
import { AnthropicBedrock, AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { Explainer, RoviAction } from "@/lib/rovi/types";
import { runTool, STATUS, TOOLS, type ToolOutcome } from "./tools";

/**
 * Rovi's brain: Claude on Amazon Bedrock, streaming, with TwinWorlds' data tools and the browser action tools.
 *
 * Token budget (the robot answers many short questions): low effort, a short frozen system prompt and fixed tool
 * list behind a cache breakpoint, the last few chat turns only, compact tool results and at most 5 tool rounds.
 *
 * Env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BEDROCK_MODEL_ID (default us.anthropic.claude-sonnet-4-6),
 * AI_MODE=demo to force the scripted demo, ROVI_FALLBACK_MODEL (refusal fallback on Mantle; "none" turns it off).
 */

export type BrainEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "reset" }
  | { type: "action"; action: RoviAction }
  | { type: "explainer"; explainer: Explainer }
  | { type: "refusal"; text: string }
  | { type: "tool"; name: string; input: unknown; result: string; isError: boolean }
  | { type: "done"; model: string; usage: Usage; stop: string }
  | { type: "error"; message: string; fallback: boolean };

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  rounds: number;
}

export interface ChatTurn {
  role: "user" | "rovi";
  text: string;
}

export const MODEL = process.env.BEDROCK_MODEL_ID?.trim() || "us.anthropic.claude-sonnet-4-6";
const MAX_ROUNDS = 5;
const MAX_DATA_CALLS = 4;
const ACTION_TOOLS = new Set(["navigate", "fly_globe", "open_map_layer", "set_finder", "place_moon_base", "start_game", "start_tour"]);
const skipped = (result: string): ToolOutcome => ({ kind: "data", result, isError: true });

export function aiMode(): "live" | "demo" {
  if (process.env.AI_MODE?.trim().toLowerCase() === "demo") return "demo";
  const hasCreds = Boolean(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.AWS_PROFILE,
  );
  return hasCreds ? "live" : "demo";
}

const SYSTEM = `You are Rovi, the small friendly robot guide inside TwinWorlds, a NASA Space Apps 2026 site that compares Earth analogue sites with the Moon and Mars using real NASA, CSA, ESA and JAXA data.

How to answer:
- Every number you state must come from a tool result in this conversation (or the user's own words). If no tool gives a number, answer without one. Never estimate or recall figures from memory.
- For facts about sites, rankings, Moon points, mission scores or datasets, call the data tools first.
- When the user wants to see, open, go to, play or try something, call the matching action tool. Actions run on the user's screen right after your reply, so describe them in the present tense ("Here's…"). Use at most one action per reply unless the user asks for several.
- Keep tool use lean: the fewest calls that answer the question.
- When the user wants to learn or understand how something works, call show_explainer once (3-5 steps, 2-6 nodes), then add one or two sentences.
- Keep every reply under 60 words: two or three short sentences of plain, warm English. Pick the two or three most useful facts, not all of them. Plain text only, no markdown, bold, lists or emoji; the screen is small. Don't announce tool calls, just answer. Copy numbers exactly as the tool gives them, with units.
- Analogues match one feature at a time, never a whole world. Say so when it matters.
- Off-topic but harmless: answer in one sentence, then offer something TwinWorlds can show. Never invent pages, sites or ids.`;

/* ---------- client ---------- */

// Bedrock has two Messages endpoints. Inference-profile ids (us./global. prefix or a :version suffix) go to the
// bedrock-runtime client; plain anthropic.* ids go to Mantle, Bedrock's Messages-API endpoint.
const RUNTIME_ID = /^(us|eu|apac|jp|au|global)\.|:\d+$/;

let fallbackOff = (process.env.ROVI_FALLBACK_MODEL ?? "").trim().toLowerCase() === "none";
let clients: { main: AnthropicBedrock | AnthropicBedrockMantle; plain: AnthropicBedrock | AnthropicBedrockMantle } | null = null;

function getClients() {
  if (clients) return clients;
  const awsRegion = process.env.AWS_REGION;
  if (RUNTIME_ID.test(MODEL)) {
    const c = new AnthropicBedrock({ awsRegion, maxRetries: 2 });
    clients = { main: c, plain: c };
  } else {
    // Refusals: Bedrock has no server-side `fallbacks`, so the SDK middleware retries a declined request on another
    // model. If this endpoint rejects the middleware's beta header, the plain client takes over (see runBrain).
    const fallbackModel = process.env.ROVI_FALLBACK_MODEL?.trim() || "anthropic.claude-opus-4-8";
    const plain = new AnthropicBedrockMantle({ awsRegion, maxRetries: 2 });
    const main = fallbackOff
      ? plain
      : new AnthropicBedrockMantle({ awsRegion, maxRetries: 2, middleware: [betaRefusalFallbackMiddleware([{ model: fallbackModel }])] });
    clients = { main, plain };
  }
  return clients;
}

/* ---------- conversation ---------- */

function toMessages(history: ChatTurn[], question: string): Anthropic.MessageParam[] {
  const turns = history
    .filter((t) => t.text.trim())
    .slice(-6)
    .map((t): Anthropic.MessageParam => ({ role: t.role === "user" ? "user" : "assistant", content: t.text.slice(0, 700) }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  return [...turns, { role: "user", content: question.slice(0, 600) }];
}

const REFUSAL_TEXT =
  "I can't help with that one. I can show you Moon bases, Mars sites and their Earth twins, or start a game. What would you like to explore?";

/**
 * One chat turn. Yields text as it streams, a status line while data tools run, actions and explainers for the
 * browser, and a final `done` (or `error` with `fallback: true`, meaning "answer in demo mode instead").
 */
export async function* runBrain(history: ChatTurn[], question: string, signal?: AbortSignal): AsyncGenerator<BrainEvent> {
  const messages = toMessages(history, question);
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, rounds: 0 };
  let wroteText = false;
  let stop = "end_turn";
  let actionsUsed = 0;
  let dataUsed = 0;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      usage.rounds++;
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: MODEL,
        max_tokens: 6000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        // The last round must answer with what it has rather than ask for more tools.
        ...(round === MAX_ROUNDS - 1 ? { tool_choice: { type: "none" as const } } : {}),
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
      };

      let message: Anthropic.Message;
      const streamOnce = async function* (client: AnthropicBedrock | AnthropicBedrockMantle) {
        const stream = client.messages.stream(params, { signal });
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && ev.delta.text) {
            yield ev.delta.text;
            wroteText = true;
          }
        }
        return await stream.finalMessage();
      };

      const { main, plain } = getClients();
      try {
        message = yield* passText(streamOnce(main));
      } catch (e) {
        // The refusal-fallback middleware adds a beta header; an endpoint that rejects it gets the plain client.
        if (main !== plain && !fallbackOff && e instanceof Anthropic.BadRequestError && !wroteText) {
          console.warn("[rovi] refusal fallback rejected by this endpoint; continuing without it:", e.message);
          fallbackOff = true;
          message = yield* passText(streamOnce(plain));
        } else throw e;
      }

      usage.input += message.usage.input_tokens;
      usage.output += message.usage.output_tokens;
      usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
      stop = message.stop_reason ?? "end_turn";

      if (stop === "refusal") {
        yield { type: "refusal", text: REFUSAL_TEXT };
        break;
      }
      const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      // A tool call cut off by max_tokens may carry truncated input: never run it.
      if (!calls.length || stop === "max_tokens") break;

      // Text before a tool call is a lead-in ("Let me check…"): clear it; the answer comes after the tools.
      if (wroteText) {
        yield { type: "reset" };
        wroteText = false;
      }
      messages.push({ role: "assistant", content: message.content });
      for (const c of calls) if (STATUS[c.name]) yield { type: "status", text: STATUS[c.name] };
      // Hard limits per reply, whatever the model asks for: one screen action, four data look-ups.
      const outcomes = await Promise.all(
        calls.map((c) => {
          if (ACTION_TOOLS.has(c.name)) {
            if (++actionsUsed > 1) return Promise.resolve(skipped("Skipped: one screen action per reply."));
          } else if (c.name !== "show_explainer" && ++dataUsed > MAX_DATA_CALLS) {
            return Promise.resolve(skipped("Skipped: look-up limit reached. Answer with what you have."));
          }
          return runTool(c.name, c.input);
        }),
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const [i, out] of outcomes.entries()) {
        const call = calls[i];
        if (out.kind === "action") yield { type: "action", action: out.action };
        if (out.kind === "explainer") yield { type: "explainer", explainer: out.explainer };
        const isError = out.kind === "data" && Boolean(out.isError);
        yield { type: "tool", name: call.name, input: call.input, result: out.result, isError };
        results.push({ type: "tool_result", tool_use_id: call.id, content: out.result, ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
    yield { type: "done", model: MODEL, usage, stop };
  } catch (e) {
    yield { type: "error", message: describeError(e), fallback: !wroteText };
  }
}

/** Re-yield text chunks from a stream generator as events and return its final message. */
async function* passText(gen: AsyncGenerator<string, Anthropic.Message>): AsyncGenerator<BrainEvent, Anthropic.Message> {
  while (true) {
    const step = await gen.next();
    if (step.done) return step.value;
    yield { type: "text", text: step.value };
  }
}

function describeError(e: unknown): string {
  // Most specific first; the browser falls back to demo answers for all of these.
  if (e instanceof Anthropic.RateLimitError) return "Rovi is very busy right now.";
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    console.error("[rovi] Bedrock auth/model access:", e.message);
    return "The AI is not set up for this site yet.";
  }
  if (e instanceof Anthropic.NotFoundError) {
    console.error(`[rovi] Bedrock model "${MODEL}" not found:`, e.message);
    return "The AI model is not available.";
  }
  if (e instanceof Anthropic.APIError) {
    console.error("[rovi] Bedrock error", e.status, e.message);
    return "The AI had a problem.";
  }
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the AI.";
  if ((e as Error)?.name === "AbortError") return "Stopped.";
  console.error("[rovi] brain failed", e);
  return "Something went wrong.";
}
