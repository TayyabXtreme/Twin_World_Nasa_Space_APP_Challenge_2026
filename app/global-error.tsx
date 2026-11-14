"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const isChunkError =
      error.message.includes("Loading chunk") ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("dynamically imported module") ||
      error.message.includes("ChunkLoadError");
    if (isChunkError && !sessionStorage.getItem("tw-retry")) {
      sessionStorage.setItem("tw-retry", "1");
      window.location.reload();
      return;
    }
    sessionStorage.removeItem("tw-retry");
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="grid min-h-dvh place-items-center bg-[#05070d] font-sans text-white">
        <div className="mx-auto max-w-md space-y-4 px-6 text-center">
          <p className="text-6xl" aria-hidden>
            &#128752;
          </p>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-neutral-400">
            A network hiccup or a stale cache may have caused this.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={reset}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/20"
            >
              Try again
            </button>
            <button
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- router is broken in global-error
              onClick={() => (window.location.href = "/")}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/20"
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
