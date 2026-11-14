"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface FinderTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Small count or note beside the label ("3/5"). */
  badge?: ReactNode;
  /** Rendered only while its tab is open, so heavy panels (imagery, data searches) load on demand. */
  render: () => ReactNode;
}

/**
 * Segmented tabs with a sliding highlight; the panel slides in from the side the new tab is on. One panel at a time
 * keeps long pages short.
 */
export function FinderTabs({
  tabs,
  label,
  className,
  initial,
}: {
  tabs: FinderTab[];
  label: string;
  className?: string;
  initial?: string;
}) {
  const reduce = useReducedMotion();
  const uid = useId();
  const [state, setState] = useState({ id: initial ?? tabs[0].id, dir: 1 });
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.id === state.id),
  );
  const tab = tabs[index];

  const pick = (id: string) => {
    const next = tabs.findIndex((t) => t.id === id);
    setState({ id, dir: next >= index ? 1 : -1 });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    pick(next.id);
    document.getElementById(`${uid}-tab-${next.id}`)?.focus();
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="finder-scroll -mx-1 flex gap-1 overflow-x-auto rounded-2xl bg-white/[0.035] p-1 ring-1 ring-white/10"
      >
        {tabs.map((t) => {
          const on = t.id === tab.id;
          return (
            <button
              key={t.id}
              id={`${uid}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(t.id)}
              className={cn(
                "relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm whitespace-nowrap transition-colors duration-200",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {on && (
                <motion.span
                  layoutId={`${uid}-pill`}
                  className="absolute inset-0 rounded-xl bg-white/[0.09] shadow-[0_6px_20px_-10px_var(--primary)] ring-1 ring-white/15"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              {t.icon && <t.icon className={cn("relative size-4", on && "text-primary")} aria-hidden />}
              <span className="relative">{t.label}</span>
              {t.badge !== undefined && (
                <span className="relative hud text-[11px] text-muted-foreground">{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab.id}`} className="relative mt-5">
        <AnimatePresence mode="wait" initial={false} custom={state.dir}>
          <motion.div
            key={tab.id}
            custom={state.dir}
            initial={reduce ? false : { opacity: 0, x: 28 * state.dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -20 * state.dir }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            {tab.render()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
