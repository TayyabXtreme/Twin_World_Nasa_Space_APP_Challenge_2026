"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { roviSignal, useRovi } from "@/lib/rovi/store";

/**
 * Rovi in 3D, built from primitives (no model download): ceramic head with a dark visor, glowing eyes that follow the
 * pointer (or whatever Rovi is pointing at) and blink, a mouth bar that moves with speech, an antenna that pulses
 * while thinking, and a little hovering body with a thruster glow. Default export so it can be lazy-loaded.
 */

const CYAN = new THREE.Color("#5ff5dc");
const AMBER = new THREE.Color("#ffc46b");
const VIOLET = new THREE.Color("#b69cff");
const SHELL = "#e9eef6";
const VISOR = "#070b16";

/**
 * Glowing materials, recoloured every frame by mood. Module-level: there is only ever one Rovi, and the frame loop
 * may mutate them freely (React state must not be mutated).
 */
const GLOW = {
  eye: new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false }),
  mouth: new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false }),
  tip: new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.2, toneMapped: false }),
  halo: new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  ear: new THREE.MeshStandardMaterial({ color: "#0d1424", emissive: CYAN, emissiveIntensity: 0.6 }),
  flame: new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
};

/** The latest pointer position, shared by every frame. */
const pointer = { x: -1, y: -1, at: 0 };

const damp = THREE.MathUtils.damp;

function Robot({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const rig = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Mesh>(null);
  const eyeR = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const tip = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);

  const glow = GLOW;

  const blink = useRef({ next: 1.5, t: -1 });
  const look = useRef(new THREE.Vector2());
  const hopSeen = useRef(0);
  const hopStart = useRef(-10);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const { mood, lookAt } = useRovi.getState();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Where to look: the spotlight while Rovi points at something, else the pointer (or straight ahead if idle).
    const box = host.current?.getBoundingClientRect();
    let tx = 0;
    let ty = 0;
    if (box) {
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height * 0.42;
      const target = lookAt ?? (pointer.at && performance.now() - pointer.at < 6000 ? pointer : null);
      if (target) {
        const dx = target.x - cx;
        const dy = target.y - cy;
        tx = THREE.MathUtils.clamp(dx / 520, -1, 1);
        ty = THREE.MathUtils.clamp(dy / 420, -1, 1);
      }
    }
    if (mood === "thinking") {
      // Glance up and around while thinking.
      tx = Math.sin(t * 2.2) * 0.45;
      ty = -0.55;
    }
    look.current.x = damp(look.current.x, tx, 6, dt);
    look.current.y = damp(look.current.y, ty, 6, dt);

    // Hop and spin when an action starts.
    if (roviSignal.hopAt !== hopSeen.current) {
      hopSeen.current = roviSignal.hopAt;
      hopStart.current = t;
    }
    const hp = (t - hopStart.current) / 0.75;
    const hop = !reduce && hp >= 0 && hp < 1 ? Math.sin(hp * Math.PI) : 0;
    const spin = !reduce && hp >= 0 && hp < 1 ? THREE.MathUtils.smootherstep(hp, 0, 1) * Math.PI * 2 : 0;

    if (rig.current) {
      const bob = reduce ? 0 : Math.sin(t * 1.6) * 0.045;
      rig.current.position.y = bob + hop * 0.28;
      rig.current.rotation.y = spin;
      rig.current.rotation.z = reduce ? 0 : Math.sin(t * 0.9) * 0.025;
    }
    if (head.current) {
      head.current.rotation.y = damp(head.current.rotation.y, look.current.x * 0.62, 8, dt);
      head.current.rotation.x = damp(head.current.rotation.x, look.current.y * 0.38, 8, dt);
      // Listening: a curious head tilt.
      head.current.rotation.z = damp(head.current.rotation.z, mood === "listening" ? 0.16 : 0, 5, dt);
    }

    // Pupils slide across the visor ahead of the head.
    if (eyes.current) {
      eyes.current.position.x = damp(eyes.current.position.x, look.current.x * 0.055, 12, dt);
      eyes.current.position.y = damp(eyes.current.position.y, -look.current.y * 0.04, 12, dt);
    }

    // Blink every 2–5 s (sometimes twice); squint while acting, wide while listening.
    const b = blink.current;
    if (b.t < 0 && t > b.next) b.t = 0;
    let lid = 1;
    if (b.t >= 0) {
      b.t += dt;
      const p = b.t / 0.16;
      lid = p < 1 ? 1 - Math.sin(p * Math.PI) * 0.92 : 1;
      if (p >= 1) {
        b.t = -1;
        b.next = t + (Math.random() < 0.2 ? 0.25 : 2 + Math.random() * 3);
      }
    }
    const open = mood === "acting" ? 0.55 : mood === "listening" ? 1.18 : 1;
    for (const e of [eyeL.current, eyeR.current]) {
      if (!e) continue;
      e.scale.y = damp(e.scale.y, lid * open, 30, dt);
    }

    // Mouth: driven by speech (roviSignal.mouth), a soft line otherwise.
    if (mouth.current) {
      const m = roviSignal.mouth;
      // The capsule lies on its side: local x is its thickness (opening), local y its width.
      mouth.current.scale.x = damp(mouth.current.scale.x, 1 + m * 4.2, 22, dt);
      mouth.current.scale.y = damp(mouth.current.scale.y, mood === "speaking" ? 0.85 + m * 0.35 : 1, 14, dt);
    }

    // Colours by mood.
    const tint = mood === "thinking" ? VIOLET : mood === "acting" ? AMBER : CYAN;
    glow.eye.color.lerp(tint, 1 - Math.exp(-dt * 6));
    glow.mouth.color.lerp(tint, 1 - Math.exp(-dt * 6));
    glow.tip.emissive.lerp(tint, 1 - Math.exp(-dt * 6));
    glow.tip.color.copy(glow.tip.emissive);
    glow.halo.color.copy(glow.tip.emissive);
    glow.flame.color.copy(glow.tip.emissive);

    // Antenna: steady glow; a fast pulse and expanding halo while thinking.
    const thinking = mood === "thinking";
    const pulse = thinking ? 0.5 + 0.5 * Math.sin(t * 9) : 0.5 + 0.5 * Math.sin(t * 1.8);
    glow.tip.emissiveIntensity = thinking ? 1 + pulse * 3.2 : 0.9 + pulse * 0.6;
    if (tip.current) tip.current.scale.setScalar(thinking ? 1 + pulse * 0.45 : 1);
    if (halo.current) {
      const hp2 = (t * 1.6) % 1;
      halo.current.scale.setScalar(thinking ? 1 + hp2 * 2.6 : 1);
      glow.halo.opacity = damp(glow.halo.opacity, thinking ? 0.75 * (1 - hp2) : 0, 10, dt);
    }

    // Ears glow up while listening.
    glow.ear.emissiveIntensity = damp(glow.ear.emissiveIntensity, mood === "listening" ? 2.2 + Math.sin(t * 7) * 0.6 : 0.6, 8, dt);

    // Arms: a wave while speaking, raised while acting.
    if (armL.current && armR.current) {
      const wave = mood === "speaking" && !reduce ? Math.sin(t * 5) * 0.25 : 0;
      const up = mood === "acting" ? 1.1 : 0;
      // Negative z swings the left arm outward, positive the right.
      armL.current.rotation.z = damp(armL.current.rotation.z, -0.35 - up - wave, 7, dt);
      armR.current.rotation.z = damp(armR.current.rotation.z, 0.35 + up * 0.4 - wave * 0.5, 7, dt);
    }

    // Thruster flicker.
    if (flame.current) {
      const f = 0.85 + Math.sin(t * 31) * 0.08 + Math.sin(t * 17.3) * 0.07 + hop * 0.6;
      flame.current.scale.set(1, f, 1);
      glow.flame.opacity = 0.35 + hop * 0.4 + Math.sin(t * 23) * 0.06;
    }
  });

  return (
    <group ref={rig}>
      {/* Head */}
      <group ref={head} position={[0, 0.32, 0]}>
        <mesh scale={[1, 0.88, 0.95]}>
          <sphereGeometry args={[0.62, 48, 32]} />
          <meshStandardMaterial color={SHELL} roughness={0.32} metalness={0.08} />
        </mesh>
        {/* Visor */}
        <mesh position={[0, -0.01, 0.33]} scale={[1, 0.7, 0.6]}>
          <sphereGeometry args={[0.5, 40, 28]} />
          <meshStandardMaterial color={VISOR} roughness={0.12} metalness={0.55} />
        </mesh>
        {/* Visor highlight */}
        <mesh position={[-0.16, 0.16, 0.6]} rotation={[0, 0, 0.5]} scale={[1, 0.35, 1]}>
          <circleGeometry args={[0.07, 20]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        {/* Eyes */}
        <group ref={eyes}>
          <mesh ref={eyeL} position={[-0.17, 0.05, 0.612]} material={glow.eye}>
            <capsuleGeometry args={[0.055, 0.07, 6, 16]} />
          </mesh>
          <mesh ref={eyeR} position={[0.17, 0.05, 0.612]} material={glow.eye}>
            <capsuleGeometry args={[0.055, 0.07, 6, 16]} />
          </mesh>
        </group>
        {/* Mouth */}
        <mesh ref={mouth} position={[0, -0.15, 0.618]} rotation={[0, 0, Math.PI / 2]} material={glow.mouth}>
          <capsuleGeometry args={[0.014, 0.13, 4, 12]} />
        </mesh>
        {/* Ears */}
        <group>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.6, 0.02, 0]} rotation={[0, 0, (s * Math.PI) / 2]}>
              <mesh>
                <cylinderGeometry args={[0.13, 0.15, 0.1, 28]} />
                <meshStandardMaterial color={SHELL} roughness={0.35} />
              </mesh>
              {/* Local -y points outward on both sides after the ±90° turn. */}
              <mesh position={[0, -0.055, 0]} material={glow.ear}>
                <cylinderGeometry args={[0.085, 0.085, 0.02, 24]} />
              </mesh>
            </group>
          ))}
        </group>
        {/* Antenna */}
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.014, 0.018, 0.2, 10]} />
          <meshStandardMaterial color="#9aa6b8" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh ref={tip} position={[0, 0.74, 0]} material={glow.tip}>
          <sphereGeometry args={[0.055, 20, 14]} />
        </mesh>
        <mesh ref={halo} position={[0, 0.74, 0]} material={glow.halo}>
          <torusGeometry args={[0.07, 0.008, 8, 32]} />
        </mesh>
      </group>

      {/* Body */}
      <group position={[0, -0.5, 0]}>
        <mesh scale={[1, 0.82, 0.9]}>
          <sphereGeometry args={[0.34, 36, 24]} />
          <meshStandardMaterial color={SHELL} roughness={0.34} metalness={0.08} />
        </mesh>
        {/* Neck ring */}
        <mesh position={[0, 0.27, 0]}>
          <torusGeometry args={[0.13, 0.03, 10, 28]} />
          <meshStandardMaterial color="#1a2234" roughness={0.4} metalness={0.4} />
        </mesh>
        {/* Chest light */}
        <mesh position={[0, 0.03, 0.312]} material={glow.mouth}>
          <circleGeometry args={[0.05, 24]} />
        </mesh>
        {/* Arms */}
        <group ref={armL} position={[-0.32, 0.06, 0]}>
          <mesh position={[0, -0.13, 0]}>
            <capsuleGeometry args={[0.055, 0.16, 6, 12]} />
            <meshStandardMaterial color={SHELL} roughness={0.35} />
          </mesh>
        </group>
        <group ref={armR} position={[0.32, 0.06, 0]}>
          <mesh position={[0, -0.13, 0]}>
            <capsuleGeometry args={[0.055, 0.16, 6, 12]} />
            <meshStandardMaterial color={SHELL} roughness={0.35} />
          </mesh>
        </group>
        {/* Thruster */}
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.1, 0.07, 0.06, 20]} />
          <meshStandardMaterial color="#1a2234" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh ref={flame} position={[0, -0.42, 0]} rotation={[Math.PI, 0, 0]} material={glow.flame}>
          <coneGeometry args={[0.065, 0.2, 16, 1, true]} />
        </mesh>
      </group>
    </group>
  );
}

export default function RoviBot() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.at = performance.now();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div ref={host} className="pointer-events-none absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.08, 5], fov: 30 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        style={{ pointerEvents: "none" }}
        aria-hidden
      >
        <hemisphereLight args={["#dfe9ff", "#1a1030", 1.1]} />
        <directionalLight position={[2.5, 3, 4]} intensity={2.2} />
        <directionalLight position={[-3, 1, -2]} intensity={1.1} color="#5ff5dc" />
        <Robot host={host} />
      </Canvas>
    </div>
  );
}
