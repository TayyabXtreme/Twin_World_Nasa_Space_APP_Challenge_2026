import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // /score and /slider were folded into Compare and Learn; keep old links working.
  async redirects() {
    return [
      { source: "/score", destination: "/compare#mission-score", permanent: false },
      { source: "/slider", destination: "/learn#worlds", permanent: false },
      { source: "/moonbase", destination: "/bases", permanent: false },
    ];
  },
  partialPrefetching: true,
  // Rovi's data tools read these at request time (lib/rovi/server/data.ts); make sure the server function ships them.
  outputFileTracingIncludes: {
    "/api/rovi": [
      "./public/data/finder/earth-grid.json",
      "./public/data/finder/targets.json",
      "./public/data/finder/earth-core.bin",
      "./public/data/moonbase/manifest.json",
      "./public/data/moonbase/*.png",
      "./public/data/countries-110m.topo.json",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
