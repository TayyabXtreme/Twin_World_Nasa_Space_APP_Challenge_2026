"use client";

import type { Map as LeafletMap } from "leaflet";
import { type ComponentProps, useCallback } from "react";
import { MapContainer as BaseMapContainer } from "react-leaflet";

const guarded = new WeakSet<LeafletMap>();

/**
 * react-leaflet's MapContainer calls map.remove() in an effect cleanup and never builds a new map.
 * With cacheComponents, Next keeps a page you leave in a hidden <Activity>: effects clean up on hide and
 * run again on show, so every layer re-adds itself to a removed map ("reading 'appendChild'" of a missing
 * pane). Strict Mode's double effects do the same. Here the removal waits a tick and only happens when the
 * container has really left the document; a hidden page keeps its map and picks up its size again on show.
 */
export function MapContainer(props: Omit<ComponentProps<typeof BaseMapContainer>, "ref">) {
  const ref = useCallback((map: LeafletMap | null) => {
    if (!map) return;
    if (!guarded.has(map)) {
      guarded.add(map);
      const remove = map.remove.bind(map);
      map.remove = function () {
        setTimeout(() => {
          if (!map.getContainer().isConnected) remove();
        });
        return this;
      };
    }
    // Shown again after being hidden (display: none), the container has its size back.
    requestAnimationFrame(() => {
      if (map.getContainer().isConnected) map.invalidateSize();
    });
  }, []);
  return <BaseMapContainer {...props} ref={ref} />;
}
