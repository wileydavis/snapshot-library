// What a snapshot sounded like, as SF-000 works it out and keeps it (its Profile.h). The same
// measures and the same sums as the instrument, so the page and the E16 agree on what is near what.

export const MEASURES = [
  ['energy', 'ENERGY'], ['weight', 'WEIGHT'], ['bright', 'BRIGHT'], ['density', 'DENSITY'],
  ['tone', 'TONE'], ['movement', 'MOVEMENT'], ['wet', 'WET'],
];
export const ROWS = ['PEAK', 'DRIVE', 'EASY', 'CALM'];        // the map, top to bottom
export const COLS = ['DARK', 'WARM', 'CLEAR', 'BRIGHT'];      // left to right

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const unit = (list, n) => Array.from({ length: n }, (_, i) => clamp((Number(list && list[i]) || 0) / 255));

// The arrays arrive as 0..255; the sums want 0..1.
export function unpack(p) {
  if (!p || typeof p !== 'object') return null;
  const f = (k) => clamp(Number(p[k]) || 0);
  return {
    energy: f('energy'), weight: f('weight'), bright: f('bright'), density: f('density'), tone: f('tone'), movement: f('movement'), wet: f('wet'),
    bpm: Number(p.bpm) || 0, bars: Number(p.bars) || 0, v: Number(p.v) || 1,
    bands: unit(p.bands, 16), pulse: unit(p.pulse, 32), lanes: unit(p.lanes, Array.isArray(p.lanes) ? p.lanes.length : 11),
  };
}

// The map's square: four rows of energy (0 calm .. 3 peak) by four columns of brightness.
export const energyRow = (p) => clamp(Math.floor(p.energy * 4), 0, 3);
export const brightCol = (p) => clamp(Math.floor(p.bright * 4), 0, 3);

// How unlike two sounds are: 0 the same. colourOnly leaves their energy out of it.
export function distance(a, b, colourOnly = false) {
  const sq = (x, y) => (x - y) * (x - y);
  const mean = (x, y) => { const n = Math.min(x.length, y.length); let s = 0; for (let i = 0; i < n; i++) s += sq(x[i], y[i]); return n ? s / n : 0; };
  let d = sq(a.bright, b.bright) + 0.7 * sq(a.weight, b.weight) + 0.7 * sq(a.density, b.density) + 0.5 * sq(a.tone, b.tone) + 0.5 * sq(a.wet, b.wet)
        + mean(a.bands, b.bands) + 0.5 * mean(a.pulse, b.pulse) + 0.7 * mean(a.lanes, b.lanes);
  if (!colourOnly) d += sq(a.energy, b.energy);
  return d;
}

// One colour for a profile: dark sounds deep red, through amber and yellow, to near white.
const STOPS = [[0x6E, 0x2A, 0x2B], [0xB5, 0x41, 0x42], [0xC5, 0x84, 0x3F], [0xD7, 0xC3, 0x52], [0xE8, 0xE5, 0xE1]];
export function heat(bright) {
  const x = clamp(bright) * 4, i = Math.min(3, Math.floor(x)), t = x - i;
  const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
