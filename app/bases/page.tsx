import type { Metadata } from "next";
import { MoonbaseView } from "@/components/moonbase/MoonbaseView";
import { PageShell } from "@/components/shell/PageShell";

export const metadata: Metadata = {
  title: "Bases",
  description:
    "Moon and Mars base maps: lunar south pole with LOLA slope, Diviner ice stability, Mini-RF radar, nine Artemis III regions, and Mars site suitability scores.",
};

export default function BasesPage() {
  return (
    <PageShell>
      <MoonbaseView />
    </PageShell>
  );
}
