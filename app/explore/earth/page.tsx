import type { Metadata } from "next";
import { ExplorerShell } from "@/components/shell/ExplorerShell";

export const metadata: Metadata = { title: "Explore Earth" };

export default function ExploreEarthPage() {
  return <ExplorerShell world="earth" />;
}
