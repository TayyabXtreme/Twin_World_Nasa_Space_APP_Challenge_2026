"use client";

import { useCursor, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { uvToLatLon } from "@/lib/geo";
import { useExplorer } from "@/lib/store";
import { WORLD_CONFIG, type World } from "@/lib/worlds";
import { atmosphereFragment, atmosphereVertex, nightFragment, nightVertex } from "./shaders";

export const SUN_DIR = new THREE.Vector3(5, 1.2, 3).normalize();

const SEGMENTS = 128;

function useWorldTextures(world: World) {
  const quality = useExplorer((s) => s.quality);
  const urls = WORLD_CONFIG[world].textures[quality];
  // Only request what this world/tier has; useTexture suspends until all are loaded.
  const request = useMemo(() => {
    const r: Record<string, string> = { color: urls.color };
    if (urls.normal) r.normal = urls.normal;
    if (urls.night) r.night = urls.night;
    if (urls.clouds) r.clouds = urls.clouds;
    if (urls.specular) r.specular = urls.specular;
    return r;
  }, [urls]);
  const maps = useTexture(request) as Record<string, THREE.Texture>;

  useLayoutEffect(() => {
    for (const [key, tex] of Object.entries(maps)) {
      tex.colorSpace = key === "color" || key === "night" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
    }
  }, [maps]);

  return maps;
}

export function Planet({ world }: { world: World }) {
  const config = WORLD_CONFIG[world];
  const maps = useWorldTextures(world);
  const setHover = useExplorer((s) => s.setHover);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, "crosshair", "auto");

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv) return;
    setHover(uvToLatLon(e.uv.x, e.uv.y));
  };

  // Earth: a click (not a drag) on the surface opens the point card for that spot.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (world !== "earth" || !e.uv || e.delta > 4 || useExplorer.getState().tourStep !== null) return;
    useExplorer.getState().setDataPoint(uvToLatLon(e.uv.x, e.uv.y));
  };

  return (
    <group>
      <mesh
        onPointerMove={onMove}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => {
          setHovered(false);
          setHover(null);
        }}
      >
        <sphereGeometry args={[1, SEGMENTS, SEGMENTS / 2]} />
        {world === "earth" ? (
          <meshPhongMaterial
            map={maps.color}
            normalMap={maps.normal}
            normalScale={new THREE.Vector2(0.6, 0.6)}
            specularMap={maps.specular}
            specular={new THREE.Color("#3a4a5a")}
            shininess={18}
          />
        ) : (
          <meshStandardMaterial
            map={maps.color}
            normalMap={maps.normal}
            normalScale={new THREE.Vector2(world === "moon" ? 1.1 : 0.9, world === "moon" ? 1.1 : 0.9)}
            roughness={1}
            metalness={0}
          />
        )}
      </mesh>

      {maps.night && <NightLights texture={maps.night} />}
      {maps.clouds && <Clouds texture={maps.clouds} />}
      {config.hasAtmosphere && config.atmosphereColor && (
        <Atmosphere color={config.atmosphereColor} intensity={world === "earth" ? 1.15 : 0.55} scale={world === "earth" ? 1.12 : 1.06} />
      )}
    </group>
  );
}

function NightLights({ texture }: { texture: THREE.Texture }) {
  const uniforms = useMemo(() => ({ uNight: { value: texture }, uSunDir: { value: SUN_DIR } }), [texture]);
  return (
    <mesh scale={1.0015} raycast={() => null}>
      <sphereGeometry args={[1, SEGMENTS, SEGMENTS / 2]} />
      <shaderMaterial
        vertexShader={nightVertex}
        fragmentShader={nightFragment}
        uniforms={uniforms}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function Clouds({ texture }: { texture: THREE.Texture }) {
  return (
    <mesh scale={1.006} raycast={() => null}>
      <sphereGeometry args={[1, SEGMENTS, SEGMENTS / 2]} />
      <meshStandardMaterial alphaMap={texture} color="#ffffff" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

function Atmosphere({ color, intensity, scale }: { color: string; intensity: number; scale: number }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uSunDir: { value: SUN_DIR },
      uIntensity: { value: intensity },
    }),
    [color, intensity],
  );
  return (
    <mesh scale={scale} raycast={() => null}>
      <sphereGeometry args={[1, 64, 32]} />
      <shaderMaterial
        vertexShader={atmosphereVertex}
        fragmentShader={atmosphereFragment}
        uniforms={uniforms}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
