import { BookOpen, Compass, Database, Gamepad2, MoonStar, Scale, ScanSearch, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the phone tab bar; falls back to label. */
  short?: string;
  /** Tooltip heading in the rail; falls back to label. */
  title?: string;
  hint: string;
  icon: LucideIcon;
}

/** Primary sections, in the order they appear in the rail. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/explore/earth", label: "Explore", hint: "Globe and map of Earth, Moon and Mars", icon: Compass },
  { href: "/finder", label: "Finder", hint: "Rank all of Earth against a Moon base or Mars site", icon: ScanSearch },
  {
    href: "/bases",
    label: "Bases",
    hint: "Moon and Mars base maps: ice, slope, temperature, Artemis III regions",
    icon: MoonStar,
  },
  { href: "/compare", label: "Compare", hint: "Earth place vs. Moon or Mars site, with a mission score", icon: Scale },
  {
    href: "/learn",
    label: "Learn",
    title: "Learn · for students and beginners",
    hint: "The Moon and Mars explained simply, with things to try, a quiz and a glossary",
    icon: BookOpen,
  },
  {
    href: "/challenge",
    label: "Challenge",
    hint: "Five missions: spot the world, scout a base, land, drive and launch",
    icon: Gamepad2,
  },
  { href: "/data", label: "Data Lab", short: "Data", hint: "Every NASA, CSA, ESA and JAXA dataset we use", icon: Database },
];
