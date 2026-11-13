// A made-up library to look at and to check the bench against: sittings days apart, a few grooves
// in each, and each groove taken a dozen times as it was built up and broken down, the way a set
// is worked on. So LIKE THIS, SONG FROM THIS, the moods and AUTO SORT have families to find.
//
//   npm run dev                       (in another terminal)
//   node test/seed.mjs                240 snapshots into http://localhost:8787
//   node test/seed.mjs 3000           more (to see that thousands cost nothing)
//   node test/seed.mjs --clear        take them out again (and the stacks made in the checks)
//
// Its snapshots are all of library 5eed5eed5eed5eed, so they are told from real ones at a glance.
import { library, clip } from './sample.mjs';

const BASE = process.env.BASE || 'http://localhost:8787';
const LIB = '5eed5eed5eed5eed';
const j = (path, method = 'GET', body) => fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
function rng(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const clamp = (x) => Math.min(1, Math.max(0, x));
const b255 = (f) => Math.round(clamp(f) * 255);

// The same list every time for the same count.
export function seeded(count = 240) {
  const r = rng(20261113);
  const real = library.snapshots.find((s) => s.profile);
  const out = [];
  let t = Date.UTC(2026, 8, 3, 20, 0, 0), n = 0;
  while (out.length < count) {
    t += (1 + Math.floor(r() * 4)) * 86400000 + Math.floor(r() * 3) * 3600000;        // the next sitting, days on
    const grooves = 1 + Math.floor(r() * 3);
    for (let g = 0; g < grooves && out.length < count; g++) {
      // a groove: its colour stays, its energy comes and goes
      const bright = 0.08 + r() * 0.84, weight = 0.25 + r() * 0.7, tone = r(), wet = r() * 0.9, move = r() * 0.8, bpm = 124 + Math.floor(r() * 10);
      const tilt = Array.from({ length: 16 }, (_, k) => 0.2 + 0.8 * Math.max(0, 1 - Math.abs(k / 15 - bright) * 1.6) * (k < 4 ? 0.35 + weight * 0.65 : 1));
      const kick = [0, 4, 8, 12], extra = Array.from({ length: 16 }, () => r());
      const laneOrder = [0, 5, 1, 6, 4, 9, 2, 7, 3, 8, 10].sort(() => r() - 0.5);
      laneOrder.unshift(...laneOrder.splice(laneOrder.indexOf(0), 1));                 // (the kick first)
      const takes = 7 + Math.floor(r() * 12);
      for (let i = 0; i < takes && out.length < count; i++) {
        t += 60000 + Math.floor(r() * 200000);
        // built up, a break two thirds through, up again, then out
        const x = i / Math.max(1, takes - 1);
        const shape = x < 0.55 ? x / 0.55 : x < 0.68 ? 0.3 : x < 0.9 ? 0.75 + (x - 0.68) : 1 - (x - 0.9) * 6;
        const energy = clamp(0.12 + 0.8 * shape + (r() - 0.5) * 0.08);
        const lanesOn = Math.max(1, Math.round(1 + energy * 9));
        const lanes = Array.from({ length: 11 }, (_, l) => (laneOrder.indexOf(l) < lanesOn ? b255(0.35 + 0.6 * r()) : 0));
        const density = clamp(0.1 + energy * 0.7 + (r() - 0.5) * 0.15);
        const pulse = Array.from({ length: 32 }, (_, k) => {
          if (k < 16) return kick.includes(k) ? 235 + Math.floor(r() * 20) : extra[k] < density * 0.35 ? 110 : 8;
          return extra[k - 16] < density * 0.8 ? b255(0.45 + 0.5 * r()) : 0;
        });
        n++;
        out.push({
          id: 70000 + n, uid: `${LIB}-${(70000 + n).toString(16)}`, name: `SNAP ${String(n).padStart(3, '0')}`, time: t, made: real.made,
          profile: { v: 1, energy: +energy.toFixed(3), weight: +clamp(weight + (r() - 0.5) * 0.08).toFixed(3), bright: +clamp(bright + (energy - 0.5) * 0.12 + (r() - 0.5) * 0.05).toFixed(3),
                     density: +density.toFixed(3), tone: +clamp(tone + (r() - 0.5) * 0.1).toFixed(3), movement: +clamp(move + (r() - 0.5) * 0.15).toFixed(3),
                     wet: +clamp(wet + (0.5 - energy) * 0.2 + (r() - 0.5) * 0.08).toFixed(3), bpm, bars: 4,
                     bands: tilt.map((v) => b255(v * (0.55 + 0.45 * energy) * (0.85 + 0.15 * r()))), pulse, lanes },
          values: {}, patterns: real.patterns, inserts: real.inserts, gen: real.gen,
        });
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === '--clear') {
    const all = (await (await j('/api/snapshots')).json()).snapshots.filter((s) => s.library_id === LIB);
    for (const s of all) await j(`/api/snapshots/${s.uid}?forget=1`, 'DELETE');
    const stacks = [...(await (await j('/api/stacks')).json()).stacks, ...(await (await j('/api/stacks?removed=1')).json()).stacks];
    let gone = 0;
    for (const st of stacks) if ((st.items || []).some((it) => it.u.startsWith(LIB)) || (st.extra && st.extra.check)) { await j(`/api/stacks/${st.id}?forget=1`, 'DELETE'); gone++; }
    console.log(`${all.length} made-up snapshots and ${gone} stacks that held them are out of ${BASE}`);
  } else {
    const list = seeded(Number(arg) || 240);
    let sent = 0;
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async (s) => {
        const r = await j('/api/snapshots', 'POST', { snapshot: s, defs: sent === 0 ? library.defs : undefined });
        if (!r.ok) throw new Error(`${s.uid}: ${r.status}`);
        if (s.id % 5 !== 0) await fetch(`${BASE}/api/clips/${s.uid}`, { method: 'PUT', headers: { 'content-type': 'audio/ogg' }, body: clip });       // (one in five has no sound kept)
        sent++;
      }));
    }
    console.log(`${sent} made-up snapshots are in ${BASE}`);
  }
}
