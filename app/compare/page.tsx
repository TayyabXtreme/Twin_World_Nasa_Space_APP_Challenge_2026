import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareView } from "@/components/compare/CompareView";
import { PageShell } from "@/components/shell/PageShell";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <PageShell>
      {/* The pair lives in the URL (?a=&b=), which is request data, so it streams inside Suspense. */}
      <Suspense fallback={<p className="mx-auto max-w-6xl text-muted-foreground">Loading comparison…</p>}>
        <CompareView />
      </Suspense>
    </PageShell>
  );
}
