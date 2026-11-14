import type { Metadata } from "next";
import { Arcade } from "@/components/challenge/Arcade";
import { ScoreBackdrop } from "@/components/score/ScoreBackdrop";
import { PageShell } from "@/components/shell/PageShell";
import { Morph } from "@/components/motion/PageTransition";

export const metadata: Metadata = { title: "Mission Challenge" };

export default function ChallengePage() {
  return (
    <PageShell>
      <ScoreBackdrop />
      <div className="mx-auto max-w-7xl">
        <Morph name="feature-challenge">
        <header className="max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">Mission control · 5 missions</p>
          <h1 className="mt-2 font-heading text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.05] font-semibold tracking-tight">
            Mission challenge
          </h1>
          <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
            Can you tell Earth from Mars? Where would you build on the Moon? Five short missions built on real NASA
            photos, data and physics. Every one ends with what really happens out there.
          </p>
        </header>
        </Morph>
        <div className="mt-8">
          <Arcade />
        </div>
      </div>
    </PageShell>
  );
}
