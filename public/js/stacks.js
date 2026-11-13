// Stacks that fill themselves. Each rule here takes the whole library and answers the chips it
// holds, in order. Plain sums on what every snapshot already carries (its profile, its tempo,
// when it was taken): the same library gives the same stacks every time, and a better sense of
// likeness can replace distance() later without anything here changing shape.
//
// A chip is a row from /api/snapshots with .p (its profile unpacked, or null if no sound was kept).
import { MEASURES, ROWS, COLS, energyRow, brightCol, distance } from './profile.js';

export const KEYS = MEASURES.map(([k]) => k);
export const when = (s) => s.taken_at || s.received_at || 0;
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const sounded = (all) => all.filter((s) => s.p);

// ---------------------------------------------------------------- sittings
// One sitting at the instrument: snapshots with no more than `gap` between one and the next.
// Newest sitting first; inside one, in the order they were taken.
export function sittings(all, gap = 45 * 60 * 1000) {
  const byTime = [...all].sort((a, b) => when(a) - when(b));
  const out = [];
  for (const s of byTime) {
    const last = out[out.length - 1];
    if (last && when(s) - last.to <= gap) { last.uids.push(s.uid); last.to = when(s); }
    else out.push({ from: when(s), to: when(s), uids: [s.uid] });
  }
  return out.reverse();
}
// Which sitting each chip was taken in (its index in sittings(), by uid).
export function sittingOf(all, gap) {
  const map = new Map();
  sittings(all, gap).forEach((sit, i) => sit.uids.forEach((u) => map.set(u, i)));
  return map;
}

// ---------------------------------------------------------------- like this
// The nearest to a chip, itself first: by the sum the instrument and the E16 use.
export function like(all, seed, n = 24) {
  if (!seed || !seed.p) return [];
  return sounded(all)
    .map((s) => ({ s, d: s.uid === seed.uid ? -1 : distance(seed.p, s.p) }))
    .sort((a, b) => a.d - b.d || when(b.s) - when(a.s))
    .slice(0, n)
    .map((x) => x.s.uid);
}

// ---------------------------------------------------------------- the family of a chip
// Chips that could be the same piece of music at another moment: the same colour whatever the
// energy, near the same tempo, and (it counts for a lot) taken in the same sitting, where one
// groove was being worked on. Nearest first, the chip itself at the head, each with how far.
export function family(all, seed, n = 24) {
  if (!seed || !seed.p) return [];
  const sit = sittingOf(all);
  const mine = sit.get(seed.uid);
  return sounded(all)
    .map((s) => {
      if (s.uid === seed.uid) return { s, d: -1 };
      let d = distance(seed.p, s.p, true);
      const bpm = Math.abs((s.p.bpm || 0) - (seed.p.bpm || 0));
      if (seed.p.bpm && s.p.bpm) d += (bpm / 16) * (bpm / 16);          // eight bpm apart is a quarter of the way to "another thing"
      if (sit.get(s.uid) === mine) d *= 0.5;
      return { s, d };
    })
    .sort((a, b) => a.d - b.d || when(a.s) - when(b.s))
    .slice(0, n);
}

// ---------------------------------------------------------------- a song from a chip
// The shape of a set piece, as energy from the family's calmest (0) to its fullest (1), with how
// long each part is and how long the way into it takes (bars). Eight parts; fewer are picked evenly.
export const ARC = [
  { role: 'IN', e: 0.12, bars: 16, morph: 0 },
  { role: 'BUILD', e: 0.4, bars: 16, morph: 8 },
  { role: 'DRIVE', e: 0.7, bars: 16, morph: 8 },
  { role: 'PEAK', e: 1.0, bars: 32, morph: 4 },
  { role: 'BREAK', e: 0.3, bars: 16, morph: 2 },
  { role: 'BUILD', e: 0.75, bars: 16, morph: 8 },
  { role: 'PEAK', e: 0.95, bars: 32, morph: 4 },
  { role: 'OUT', e: 0.15, bars: 16, morph: 8 },
];

// Parts in a line: the chip's family spread over the arc. Each part is the unused chip whose
// energy is nearest what the arc asks for there, leaning to the family's nearest and to a short
// step from the part before. The chip asked for is always in it, where its own energy puts it.
// No chip twice. Answers [{ u, bars, morph, role }].
export function song(all, seed, parts = 8) {
  const fam = family(all, seed, Math.max(24, parts * 3));
  if (fam.length < 2) return [];
  parts = Math.max(2, Math.min(parts, ARC.length, fam.length));
  const arc = parts === ARC.length ? ARC : Array.from({ length: parts }, (_, i) => ARC[Math.round((i * (ARC.length - 1)) / (parts - 1))]);
  const es = fam.map((f) => f.s.p.energy);
  const lo = Math.min(...es), span = Math.max(0.05, Math.max(...es) - lo);
  const want = arc.map((a) => lo + a.e * span);
  const far = Math.max(1e-6, ...fam.map((f) => f.d));
  const picked = new Array(parts).fill(null);
  const used = new Set([seed.uid]);
  // the chip itself, where it fits best
  let at = 0;
  for (let i = 1; i < parts; i++) if (Math.abs(want[i] - seed.p.energy) < Math.abs(want[at] - seed.p.energy)) at = i;
  picked[at] = seed;
  for (let i = 0; i < parts; i++) {
    if (picked[i]) continue;
    const before = i > 0 ? picked[i - 1] : null;
    let best = null, bestCost = Infinity;
    for (const f of fam) {
      if (used.has(f.s.uid)) continue;
      const cost = Math.abs(f.s.p.energy - want[i]) / span + 0.35 * (Math.max(0, f.d) / far) + (before ? 0.25 * Math.sqrt(distance(before.p, f.s.p, true)) : 0);
      if (cost < bestCost) { bestCost = cost; best = f.s; }
    }
    if (!best) break;
    picked[i] = best; used.add(best.uid);
  }
  return picked.map((s, i) => (s ? { u: s.uid, bars: arc[i].bars, morph: i === 0 ? 0 : arc[i].morph, role: arc[i].role } : null)).filter(Boolean);
}

// A knob from a chip: up to `n` of its family from calmest to fullest, far enough apart to be
// worth a turn. What a snapshot knob sweeps through, in sweep order.
export function knob(all, seed, n = 3) {
  const fam = family(all, seed, 16).map((f) => f.s).sort((a, b) => a.p.energy - b.p.energy);
  if (fam.length <= n) return fam.map((s) => s.uid);
  const out = [];
  for (let i = 0; i < n; i++) out.push(fam[Math.round((i * (fam.length - 1)) / (n - 1))]);
  if (!out.includes(seed)) {                       // the chip asked for is one of them: it takes the place of the nearest in energy
    let at = 0;
    for (let i = 1; i < out.length; i++) if (Math.abs(out[i].p.energy - seed.p.energy) < Math.abs(out[at].p.energy - seed.p.energy)) at = i;
    out[at] = seed;
  }
  return [...new Set(out.map((s) => s.uid))];
}

// ---------------------------------------------------------------- moods
// A mood is a place on the seven measures and how much each one matters to it. A chip fits by how
// near it is on the ones that matter: 1 on the spot, 0 as far off as can be.
export const MOODS = {
  deep:     { name: 'DEEP',     t: { weight: 0.8, bright: 0.25, energy: 0.45, wet: 0.55 }, w: { weight: 1, bright: 1, energy: 0.6, wet: 0.4 } },
  dub:      { name: 'DUB',      t: { wet: 0.8, density: 0.3, bright: 0.35, energy: 0.4 }, w: { wet: 1, density: 0.7, bright: 0.6, energy: 0.4 } },
  driving:  { name: 'DRIVING',  t: { energy: 0.8, density: 0.7, movement: 0.4 }, w: { energy: 1, density: 0.8, movement: 0.3 } },
  hypnotic: { name: 'HYPNOTIC', t: { movement: 0.15, density: 0.5, energy: 0.55, tone: 0.6 }, w: { movement: 1, density: 0.5, energy: 0.5, tone: 0.4 } },
  peak:     { name: 'PEAK',     t: { energy: 0.95, bright: 0.65, density: 0.75 }, w: { energy: 1, bright: 0.4, density: 0.4 } },
  sparse:   { name: 'SPARSE',   t: { density: 0.12, energy: 0.3 }, w: { density: 1, energy: 0.5 } },
  dark:     { name: 'DARK',     t: { bright: 0.12, weight: 0.7 }, w: { bright: 1, weight: 0.4 } },
  bright:   { name: 'BRIGHT',   t: { bright: 0.88, tone: 0.5 }, w: { bright: 1, tone: 0.2 } },
  heavy:    { name: 'HEAVY',    t: { weight: 0.9, energy: 0.75 }, w: { weight: 1, energy: 0.6 } },
  restless: { name: 'RESTLESS', t: { movement: 0.8, density: 0.6 }, w: { movement: 1, density: 0.3 } },
  warmup:   { name: 'WARM-UP',  t: { energy: 0.35, density: 0.35, bright: 0.4 }, w: { energy: 1, density: 0.5, bright: 0.4 } },
};

export function fit(p, mood) {
  let sum = 0, weights = 0;
  for (const k of KEYS) {
    const w = (mood.w && mood.w[k]) || 0;
    if (!w) continue;
    const d = p[k] - mood.t[k];
    sum += w * d * d; weights += w;
  }
  return weights ? 1 - Math.sqrt(sum / weights) : 0;
}

// The chips that fit a mood, best first: those within `cut` of it (0.85: no more than a seventh of
// the way off, taken over the measures that matter), `most` at the most.
export function mood(all, m, { cut = 0.85, most = 64 } = {}) {
  if (!m || !m.t) return [];
  return sounded(all)
    .map((s) => ({ s, f: fit(s.p, m) }))
    .filter((x) => x.f >= (m.cut || cut))
    .sort((a, b) => b.f - a.f || when(b.s) - when(a.s))
    .slice(0, most)
    .map((x) => x.s.uid);
}

// A mood from examples: where they agree is what the mood is. Its place is their middle; a
// measure matters as much as they agree on it (and not at all where they are all over the place);
// and it is as wide as takes every example in, and a little more.
export function moodFrom(chips, name = 'MOOD') {
  const ps = chips.filter((s) => s && s.p).map((s) => s.p);
  if (ps.length < 2) return null;
  const t = {}, w = {};
  let top = 0;
  for (const k of KEYS) {
    const mean = ps.reduce((a, p) => a + p[k], 0) / ps.length;
    const sd = Math.sqrt(ps.reduce((a, p) => a + (p[k] - mean) * (p[k] - mean), 0) / ps.length);
    t[k] = Math.round(mean * 1000) / 1000;
    w[k] = 1 / (sd + 0.06);
    top = Math.max(top, w[k]);
  }
  for (const k of KEYS) { w[k] = Math.round((w[k] / top) * 100) / 100; if (w[k] < 0.3) { delete w[k]; delete t[k]; } }
  const m = { name, t, w };
  const worst = Math.min(...ps.map((p) => fit(p, m)));
  m.cut = Math.round(clamp(worst - 0.04, 0.5, 0.95) * 1000) / 1000;
  return m;
}

// ---------------------------------------------------------------- find, recent, unsorted
export function find(all, text) {
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return all
    .filter((s) => { const hay = [s.name, s.notes, ...(s.tags || []), ...(s.effects || [])].join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => when(b) - when(a))
    .map((s) => s.uid);
}
export const recent = (all, n = 48) => [...all].sort((a, b) => when(b) - when(a)).slice(0, n).map((s) => s.uid);
// In no stack of the hand's making yet (a stack that fills itself is not a place a chip was put).
export function unsorted(all, stacks) {
  const placed = new Set();
  for (const st of stacks) if (st.kind !== 'rule') for (const it of st.items || []) placed.add(it.u);
  return all.filter((s) => !placed.has(s.uid)).sort((a, b) => when(b) - when(a)).map((s) => s.uid);
}

// ---------------------------------------------------------------- auto sort
// The library dealt into piles of like sounds. Each chip is a point whose distances are
// distance()'s; the piles are found by k-means from a fixed start, so the same library is dealt
// the same way every time. A pile is named for where its middle is on the map and for the measure
// it stands furthest out on.
function point(p) {
  const v = [p.energy, p.bright, Math.sqrt(0.7) * p.weight, Math.sqrt(0.7) * p.density, Math.sqrt(0.5) * p.tone, Math.sqrt(0.5) * p.wet];
  for (let i = 0; i < 16; i++) v.push((p.bands[i] || 0) / 4);
  for (let i = 0; i < 32; i++) v.push(Math.sqrt(0.5) * (p.pulse[i] || 0) / Math.sqrt(32));
  for (let i = 0; i < 11; i++) v.push(Math.sqrt(0.7) * (p.lanes[i] || 0) / Math.sqrt(11));
  return v;
}
const d2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return s; };
function rng(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

export function piles(all, k = 0) {
  const chips = sounded(all).sort((a, b) => (a.uid < b.uid ? -1 : 1));       // (an order that does not depend on how the list came)
  if (chips.length < 4) return [];
  k = k || Math.max(3, Math.min(12, Math.round(Math.sqrt(chips.length / 2))));
  k = Math.min(k, chips.length);
  const pts = chips.map((s) => point(s.p));
  const r = rng(20261113);
  // k-means++: each new middle far from the ones there are
  const mids = [pts[Math.floor(r() * pts.length)].slice()];
  while (mids.length < k) {
    const far = pts.map((p) => Math.min(...mids.map((m) => d2(p, m))));
    const total = far.reduce((a, b) => a + b, 0);
    let x = r() * total, at = 0;
    while (at < far.length - 1 && (x -= far[at]) > 0) at++;
    mids.push(pts[at].slice());
  }
  const of = new Array(pts.length).fill(0);
  for (let round = 0; round < 40; round++) {
    let moved = false;
    pts.forEach((p, i) => {
      let best = 0;
      for (let c = 1; c < k; c++) if (d2(p, mids[c]) < d2(p, mids[best])) best = c;
      if (best !== of[i]) { of[i] = best; moved = true; }
    });
    for (let c = 0; c < k; c++) {
      const mine = pts.filter((_, i) => of[i] === c);
      if (!mine.length) continue;
      for (let j = 0; j < mids[c].length; j++) mids[c][j] = mine.reduce((a, p) => a + p[j], 0) / mine.length;
    }
    if (!moved && round > 0) break;
  }
  // named, and put in order: calm and dark first, as the map reads
  const all7 = (list) => Object.fromEntries(KEYS.map((key) => [key, list.reduce((a, s) => a + s.p[key], 0) / list.length]));
  const whole = all7(chips);
  const out = [];
  for (let c = 0; c < k; c++) {
    const mine = chips.filter((_, i) => of[i] === c);
    if (!mine.length) continue;
    const mid = all7(mine);
    let trait = '', most = 0.08;
    for (const [key, label] of MEASURES) {
      if (key === 'energy' || key === 'bright') continue;               // (the map's square says those)
      const off = mid[key] - whole[key];
      if (Math.abs(off) > most) { most = Math.abs(off); trait = off > 0 ? TRAIT[key][1] : TRAIT[key][0]; }
    }
    const square = `${ROWS[3 - energyRow(mid)]} ${COLS[brightCol(mid)]}`;
    mine.sort((a, b) => d2(point(a.p), mids[c]) - d2(point(b.p), mids[c]));          // the most typical on top
    out.push({ name: trait ? `${square} ${trait}` : square, mid, uids: mine.map((s) => s.uid) });
  }
  out.sort((a, b) => a.mid.energy - b.mid.energy || a.mid.bright - b.mid.bright);
  const seen = {};
  for (const p of out) { seen[p.name] = (seen[p.name] || 0) + 1; if (seen[p.name] > 1) p.name += ` ${seen[p.name]}`; }
  return out;
}
const TRAIT = {
  weight: ['LIGHT', 'HEAVY'], density: ['SPARSE', 'BUSY'], tone: ['ROUGH', 'TONAL'], movement: ['STILL', 'MOVING'], wet: ['DRY', 'WET'],
};

// ---------------------------------------------------------------- a rule, filled
// rule: { type: 'like' | 'song' | 'knob' | 'mood' | 'find', ... }. Answers the items a stack of
// that rule holds now ([{ u, bars?, morph? }]); what is not in the library any more is not in it.
export function fill(rule, all) {
  if (!rule || typeof rule !== 'object') return [];
  const seed = rule.uid ? all.find((s) => s.uid === rule.uid) : null;
  const u = (list) => list.map((x) => ({ u: x }));
  switch (rule.type) {
    case 'like': return u(like(all, seed, rule.n || 24));
    case 'song': return song(all, seed, rule.parts || 8).map(({ u: uid, bars, morph }) => ({ u: uid, bars, morph }));
    case 'knob': return u(knob(all, seed, rule.n || 3));
    case 'mood': return u(mood(all, rule.mood && MOODS[rule.mood] ? MOODS[rule.mood] : rule, { most: rule.most || 64 }));
    case 'find': return u(find(all, rule.text));
    default: return [];
  }
}

// What a rule is called on its plate.
export function ruleName(rule, all) {
  if (!rule) return '';
  const seed = rule.uid ? all.find((s) => s.uid === rule.uid) : null;
  const of = seed ? String(seed.name || 'UNNAMED').toUpperCase() : 'A CHIP THAT HAS GONE';
  switch (rule.type) {
    case 'like': return `LIKE ${of}`;
    case 'song': return `SONG FROM ${of}`;
    case 'knob': return `KNOB FROM ${of}`;
    case 'mood': return rule.mood && MOODS[rule.mood] ? MOODS[rule.mood].name : String(rule.name || 'MOOD').toUpperCase();
    case 'find': return `FIND ${String(rule.text || '').toUpperCase()}`;
    default: return 'RULE';
  }
}
