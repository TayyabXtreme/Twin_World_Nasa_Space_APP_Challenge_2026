"use client";

import { Check, CircleAlert, Loader2, Mic, RotateCcw, SendHorizontal, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ask, undoChip } from "@/lib/rovi/conductor";
import { SUGGESTIONS } from "@/lib/rovi/script";
import { useRovi } from "@/lib/rovi/store";
import type { ActionChip, ChatMessage } from "@/lib/rovi/types";
import { canListen, listen, stopSpeaking } from "@/lib/rovi/voice";
import { cn } from "@/lib/utils";
import { ExplainerCard } from "./ExplainerCard";
import { RoviFace } from "./RoviFace";

const EASE = [0.23, 1, 0.32, 1] as const;

/** Rovi's answer, typed out once when it first arrives. */
function Typed({ msg }: { msg: ChatMessage }) {
  const reduce = useReducedMotion();
  const settle = useRovi((s) => s.settle);
  const [n, setN] = useState(msg.fresh && !reduce ? 0 : msg.text.length);
  useEffect(() => {
    if (n >= msg.text.length) {
      if (msg.fresh) settle(msg.id);
      return;
    }
    const id = setTimeout(() => setN((v) => Math.min(msg.text.length, v + 2)), 30);
    return () => clearTimeout(id);
  }, [n, msg, settle]);
  return (
    <>
      {msg.text.slice(0, n)}
      {n < msg.text.length && <span className="rovi-caret" aria-hidden />}
    </>
  );
}

function Chip({ chip }: { chip: ActionChip }) {
  return (
    <li className="rovi-chip flex items-center gap-2 rounded-xl bg-white/[0.04] py-1.5 ps-2.5 pe-1.5 text-xs ring-1 ring-white/10">
      {chip.status === "running" ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-warn" aria-hidden />
      ) : chip.status === "done" ? (
        <Check className="size-3.5 shrink-0 text-ok" aria-hidden />
      ) : chip.status === "failed" ? (
        <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden />
      ) : (
        <Undo2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className={cn("min-w-0 flex-1 truncate", chip.status === "undone" && "text-muted-foreground line-through")}>
        {chip.label}
      </span>
      {chip.undoable && chip.status === "done" && (
        <button
          type="button"
          onClick={() => undoChip(chip.id)}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary transition-colors duration-150 hover:bg-primary/10"
        >
          <Undo2 className="size-3" aria-hidden /> Undo
        </button>
      )}
    </li>
  );
}

function SuggestionChips({ items, onPick, className }: { items: string[]; onPick: (q: string) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className="rounded-full bg-white/[0.05] px-3 py-1.5 text-start text-xs text-foreground/90 ring-1 ring-white/10 transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-out)] hover:bg-primary/10 hover:ring-primary/40 active:scale-[0.97]"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-4 px-1 pt-1">
      <div>
        <p className="font-heading text-lg leading-snug font-semibold">Hi, I&apos;m Rovi.</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          I can fly the globes, run the Analog Finder, pin a Moon base, open NASA map layers, start a game or show you
          around. Ask &ldquo;how does&hellip; work?&rdquo; and I&apos;ll draw it step by step. Type or use the mic.
        </p>
      </div>
      <ul className="grid gap-1.5">
        {SUGGESTIONS.map((s, i) => (
          <li key={s.id} className="rovi-rise" style={{ "--i": i } as React.CSSProperties}>
            <button
              type="button"
              onClick={() => onPick(s.q)}
              className="group flex w-full items-center gap-3 rounded-xl bg-white/[0.035] px-3 py-2.5 text-start text-sm ring-1 ring-white/[0.08] transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-out)] hover:bg-primary/[0.08] hover:ring-primary/35 active:scale-[0.985]"
            >
              <span className="hud w-5 shrink-0 text-[11px] text-muted-foreground group-hover:text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              {s.q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2" aria-label="Rovi is thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="rovi-dot size-1.5 rounded-full bg-[oklch(0.78_0.14_295)]" style={{ "--i": i } as React.CSSProperties} />
      ))}
    </div>
  );
}

/** Everything inside the panel or sheet: header, conversation, composer. */
function ChatBody({ onClose }: { onClose: () => void }) {
  const messages = useRovi((s) => s.messages);
  const mood = useRovi((s) => s.mood);
  const voiceOut = useRovi((s) => s.voiceOut);
  const setVoiceOut = useRovi((s) => s.setVoiceOut);
  const clear = useRovi((s) => s.clear);
  const aiMode = useRovi((s) => s.aiMode);
  const [draft, setDraft] = useState("");

  // Ask the server once whether the live AI is on, so the badge is right before the first question.
  useEffect(() => {
    if (useRovi.getState().aiMode !== "unknown") return;
    fetch("/api/rovi")
      .then((r) => r.json() as Promise<{ mode?: "live" | "demo" }>)
      .then((j) => useRovi.getState().aiMode === "unknown" && useRovi.setState({ aiMode: j.mode === "live" ? "live" : "demo" }))
      .catch(() => useRovi.setState({ aiMode: "demo" }));
  }, []);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [micOk, setMicOk] = useState(true);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after hydration
  useEffect(() => setMicOk(canListen()), []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, mood]);

  // Keep the newest Rovi line in view while it types.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !messages.at(-1)?.fresh) return;
    const id = setInterval(() => el.scrollTo({ top: el.scrollHeight }), 120);
    return () => clearInterval(id);
  }, [messages]);

  useEffect(() => () => stopRef.current?.(), []);

  const send = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setDraft("");
    void ask(text);
  };

  const toggleMic = () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    if (!micOk) {
      toast("Voice input needs Chrome, Edge or Safari. You can still type.");
      return;
    }
    stopSpeaking();
    setListening(true);
    useRovi.getState().setMood("listening");
    stopRef.current = listen(
      (t) => setDraft(t),
      (t, err) => {
        setListening(false);
        stopRef.current = null;
        useRovi.getState().setMood("idle");
        if (err) toast.error(err);
        if (t) send(t);
      },
    );
  };

  const last = messages.at(-1);
  const busy = mood === "thinking" && !last?.streaming;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
        <RoviFace className="size-9 shrink-0" live={false} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-heading text-[15px] leading-tight font-semibold">
            Rovi
            {aiMode === "live" ? (
              <span
                title={`Answers from Claude on AWS Bedrock, with numbers from TwinWorlds' NASA data tools`}
                className="rounded-full bg-ok/15 px-1.5 py-px text-[10px] font-medium tracking-wide text-ok uppercase ring-1 ring-ok/30"
              >
                Live AI
              </span>
            ) : aiMode === "demo" ? (
              <span
                title="Scripted answers: the live AI is off on this site"
                className="rounded-full bg-warn/15 px-1.5 py-px text-[10px] font-medium tracking-wide text-warn uppercase ring-1 ring-warn/30"
              >
                Demo
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {mood === "listening"
              ? "Listening…"
              : mood === "thinking"
                ? "Thinking…"
                : mood === "acting"
                  ? "On it…"
                  : mood === "speaking"
                    ? "Speaking"
                    : "TwinWorlds mission robot"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVoiceOut(!voiceOut)}
          aria-pressed={voiceOut}
          aria-label={voiceOut ? "Mute Rovi's voice" : "Let Rovi speak answers aloud"}
          title={voiceOut ? "Voice replies on" : "Voice replies off"}
          className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground"
        >
          {voiceOut ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              stopSpeaking();
              clear();
            }}
            aria-label="Start a new conversation"
            title="New conversation"
            className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground"
          >
            <RotateCcw className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Rovi"
          className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div ref={scroller} className="rovi-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <Welcome onPick={send} />
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li key={m.id} className={cn("rovi-msg flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                <p
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "rounded-br-md bg-primary/15 text-foreground ring-1 ring-primary/25"
                      : "rounded-bl-md bg-white/[0.05] text-foreground/95 ring-1 ring-white/[0.08]",
                  )}
                >
                  {m.role === "rovi" ? (
                    m.streaming ? (
                      <>
                        {m.text}
                        {m.status && !m.text ? (
                          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin text-[oklch(0.78_0.14_295)]" aria-hidden />
                            {m.status}
                          </span>
                        ) : (
                          <span className="rovi-caret" aria-hidden />
                        )}
                      </>
                    ) : (
                      <Typed msg={m} />
                    )
                  ) : (
                    m.text
                  )}
                </p>
                {m.explainer && <ExplainerCard e={m.explainer} />}
                {m.chips && m.chips.length > 0 && (
                  <ul className="flex w-[88%] flex-col gap-1.5" aria-label="What Rovi did">
                    {m.chips.map((c) => (
                      <Chip key={c.id} chip={c} />
                    ))}
                  </ul>
                )}
                {m === last && m.role === "rovi" && !m.fresh && m.next && m.next.length > 0 && (
                  <SuggestionChips items={m.next} onPick={send} className="max-w-[92%]" />
                )}
              </li>
            ))}
            {busy && (
              <li>
                <Thinking />
              </li>
            )}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2 border-t border-white/[0.07] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          onClick={toggleMic}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Ask with your voice"}
          title={micOk ? "Talk to Rovi (English)" : "Voice input needs Chrome, Edge or Safari"}
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,transform] duration-150 active:scale-95",
            listening
              ? "rovi-mic-on bg-primary text-primary-foreground ring-primary"
              : "bg-white/[0.05] text-muted-foreground ring-white/10 hover:text-foreground",
            !micOk && "opacity-60",
          )}
        >
          <Mic className="size-4.5" />
        </button>
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={listening ? "Listening…" : "Ask Rovi anything…"}
          aria-label="Message Rovi"
          enterKeyHint="send"
          className="h-10 min-w-0 flex-1 rounded-full bg-white/[0.05] px-4 text-[16px] ring-1 ring-white/10 outline-none placeholder:text-muted-foreground focus:ring-primary/50 sm:text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] duration-150 active:scale-95 disabled:opacity-35"
        >
          <SendHorizontal className="size-4.5" />
        </button>
      </form>
    </div>
  );
}

/** Floating panel above the robot on wide screens, a draggable bottom sheet on phones. */
export function ChatPanel({ phone }: { phone: boolean }) {
  const open = useRovi((s) => s.open);
  const setOpen = useRovi((s) => s.setOpen);
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open &&
        (phone ? (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-[44] bg-black/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={close}
            />
            <motion.section
              key="sheet"
              role="dialog"
              aria-label="Chat with Rovi"
              className="rovi-panel fixed inset-x-0 bottom-0 z-[45] h-[min(80dvh,40rem)] rounded-t-[1.75rem]"
              initial={reduce ? { opacity: 0 } : { y: "100%" }}
              animate={reduce ? { opacity: 1 } : { y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: "100%" }}
              transition={{ duration: 0.42, ease: EASE }}
              drag="y"
              dragListener={false}
              dragControls={drag}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.04, bottom: 0.9 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 600) close();
              }}
            >
              <div
                className="flex touch-none justify-center pt-2.5 pb-1"
                onPointerDown={(e) => drag.start(e)}
                aria-hidden
              >
                <span className="h-1 w-10 rounded-full bg-white/25" />
              </div>
              <div className="h-[calc(100%-1.25rem)]">
                <ChatBody onClose={close} />
              </div>
            </motion.section>
          </>
        ) : (
          <motion.section
            key="panel"
            role="dialog"
            aria-label="Chat with Rovi"
            className="rovi-panel fixed end-4 bottom-[calc(var(--rovi-bottom)+var(--rovi-size)+0.5rem)] z-[45] flex h-[min(38rem,calc(100dvh-var(--rovi-bottom)-var(--rovi-size)-2rem))] w-[min(24.5rem,calc(100vw-2rem))] origin-bottom-right flex-col rounded-[1.6rem]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.26, ease: EASE }}
          >
            <ChatBody onClose={close} />
          </motion.section>
        ))}
    </AnimatePresence>
  );
}
