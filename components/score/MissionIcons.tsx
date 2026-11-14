import { Rocket } from "lucide-react";
import type { Mission } from "@/lib/score";

/* Drawn in lucide's grammar (24px box, 2px round strokes) so they sit with the rest of the icon set. */

function RoverIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 13h14l-1.5-4h-11z" />
      <path d="M12 9V5h3" />
      <circle cx="15.5" cy="4.5" r="0.5" />
      <circle cx="6" cy="17" r="2" />
      <circle cx="12" cy="17" r="2" />
      <circle cx="18" cy="17" r="2" />
    </svg>
  );
}

function HabitatIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 19h18" />
      <path d="M5 19a7 7 0 0 1 14 0" />
      <path d="M10 19v-3a2 2 0 0 1 4 0v3" />
      <path d="M8.5 9.2 7 6.5M15.5 9.2 17 6.5" />
    </svg>
  );
}

export function MissionIcon({ mission, className }: { mission: Mission; className?: string }) {
  if (mission === "landing") return <Rocket className={className} style={{ rotate: "135deg" }} aria-hidden />;
  if (mission === "rover") return <RoverIcon className={className} aria-hidden />;
  return <HabitatIcon className={className} aria-hidden />;
}
