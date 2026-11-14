import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { SoundSync } from "@/components/SoundSync";
import { LaunchLoader } from "@/components/motion/LaunchLoader";
import { RoviDock } from "@/components/rovi/RoviDock";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import "./transitions.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "TwinWorlds: Earth analogues for the Moon and Mars",
    template: "%s · TwinWorlds",
  },
  description:
    "Fly between Earth, the Moon and Mars, compare Earth places with lunar and Martian sites, and test mission suitability, all built on NASA data.",
  applicationName: "TwinWorlds",
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Runs before first paint: later visits in a session skip the launch screen (data-boot="seen"); later visits to the
 * landing page get a small cover while its 3D scene loads (data-boot="cover"). See components/motion/LaunchLoader.
 */
const BOOT_SCRIPT = `try{if(sessionStorage.getItem("tw-launched")){document.documentElement.dataset.boot=location.pathname==="/"?"cover":"seen"}}catch(e){}`;

/**
 * Route transitions in a background tab. Chrome aborts a view transition while the tab is hidden with
 * "Transition was aborted because of invalid state. Document hidden"; React ignores that error only under its old,
 * exact message, so the new one surfaced as an uncaught InvalidStateError. Before React loads:
 *  - while hidden, refuse to start a transition: React catches the throw and applies the update without animating;
 *  - if the tab hides mid-transition, re-throw the rejection under the message React knows, so it is ignored.
 */
const VIEW_TRANSITION_SCRIPT = `(function(){var d=document,start=d.startViewTransition;if(!start)return;var KNOWN="Transition was aborted because of invalid state";d.startViewTransition=function(arg){if(d.visibilityState==="hidden")throw new DOMException(KNOWN,"InvalidStateError");var t=start.call(d,arg);var ready=t.ready.catch(function(e){if(e&&e.name==="InvalidStateError")throw new DOMException(KNOWN,"InvalidStateError");throw e});return new Proxy(t,{get:function(o,k){if(k==="ready")return ready;var v=o[k];return typeof v==="function"?v.bind(o):v}})}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      dir="ltr"
      // BOOT_SCRIPT sets data-boot before hydration.
      suppressHydrationWarning
      className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: VIEW_TRANSITION_SCRIPT }} />
        <noscript>
          <style>{`.launch-loader{display:none}`}</style>
        </noscript>
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        <DirectionProvider dir="ltr">
          <TooltipProvider delayDuration={300}>
            {children}
            {/* Carries the star-streak field during warp route transitions (app/transitions.css); invisible otherwise. */}
            <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]" style={{ viewTransitionName: "warp-field" }} />
            <LaunchLoader />
            <RoviDock />
            <Toaster theme="dark" position="bottom-center" />
            <SoundSync />
          </TooltipProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
