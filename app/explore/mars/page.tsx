import type { Metadata } from "next";
import { ExplorerShell } from "@/components/shell/ExplorerShell";

export const metadata: Metadata = { title: "Explore Mars" };

export default function ExploreMarsPage() {
  return <ExplorerShell world="mars" />;
}
