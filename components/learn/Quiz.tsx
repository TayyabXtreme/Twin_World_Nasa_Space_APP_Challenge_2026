"use client";

import { ArrowRight, Check, ExternalLink, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { QUIZ } from "@/lib/data/learn";
import { sourceById } from "@/lib/data/sources";
import { cn } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;
/** Spark directions for a right answer, px. */
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { dx: `${Math.round(Math.cos(a) * 56)}px`, dy: `${Math.round(Math.sin(a) * 40)}px` };
});

function verdict(score: number, total: number) {
  const r = score / total;
  if (r === 1) return "Perfect. Mission control would hire you.";
  if (r >= 0.75) return "Great flying. Just a few surprises out there.";
  if (r >= 0.5) return "Not bad. Scroll back up for the ones that caught you.";
  return "Space is strange! The chapters above explain every answer.";
}

/** True or false, one card at a time, with the explanation and its source after each answer. */
export function Quiz() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const done = step >= QUIZ.length;
  const q = QUIZ[Math.min(step, QUIZ.length - 1)];
  const picked = answers[step] as boolean | undefined;
  const answered = picked !== undefined;
  const right = answered && picked === q.answer;
  const score = answers.filter((a, i) => a === QUIZ[i].answer).length;
  const src = q.sourceId ? sourceById(q.sourceId) : undefined;

  const answer = (v: boolean) => {
    if (answered) return;
    setAnswers((a) => [...a.slice(0, step), v]);
  };
  const restart = () => {
    setAnswers([]);
    setStep(0);
  };

  return (
    <div className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl glass p-6 sm:p-8">
      {/* Progress: one segment per question, coloured by how you did. */}
      <div className="flex gap-1.5" aria-hidden>
        {QUIZ.map((qq, i) => (
          <span
            key={qq.id}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              answers[i] === undefined
                ? i === step
                  ? "bg-white/40"
                  : "bg-white/10"
                : answers[i] === qq.answer
                  ? "bg-ok"
                  : "bg-destructive",
            )}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.div
            key="done"
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="flex flex-col items-center py-8 text-center"
          >
            <p className="hud text-xs tracking-[0.18em] text-muted-foreground uppercase">Your score</p>
            <p className="mt-2 font-heading text-6xl font-semibold tracking-tight">
              {score}
              <span className="text-muted-foreground">/{QUIZ.length}</span>
            </p>
            <p className="mt-3 max-w-sm text-muted-foreground">{verdict(score, QUIZ.length)}</p>
            <button
              type="button"
              onClick={restart}
              className="mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm ring-1 ring-white/15 transition-[background-color,scale] duration-150 hover:bg-white/5 active:scale-[0.97]"
            >
              <RotateCcw className="size-4" aria-hidden />
              Play again
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={q.id}
            initial={reduce ? false : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="pt-6"
          >
            <p className="hud text-xs text-muted-foreground">
              Question {step + 1} of {QUIZ.length}
            </p>
            <p className="mt-2 font-heading text-[clamp(1.35rem,3vw,1.9rem)] leading-snug font-semibold tracking-tight text-balance">
              {q.statement}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {[true, false].map((v) => {
                const chosen = picked === v;
                const correct = q.answer === v;
                return (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => answer(v)}
                    disabled={answered}
                    className={cn(
                      "relative flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-medium ring-1 transition-[background-color,box-shadow,opacity,scale] duration-200 ease-(--ease-out)",
                      !answered && "ring-white/15 hover:bg-white/[0.06] hover:ring-white/30 active:scale-[0.97]",
                      answered && correct && "bg-ok/15 text-foreground ring-ok/60",
                      answered && chosen && !correct && "bg-destructive/15 ring-destructive/60",
                      answered && !chosen && !correct && "opacity-40 ring-white/10",
                    )}
                  >
                    {answered && correct && <Check className="size-4 text-ok" aria-hidden />}
                    {answered && chosen && !correct && <X className="size-4 text-destructive" aria-hidden />}
                    {v ? "True" : "False"}
                    {chosen &&
                      right &&
                      SPARKS.map((s, i) => (
                        <span
                          key={i}
                          aria-hidden
                          className="learn-spark pointer-events-none absolute top-1/2 left-1/2 size-1.5 rounded-full bg-ok"
                          style={{ "--dx": s.dx, "--dy": s.dy } as React.CSSProperties}
                        />
                      ))}
                  </button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {answered && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="mt-6 border-t border-border pt-5"
                  aria-live="polite"
                >
                  <p className={cn("text-sm font-semibold", right ? "text-ok" : "text-destructive")}>
                    {right ? "Correct!" : "Not quite."} It&rsquo;s {q.answer ? "true" : "false"}.
                  </p>
                  <p className="mt-1.5 leading-relaxed text-foreground/90">{q.explanation}</p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    {src ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                      >
                        {src.org}: {src.title}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Worked out from distance ÷ the speed of light.
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setStep((s) => s + 1)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-[background-color,scale] duration-150 hover:bg-primary/90 active:scale-[0.97]"
                    >
                      {step === QUIZ.length - 1 ? "See score" : "Next"}
                      <ArrowRight className="size-4" aria-hidden />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
