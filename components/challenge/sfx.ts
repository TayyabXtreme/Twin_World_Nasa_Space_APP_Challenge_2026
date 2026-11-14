"use client";

import { useExplorer } from "@/lib/store";

/**
 * Game sound, synthesised with Web Audio so nothing extra downloads: an engine roar (filtered noise whose
 * level follows the throttle), blips, a crash, a success chime and a launch rumble. Everything respects the
 * site-wide sound toggle, and the audio context only starts after a user gesture (browser autoplay rules).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let engine: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

const on = () => useExplorer.getState().soundOn;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export const sfx = {
  /** Call from a click/keypress so later sounds are allowed to play. */
  unlock() {
    if (on()) audio();
  },

  /** Continuous engine noise; level 0–1. Low rumble for rockets, a higher whine for the rover. */
  engine(level: number, kind: "rocket" | "rover" = "rocket") {
    if (!on()) {
      if (engine) engine.gain.gain.value = 0;
      return;
    }
    const a = audio();
    if (!engine) {
      const src = a.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = a.createBiquadFilter();
      filter.type = "lowpass";
      const gain = a.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(master!);
      src.start();
      engine = { src, gain, filter };
    }
    const t = a.currentTime;
    engine.filter.frequency.setTargetAtTime(kind === "rover" ? 900 + level * 900 : 260 + level * 520, t, 0.05);
    engine.gain.gain.setTargetAtTime(level * (kind === "rover" ? 0.12 : 0.5), t, 0.06);
  },

  stopEngine() {
    if (engine && ctx) engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  },

  blip(freq = 880, dur = 0.09, type: OscillatorType = "sine", vol = 0.25) {
    if (!on()) return;
    const a = audio();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g).connect(master!);
    env(g, a.currentTime, vol, 0.005, dur);
    o.start();
    o.stop(a.currentTime + dur + 0.05);
  },

  /** Rising arpeggio for a success. */
  chime() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sfx.blip(f, 0.22, "triangle", 0.22), i * 90));
  },

  /** Falling tone for a miss. */
  miss() {
    if (!on()) return;
    const a = audio();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(330, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(90, a.currentTime + 0.6);
    o.connect(g).connect(master!);
    env(g, a.currentTime, 0.12, 0.01, 0.6);
    o.start();
    o.stop(a.currentTime + 0.7);
  },

  /** Noise burst through a falling filter: crashes and impacts. */
  boom(strength = 1) {
    if (!on()) return;
    const a = audio();
    const src = a.createBufferSource();
    src.buffer = noise;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1600, a.currentTime);
    f.frequency.exponentialRampToValueAtTime(80, a.currentTime + 0.9 * strength);
    const g = a.createGain();
    src.connect(f).connect(g).connect(master!);
    env(g, a.currentTime, 0.7 * strength, 0.005, 0.9 * strength);
    src.start();
    src.stop(a.currentTime + 1.2);
  },

  /** A long rumble that swells and fades: rocket launch. */
  launch() {
    if (!on()) return;
    const a = audio();
    const src = a.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(200, a.currentTime);
    f.frequency.linearRampToValueAtTime(700, a.currentTime + 1.2);
    f.frequency.linearRampToValueAtTime(150, a.currentTime + 2.6);
    const g = a.createGain();
    src.connect(f).connect(g).connect(master!);
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.6, a.currentTime + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 2.6);
    src.start();
    src.stop(a.currentTime + 2.7);
  },
};
