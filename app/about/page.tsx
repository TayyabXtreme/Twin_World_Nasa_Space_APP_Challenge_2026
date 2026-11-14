import type { Metadata } from "next";
import { SectionPlaceholder } from "@/components/shell/SectionPlaceholder";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <SectionPlaceholder
      title="About TwinWorlds"
      planRef="Space Apps 2026"
      summary="Built for the NASA Space Apps Challenge 2026. Team, methodology and full data credits go here."
      points={[
        "Imagery: NASA Trek (Moon, Mars), NASA GIBS (Earth), NASA Image Library",
        "Elevation: LRO LOLA (Moon), MGS MOLA (Mars)",
        "Feature names: USGS Gazetteer of Planetary Nomenclature",
      ]}
    />
  );
}
