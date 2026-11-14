import Link from "next/link";
import { PageTransition } from "@/components/motion/PageTransition";
import { CommandSearch } from "./CommandSearch";
import { LeftRail } from "./LeftRail";

/**
 * Frame for the non-globe sections: same logo pill, search and rail as Explore, content on deep space.
 * The whole frame takes part in route transitions; the header and rail are anchors that stay still.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
    <div className="relative min-h-dvh bg-background">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-[0.18]"
        style={{ backgroundImage: "url(/textures/sky/milky-way-2k.webp)" }}
      />
      <header style={{ viewTransitionName: "site-header" }} className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href="/" transitionTypes={["warp-back"]} className="glass pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2 font-heading text-sm font-semibold tracking-tight">
          <span className="relative flex size-4 items-center justify-center" aria-hidden>
            <span className="absolute size-4 rounded-full border border-primary/60" />
            <span className="size-1.5 rounded-full bg-primary" />
          </span>
          TwinWorlds
        </Link>
        <div className="glass pointer-events-auto rounded-xl p-1">
          <CommandSearch />
        </div>
      </header>
      <LeftRail />
      <main className="relative z-10 px-4 pt-20 pb-28 md:ps-24 md:pe-8 md:pb-16">{children}</main>
    </div>
    </PageTransition>
  );
}
