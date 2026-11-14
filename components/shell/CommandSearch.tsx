"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { SITES } from "@/lib/data/sites";
import { useExplorer } from "@/lib/store";
import { WORLD_CONFIG, WORLDS } from "@/lib/worlds";
import { NAV_ITEMS } from "./nav";

/** ⌘K / Ctrl+K palette: worlds, every site, and the sections. */
export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const selectSite = useExplorer((s) => s.selectSite);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const openSite = (world: string, id: string) => {
    setOpen(false);
    if (pathname === `/explore/${world}`) selectSite(id);
    else router.push(`/explore/${world}?site=${id}`);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground max-lg:px-2"
        aria-label="Search"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden lg:inline">Search</span>
        <Kbd className="hidden lg:inline-flex">Ctrl K</Kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search TwinWorlds"
        description="Find a site, a world or a section"
      >
        {/* cmdk needs <Command> as the store provider; this CommandDialog does not add it. */}
        <Command>
          <CommandInput placeholder="Search sites, worlds, sections…" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="Worlds">
              {WORLDS.map((w) => (
                <CommandItem key={w} onSelect={() => go(`/explore/${w}`)}>
                  Explore {WORLD_CONFIG[w].name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Sites">
              {SITES.map((site) => (
                <CommandItem
                  key={site.id}
                  value={`${site.name} ${site.region} ${site.world}`}
                  onSelect={() => openSite(site.world, site.id)}
                >
                  <span className={`size-2 rounded-full bg-${site.world}`} aria-hidden />
                  {site.name}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {WORLD_CONFIG[site.world].name} · {site.region}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Sections">
              {NAV_ITEMS.map((item) => (
                <CommandItem key={item.href} onSelect={() => go(item.href)}>
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                  <span className="ms-auto text-xs text-muted-foreground">{item.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
