"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { latLonToVec3 } from "@/lib/geo";
import type { IssFix, IssTracker } from "@/lib/iss";
import { issLive } from "@/lib/issLive";
import { glowTexture } from "./TwinArcs";

/**
 * Live ISS: position from the public TLE, propagated with SGP4 in the browser once a second, plus an orbit trail
 * from 45 minutes ago to 45 minutes ahead (about one full orbit). The globe re-renders once a second for this,
 * not every frame. The page-layer pin (with its photo) is drawn by SitePinsOverlay from the shared `issLive` fix.
 */

const EARTH_KM = 6371;
const TRAIL_MIN = 45;

/** Globe-space position of a fix (unit sphere = Earth radius). */
export const issVector = (f: { lat: number; lon: number; altKm: number }, out = new THREE.Vector3()) =>
  out.set(...latLonToVec3(f.lat, f.lon, 1 + f.altKm / EARTH_KM));

const trailVertex = /* glsl */ `
  varying float vU;
  void main() {
    vU = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// vU = 0 is 45 min ago, 0.5 is now, 1 is 45 min ahead: the past fades in toward the station, the future is fainter.
const trailFragment = /* glsl */ `
  varying float vU;
  void main() {
    float past = smoothstep(0.0, 0.5, vU) * step(vU, 0.5);
    float ahead = (1.0 - smoothstep(0.5, 1.0, vU)) * step(0.5, vU) * 0.35;
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), (past * 0.85 + ahead));
  }
`;

export function IssLayer() {
  const invalidate = useThree((s) => s.invalidate);
  const [tracker, setTracker] = useState<IssTracker | null>(null);
  const [track, setTrack] = useState<IssFix[]>([]);
  const marker = useRef<THREE.Group>(null);
  const glow = useMemo(() => glowTexture(), []);
  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: trailVertex, fragmentShader: trailFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    [],
  );

  useEffect(() => {
    let live = true;
    import("@/lib/iss")
      .then((m) => m.loadIssTracker())
      .then((t) => live && setTracker(t))
      .catch(() => {});
    return () => {
      live = false;
      issLive.set(null);
    };
  }, []);

  // Once a second: new fix, move the marker, publish it for the pin and card, render one frame.
  useEffect(() => {
    if (!tracker) return;
    const v = new THREE.Vector3();
    const tick = () => {
      const f = tracker.at(Date.now());
      if (!f) return;
      issLive.set({ ...f, periodMin: tracker.periodMin, epoch: tracker.epoch, source: tracker.tle.source, stale: Boolean(tracker.tle.stale) });
      marker.current?.position.copy(issVector(f, v));
      invalidate();
    };
    const retrace = () => setTrack(tracker.track(Date.now(), -TRAIL_MIN, TRAIL_MIN, 30));
    tick();
    retrace();
    const a = setInterval(tick, 1000);
    const b = setInterval(retrace, 60_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [tracker, invalidate]);

  const geometry = useMemo(() => {
    if (track.length < 4) return null;
    const curve = new THREE.CatmullRomCurve3(track.map((f) => issVector(f)));
    return new THREE.TubeGeometry(curve, track.length * 2, 0.0028, 6, false);
  }, [track]);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(
    () => () => {
      material.dispose();
      glow.dispose();
    },
    [material, glow],
  );

  if (!tracker) return null;
  return (
    <group>
      {geometry && <mesh geometry={geometry} material={material} raycast={() => null} renderOrder={2} />}
      <group ref={marker}>
        <mesh raycast={() => null}>
          <sphereGeometry args={[0.012, 16, 10]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <sprite scale={0.12} raycast={() => null}>
          <spriteMaterial map={glow} color="#fff6e0" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      </group>
    </group>
  );
}
