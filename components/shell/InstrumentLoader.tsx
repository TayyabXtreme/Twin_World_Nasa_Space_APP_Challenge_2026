/**
 * Loading state in the landing page's language: a planet circling a small sun on a tilted orbit.
 * Pure SVG + one CSS rotation, so it costs almost nothing while three.js downloads.
 */
export function InstrumentLoader({ label = "Loading world" }: { label?: string }) {
  return (
    <div role="status" className="flex size-full flex-col items-center justify-center gap-5">
      <svg viewBox="-60 -30 120 60" className="w-36" aria-hidden>
        <ellipse rx="48" ry="17" fill="none" stroke="rgb(201 209 240 / 0.4)" strokeWidth="1" />
        <circle r="7" fill="#ffc46b" />
        <circle r="12" fill="#ffc46b" opacity="0.18" />
        {/* The planet rides the tilted orbit (passing behind the sun on the far side is implied by the glow). */}
        <circle r="4.5" fill="#5aa2ff">
          <animateMotion dur="2.4s" repeatCount="indefinite" path="M48 0 A48 17 0 1 1 -48 0 A48 17 0 1 1 48 0" />
        </circle>
      </svg>
      <p className="text-sm tracking-wide text-[#b8c0e6]">{label}…</p>
    </div>
  );
}
