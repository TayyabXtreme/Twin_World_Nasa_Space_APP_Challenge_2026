"use client";

import { motion, useReducedMotion } from "motion/react";
import { Fragment, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades and slides its content in once, the first time it scrolls into view. Transform and opacity only. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  x = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  /** Slide in sideways instead of (or as well as) from below. */
  x?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A headline whose words rise into place one after another from behind a mask. Screen readers get the plain text;
 * the animated words are hidden from them.
 */
export function SlideWords({
  text,
  className,
  delay = 0,
  onMount = false,
}: {
  text: string;
  className?: string;
  delay?: number;
  /** Play as soon as it mounts (the hero) rather than when scrolled into view. */
  onMount?: boolean;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const show = { y: "0%", opacity: 1 };
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <Fragment key={i}>
            <span className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-bottom">
              <motion.span
                className="inline-block"
                initial={reduce ? false : { y: "105%", opacity: 0 }}
                {...(onMount
                  ? { animate: show }
                  : { whileInView: show, viewport: { once: true, margin: "0px 0px -10% 0px" } })}
                transition={{ duration: 0.75, delay: delay + i * 0.06, ease: EASE }}
              >
                {w}
              </motion.span>
            </span>
            {i < words.length - 1 && " "}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

/** Section heading block shared by the landing sections: eyebrow, title (words slide up), lead. */
export function SectionHead({
  eyebrow,
  title,
  lead,
  id,
  align = "start",
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  id: string;
  align?: "start" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <Reveal y={12}>
        <p className="eyebrow">{eyebrow}</p>
      </Reveal>
      <h2 id={id} className="display mt-3 text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.04] font-semibold text-balance">
        <SlideWords text={title} delay={0.05} />
      </h2>
      {lead && (
        <Reveal delay={0.25} y={16}>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-[var(--ink-dim)]">{lead}</p>
        </Reveal>
      )}
    </div>
  );
}
