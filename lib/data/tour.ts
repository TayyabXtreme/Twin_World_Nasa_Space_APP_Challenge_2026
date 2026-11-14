import { layerOf, type GlobeLayerId } from "./globe";
import { placeById } from "./globePlaces";
import { siteById } from "./sites";

/** Cinematic tour of the Earth globe: the camera flies pin to pin, one caption per stop. */

export interface TourStop {
  kind: "site" | "place";
  id: string;
  caption: string;
}

export const TOUR: TourStop[] = [
  { kind: "place", id: "iss", caption: "The International Space Station, right now: its position is computed in your browser from the latest orbit data." },
  { kind: "place", id: "kennedy", caption: "Kennedy Space Center. Apollo 11 left from Pad 39A in 1969; Artemis I from Pad 39B in 2022." },
  { kind: "place", id: "neemo", caption: "NEEMO: crews live 19 m under the sea off Florida to rehearse spacewalks." },
  { kind: "place", id: "desert-rats", caption: "Desert RATS: astronauts lived in a pressurised rover on Arizona lava for up to two weeks." },
  { kind: "place", id: "pisces", caption: "Hawaiʻi: young basalt that is about as close to lunar soil as Earth gets." },
  { kind: "place", id: "canberra", caption: "Canberra's 70 m dish is the only antenna on Earth that can still command Voyager 2." },
  { kind: "site", id: "earth-hingol", caption: "Pakistan's Hingol mud volcanoes, a proposed twin for cones in Mars' Utopia Planitia." },
  { kind: "place", id: "baikonur", caption: "Baikonur: Sputnik and Gagarin flew from here, and Soyuz crews still do." },
  { kind: "place", id: "artemis2-iceland", caption: "Iceland: the Artemis II crew trained on this grey volcanic ground for the Moon." },
  { kind: "place", id: "hmp", caption: "Devon Island: a Mars stand-in inside an Arctic impact crater since 1997." },
  { kind: "site", id: "earth-atacama", caption: "Atacama: dry, salty soil where NASA-related teams test life-detection tools for Mars." },
  { kind: "place", id: "kourou", caption: "Kourou: the James Webb Space Telescope launched from here on Christmas Day 2021." },
];

export const stopLayer = (stop: TourStop): GlobeLayerId => (stop.kind === "site" ? layerOf(siteById(stop.id)!) : placeById(stop.id)!.layer);

/** Every layer the tour visits, switched on when it starts. */
export const TOUR_LAYERS = [...new Set(TOUR.map(stopLayer))];

export function stopInfo(stop: TourStop) {
  if (stop.kind === "site") {
    const s = siteById(stop.id)!;
    return { name: s.name, region: s.region, photo: s.image?.src };
  }
  const p = placeById(stop.id)!;
  return { name: p.name, region: p.region, photo: p.photo.src };
}
