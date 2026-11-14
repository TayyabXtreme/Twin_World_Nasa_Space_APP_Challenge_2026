import type { Metadata } from "next";
import { Suspense } from "react";
import { FinderView } from "@/components/finder/FinderView";
import { PageShell } from "@/components/shell/PageShell";

export const metadata: Metadata = {
  title: "Analog Finder",
  description: "Rank every place on Earth against a Moon base or Mars site using NASA MODIS, LRO, TES and Odyssey data.",
};

export default function FinderPage() {
  return (
    <PageShell>
      {/* The chosen target lives in the URL (?t=), which is request data, so it streams inside Suspense. */}
      <Suspense fallback={<p className="mx-auto max-w-[1680px] text-muted-foreground">Loading the Analog Finder…</p>}>
        <FinderView />
      </Suspense>
    </PageShell>
  );
}
