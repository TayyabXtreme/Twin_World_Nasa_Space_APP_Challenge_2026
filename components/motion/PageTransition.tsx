import { ViewTransition } from "react";

/**
 * Route transitions (React <ViewTransition>, CSS in app/transitions.css). Pages wrap their content in
 * <PageTransition>; layouts persist across navigations, so the wrapper lives in each page's shell.
 *
 * Links say what kind of move they are with `transitionTypes`:
 *  - "warp"       landing → a section: the page zooms through a star-streak field
 *  - "warp-back"  logo → landing: the same in reverse
 *  - "nav-forward" / "nav-back"  moving down / up the section rail (or Earth → Moon → Mars): directional slide
 * Anything untyped (browser back and forward buttons) gets a short crossfade.
 */
const TYPES = {
  warp: "warp",
  "warp-back": "warp-back",
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "route-fade",
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={TYPES} exit={TYPES} default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Shared element: the same `name` on two pages (or two states of one page) morphs one into the other.
 * `default="none"` keeps it still during unrelated transitions; `share="morph"` styles the morph itself.
 */
export function Morph({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

/** Transition type for a move between two entries of an ordered list (rail sections, worlds). */
export function directionType(from: number, to: number): string[] | undefined {
  if (from < 0 || to < 0 || from === to) return undefined;
  return [to > from ? "nav-forward" : "nav-back"];
}
