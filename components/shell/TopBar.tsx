"use client";

import { EyeOff, Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useExplorer, type ViewMode } from "@/lib/store";
import { useFullscreen } from "@/lib/useFullscreen";
import type { World } from "@/lib/worlds";
import { CommandSearch } from "./CommandSearch";
import { WorldSwitcher } from "./WorldSwitcher";

export function TopBar({ world }: { world: World }) {
  const view = useExplorer((s) => s.view);
  const setView = useExplorer((s) => s.setView);
  const soundOn = useExplorer((s) => s.soundOn);
  const toggleSound = useExplorer((s) => s.toggleSound);
  const setChromeHidden = useExplorer((s) => s.setChromeHidden);
  const fullscreen = useFullscreen();

  return (
    <header style={{ viewTransitionName: "site-header" }} className="chrome pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <Link
        href="/"
        transitionTypes={["warp-back"]}
        className="glass pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2 font-heading text-sm font-semibold tracking-tight"
      >
        <span className="relative flex size-4 items-center justify-center" aria-hidden>
          <span className="absolute size-4 rounded-full border border-primary/60" />
          <span className="size-1.5 rounded-full bg-primary" />
        </span>
        TwinWorlds
      </Link>

      <div className="glass pointer-events-auto rounded-xl p-0.5">
        <WorldSwitcher world={world} />
      </div>

      <div className="glass pointer-events-auto ms-auto flex items-center gap-1 rounded-xl p-1">
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
