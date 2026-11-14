import type { Metadata } from "next";
import { LearnView } from "@/components/learn/LearnView";
import { PageShell } from "@/components/shell/PageShell";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return (
    <PageShell>
      <LearnView />
    </PageShell>
  );
}
