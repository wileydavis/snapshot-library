// Test data: the snapshots in fixtures/library.json, and made-up ones spread across the map, as
// another tool might write them (their own library id; only what the format asks for).
import { readFileSync } from 'node:fs';

const here = new URL('./fixtures/', import.meta.url);
export const library = JSON.parse(readFileSync(new URL('library.json', here), 'utf8'));
export const clip = readFileSync(new URL('clip.ogg', here));

function rng(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

export function madeUp(n, seed = 7) {
  const r = rng(seed);
  const real = library.snapshots.find((s) => s.profile);
  const out = [];
  for (let i = 0; i < n; i++) {
    const energy = r(), bright = r(), weight = r();
    const b255 = (f) => Math.round(Math.min(1, Math.max(0, f)) * 255);
    const bands = Array.from({ length: 16 }, (_, k) => b255(0.25 + 0.75 * (1 - Math.abs(k / 15 - bright)) * (k < 4 ? 0.4 + weight * 0.6 : 1) * (0.7 + 0.3 * r())));
    const hits = 1 + Math.floor(r() * 4);
    const pulse = Array.from({ length: 32 }, (_, k) => (k < 16 ? (k % 4 === 0 ? 235 + Math.floor(r() * 20) : (r() < 0.15 * hits ? 120 : 10)) : (k % Math.max(1, 5 - hits) === 0 ? b255(0.5 + 0.5 * r()) : 0)));
    const lanes = Array.from({ length: 11 }, (_, l) => (r() < 0.25 + energy * 0.6 ? b255(0.3 + 0.7 * r()) : 0));
    out.push({
      id: 5000 + i,
      uid: `7e577e577e577e57-${(5000 + i).toString(16)}`,
      name: `MADE ${String(i + 1).padStart(3, '0')}`,
      time: 1794440000000 + i * 61000,
      made: real.made,
      profile: { v: 1, energy: +energy.toFixed(3), weight: +weight.toFixed(3), bright: +bright.toFixed(3), density: +r().toFixed(3), tone: +r().toFixed(3),
                 movement: +r().toFixed(3), wet: +r().toFixed(3), bpm: 126 + Math.floor(r() * 12), bars: 4, bands, pulse, lanes },
      values: {}, patterns: real.patterns, inserts: real.inserts, gen: real.gen,
    });
  }
  return out;
}
