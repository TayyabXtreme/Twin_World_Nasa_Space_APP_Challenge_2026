"use client";

import { Ellipsis, EyeOff, Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useExplorer, type ViewMode } from "@/lib/store";
import { useFullscreen } from "@/lib/useFullscreen";
import { cn } from "@/lib/utils";
import type { World } from "@/lib/worlds";
import { CommandSearch } from "./CommandSearch";
import { WorldSwitcher } from "./WorldSwitcher";

/** One row of the phone "more" menu: icon, label, and the state on the right. */
function MenuItem({
  icon: Icon,
  label,
  onClick,
  pressed,
}: {
  icon: typeof EyeOff;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-foreground transition-colors duration-150 hover:bg-white/[0.06] active:bg-white/10",
        pressed && "text-primary",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}

/**
 * Explorer top bar. Wide screens: logo, world switcher and every control in one row. Phones: one compact row
 * (logo mark, world switcher, search and a "more" menu with view, sound, hide panels and full screen), so the
 * layer chips below always have a fixed place.
 */
export function TopBar({ world }: { world: World }) {
  const view = useExplorer((s) => s.view);
  const setView = useExplorer((s) => s.setView);
  const soundOn = useExplorer((s) => s.soundOn);
  const toggleSound = useExplorer((s) => s.toggleSound);
  const setChromeHidden = useExplorer((s) => s.setChromeHidden);
  const fullscreen = useFullscreen();

  return (
    <header style={{ viewTransitionName: "site-header" }} className="chrome pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-1.5 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:flex-wrap md:gap-2">
      <Link
        href="/"
        transitionTypes={["warp-back"]}
        aria-label="TwinWorlds home"
        className="glass pointer-events-auto flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 font-heading text-sm font-semibold tracking-tight md:h-auto md:py-2"
      >
        <span className="relative flex size-4 items-center justify-center" aria-hidden>
          <span className="absolute size-4 rounded-full border border-primary/60" />
          <span className="size-1.5 rounded-full bg-primary" />
        </span>
        <span className="hidden sm:inline">TwinWorlds</span>
      </Link>

      <div className="glass pointer-events-auto min-w-0 rounded-xl p-0.5">
        <WorldSwitcher world={world} />
      </div>

      {/* Phones: search + a menu for the rest */}
      <div className="glass pointer-events-auto ms-auto flex h-10 shrink-0 items-center gap-0.5 rounded-xl p-1 md:hidden">
        <CommandSearch />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More controls">
              <Ellipsis className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="glass w-56 rounded-2xl border-white/10 p-1.5">
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              View
            </p>
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as ViewMode)}
              aria-label="View mode"
              className="mb-1 grid w-full grid-cols-2 rounded-lg bg-secondary/60 p-0.5"
            >
              <ToggleGroupItem value="3d" aria-label="3D globe" className="h-8 rounded-md">
                3D globe
              </ToggleGroupItem>
              <ToggleGroupItem value="2d" aria-label="2D map" className="h-8 rounded-md">
                2D map
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="my-1 h-px bg-white/[0.07]" />
            <MenuItem
              icon={soundOn ? Volume2 : VolumeX}
              label={soundOn ? "Sound on" : "Sound off"}
              onClick={toggleSound}
              pressed={soundOn}
            />
            <MenuItem icon={EyeOff} label="Hide panels" onClick={() => setChromeHidden(true)} />
            {fullscreen.supported && (
              <MenuItem
                icon={fullscreen.active ? Minimize : Maximize}
                label={fullscreen.active ? "Exit full screen" : "Full screen"}
                onClick={fullscreen.toggle}
                pressed={fullscreen.active}
              />
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="glass pointer-events-auto ms-auto hidden items-center gap-1 rounded-xl p-1 md:flex">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as ViewMode)}
          aria-label="View mode"
          size="sm"
        >
          <ToggleGroupItem value="3d" aria-label="3D globe">
            3D
          </ToggleGroupItem>
          <ToggleGroupItem value="2d" aria-label="2D map">
            2D
          </ToggleGroupItem>
        </ToggleGroup>
        <CommandSearch />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Mute sound" : "Turn sound on"}
              className={soundOn ? "text-primary" : undefined}
            >
              {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{soundOn ? "Mute sound" : "Turn sound on"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => setChromeHidden(true)} aria-label="Hide panels">
              <EyeOff className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Hide panels <span className="ms-1 text-muted-foreground">H</span>
          </TooltipContent>
        </Tooltip>
        {fullscreen.supported && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={fullscreen.toggle}
                aria-pressed={fullscreen.active}
                aria-label={fullscreen.active ? "Exit full screen" : "Full screen"}
              >
                {fullscreen.active ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {fullscreen.active ? "Exit full screen" : "Full screen"} <span className="ms-1 text-muted-foreground">F</span>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
