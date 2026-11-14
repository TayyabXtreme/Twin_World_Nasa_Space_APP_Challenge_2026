"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { directionType } from "@/components/motion/PageTransition";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

function isActive(pathname: string, href: string) {
  const section = href.split("/")[1];
  return pathname.split("/")[1] === section;
}

/**
 * Vertical rail on desktop, bottom tab bar on phones. Moving down the rail slides the page forward, moving up slides
 * it back (see PageTransition). The rail itself is a view-transition anchor, so it stays put while pages move.
 */
export function LeftRail() {
  const pathname = usePathname();
  const current = NAV_ITEMS.findIndex((n) => isActive(pathname, n.href));

  return (
    <nav
      aria-label="Sections"
      style={{ viewTransitionName: "site-rail" }}
      className={cn(
        "chrome pointer-events-auto z-20 flex rounded-2xl glass p-1.5",
        "fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] gap-0.5 [scrollbar-width:none] overflow-x-auto sm:inset-x-3 sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:overflow-visible",
        "md:inset-x-auto md:start-3 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:flex-col md:justify-start md:gap-1",
      )}
    >
      {NAV_ITEMS.map(({ href, label, short, title, hint, icon: Icon }, i) => {
        const active = isActive(pathname, href);
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <Link
                href={href}
                transitionTypes={directionType(current, i)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-w-11 flex-1 basis-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 text-[10px] leading-none whitespace-nowrap text-muted-foreground md:min-w-0 md:flex-none md:basis-auto md:gap-0.5 md:px-2.5 md:py-2 md:text-[11px] md:leading-normal",
                  "transition-[background-color,color] duration-(--duration-fast) ease-(--ease-out)",
                  "hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  active && "bg-accent text-primary",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate md:sr-only">
                  <span className="sm:hidden">{short ?? label}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="hidden md:block">
              <p className="font-medium">{title ?? label}</p>
              <p className="text-muted-foreground">{hint}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
