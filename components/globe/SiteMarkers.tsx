"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type CameraControlsImpl from "camera-controls";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLOBE_LAYERS, layerOf, pinPhoto, type GlobeLayerId } from "@/lib/data/globe";
import { placeById, STATIC_PLACES } from "@/lib/data/globePlaces";
import { AGENCIES, landedBy, landingById, landingsFor } from "@/lib/data/landings";
import { siteById, sitesFor } from "@/lib/data/sites";
import { twinsForSite } from "@/lib/data/twins";
import type { Site } from "@/lib/data/types";
import { latLonToVec3 } from "@/lib/geo";
import { issLive, useIssReady } from "@/lib/issLive";
import { useExplorer } from "@/lib/store";
import { WORLD_CONFIG, type World } from "@/lib/worlds";
import { issVector } from "./IssLayer";
import { beaconEls, occluded, siteBasis, twinFrame } from "./TwinArcs";

/**
 * Pins are ordinary page buttons laid over the canvas (keyboard reachable, no nested React roots inside the 3D
 * scene). `SitePinsProjector` runs inside the canvas and moves them to their 3D positions each frame.
 * On Earth each pin carries a small photo bubble ringed in its layer colour; bubbles that would overlap collapse
 * to dots until you zoom in. Earth pins are comparison sites, the other globe places, and the moving ISS. On the
 * Moon and Mars the exploration-history layer adds a photo pin per landing, ringed in the agency's colour, up to the
 * year the timeline shows; a pin that appears drops in (data-drop).
 */
const pinEls: Record<string, HTMLButtonElement | null> = {};
/** Last value written per pin, so a frame only touches the DOM when something moved. */
const written = new Map<string, string>();

const LAYER_COLOR = Object.fromEntries(GLOBE_LAYERS.map((l) => [l.id, l.color])) as Record<GlobeLayerId, string>;

interface Pin {
  id: string;
  kind: "site" | "place" | "iss" | "point" | "landing";
  name: string;
  region: string;
  lat: number;
  lon: number;
  layer?: GlobeLayerId;
  photo?: string;
  /** Ring colour when it is not the layer's (landings use their agency's). */
  color?: string;
}

/** Pins for this world, minus any layer switched off, and on the Moon and Mars only the landings the timeline has reached. */
function usePins(world: World): Pin[] {
  const hidden = useExplorer((s) => s.hiddenLayers);
  const issReady = useIssReady();
  const point = useExplorer((s) => s.dataPoint);
  // A count, not the year itself, so dragging or playing the timeline only re-renders when a landing appears or goes.
  const landed = useExplorer((s) => landedBy(world, s.timelineT));
  return useMemo(() => {
    const sites: Pin[] = sitesFor(world)
      .filter((s) => world !== "earth" || !hidden.includes(layerOf(s)))
      .map((s) => ({ id: s.id, kind: "site", name: s.name, region: s.region, lat: s.lat, lon: s.lon, ...(world === "earth" && { layer: layerOf(s), photo: pinPhoto(s.id) }) }));
    if (world !== "earth") {
      if (hidden.includes("landings")) return sites;
      const landings: Pin[] = landingsFor(world)
        .slice(0, landed)
        .map((l) => ({
          id: l.id,
          kind: "landing",
          name: `${l.mission} · ${l.date.slice(0, 4)}`,
          region: `${AGENCIES[l.agency].label}, ${l.site}`,
          lat: l.lat,
          lon: l.lon,
          layer: "landings",
          photo: l.photo.pin,
          color: AGENCIES[l.agency].color,
        }));
      return [...sites, ...landings];
    }
    const places: Pin[] = STATIC_PLACES.filter((p) => !hidden.includes(p.layer)).map((p) => ({
      id: p.id,
      kind: "place",
      name: p.name,
      region: p.region,
      lat: p.lat,
      lon: p.lon,
      layer: p.layer,
      photo: p.photo.pin,
    }));
    const iss = placeById("iss")!;
    const issPin: Pin[] = issReady && !hidden.includes("iss") ? [{ id: "iss", kind: "iss", name: "ISS · live", region: iss.region, lat: 0, lon: 0, layer: "iss", photo: iss.photo.pin }] : [];
    const pointPin: Pin[] = point ? [{ id: "point", kind: "point", name: "Selected point", region: `${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}°`, lat: point.lat, lon: point.lon }] : [];
    return [...sites, ...places, ...issPin, ...pointPin];
  }, [world, hidden, issReady, point, landed]);
}

/** Page layer: one button per pin. Render it next to the <Canvas>, inside the same positioned wrapper. */
export function SitePinsOverlay({ world }: { world: World }) {
  const pins = usePins(world);
  const selectedId = useExplorer((s) => s.selectedSiteId ?? s.selectedPlaceId ?? (s.dataPoint ? "point" : null));
  const selectSite = useExplorer((s) => s.selectSite);
  const selectPlace = useExplorer((s) => s.selectPlace);
  const selectedSite = useExplorer((s) => (s.selectedSiteId ? siteById(s.selectedSiteId) : undefined));
  return (
    <div className="globe-pins pointer-events-none absolute inset-0 overflow-hidden">
      {pins.map((p) => (
        <button
          key={p.id}
          ref={(el) => {
            pinEls[p.id] = el;
            if (!el) written.delete(p.id);
          }}
          type="button"
          className="site-pin"
          style={{ transform: "translate3d(-9999px, -9999px, 0)", ...(p.photo && p.layer && { "--pin": p.color ?? LAYER_COLOR[p.layer] }) } as React.CSSProperties}
          data-selected={selectedId === p.id || undefined}
          data-photo={p.photo ? "" : undefined}
          data-live={p.kind === "iss" || undefined}
          data-drop={p.kind === "landing" || undefined}
          onClick={() => (p.kind === "site" ? selectSite(p.id) : p.kind === "point" ? undefined : selectPlace(p.id))}
          aria-label={`${p.name}, ${p.region}`}
        >
          <span className="site-pin-dot" aria-hidden />
          {p.photo && (
            <span className="site-pin-bubble" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element -- 96 px webp thumbnails, already sized */}
              <img src={p.photo} alt="" width={36} height={36} loading="lazy" decoding="async" />
            </span>
          )}
          <span className="site-pin-label">{p.name}</span>
        </button>
      ))}
      {world === "earth" && selectedSite?.world === "earth" && <TwinBeaconLabels site={selectedSite} />}
    </div>
  );
}

/** Labels at the end of each twin arc ("Mars · Gale Crater"), positioned by TwinArcs each frame. */
function TwinBeaconLabels({ site }: { site: Site }) {
  return (
    <>
      {twinFrame(site).map(({ twin, other }) => (
        <div
          key={twin.id}
          ref={(el) => void (beaconEls[twin.id] = el)}
          className="twin-beacon absolute top-0 left-0"
          style={{ transform: "translate3d(-9999px, -9999px, 0)", "--beacon": `var(${WORLD_CONFIG[other.world].colorVar})` } as React.CSSProperties}
        >
          <span className="twin-beacon-world">{WORLD_CONFIG[other.world].name}</span>
          <span className="twin-beacon-name">{other.name}</span>
          <span className="twin-beacon-feature">{twin.feature}</span>
        </div>
      ))}
    </>
  );
}

const BUBBLE = 44; // px: 36 px photo + ring + gap, used to detect overlapping bubbles
const STEM = 30; // px from the dot to the bubble centre (matches .site-pin-bubble)
/** How far (radians) the camera swings south of a site so its twin arcs are seen side-on. */
const TILT = 0.5;

/** Canvas side: projects each pin and fades it out as it turns to the far side of the planet. */
export function SitePinsProjector({ world }: { world: World }) {
  const pins = usePins(world);
  const points = useMemo(
    () =>
      pins.map((p) => ({
        id: p.id,
        live: p.kind === "iss",
        // Only photo bubbles (and the clicked point) take part in decluttering; plain site dots never hide a bubble.
        declutter: Boolean(p.photo) || p.kind === "point",
        pos: new THREE.Vector3(...latLonToVec3(p.lat, p.lon, 1.004)),
        normal: new THREE.Vector3(...latLonToVec3(p.lat, p.lon, 1)),
      })),
    [pins],
  );
  const v = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const camDir = useMemo(() => new THREE.Vector3(), []);
  const screenRef = useRef<{ id: string; x: number; y: number; visible: boolean }[]>([]);
  const invalidate = useThree((s) => s.invalidate);
  // New pins (a layer switched on, the timeline moving) need one frame to be placed; the globe renders on demand.
  useEffect(() => invalidate(), [points, invalidate]);

  // Runs whenever a frame renders (the globe renders on demand: camera moves, resizes, data changes, ISS ticks).
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    camDir.copy(camera.position).normalize();
    const { selectedSiteId, selectedPlaceId } = useExplorer.getState();
    const selectedId = selectedSiteId ?? selectedPlaceId;
    const screen = screenRef.current;
    screen.length = 0;
    for (const p of points) {
      const el = pinEls[p.id];
      if (!el) continue;
      let visible: boolean;
      let opacity: string;
      if (p.live) {
        // The ISS is above the surface: hide it only when the planet is actually in the way.
        const fix = issLive.get();
        if (!fix) continue;
        issVector(fix, p.pos);
        visible = !occluded(camera.position, p.pos, tmp);
        opacity = visible ? "1" : "0";
      } else {
        const facing = p.normal.dot(camDir);
        visible = facing > 0.12;
        opacity = visible ? Math.min(1, (facing - 0.12) * 4).toFixed(2) : "0";
      }
      v.copy(p.pos).project(camera);
      const x = Math.round(((v.x + 1) / 2) * size.width);
      const y = Math.round(((1 - v.y) / 2) * size.height);
      const key = `${x},${y},${opacity}`;
      if (written.get(p.id) !== key) {
        written.set(p.id, key);
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        el.style.opacity = opacity;
        el.style.pointerEvents = visible ? "auto" : "none";
        el.tabIndex = visible ? 0 : -1;
      }
      if (p.declutter) screen.push({ id: p.id, x, y, visible });
    }
    // Declutter: the selected pin keeps its bubble, then nearer-to-centre pins win; losers show just the dot.
    const cx = size.width / 2;
    const cy = size.height / 2;
    screen.sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)));
    const kept: { x: number; y: number }[] = [];
    for (const s of screen) {
      const by = s.y - STEM;
      const clash = !s.visible || kept.some((k) => Math.abs(k.x - s.x) < BUBBLE && Math.abs(k.y - by) < BUBBLE);
      if (!clash) kept.push({ x: s.x, y: by });
      const el = pinEls[s.id]!;
      if ((el.dataset.collapsed === "") !== clash) {
        if (clash) el.dataset.collapsed = "";
        else delete el.dataset.collapsed;
      }
    }
  });

  return (
    <>
      <FlyToSelection world={world} />
      {world !== "earth" && <FollowTimeline world={world} />}
    </>
  );
}

/**
 * Is `p` on the near side of the planet and inside the part of the screen the user can actually see? On wide
 * screens the details card covers the right 430 px; on phones the sheet covers everything below ~28% height.
 */
function comfortablyVisible(p: THREE.Vector3, camera: THREE.Camera, size: { width: number; height: number }, phone: boolean) {
  if (p.clone().normalize().dot(camera.position.clone().normalize()) < 0.25) return false;
  const v = p.clone().project(camera);
  const x = ((v.x + 1) / 2) * size.width;
  const y = ((1 - v.y) / 2) * size.height;
  if (phone) return x > size.width * 0.08 && x < size.width * 0.92 && y > size.height * 0.1 && y < size.height * 0.26;
  return x > size.width * 0.08 && x < size.width - 430 && y > size.height * 0.12 && y < size.height * 0.88;
}

/**
 * Moves the camera to the selected pin only when it has to. During the cinematic tour it always flies (slowly,
 * see GlobeCanvas). Otherwise a pin you can already see stays where it is; the camera turns only when the selection
 * is behind the planet, off screen or under the details card (e.g. picked from search or the site list).
 * When an Earth analogue with twins needs a flight, the camera tilts south so the arcs rise up the screen.
 */
function FlyToSelection({ world }: { world: World }) {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const selectedSiteId = useExplorer((s) => s.selectedSiteId);
  const selectedPlaceId = useExplorer((s) => s.selectedPlaceId);
  const touring = useExplorer((s) => s.tourStep !== null);
  const site = useMemo(() => sitesFor(world).find((s) => s.id === selectedSiteId), [world, selectedSiteId]);
  const place = selectedPlaceId ? (world === "earth" ? placeById(selectedPlaceId) : landingById(selectedPlaceId)) : undefined;

  useEffect(() => {
    if (!controls) return;
    const phone = window.matchMedia("(max-width: 767px)").matches;
    if (!site && !place) {
      void controls.setFocalOffset(0, 0, 0, true);
      return invalidate();
    }
    const { camera, size } = get();
    // Phones: when we do fly, lift the scene into the space above the details sheet (no sheet during the tour).
    const lift = () => void controls.setFocalOffset(0, phone && !touring ? -0.55 : 0, 0, true);

    if (place && "layer" in place && place.layer === "iss") {
      const fly = () => {
        const fix = issLive.get();
        if (!fix) return;
        const d = issVector(fix).normalize().multiplyScalar(touring ? 3 : Math.min(3.4, Math.max(2.4, controls.distance)));
        lift();
        void controls.setLookAt(d.x, d.y, d.z, 0, 0, 0, true);
        invalidate();
      };
      // The tour follows the station as it moves; otherwise turn to it once, and only if it is out of sight.
      if (touring) {
        fly();
        return issLive.subscribe(fly);
      }
      const fix = issLive.get();
      if (fix && !comfortablyVisible(issVector(fix), camera, size, phone)) fly();
      return;
    }

    const target = site ?? place!;
    if (!touring && comfortablyVisible(new THREE.Vector3(...latLonToVec3(target.lat, target.lon, 1.004)), camera, size, phone)) return;

    lift();
    if (site && world === "earth" && twinsForSite(site.id).length > 0) {
      // Orbit pivot stays at the planet's centre so dragging afterwards feels the same as before.
      const { n, north } = siteBasis(site);
      const eye = n.clone().multiplyScalar(Math.cos(TILT)).addScaledVector(north, -Math.sin(TILT)).multiplyScalar(phone ? 4.1 : 3.5);
      void controls.setLookAt(eye.x, eye.y, eye.z, 0, 0, 0, true);
    } else {
      const distance = touring ? 2.7 : Math.min(3.2, Math.max(2.1, controls.distance));
      const [x, y, z] = latLonToVec3(target.lat, target.lon, distance);
      void controls.setLookAt(x, y, z, 0, 0, 0, true);
    }
    invalidate();
  }, [controls, site, place, world, touring, invalidate, get]);

  return null;
}

/**
 * While the exploration-history timeline plays, turn the globe to each landing as it drops in, but only when it is
 * out of sight (most early Moon landings are on the near side, so the camera mostly holds still there).
 */
function FollowTimeline({ world }: { world: World }) {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const playing = useExplorer((s) => s.timelinePlaying);
  const landed = useExplorer((s) => landedBy(world, s.timelineT));

  useEffect(() => {
    if (!controls || !playing || landed === 0) return;
    const newest = landingsFor(world)[landed - 1];
    const { camera, size } = get();
    const phone = window.matchMedia("(max-width: 767px)").matches;
    if (comfortablyVisible(new THREE.Vector3(...latLonToVec3(newest.lat, newest.lon, 1.004)), camera, size, phone)) return;
    const [x, y, z] = latLonToVec3(newest.lat, newest.lon, Math.min(3.4, Math.max(2.4, controls.distance)));
    void controls.setLookAt(x, y, z, 0, 0, 0, true);
    invalidate();
  }, [controls, playing, landed, world, invalidate, get]);

  return null;
}
