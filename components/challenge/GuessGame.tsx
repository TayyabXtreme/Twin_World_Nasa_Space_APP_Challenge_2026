"use client";

import { ArrowRight, Check, ExternalLink, Flame, Play, RotateCcw, Timer, Trophy, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { drawRounds, photoSrc, WORLD_LABEL, type PhotoRound } from "@/lib/challenge/photos";
import { cn } from "@/lib/utils";
import type { World } from "@/lib/worlds";
import { readBest, writeBest } from "./best";
import { sfx } from "./sfx";

/**
 * Earth or Elsewhere?: ten real photographs, each from Earth, the Moon or Mars. Guess before the timer runs out;
 * every answer reveals where it was taken and what makes the place a good (or bad) analogue.
 */

const ROUND_SECONDS = 12;
const EASE = [0.22, 1, 0.36, 1] as const;
const CHOICES: { world: World; label: string; key: string; dot: string; glow: string }[] = [
  {
    world: "earth",
    label: "Earth",
    key: "1",
    dot: "bg-[var(--world-earth)]",
    glow: "hover:ring-[var(--world-earth)]/60 hover:bg-[var(--world-earth)]/10",
  },
  {
    world: "moon",
    label: "Moon",
    key: "2",
    dot: "bg-[var(--world-moon)]",
    glow: "hover:ring-[var(--world-moon)]/60 hover:bg-[var(--world-moon)]/10",
  },
  {
    world: "mars",
    label: "Mars",
    key: "3",
    dot: "bg-[var(--world-mars)]",
    glow: "hover:ring-[var(--world-mars)]/60 hover:bg-[var(--world-mars)]/10",
  },
];

type Answer = { round: PhotoRound; guess: World | null; points: number; seconds: number };
type Phase = "intro" | "asking" | "reveal" | "done";

function rankFor(correct: number) {
  if (correct >= 10)
    return { title: "Planetary geologist", line: "Perfect. You read rocks, light and dust like a mission scientist." };
  if (correct >= 8) return { title: "Field scientist", line: "Sharp eyes. Analogue sites only fooled you a little." };
  if (correct >= 6)
    return { title: "Rover driver", line: "Good instincts. Earth's analogues are genuinely convincing." };
  if (correct >= 4)
    return {
      title: "Trainee astronaut",
      line: "That is exactly why NASA trains crews in these places: they look alike.",
    };
  return {
    title: "Fooled by the analogues",
    line: "Don't worry: deserts, lava fields and dry valleys on Earth were chosen because they look like other worlds.",
  };
}

export function GuessGame() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("intro");
  const [rounds, setRounds] = useState<PhotoRound[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [left, setLeft] = useState(ROUND_SECONDS);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const started = useRef(0);
  // One answer per photo: the countdown can fire again before React has switched to the reveal.
  const answered = useRef(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the stored record once, after hydration
  useEffect(() => setBest(readBest("guess")), []);

  const round = rounds[index];
  const streak = (() => {
    let s = 0;
    for (let i = answers.length - 1; i >= 0 && answers[i].guess === answers[i].round.world; i--) s++;
    return s;
  })();
  const score = answers.reduce((s, a) => s + a.points, 0);
  const correct = answers.filter((a) => a.guess === a.round.world).length;

  const start = useCallback(() => {
    sfx.unlock();
    setRounds(drawRounds());
    setIndex(0);
    setAnswers([]);
    setNewBest(false);
    setLeft(ROUND_SECONDS);
    started.current = performance.now();
    answered.current = false;
    setPhase("asking");
  }, []);

  const answer = useCallback(
    (guess: World | null) => {
      if (phase !== "asking" || !round || answered.current) return;
      answered.current = true;
      const seconds = (performance.now() - started.current) / 1000;
      const right = guess === round.world;
      const runBefore = answers.length && streak;
      const points = right
        ? 100 + Math.round(50 * Math.max(0, 1 - seconds / ROUND_SECONDS)) + (runBefore >= 2 ? 25 : 0)
        : 0;
      if (right) sfx.chime();
      else sfx.miss();
      setAnswers((a) => [...a, { round, guess, points, seconds }]);
      setPhase("reveal");
    },
    [phase, round, answers.length, streak],
  );

  const next = useCallback(() => {
    if (phase !== "reveal") return;
    if (index + 1 >= rounds.length) {
      const total = answers.reduce((s, a) => s + a.points, 0);
      const prev = readBest("guess");
      if (total > prev) writeBest("guess", total);
      setNewBest(total > prev && prev > 0);
      setBest(Math.max(prev, total));
      setPhase("done");
      return;
    }
    setIndex((i) => i + 1);
    setLeft(ROUND_SECONDS);
    started.current = performance.now();
    answered.current = false;
    setPhase("asking");
  }, [phase, index, rounds.length, answers]);

  // Countdown (state updates 10x a second; the bar itself animates with CSS).
  useEffect(() => {
    if (phase !== "asking") return;
    const id = window.setInterval(() => {
      const remaining = ROUND_SECONDS - (performance.now() - started.current) / 1000;
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) answer(null);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, answer]);

  // Keyboard: 1/2/3 to answer, Enter or Space for next / start.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (phase === "asking") {
        const c = CHOICES.find((c) => c.key === e.key);
        if (c) answer(c.world);
      } else if ((e.key === "Enter" || e.code === "Space") && t?.tagName !== "BUTTON" && t?.tagName !== "A") {
        e.preventDefault();
        if (phase === "reveal") next();
        else start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, answer, next, start]);

  // Preload the next photo while the current one is on screen.
  useEffect(() => {
    const n = rounds[index + 1];
    if (n) new window.Image().src = photoSrc(n.id);
  }, [rounds, index]);

  const last = answers[answers.length - 1];

  /* ------------------------------------------------------------------ intro */
  if (phase === "intro") {
    return (
      <div className="relative overflow-hidden rounded-[1.75rem] ring-1 ring-white/10">
        <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
          <Image
            src="/photos/challenge/card-guess.webp"
            alt="Iceland on Earth meeting Mount Sharp on Mars along a diagonal"
            fill
            sizes="(min-width: 1280px) 1200px, 100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(3_5_11/0.92)_0%,rgb(3_5_11/0.65)_45%,rgb(3_5_11/0.1)_80%)]" />
          <div className="absolute inset-0 flex max-w-xl flex-col justify-center gap-4 p-6 sm:p-10">
            <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">
              Analogue challenge · 10 photos
            </p>
            <h2 className="font-heading text-[clamp(1.8rem,4vw,3rem)] leading-none font-semibold tracking-tight">
              Earth or elsewhere?
            </h2>
            <p className="max-w-[44ch] text-sm leading-relaxed text-foreground/85 sm:text-base">
              Every photo is real: NASA rovers on Mars, Apollo astronauts on the Moon, and the places on Earth where
              NASA trains for both. You have {ROUND_SECONDS} seconds per photo.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={start}
                className="arcade-start flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-transform active:scale-[0.97]"
              >
                <Play className="size-4" aria-hidden /> Start
              </button>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Keys 1 · 2 · 3 to answer, Enter for next
              </span>
              {best > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Trophy className="size-4 text-warn" aria-hidden /> Best {best}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ results */
  if (phase === "done") {
    const rank = rankFor(correct);
    return (
      <div className="overflow-hidden rounded-[1.75rem] bg-white/[0.03] p-5 ring-1 ring-white/10 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">Results</p>
            <h2 className="mt-1 font-heading text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold tracking-tight">
              {rank.title}
            </h2>
            <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">{rank.line}</p>
          </div>
          <div className="flex items-end gap-6">
            <div>
              <p className="text-[11px] text-muted-foreground">Score</p>
              <p className="hud text-3xl text-foreground">{score}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Correct</p>
              <p className="hud text-3xl text-foreground">{correct}/10</p>
            </div>
            {newBest && (
              <span className="arcade-pop mb-2 rounded-full bg-warn/15 px-2.5 py-0.5 text-xs text-warn ring-1 ring-warn/40">
                New best
              </span>
            )}
          </div>
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {answers.map((a, i) => {
            const ok = a.guess === a.round.world;
            return (
              <motion.li
                key={a.round.id}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
                className="overflow-hidden rounded-xl bg-black ring-1 ring-white/10"
              >
                <div className="relative aspect-[16/10]">
                  <Image
                    src={photoSrc(a.round.id, true)}
                    alt={a.round.place}
                    fill
                    sizes="240px"
                    className="object-cover"
                  />
                  <span
                    className={cn(
                      "absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full",
                      ok ? "bg-ok text-black" : "bg-destructive text-white",
                    )}
                  >
                    {ok ? (
                      <Check className="size-3.5" aria-label="correct" />
                    ) : (
                      <X className="size-3.5" aria-label="wrong" />
                    )}
                  </span>
                </div>
                <p className="truncate px-2.5 py-1.5 text-[11px] text-muted-foreground" title={a.round.place}>
                  <span className="text-foreground">{WORLD_LABEL[a.round.world].replace("the ", "")}</span> ·{" "}
                  {a.round.place.split(" · ")[0]}
                </p>
              </motion.li>
            );
          })}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground active:scale-[0.97]"
          >
            <RotateCcw className="size-4" aria-hidden /> Play again
          </button>
          <Link
            href="/finder"
            className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm ring-1 ring-white/15 transition-colors hover:bg-white/5"
          >
            Find more analogues <ArrowRight className="size-4" aria-hidden />
          </Link>
          {best > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Trophy className="size-4 text-warn" aria-hidden /> Best {best}
            </span>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ asking / reveal */
  const revealed = phase === "reveal" && last;
  const right = revealed && last.guess === last.round.world;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[1.75rem] bg-black ring-1 ring-white/10">
        <AnimatePresence initial={false}>
          <motion.div
            key={round.id}
            className="absolute inset-0"
            initial={reduce ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <Image
              src={photoSrc(round.id)}
              alt="Mystery landscape: Earth, the Moon or Mars?"
              fill
              sizes="(min-width: 1024px) 70vw, 100vw"
              className={cn("object-cover", !reduce && "guess-kenburns")}
              priority
            />
          </motion.div>
        </AnimatePresence>
        {/* timer bar */}
        <div className="absolute inset-x-0 top-0 h-1 bg-black/40">
          <div
            className={cn(
              "h-full origin-left bg-primary transition-transform duration-100 ease-linear",
              left < 4 && phase === "asking" && "bg-warn",
            )}
            style={{ transform: `scaleX(${phase === "asking" ? left / ROUND_SECONDS : 0})` }}
          />
        </div>
        <div className="absolute top-3 left-3 flex gap-1.5" aria-label={`Photo ${index + 1} of ${rounds.length}`}>
          {rounds.map((r, i) => {
            const a = answers[i];
            return (
              <span
                key={r.id}
                className={cn(
                  "h-1.5 w-4 rounded-full transition-colors duration-300 sm:w-6",
                  a
                    ? a.guess === a.round.world
                      ? "bg-ok"
                      : "bg-destructive"
                    : i === index
                      ? "bg-white"
                      : "bg-white/25",
                )}
              />
            );
          })}
        </div>
        <AnimatePresence>
          {revealed && (
            <motion.div
              key="label"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/65 px-4 py-3 ring-1 ring-white/10 backdrop-blur-md"
            >
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                This is {WORLD_LABEL[last.round.world]}
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground">{last.round.place}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
            <p className="text-[10px] text-muted-foreground">Score</p>
            <p className="hud text-lg text-foreground">{score}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Flame className="size-3" aria-hidden /> Streak
            </p>
            <p className={cn("hud text-lg", streak >= 3 ? "text-warn" : "text-foreground")}>{streak}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Timer className="size-3" aria-hidden /> Time
            </p>
            <p className={cn("hud text-lg", left < 4 && phase === "asking" ? "text-warn" : "text-foreground")}>
              {phase === "asking" ? Math.ceil(left) : "—"}
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {phase === "asking" ? (
            <motion.div
              key={`ask-${index}`}
              className="flex flex-1 flex-col gap-2.5"
              initial={reduce ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -16 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <p className="px-1 text-sm text-muted-foreground">Where was this photo taken?</p>
              {CHOICES.map((c) => (
                <button
                  key={c.world}
                  type="button"
                  onClick={() => answer(c.world)}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3.5 text-start ring-1 ring-white/10 transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.98] sm:py-4",
                    c.glow,
                  )}
                >
                  <span className={cn("size-3 rounded-full shadow-[0_0_12px_currentColor]", c.dot)} aria-hidden />
                  <span className="flex-1 font-heading text-lg font-semibold">{c.label}</span>
                  <kbd className="hidden rounded-md bg-white/10 px-2 py-0.5 hud text-xs text-muted-foreground sm:block">
                    {c.key}
                  </kbd>
                </button>
              ))}
              <p className="px-1 text-[11px] text-muted-foreground">
                Faster answers score more; three in a row adds a streak bonus.
              </p>
            </motion.div>
          ) : (
            revealed && (
              <motion.div
                key={`reveal-${index}`}
                className="flex flex-1 flex-col gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10"
                initial={reduce ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? undefined : { opacity: 0, x: -16 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <p
                  className={cn(
                    "flex items-center gap-2 font-heading text-xl font-semibold",
                    right ? "text-ok" : "text-warn",
                  )}
                >
                  {right ? <Check className="size-5" aria-hidden /> : <X className="size-5" aria-hidden />}
                  {right
                    ? `Correct · +${last.points}`
                    : last.guess
                      ? `Not quite: it's ${WORLD_LABEL[last.round.world]}`
                      : `Time's up: it's ${WORLD_LABEL[last.round.world]}`}
                </p>
                <p className="text-sm leading-relaxed text-foreground/90">{last.round.fact}</p>
                <div className="flex flex-col gap-1.5 text-xs">
                  <a
                    href={last.round.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
                  >
                    Photo: {last.round.credit} <ExternalLink className="size-3" aria-hidden />
                  </a>
                  {last.round.compare && (
                    <Link
                      href={last.round.compare.href}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {last.round.compare.label} <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  onClick={next}
                  className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground active:scale-[0.98]"
                >
                  {index + 1 >= rounds.length ? "See results" : "Next photo"}{" "}
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
