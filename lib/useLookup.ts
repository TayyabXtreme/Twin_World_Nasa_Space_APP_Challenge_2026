"use client";

import { useEffect, useState } from "react";
import { createLookup, type Lookup } from "./lookup";
import type { World } from "./worlds";

/** The place lookup for a world, or null while its data is still loading. */
export function useLookup(world: World) {
  const [state, setState] = useState<{ world: World; fn: Lookup } | null>(null);
  useEffect(() => {
    let live = true;
    createLookup(world)
      .then((fn) => live && setState({ world, fn }))
      .catch(() => {
        /* hover names are a bonus; coordinates still show without them */
      });
    return () => {
      live = false;
    };
  }, [world]);
  return state?.world === world ? state.fn : null;
}
