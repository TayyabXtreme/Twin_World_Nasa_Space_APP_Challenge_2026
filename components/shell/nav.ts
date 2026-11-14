import { BookOpen, Compass, Database, Gamepad2, MoonStar, Scale, ScanSearch, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
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
  { href: "/challenge", label: "Challenge", hint: "Launch, land and drive: three space games", icon: Gamepad2 },
  {
    href: "/learn",
    label: "Learn",
    hint: "Facts, the three worlds side by side, glossary and sources",
    icon: BookOpen,
  },
  { href: "/data", label: "Data Lab", hint: "Every NASA, CSA, ESA and JAXA dataset we use", icon: Database },
];
