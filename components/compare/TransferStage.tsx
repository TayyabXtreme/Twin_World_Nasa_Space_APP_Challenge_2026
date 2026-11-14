"use client";

import { Line, Stars, Trail, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { atmosphereFragment, atmosphereVertex, nightFragment, nightVertex } from "@/components/globe/shaders";

/*
 * The Compare page's signature moment: Earth on the left, the Moon or Mars on the right, and a small
 * spacecraft that flies the transfer arc between them every time the pair changes, then settles into orbit.
 * Bodies are not to scale (the page says so); the layout follows the canvas so it fits any width.
 */

type Target = "moon" | "mars";

const SUN_DIR = new THREE.Vector3(-0.42, 0.42, 0.8).normalize();
const FLIGHT_S = 2.8;
const ORBIT_SPEED = 0.45;
const ORBIT_TILT = 0.32;

/** Colour maps are sRGB, data maps (normals, cloud alpha) stay linear; set once when the textures load. */
function configure(loaded: Record<string, THREE.Texture> | THREE.Texture[]) {
  // drei passes an array at runtime although its types say a keyed object; accept both.
  for (const t of Object.values(loaded)) {
    const src = (t.image as HTMLImageElement | undefined)?.src ?? "";
    if (/(day|night|color)-/.test(src)) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
  }
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function useLayout(target: Target) {
  const { width: vw, height: vh } = useThree((s) => s.viewport);
  return useMemo(() => {
    const rE = Math.min(vh * 0.25, vw * 0.115);
    const rT = rE * (target === "moon" ? 0.62 : 0.76);
    const y = -vh * 0.07;
    const earth = new THREE.Vector3(-vw * 0.33, y, 0);
    const other = new THREE.Vector3(vw * 0.33, y, 0);
    const orbitE = rE * 1.55;
    const orbitT = rT * 1.7;
    // Climb away from Earth's upper right, arc high over the headline, and arrive on the left of the target's
    // orbit with the end tangent matching the orbit's direction so the hand-off into orbit is seamless.
    const p0 = earth.clone().add(new THREE.Vector3(orbitE * 0.72, orbitE * 0.72, 0.4));
    const p3 = other.clone().add(new THREE.Vector3(-orbitT, 0, 0));
    const lift = vh * 0.4;
    const p1 = p0.clone().add(new THREE.Vector3(vw * 0.1, lift, 1.2));
    const p2 = p3.clone().add(new THREE.Vector3(-vw * 0.04, ORBIT_TILT * orbitT * 1.6 + lift * 0.62, orbitT * 1.6));
    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
    return { rE, rT, earth, other, orbitT, curve, points: curve.getPoints(96), craft: rE * 0.2 };
  }, [vw, vh, target]);
}

/* ---------- Planets ---------- */

function Earth({ position, r }: { position: THREE.Vector3; r: number }) {
  const maps = useTexture({
    color: "/textures/earth/day-1k.webp",
    night: "/textures/earth/night-1k.webp",
    clouds: "/textures/earth/clouds-1k.webp",
    normal: "/textures/earth/normal-1k.webp",
  }, configure);
  const spin = useRef<THREE.Group>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const nightUniforms = useMemo(() => ({ uNight: { value: maps.night }, uSunDir: { value: SUN_DIR } }), [maps.night]);
  const atmo = useMemo(() => ({ uColor: { value: new THREE.Color("#4da3ff") }, uSunDir: { value: SUN_DIR }, uIntensity: { value: 1.3 } }), []);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.06;
    if (clouds.current) clouds.current.rotation.y += dt * 0.08;
  });
  return (
    <group position={position}>
      <group ref={spin} rotation={[0.18, -1.2, 0.41]}>
        <mesh>
          <sphereGeometry args={[r, 64, 32]} />
          <meshPhongMaterial map={maps.color} normalMap={maps.normal} normalScale={new THREE.Vector2(0.5, 0.5)} shininess={12} specular={new THREE.Color("#2b3a4a")} />
        </mesh>
        <mesh scale={1.002}>
          <sphereGeometry args={[r, 64, 32]} />
          <shaderMaterial vertexShader={nightVertex} fragmentShader={nightFragment} uniforms={nightUniforms} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
        </mesh>
        <mesh ref={clouds} scale={1.012}>
          <sphereGeometry args={[r, 64, 32]} />
          <meshStandardMaterial alphaMap={maps.clouds} color="#ffffff" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      </group>
      <mesh scale={1.17}>
        <sphereGeometry args={[r, 48, 24]} />
        <shaderMaterial vertexShader={atmosphereVertex} fragmentShader={atmosphereFragment} uniforms={atmo} side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

function Destination({ world, position, r }: { world: Target; position: THREE.Vector3; r: number }) {
  const maps = useTexture({ color: `/textures/${world}/color-1k.webp`, normal: `/textures/${world}/normal-1k.webp` }, configure);
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const grow = useRef(0);
  const atmo = useMemo(() => ({ uColor: { value: new THREE.Color("#e2804f") }, uSunDir: { value: SUN_DIR }, uIntensity: { value: 0.7 } }), []);
  useFrame((_, dt) => {
    // A new destination swells in from nothing with a strong ease-out.
    grow.current = Math.min(1, grow.current + dt / 0.9);
    const k = 1 - (1 - grow.current) ** 4;
    group.current?.scale.setScalar(0.001 + k * 0.999);
    if (spin.current) spin.current.rotation.y += dt * (world === "moon" ? 0.025 : 0.05);
  });
  return (
    <group ref={group} position={position}>
      <group ref={spin} rotation={[0.1, world === "moon" ? 0.4 : -2.2, world === "mars" ? 0.44 : 0.03]}>
        <mesh>
          <sphereGeometry args={[r, 64, 32]} />
          <meshStandardMaterial map={maps.color} normalMap={maps.normal} normalScale={new THREE.Vector2(1.2, 1.2)} roughness={1} metalness={0} />
        </mesh>
      </group>
      {world === "mars" && (
        <mesh scale={1.09}>
          <sphereGeometry args={[r, 48, 24]} />
          <shaderMaterial vertexShader={atmosphereVertex} fragmentShader={atmosphereFragment} uniforms={atmo} side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/* ---------- Spacecraft ---------- */

function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,214,160,0.85)");
    grad.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/** A generic crewed spacecraft (capsule, service module, four solar wings), built along +Z so lookAt aims it. */
function CraftModel({ s, thrust }: { s: number; thrust: React.RefObject<number> }) {
  const glow = useGlowTexture();
  const plume = useRef<THREE.Sprite>(null);
  useFrame(({ clock }) => {
    const k = thrust.current ?? 0;
    const flicker = 0.9 + Math.sin(clock.elapsedTime * 38) * 0.1;
    plume.current?.scale.setScalar(s * (0.35 + 1.15 * k) * flicker);
    if (plume.current) (plume.current.material as THREE.SpriteMaterial).opacity = 0.25 + 0.75 * k;
  });
  const metal = <meshStandardMaterial color="#d9dee6" metalness={0.55} roughness={0.38} />;
  return (
    <group>
      {/* Capsule */}
      <mesh position={[0, 0, s * 0.62]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[s * 0.13, s * 0.36, s * 0.42, 24]} />
        <meshStandardMaterial color="#f1f3f6" metalness={0.2} roughness={0.5} />
      </mesh>
      {/* Service module */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[s * 0.34, s * 0.34, s * 0.82, 24]} />
        {metal}
      </mesh>
      {/* Engine bell */}
      <mesh position={[0, 0, -s * 0.52]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[s * 0.08, s * 0.2, s * 0.24, 16, 1, true]} />
        <meshStandardMaterial color="#3b4048" metalness={0.7} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Solar wings */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, 0, (i * Math.PI) / 2 + Math.PI / 4]}>
          <mesh position={[s * 0.95, 0, -s * 0.12]}>
            <boxGeometry args={[s * 1.2, s * 0.02, s * 0.3]} />
            <meshStandardMaterial color="#1c3767" emissive="#0d2350" emissiveIntensity={0.35} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <sprite ref={plume} position={[0, 0, -s * 0.78]}>
        <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
      </sprite>
    </group>
  );
}

/** One launch: mounted fresh for every pair (keyed by the pair), so its trail never streaks back across. */
function Craft({ layout, reduced }: { layout: ReturnType<typeof useLayout>; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const thrust = useRef(0);
  const state = useRef({ t: reduced ? 1 : 0, theta: Math.PI, omega: 0 });
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), ahead: new THREE.Vector3() }), []);

  const orbitAt = (theta: number, out: THREE.Vector3) =>
    out.set(Math.cos(theta) * layout.orbitT, Math.sin(theta) * layout.orbitT * ORBIT_TILT, Math.sin(theta) * layout.orbitT).add(layout.other);

  useFrame((_, rawDt) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.05);
    const st = state.current;
    if (st.t < 1) {
      st.t = Math.min(1, st.t + dt / FLIGHT_S);
      const e = easeInOutCubic(st.t);
      layout.curve.getPoint(e, tmp.p);
      layout.curve.getPoint(Math.min(1, e + 0.01), tmp.ahead);
      if (e >= 0.999) orbitAt(Math.PI + 0.05, tmp.ahead);
      // Burn hard leaving Earth, coast, then a short braking burn before orbit insertion.
      thrust.current = st.t < 0.22 ? 1 : st.t > 0.82 ? 0.7 : 0.15;
    } else {
      if (!reduced) {
        st.omega = Math.min(ORBIT_SPEED, st.omega + dt * 0.35);
        st.theta += st.omega * dt;
      }
      orbitAt(st.theta, tmp.p);
      orbitAt(st.theta + 0.05, tmp.ahead);
      thrust.current = Math.max(0, thrust.current - dt * 1.5);
    }
    g.position.copy(tmp.p);
    g.lookAt(tmp.ahead);
  });

  return (
    <Trail width={layout.craft * 2.2} length={reduced ? 0 : 7} color="#9fe8ff" attenuation={(w) => w * w} decay={1.2}>
      <group ref={ref}>
        <CraftModel s={layout.craft} thrust={thrust} />
      </group>
    </Trail>
  );
}

/* ---------- Path ---------- */

function TransferPath({ points, reduced }: { points: THREE.Vector3[]; reduced: boolean }) {
  const line = useRef<{ material: { dashOffset: number } } | null>(null);
  useFrame((_, dt) => {
    if (!reduced && line.current) line.current.material.dashOffset -= dt * 0.25;
  });
  return (
    <Line
      ref={line as never}
      points={points}
      color="#7fe3e0"
      lineWidth={1.4}
      dashed
      dashSize={0.09}
      gapSize={0.07}
      transparent
      opacity={0.55}
      depthWrite={false}
    />
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

interface StageProps {
  target: Target;
  flightKey: string;
  active: boolean;
  /** Called once Earth's textures are in, so the page can swap its CSS placeholder for the scene. */
  onReady: () => void;
}

function Scene({ target, flightKey, reduced, onReady }: Omit<StageProps, "active"> & { reduced: boolean }) {
  const layout = useLayout(target);
  return (
    <>
      <ambientLight intensity={0.05} />
      <directionalLight position={SUN_DIR.clone().multiplyScalar(20)} intensity={2.6} />
      <Stars radius={70} depth={40} count={1400} factor={3} saturation={0} fade speed={reduced ? 0 : 0.4} />
      {/* The first launch waits for Earth, so nobody misses it while textures load. */}
      <Suspense fallback={null}>
        <Earth position={layout.earth} r={layout.rE} />
        <TransferPath points={layout.points} reduced={reduced} />
        <Craft key={flightKey} layout={layout} reduced={reduced} />
        <Ready onReady={onReady} />
      </Suspense>
      {/* Separate boundary: switching Moon ↔ Mars must not blank Earth while the new map loads. */}
      <Suspense fallback={null}>
        <Destination key={target} world={target} position={layout.other} r={layout.rT} />
      </Suspense>
    </>
  );
}

export default function TransferStage({ target, flightKey, active, onReady }: StageProps) {
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.6]}
      camera={{ position: [0, 0, 10], fov: 34, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      aria-hidden
    >
      <Scene target={target} flightKey={flightKey} reduced={reduced} onReady={onReady} />
    </Canvas>
  );
}
