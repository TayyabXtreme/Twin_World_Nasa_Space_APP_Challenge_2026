import type { Metadata } from "next";
import { ExplorerShell } from "@/components/shell/ExplorerShell";

export const metadata: Metadata = { title: "Explore Moon" };

export default function ExploreMoonPage() {
  return <ExplorerShell world="moon" />;
}
