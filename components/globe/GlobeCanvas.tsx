"use client";

import { CameraControls, PerformanceMonitor, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type CameraControlsImpl from "camera-controls";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { trackLoadingManager } from "@/lib/boot";
import { useExplorer } from "@/lib/store";
import type { World } from "@/lib/worlds";
import { DsnBeams } from "./DsnBeams";
import { IssLayer } from "./IssLayer";
import { Planet, SUN_DIR } from "./Planet";
import { SitePinsOverlay, SitePinsProjector } from "./SiteMarkers";
import { TwinArcs } from "./TwinArcs";

// Globe textures count towards the launch screen's progress on a first visit straight into Explore.
trackLoadingManager(THREE.DefaultLoadingManager);

function Sky() {
  const tex = useTexture("/textures/sky/milky-way-2k.webp", (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });
  return (
    <mesh raycast={() => null}>
      <sphereGeometry args={[60, 48, 24]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} color="#7f8798" toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/**
 * Sunlight that follows the camera from slightly upper-left, so whatever you look at is lit
 * (including sites you fly to). SUN_DIR is shared with the night-light and atmosphere shaders.
 */
function SunRig() {
  const light = useRef<THREE.DirectionalLight>(null);
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    right.current.setFromMatrixColumn(camera.matrixWorld, 0);
    up.current.setFromMatrixColumn(camera.matrixWorld, 1);
    SUN_DIR.copy(camera.position)
      .normalize()
      .addScaledVector(right.current, -0.55)
      .addScaledVector(up.current, 0.35)
      .normalize();
    light.current?.position.copy(SUN_DIR).multiplyScalar(10);
  });
  return <directionalLight ref={light} intensity={2.6} />;
}

/**
 * Cinematic tour camera: a slow drift around each stop while the tour runs (the softer flights come from the
 * tour's smoothTime on CameraControls below).
 */
function TourCamera() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const touring = useExplorer((s) => s.tourStep !== null);
  const reduce = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useFrame((_, dt) => {
    if (!touring || !controls || reduce) return;
    void controls.rotate(dt * 0.035, 0, true);
    invalidate();
  });
  return null;
}

/**
 * The 3D globe. Renders on demand (only when the camera moves or data changes),
 * clamps pixel ratio, and drops to the low texture tier if the frame rate collapses.
 */
export default function GlobeCanvas({ world }: { world: World }) {
  const quality = useExplorer((s) => s.quality);
  const setQuality = useExplorer((s) => s.setQuality);
  const hidden = useExplorer((s) => s.hiddenLayers);
  const touring = useExplorer((s) => s.tourStep !== null);

  return (
    <div className="relative size-full">
      <Canvas
        frameloop="demand"
        dpr={[1, quality === "high" ? 2 : 1.5]}
        camera={{ position: [0, 0.4, 3.4], fov: 38, near: 0.05, far: 200 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        aria-label={`Interactive 3D globe of ${world}`}
      >
        <PerformanceMonitor onDecline={() => quality !== "low" && setQuality("low")} />
        <ambientLight intensity={world === "moon" ? 0.03 : 0.06} />
        <SunRig />
        <Suspense fallback={null}>
          <Sky />
          <Planet key={`${world}-${quality}`} world={world} />
        </Suspense>
        <SitePinsProjector world={world} />
        {world === "earth" && <TwinArcs />}
        {world === "earth" && !hidden.includes("dsn") && <DsnBeams />}
        {world === "earth" && !hidden.includes("iss") && <IssLayer />}
        <TourCamera />
        <CameraControls
          makeDefault
          minDistance={1.35}
          maxDistance={7}
          smoothTime={touring ? 1.15 : 0.35}
          draggingSmoothTime={0.12}
          dollySpeed={0.6}
          truckSpeed={0}
        />
      </Canvas>
      <SitePinsOverlay world={world} />
    </div>
  );
}
