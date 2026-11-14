"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { STATIC_PLACES } from "@/lib/data/globePlaces";
import { latLonToVec3 } from "@/lib/geo";
import { arcMaterial, glowTexture } from "./TwinArcs";

/**
 * Deep Space Network signal arcs: from each of the three complexes an uplink rises into space with pulses
 * travelling outward, and a fainter downlink beside it carries pulses back in. The far ends fade out, as a signal
 * heading to a spacecraft would. Animated, so the globe renders continuously while this layer is on
 * (reduced motion: static arcs).
 */

const STATIONS = STATIC_PLACES.filter((p) => p.layer === "dsn");
const UP = "#8fd3ff";
const DOWN = "#e6f6ff";

function beamCurve(lat: number, lon: number, side: number) {
  const n = new THREE.Vector3(...latLonToVec3(lat, lon, 1));
  // Lean each beam gently east, the way a dish follows a spacecraft across the sky as Earth turns.
  const east = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const off = east.clone().multiplyScalar(side * 0.018);
  return new THREE.CubicBezierCurve3(
    n.clone().multiplyScalar(1.002).add(off),
    n.clone().multiplyScalar(1.3).add(off),
    n.clone().multiplyScalar(1.65).addScaledVector(east, 0.18).add(off),
    n.clone().multiplyScalar(2.05).addScaledVector(east, 0.32).add(off),
  );
}

export function DsnBeams() {
  const invalidate = useThree((s) => s.invalidate);
  const glow = useMemo(() => glowTexture(), []);
  const reduce = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const parts = useMemo(
    () =>
      STATIONS.map((st) => ({
        id: st.id,
        base: new THREE.Vector3(...latLonToVec3(st.lat, st.lon, 1.006)),
        upCore: new THREE.TubeGeometry(beamCurve(st.lat, st.lon, -1), 90, 0.0035, 6, false),
        upHalo: new THREE.TubeGeometry(beamCurve(st.lat, st.lon, -1), 90, 0.013, 8, false),
        down: new THREE.TubeGeometry(beamCurve(st.lat, st.lon, 1), 90, 0.0025, 6, false),
        upCoreMat: arcMaterial(UP, 1, 0.6, { fadeEnd: 0.5, speed: 4.2 }),
        upHaloMat: arcMaterial(UP, 0.4, 2.2, { fadeEnd: 0.5, speed: 4.2 }),
        downMat: arcMaterial(DOWN, 0.55, 0.8, { fadeEnd: 0.45, speed: -3.2 }),
      })),
    [],
  );
  const dishGlow = useRef<(THREE.Sprite | null)[]>([]);

  useEffect(() => {
    for (const p of parts) for (const m of [p.upCoreMat, p.upHaloMat, p.downMat]) m.uniforms.uDraw.value = 1;
    invalidate();
    return () => {
      for (const p of parts) {
        for (const g of [p.upCore, p.upHalo, p.down]) g.dispose();
        for (const m of [p.upCoreMat, p.upHaloMat, p.downMat]) m.dispose();
      }
      glow.dispose();
    };
  }, [parts, glow, invalidate]);

  useFrame(({ clock }) => {
    if (reduce) return;
    const t = clock.elapsedTime;
    parts.forEach((p, i) => {
      // Offset each complex so the three don't pulse in lockstep.
      for (const m of [p.upCoreMat, p.upHaloMat, p.downMat]) m.uniforms.uTime.value = t + i * 0.9;
      const s = dishGlow.current[i];
      if (s) s.scale.setScalar(0.09 + 0.05 * (0.5 + 0.5 * Math.sin(t * 4 + i)));
    });
    invalidate();
  });

  return (
    <group>
      {parts.map((p, i) => (
        <group key={p.id}>
          <mesh geometry={p.upHalo} material={p.upHaloMat} raycast={() => null} renderOrder={2} />
          <mesh geometry={p.upCore} material={p.upCoreMat} raycast={() => null} renderOrder={3} />
          <mesh geometry={p.down} material={p.downMat} raycast={() => null} renderOrder={3} />
          <sprite ref={(s) => void (dishGlow.current[i] = s)} position={p.base} scale={0.11} raycast={() => null}>
            <spriteMaterial map={glow} color={UP} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
}
