import { cn } from "@/lib/utils";

/**
 * Small loader: a rocket orbiting a planet (CSS rotate only). Used by the route loading screens and the launch
 * loader's cover mode. Server-renderable; the label is read by screen readers and shown under the orbit.
 */
export function OrbitLoader({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("orbit-loader flex flex-col items-center gap-4", className)}>
      <div className="orbit-loader-sys" aria-hidden>
        <span className="orbit-loader-ring" />
        <span className="orbit-loader-planet" />
        <span className="orbit-loader-arm">
          <svg viewBox="0 0 24 48" className="orbit-loader-rocket">
            <path d="M12 46C10 40 9 38 12 34C15 38 14 40 12 46Z" fill="#ffb24a" className="orbit-loader-flame" />
            <path d="M12 2C17 8 18 14 18 22V34H6V22C6 14 7 8 12 2Z" fill="#f2f5fa" />
            <path d="M6 26L2 34V38L6 35ZM18 26L22 34V38L18 35Z" fill="#ff7a4d" />
            <circle cx="12" cy="18" r="3" fill="#0b1424" stroke="#8fd3ff" strokeWidth="1.5" />
          </svg>
        </span>
      </div>
      <p className="hud text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
