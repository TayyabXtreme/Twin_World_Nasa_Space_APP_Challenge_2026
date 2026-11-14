"use client";

import { Center, ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// three's own loader and decoder (drei's useGLTF uses three-stdlib's older copy, which stalls on these files).
const withMeshopt = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

/** Fits any NASA model into a 2.4-unit box, whatever units it was authored in. */
function Model({ url, yaw, onReady }: { url: string; yaw: number; onReady: () => void }) {
  const { scene } = useLoader(GLTFLoader, url, withMeshopt);
  const fitted = useMemo(() => {
    const clone = scene.clone(true);
    const size = new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3());
    clone.scale.setScalar(2.4 / Math.max(size.x, size.y, size.z));
    return clone;
  }, [scene]);
  useLayoutEffect(() => {
    fitted.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }, [fitted]);
  useEffect(onReady, [onReady, fitted]);
  return (
    <group rotation={[0, yaw, 0]}>
      <Center>
        <primitive object={fitted} />
      </Center>
    </group>
  );
}

export default function HardwareViewer({ url, yaw = 0, tint }: { url: string; yaw?: number; tint: string }) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const onReady = useMemo(() => () => setLoadedUrl(url), [url]);

  return (
    <div className="absolute inset-0">
      <Canvas dpr={[1, 1.75]} camera={{ position: [3.2, 1.5, 4.2], fov: 32 }} gl={{ antialias: true, alpha: true }} aria-hidden>
        <hemisphereLight args={["#e6efff", "#2a1d14", 0.9]} />
        <directionalLight position={[4, 6, 5]} intensity={2.4} />
        <directionalLight position={[-5, 2, -4]} intensity={1.4} color={tint} />
        <Suspense fallback={null}>
          <Model key={`model-${url}`} url={url} yaw={yaw} onReady={onReady} />
          {/* Baked once per model (frames=1), so it re-mounts with the model. */}
          <ContactShadows key={`shadow-${url}`} position={[0, -1.25, 0]} opacity={0.55} scale={7} blur={2.6} far={2.5} resolution={256} frames={1} />
        </Suspense>
        <OrbitControls
          makeDefault
          enableZoom={false}
          enablePan={false}
          autoRotate={!reduced}
          autoRotateSpeed={0.9}
          minPolarAngle={Math.PI * 0.2}
          maxPolarAngle={Math.PI * 0.55}
        />
      </Canvas>
      {loadedUrl !== url && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground" role="status">
          Loading 3D model…
        </p>
      )}
    </div>
  );
}
