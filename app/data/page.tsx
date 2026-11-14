import type { Metadata } from "next";
import { DataLabView } from "@/components/datalab/DataLabView";
import { PageShell } from "@/components/shell/PageShell";

export const metadata: Metadata = {
  title: "Data Lab",
  description: "Every NASA, CSA, ESA and JAXA dataset behind TwinWorlds: what it measures, resolution, coverage, licence and source.",
};

export default function DataLabPage() {
  return (
    <PageShell>
      <DataLabView />
    </PageShell>
  );
}
