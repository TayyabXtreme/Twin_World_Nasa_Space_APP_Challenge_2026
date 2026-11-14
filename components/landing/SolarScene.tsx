"use client";

import { Billboard, Line, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useRouter } from "next/navigation";
import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { atmosphereFragment, atmosphereVertex, nightFragment, nightVertex } from "@/components/globe/shaders";
import { earthAt, formatLightTime, LIGHT_SECONDS_PER_AU, marsAt, moonLongitudeAt, orbitPath } from "@/lib/orbits";
import { trackLoadingManager } from "@/lib/boot";
import { solarAnchors, solarClock, useSolar, type SolarWorld } from "@/lib/solar";
import type { QualityTier } from "@/lib/store";

/* Scene scale (not to scale with the bodies): 1 AU → 6.5 units in the ecliptic (XZ) plane. */
const K = 6.5;
const R: Record<"sun" | SolarWorld, number> = { sun: 0.95, earth: 0.64, moon: 0.17, mars: 0.44 };
const MOON_ORBIT = 1.4;
const DAYS_PER_YEAR = 365.256;
const SPIN: Record<SolarWorld, number> = { earth: 0.12, moon: 0.004, mars: 0.11 };
const FLIGHT_MS = 1500;

const toScene = (x: number, y: number) => new THREE.Vector3(x * K, 0, -y * K);

type BodyRefs = Record<SolarWorld, React.RefObject<THREE.Group | null>>;
const BodiesContext = createContext<BodyRefs | null>(null);

function texturesFor(id: SolarWorld, quality: QualityTier) {
  const big = quality === "high";
  if (id === "earth")
    return {
      color: `/textures/earth/day-${big ? "2k" : "1k"}.webp`,
      normal: "/textures/earth/normal-1k.webp",
      specular: "/textures/earth/specular-1k.webp",
      night: "/textures/earth/night-1k.webp",
      clouds: `/textures/earth/clouds-${big ? "2k" : "1k"}.webp`,
    };
  return { color: `/textures/${id}/color-${big ? "2k" : "1k"}.webp`, normal: `/textures/${id}/normal-1k.webp` };
}

// Report real texture progress to the launch screen (lib/boot) and the scene's own store. Registered when this
// module loads, i.e. before the Canvas mounts and drei's useTexture (three's default loading manager) requests anything.
trackLoadingManager(THREE.DefaultLoadingManager, (loaded, total) =>
  useSolar.getState().setProgress(total ? loaded / total : 0),
);

/* ---------- Sky and Sun ---------- */

function Sky() {
  const tex = useTexture("/textures/sky/milky-way-2k.webp", (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });
  return (
    <mesh raycast={() => null}>
      <sphereGeometry args={[300, 48, 24]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} color="#b3bccf" toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,236,200,1)");
    grad.addColorStop(0.18, "rgba(255,200,120,0.55)");
    grad.addColorStop(0.45, "rgba(255,150,70,0.14)");
    grad.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Sun() {
  const tex = useTexture("/textures/sky/sun-1k.webp", (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });
  const glow = useGlowTexture();
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (mesh.current) mesh.current.rotation.y += dt * 0.02;
  });
  return (
    <group>
      <mesh ref={mesh} raycast={() => null}>
        <sphereGeometry args={[R.sun, 64, 32]} />
        {/* HDR colour (> 1) so only the Sun crosses the bloom threshold. */}
        <meshBasicMaterial map={tex} color={new THREE.Color(2.4, 1.7, 1.05)} toneMapped={false} />
      </mesh>
      <sprite scale={[8.5, 8.5, 1]} raycast={() => null}>
        <spriteMaterial
          map={glow}
          color="#ffd08a"
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
          toneMapped={false}
        />
      </sprite>
      <pointLight position={[0, 0, 0]} intensity={3.4} decay={0} color="#fff1dc" />
    </group>
  );
}

/* ---------- Orbits and the light-delay line ---------- */

function Orbit({ body, color }: { body: "earth" | "mars"; color: string }) {
  const points = useMemo(() => {
    const pts = orbitPath(body, solarClock.today, 240).map((p) => toScene(p.x, p.y));
    pts.push(pts[0].clone()); // close the loop
    return pts;
  }, [body]);
  return <Line points={points} color={color} lineWidth={1} transparent opacity={0.32} raycast={() => null} />;
}

function LightLine() {
  const bodies = useContext(BodiesContext)!;
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: "#cfd8ff",
        dashSize: 0.18,
        gapSize: 0.22,
        transparent: true,
        opacity: 0.55,
      }),
    [],
  );
  const line = useMemo(() => new THREE.Line(geom, material), [geom, material]);
  const lastText = useRef("");

  useFrame(() => {
    const e = bodies.earth.current?.position;
    const m = bodies.mars.current?.position;
    if (!e || !m) return;
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    pos.setXYZ(0, e.x, e.y, e.z);
    pos.setXYZ(1, m.x, m.y, m.z);
    pos.needsUpdate = true;
    line.computeLineDistances();
    const au = e.distanceTo(m) / K;
    const t = `light ${formatLightTime(au * LIGHT_SECONDS_PER_AU)}`;
    const el = solarAnchors.light;
    if (el && t !== lastText.current) {
      el.textContent = t;
      lastText.current = t;
    }
  });

  return <primitive object={line} raycast={() => null} />;
}

/**
 * Moves the page-level labels to their bodies every frame (after the bodies and camera have moved).
 * Labels are plain DOM, so there is no nested React root inside the canvas.
 */
function LabelProjector() {
  const bodies = useContext(BodiesContext)!;
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    const place = (el: HTMLElement | null | undefined, x: number, y: number, z: number, shift: string) => {
      if (!el) return;
      v.set(x, y, z).project(camera);
      const visible = v.z > -1 && v.z < 1;
      el.style.transform = `translate3d(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px, 0) ${shift}`;
      el.style.visibility = visible ? "" : "hidden";
    };
    for (const id of ["earth", "mars", "moon"] as SolarWorld[]) {
      const p = bodies[id].current?.position;
      if (!p) continue;
      // Earth and Mars: label below the planet. Moon: to its right, so the two never stack.
      if (id === "moon") place(solarAnchors.moon, p.x + R.moon + 0.1, p.y, p.z, "translate(0, -50%)");
      else place(solarAnchors[id], p.x, p.y - (R[id] + 0.32), p.z, "translate(-50%, -50%)");
    }
    const e = bodies.earth.current?.position;
    const m = bodies.mars.current?.position;
    if (e && m) place(solarAnchors.light, (e.x + m.x) / 2, 0.45, (e.z + m.z) / 2, "translate(-50%, -50%)");
  });
  return null;
}

/* ---------- Planets ---------- */

function Planet({ id, quality }: { id: SolarWorld; quality: QualityTier }) {
  const bodies = useContext(BodiesContext)!;
  const urls = texturesFor(id, quality);
  const maps = useTexture(urls as Record<string, string>) as Record<string, THREE.Texture>;
  useLayoutEffect(() => {
    for (const [key, t] of Object.entries(maps)) {
      t.colorSpace = key === "color" || key === "night" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
    }
  }, [maps]);

  const hovered = useSolar((s) => s.hovered === id);
  const setHovered = useSolar((s) => s.setHovered);
  const setFlyTo = useSolar((s) => s.setFlyTo);
  const router = useRouter();

  const spin = useRef<THREE.Group>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const sunDir = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const world = useMemo(() => new THREE.Vector3(), []);
  const nightUniforms = useMemo(
    () => ({ uNight: { value: maps.night ?? null }, uSunDir: { value: sunDir } }),
    [maps.night, sunDir],
  );
  const atmoUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(id === "earth" ? "#4da3ff" : "#e2804f") },
      uSunDir: { value: sunDir },
      uIntensity: { value: id === "earth" ? 1.25 : 0.6 },
    }),
    [id, sunDir],
  );

  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * SPIN[id];
    if (clouds.current) clouds.current.rotation.y += dt * SPIN[id] * 0.35;
    // Direction from this body to the Sun (at the origin), for the night side and atmosphere.
    const g = bodies[id].current;
    if (g) sunDir.copy(g.getWorldPosition(world)).multiplyScalar(-1).normalize();
  });

  const r = R[id];
  const enter = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(id);
    document.body.style.cursor = "pointer";
    router.prefetch(`/explore/${id}`);
  };
  const leave = () => {
    setHovered(null);
    document.body.style.cursor = "";
  };
  const go = () => {
    document.body.style.cursor = "";
    setFlyTo(id);
  };

  return (
    <group ref={bodies[id]}>
      {/* Generous invisible hit target so small planets are easy to click. */}
      <mesh onPointerOver={enter} onPointerOut={leave} onClick={go} visible={false}>
        <sphereGeometry args={[Math.max(r * 1.9, 0.5), 16, 8]} />
      </mesh>
      <group ref={spin} rotation={[0, 0, id === "earth" ? 0.41 : id === "mars" ? 0.44 : 0.03]}>
        <mesh raycast={() => null}>
          <sphereGeometry args={[r, 64, 32]} />
          {id === "earth" ? (
            <meshPhongMaterial
              map={maps.color}
              normalMap={maps.normal}
              normalScale={new THREE.Vector2(0.6, 0.6)}
              specularMap={maps.specular}
              specular={new THREE.Color("#3a4a5a")}
              shininess={16}
            />
          ) : (
            <meshStandardMaterial
              map={maps.color}
              normalMap={maps.normal}
              normalScale={new THREE.Vector2(1, 1)}
              roughness={1}
              metalness={0}
            />
          )}
        </mesh>
        {maps.night && (
          <mesh scale={1.002} raycast={() => null}>
            <sphereGeometry args={[r, 64, 32]} />
            <shaderMaterial
              vertexShader={nightVertex}
              fragmentShader={nightFragment}
              uniforms={nightUniforms}
              blending={THREE.AdditiveBlending}
              transparent
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
      {maps.clouds && (
        <mesh ref={clouds} scale={1.012} raycast={() => null}>
          <sphereGeometry args={[r, 64, 32]} />
          <meshStandardMaterial alphaMap={maps.clouds} color="#ffffff" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      {id !== "moon" && (
        <mesh scale={id === "earth" ? 1.16 : 1.08} raycast={() => null}>
          <sphereGeometry args={[r, 48, 24]} />
          <shaderMaterial
            vertexShader={atmosphereVertex}
            fragmentShader={atmosphereFragment}
            uniforms={atmoUniforms}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}
      {hovered && (
        <Billboard>
          <mesh raycast={() => null}>
            <ringGeometry args={[r * 1.45, r * 1.45 + 0.03, 64]} />
            <meshBasicMaterial color="#e8f1ff" transparent opacity={0.8} toneMapped={false} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}

/* ---------- Motion: orbits from the clock ---------- */

function Bodies({ quality }: { quality: QualityTier }) {
  const bodies = useContext(BodiesContext)!;
  const running = useSolar((s) => s.running);

  useFrame((_, dt) => {
    if (running) solarClock.days += Math.min(dt, 0.1) * (DAYS_PER_YEAR / 12);
    const d = solarClock.days;
    const e = earthAt(d);
    const m = marsAt(d);
    const ep = toScene(e.x, e.y);
    bodies.earth.current?.position.copy(ep);
    bodies.mars.current?.position.copy(toScene(m.x, m.y));
    const ml = moonLongitudeAt(d);
    bodies.moon.current?.position.set(ep.x + Math.cos(ml) * MOON_ORBIT, 0, ep.z - Math.sin(ml) * MOON_ORBIT);
  });

  return (
    <>
      <Planet id="earth" quality={quality} />
      <Planet id="moon" quality={quality} />
      <Planet id="mars" quality={quality} />
      <LightLine />
      <LabelProjector />
    </>
  );
}

/* ---------- Camera: parallax at rest, a flight into the chosen world ---------- */

function CameraRig() {
  const bodies = useContext(BodiesContext)!;
  const { camera, size, pointer } = useThree();
  const flyTo = useSolar((s) => s.flyTo);
  const router = useRouter();
  const look = useRef(new THREE.Vector3());
  const flight = useRef<{ start: number; from: THREE.Vector3; fromLook: THREE.Vector3; done: boolean } | null>(null);

  // Wide screens: the system sits right of centre (text on the left). Tall screens: lower, seen from higher up.
  const aspect = size.width / size.height;
  const wide = aspect >= 1.15;
  const base = useMemo(() => (wide ? new THREE.Vector3(0, 6.4, 17.5) : new THREE.Vector3(0, 13, 30)), [wide]);
  const baseLook = useMemo(() => (wide ? new THREE.Vector3(-4.4, -0.6, 0) : new THREE.Vector3(0, 4.2, 0)), [wide]);

  useEffect(() => {
    if (!flyTo) return;
    flight.current = {
      start: performance.now(),
      from: camera.position.clone(),
      fromLook: look.current.clone(),
      done: false,
    };
  }, [flyTo, camera]);

  useFrame((state, dt) => {
    const f = flight.current;
    const target = flyTo ? bodies[flyTo].current : null;
    if (f && target) {
      const t = Math.min(1, (performance.now() - f.start) / FLIGHT_MS);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const p = target.position;
      const away = f.from.clone().sub(p).normalize();
      const dest = p.clone().add(away.multiplyScalar(R[flyTo!] * 4.2));
      camera.position.lerpVectors(f.from, dest, ease);
      look.current.lerpVectors(f.fromLook, p, ease);
      camera.lookAt(look.current);
      if (t >= 1 && !f.done) {
        f.done = true;
        router.push(`/explore/${flyTo}`, { transitionTypes: ["warp"] });
      }
      return;
    }
    const sway = Math.sin(state.clock.elapsedTime * 0.12) * 0.6;
    const desired = new THREE.Vector3(base.x + pointer.x * 1.4 + sway, base.y + pointer.y * 0.7, base.z);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 2.2));
    look.current.lerp(baseLook, 1 - Math.exp(-dt * 3));
    camera.lookAt(look.current);
  });
  return null;
}

function Ready() {
  const setReady = useSolar((s) => s.setReady);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [setReady]);
  return null;
}

export default function SolarScene({ quality, active }: { quality: QualityTier; active: boolean }) {
  // Textures are chosen once: a later quality change must not re-suspend (and reload) the planets.
  const [textureQuality] = useState(quality);
  const earth = useRef<THREE.Group>(null);
  const moon = useRef<THREE.Group>(null);
  const mars = useRef<THREE.Group>(null);
  const bodies = useMemo<BodyRefs>(() => ({ earth, moon, mars }), []);

  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, quality === "high" ? 1.75 : 1.4]}
      camera={{ position: [0, 6.4, 17.5], fov: 40, near: 0.05, far: 800 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-hidden
    >
      <BodiesContext.Provider value={bodies}>
        <ambientLight intensity={0.035} />
        <Suspense fallback={null}>
          <Sky />
          <Sun />
          <Orbit body="earth" color="#5aa2ff" />
          <Orbit body="mars" color="#ff7a4d" />
          <Bodies quality={textureQuality} />
          <Ready />
        </Suspense>
        <CameraRig />
        {quality !== "low" && (
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1} luminanceSmoothing={0.25} />
          </EffectComposer>
        )}
      </BodiesContext.Provider>
    </Canvas>
  );
}
