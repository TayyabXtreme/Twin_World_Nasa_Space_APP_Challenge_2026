"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { siteById } from "@/lib/data/sites";
import { twinsForSite } from "@/lib/data/twins";
import type { Site } from "@/lib/data/types";
import { latLonToVec3 } from "@/lib/geo";
import { useExplorer } from "@/lib/store";

/**
 * Twin arcs: select an Earth analogue and a glowing arc rises from it to a beacon for each Moon/Mars twin.
 * The arc draws itself in, then a soft pulse keeps flowing toward the twin world. While an arc is on screen the
 * globe renders continuously; otherwise it stays on demand. Reduced motion gets a static, fully drawn arc.
 */

/** Twin labels live in the page layer (SitePinsOverlay); this file positions them. */
export const beaconEls: Record<string, HTMLDivElement | null> = {};

const ARC_COLOR = { moon: "#d6deea", mars: "#ff8a57", earth: "#7fb6ff" } as const;
const DRAW_S = 1.1;

/** Local frame at a site: outward normal, local north and east (tangent to the sphere). */
export function siteBasis(site: Site) {
  const n = new THREE.Vector3(...latLonToVec3(site.lat, site.lon, 1));
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y);
  if (north.lengthSq() < 1e-6) north.set(1, 0, 0).addScaledVector(n, -n.x);
  north.normalize();
  const east = new THREE.Vector3().crossVectors(north, n).normalize();
  return { n, north, east };
}

/** Up to two twins of an Earth site, each with its beacon position and arc curve. */
export function twinFrame(site: Site) {
  const twins = twinsForSite(site.id)
    .filter((t) => t.earthId === site.id)
    .slice(0, 2);
  const basis = siteBasis(site);
  const { n, north, east } = basis;
  return twins.map((twin, i) => {
    const other = siteById(twin.otherId)!;
    const side = twins.length === 1 ? 0 : i === 0 ? -1 : 1;
    const beacon = n.clone().multiplyScalar(1.5).addScaledVector(north, 0.7).addScaledVector(east, side * 0.55);
    // Leave the ground straight up, then lean over toward the beacon.
    const c1 = n.clone().multiplyScalar(1.38);
    const c2 = beacon.clone().lerp(c1, 0.45).addScaledVector(n, 0.1);
    const curve = new THREE.CubicBezierCurve3(n.clone().multiplyScalar(1.002), c1, c2, beacon);
    return { twin, other, basis, beacon, curve };
  });
}

const arcVertex = /* glsl */ `
  varying float vU;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vU = uv.x;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const arcFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uDraw;
  uniform float uAlpha;
  uniform float uSoft;
  uniform float uFadeEnd;
  uniform float uSpeed;
  varying float vU;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    if (vU > uDraw) discard;
    float edge = pow(abs(dot(normalize(vNormal), normalize(vView))), uSoft);
    float head = smoothstep(uDraw - 0.1, uDraw, vU) * (1.0 - step(0.999, uDraw));
    float pulse = pow(0.5 + 0.5 * sin(vU * 10.0 - uTime * uSpeed), 8.0);
    float a = uAlpha * edge * smoothstep(0.0, 0.05, vU) * (1.0 - smoothstep(uFadeEnd, 1.0, vU)) * (0.5 + 0.7 * pulse + 1.2 * head);
    gl_FragColor = vec4(uColor * (1.0 + 0.8 * pulse + head), a);
  }
`;

export function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Additive glowing tube material. `fadeEnd` < 1 fades the far end out (a signal leaving into space). */
export function arcMaterial(color: string, alpha: number, soft: number, { fadeEnd = 1, speed = 2.4 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: arcVertex,
    fragmentShader: arcFragment,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uDraw: { value: 0 },
      uAlpha: { value: alpha },
      uSoft: { value: soft },
      uFadeEnd: { value: fadeEnd },
      uSpeed: { value: speed },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** True when the planet (unit sphere) hides `p` from a camera at `eye`. */
export function occluded(eye: THREE.Vector3, p: THREE.Vector3, tmp: THREE.Vector3) {
  const d = tmp.copy(p).sub(eye);
  const len = d.length();
  d.divideScalar(len);
  const b = eye.dot(d);
  const disc = b * b - (eye.lengthSq() - 1);
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < len;
}

export function TwinArcs() {
  const selectedId = useExplorer((s) => s.selectedSiteId);
  const site = selectedId ? siteById(selectedId) : undefined;
  if (!site || site.world !== "earth") return null;
  return <SiteArcs key={site.id} site={site} />;
}

function SiteArcs({ site }: { site: Site }) {
  const invalidate = useThree((s) => s.invalidate);
  const frames = useMemo(() => twinFrame(site), [site]);
  const glow = useMemo(() => glowTexture(), []);
  const parts = useMemo(
    () =>
      frames.map((f) => {
        const color = ARC_COLOR[f.other.world];
        return {
          ...f,
          core: new THREE.TubeGeometry(f.curve, 120, 0.0045, 8, false),
          halo: new THREE.TubeGeometry(f.curve, 120, 0.016, 10, false),
          coreMat: arcMaterial(color, 1, 0.6),
          haloMat: arcMaterial(color, 0.45, 2.2),
          color,
        };
      }),
    [frames],
  );
  const beaconRefs = useRef<(THREE.Group | null)[]>([]);
  const start = useRef<number | null>(null);
  const reduce = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => invalidate(), [invalidate]);
  useEffect(
    () => () => {
      for (const p of parts) {
        p.core.dispose();
        p.halo.dispose();
        p.coreMat.dispose();
        p.haloMat.dispose();
      }
      glow.dispose();
    },
    [parts, glow],
  );

  useFrame(({ clock, camera, size }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    const raw = reduce ? 1 : Math.min(1, t / DRAW_S);
    const draw = 1 - Math.pow(1 - raw, 3);
    parts.forEach((p, i) => {
      for (const m of [p.coreMat, p.haloMat]) {
        m.uniforms.uDraw.value = draw;
        m.uniforms.uTime.value = reduce ? 0 : t;
      }
      const shown = THREE.MathUtils.smoothstep(draw, 0.85, 1);
      const g = beaconRefs.current[i];
      if (g) g.scale.setScalar(shown * (reduce ? 1 : 1 + 0.12 * Math.sin(t * 3)));
      const el = beaconEls[p.twin.id];
      if (el) {
        v.copy(p.beacon).project(camera);
        const hidden = occluded(camera.position, p.beacon, tmp) || v.z > 1;
        el.style.transform = `translate3d(${Math.round(((v.x + 1) / 2) * size.width)}px, ${Math.round(((1 - v.y) / 2) * size.height)}px, 0) translate(-50%, calc(-100% - 18px))`;
        el.style.opacity = hidden ? "0" : String(shown);
      }
    });
    // Keep frames coming while the arc animates; a reduced-motion arc is static after it is drawn.
    if (!reduce) invalidate();
  });

  return (
    <group>
      {parts.map((p, i) => (
        <group key={p.twin.id}>
          <mesh geometry={p.halo} material={p.haloMat} raycast={() => null} renderOrder={2} />
          <mesh geometry={p.core} material={p.coreMat} raycast={() => null} renderOrder={3} />
          <group ref={(g) => void (beaconRefs.current[i] = g)} position={p.beacon} scale={0}>
            <mesh raycast={() => null}>
              <sphereGeometry args={[0.028, 20, 12]} />
              <meshBasicMaterial color={p.color} toneMapped={false} />
            </mesh>
            <sprite scale={0.34} raycast={() => null}>
              <spriteMaterial map={glow} color={p.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </sprite>
          </group>
        </group>
      ))}
    </group>
  );
}
