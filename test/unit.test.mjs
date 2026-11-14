// The parts that need no server: node test/unit.test.mjs
import assert from 'node:assert/strict';
import { summarise, cleanTags, cleanItems, stackFields } from '../src/worker.js';
import * as st from '../public/js/stacks.js';
import { unpack, distance, heat, energyRow, brightCol } from '../public/js/profile.js';
import { narrow } from '../public/js/narrow.js';
import { library, madeUp } from './sample.mjs';

const by = (name) => library.snapshots.find((s) => s.name === name);

// What the index keeps of a snapshot as SF-000 wrote it.
{
  const s = summarise(by('SNAP 010'));
  assert.equal(s.name, 'SNAP 010');
  assert.equal(s.hasProfile, true);
  assert.ok(s.energy > 0 && s.energy <= 1 && s.weight > 0.8, 'the kick alone is heavy');
  assert.equal(s.bars, 4);
  assert.equal(s.profileV, 1);
  assert.equal(s.lanes.length, 11);
  assert.equal(s.lanes[0], 'kick');
  assert.deepEqual(s.effects, ['DELAY', 'RADIO']);
  assert.equal(s.fill.length, 11);
  assert.ok(s.fill.every((f) => f >= 0 && f <= 1));
  // every print it names is a definition in the file: eleven lanes, two effects, three returns, the chassis
  assert.equal(s.prints.length, new Set(s.prints).size);
  assert.ok(s.prints.length >= 14 && s.prints.every((p) => library.defs[p]), 'its prints are all defined');
  assert.equal(JSON.parse(s.profile).bands.length, 16);
}
// One from before a snapshot said what it was made with, and one with nothing playing.
{
  const old = summarise(by('INIT'));
  assert.equal(old.hasProfile, false);
  assert.equal(old.energy, null);
  assert.deepEqual(old.prints, []);
  assert.equal(old.lanes.join(','), 'kick,closed_hat,open_hat,clap,perc,bass,rumble,lead,chord,pad,voice');
  assert.ok(old.fill.some((f) => f > 0), 'its patterns have steps');
  const clean = summarise(by('CLEAN SLATE'));
  assert.ok(clean.fill.every((f) => f === 0));
  assert.deepEqual(clean.effects, []);
  assert.ok(clean.prints.length >= 12);
}
// Odd input does not throw, and nothing is invented.
{
  const s = summarise({ uid: 'x', profile: { energy: 'loud' }, inserts: 'no', patterns: [null, { len: 0, steps: [[0]] }] });
  assert.equal(s.energy, null);
  assert.deepEqual(s.effects, []);
  assert.equal(s.name, '');
}
assert.deepEqual(cleanTags([' Dark ', 'dark', 'Rolling, low', '', 'x'.repeat(60)]), ['dark', 'rolling low', 'x'.repeat(40)]);

// The profile's sums, as the instrument does them.
{
  const a = unpack(by('SNAP 010').profile), b = unpack(by('SNAP 009').profile);
  assert.equal(distance(a, a), 0);
  assert.ok(distance(a, b) > 0 && Math.abs(distance(a, b) - distance(b, a)) < 1e-12);
  assert.ok(distance(a, b, true) <= distance(a, b));
  assert.equal(heat(0), 'rgb(110, 42, 43)');
  assert.equal(heat(1), 'rgb(232, 229, 225)');
  assert.equal(energyRow({ energy: 1 }), 3);
  assert.equal(energyRow({ energy: 0.26 }), 1);
  assert.equal(brightCol({ bright: 0 }), 0);
  assert.equal(unpack(null), null);
  assert.equal(unpack({ bands: [255, 0] }).bands.length, 16);
}
// What is shown and in what order.
{
  const all = [...library.snapshots, ...madeUp(40)].map((s, i) => ({ uid: s.uid, name: s.name, taken_at: s.time, has_clip: i % 2 === 0, tags: i === 5 ? ['rolling'] : [], effects: ['DELAY'], notes: '', p: unpack(s.profile) }));
  const up = narrow(all, { order: 'energy-up' });
  const withP = up.filter((s) => s.p);
  assert.equal(up.length, all.length);
  for (let i = 1; i < withP.length; i++) assert.ok(withP[i - 1].p.energy <= withP[i].p.energy);
  assert.ok(up.slice(withP.length).every((s) => !s.p), 'those with no sound kept go last');
  // the map: every square holds what belongs in it, and the squares together hold every profiled one once
  let inSquares = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cell = narrow(all, { cell: [row, col] });         // row 0 is PEAK, the top of the map
      const lo = (3 - row) / 4, left = col / 4;
      assert.ok(cell.every((s) => s.p && s.p.energy >= lo && (row === 0 || s.p.energy < lo + 0.25) && s.p.bright >= left && (col === 3 || s.p.bright < left + 0.25)));
      inSquares += cell.length;
    }
  }
  assert.equal(inSquares, all.filter((s) => s.p).length);
  assert.equal(narrow(all, { find: 'rolling' }).length, 1);
  assert.equal(narrow(all, { find: 'made 00' }).length, 9);
  assert.ok(narrow(all, { soundOnly: true }).every((s) => s.has_clip));
  const near = all.find((s) => s.name === 'MADE 010');
  const like = narrow(all, { order: 'like', near });
  assert.equal(like[0].uid, near.uid, 'nearest the selected: itself first');
  const newest = narrow(all, { order: 'new' });
  for (let i = 1; i < newest.length; i++) assert.ok(newest[i - 1].taken_at >= newest[i].taken_at);
}
// ---------------------------------------------------------------- stacks
// What a stack may hold, and what a request may set of one.
{
  const a = '0123456789abcdef-1', b = '0123456789abcdef-2';
  assert.deepEqual(cleanItems([a, { u: b, bars: 4 }, a, { u: '../x' }, null, 7]), [{ u: a }, { u: b }], 'a chip once, by uid; bars are a song\'s');
  assert.deepEqual(cleanItems([{ u: a, bars: 400, morph: -2 }, { u: a }, { u: b, bars: 'x', morph: 0.5 }], 'song'),
    [{ u: a, bars: 256, morph: 0 }, { u: a, bars: 8, morph: 0 }, { u: b, bars: 8, morph: 0.5 }], 'a song may hold a chip twice; its parts have bars and a way in');
  const f = stackFields({ name: '  ROLLERS  ', kind: 'macro', depth: 3, slot: 17, load: true, pos: 2, items: [a, a], rule: { type: 'like', uid: a }, extra: { x: 1 }, id: 'ignored', deleted_at: 5 });
  assert.deepEqual(f, { name: 'ROLLERS', kind: 'macro', rule: '{"type":"like","uid":"' + a + '"}', items: '[{"u":"' + a + '"}]', depth: 2, load: 1, pos: 2, extra: '{"x":1}' });
  assert.deepEqual(stackFields({ slot: 16, depth: null, rule: null }), { rule: '', depth: null, slot: 16 });
  assert.deepEqual(stackFields({ kind: 'bucket', slot: 0, load: 'yes', pos: 'far' }), {}, 'what is not understood is not set');
  assert.deepEqual(stackFields(null), {});
}
// The rules that fill a stack.
{
  const day = 86400000;
  // three sittings: forty made-up chips taken a minute apart, then two real ones a day on, then one more a day after
  const made = madeUp(40).map((s) => ({ uid: s.uid, name: s.name, taken_at: s.time, tags: [], effects: ['DELAY'], notes: '', p: unpack(s.profile) }));
  const two = library.snapshots.filter((s) => s.profile);
  const real = [two[0], two[1], { ...two[1], uid: '7e577e577e577e57-later', name: 'LATER' }].map((s, i) => ({ uid: s.uid, name: s.name, taken_at: made[39].taken_at + day * (i < 2 ? 1 : 2) + i * 60000, tags: i ? [] : ['keeper'], effects: [], notes: '', p: unpack(s.profile) }));
  const mute = { uid: 'ffffffffffffffff-mute', name: 'NO SOUND', taken_at: made[0].taken_at - 5 * day, tags: [], effects: [], notes: '', p: null };
  const all = [...made, ...real, mute];
  const byUid = new Map(all.map((s) => [s.uid, s]));

  const sits = st.sittings(all);
  assert.equal(sits.length, 4, 'a gap of more than 45 minutes begins another sitting');
  assert.deepEqual(sits.map((x) => x.uids.length), [1, 2, 40, 1], 'newest first');
  assert.equal(sits.reduce((n, x) => n + x.uids.length, 0), all.length, 'every chip is in one sitting, once');
  for (const x of sits) for (let i = 1; i < x.uids.length; i++) assert.ok(byUid.get(x.uids[i - 1]).taken_at <= byUid.get(x.uids[i]).taken_at);

  const seed = made[9];
  const near = st.like(all, seed, 12);
  assert.equal(near.length, 12);
  assert.equal(near[0], seed.uid, 'like a chip: itself first');
  for (let i = 2; i < near.length; i++) assert.ok(distance(seed.p, byUid.get(near[i - 1]).p) <= distance(seed.p, byUid.get(near[i]).p), 'then nearest first');
  assert.ok(!near.includes(mute.uid), 'one with no sound kept is like nothing');
  assert.deepEqual(st.like(all, mute), []);

  // a song: no chip twice, the seed in it, bars and a way in on every part, and the arc's shape in the energy
  const parts = st.song(all, seed);
  assert.equal(parts.length, 8);
  assert.equal(new Set(parts.map((x) => x.u)).size, 8, 'no chip twice');
  assert.ok(parts.some((x) => x.u === seed.uid), 'the chip asked for is in it');
  assert.ok(parts.every((x) => x.bars >= 1 && x.bars <= 256 && x.morph >= 0) && parts[0].morph === 0, 'the first part is simply there');
  const e = parts.map((x) => byUid.get(x.u).p.energy);
  assert.ok(e[3] > e[0] && e[3] > e[4] && e[6] > e[4] && e[6] > e[7], `in, up to a peak, a break, a peak, out (${e.map((x) => x.toFixed(2)).join(' ')})`);
  assert.deepEqual(st.song(all, seed), parts, 'the same library gives the same song');
  assert.equal(st.song(all, seed, 4).length, 4);
  assert.deepEqual(st.song(all, mute), []);
  assert.ok(st.song(real, real[0]).length <= 3, 'a small family makes a short song');
  // the family leans to the sitting: of two equally far, the one taken in the same sitting comes first
  const twin = { ...made[20], uid: '7e577e577e577e57-twin', taken_at: real[0].taken_at + 1000, p: { ...made[20].p } };
  const fam = st.family([...all, twin], made[20]).map((x) => x.s.uid);
  assert.equal(fam[0], made[20].uid, 'the chip itself heads its family');
  assert.equal(fam[1], twin.uid, 'and its double is next, whenever it was taken');
  const farTwin = st.family([...all, twin], real[0], 100).map((x) => x.s.uid);
  assert.ok(farTwin.indexOf(twin.uid) >= 0 && farTwin.indexOf(twin.uid) < farTwin.indexOf(made[20].uid), 'taken in the same sitting counts: of two that sound the same, the one from this sitting comes first');

  // a knob: calm to full, the chip among them
  const kn = st.knob(all, seed, 3);
  assert.equal(kn.length, 3);
  assert.ok(kn.includes(seed.uid));
  assert.ok(byUid.get(kn[0]).p.energy <= byUid.get(kn[2]).p.energy, 'in sweep order: the calmest first');

  // moods: the chips that fit, best first; a mood made from examples takes its examples in
  for (const [key, m] of Object.entries(st.MOODS)) {
    const got = st.mood(all, m);
    for (let i = 1; i < got.length; i++) assert.ok(st.fit(byUid.get(got[i - 1]).p, m) >= st.fit(byUid.get(got[i]).p, m), `${key}: best first`);
    assert.ok(got.every((u) => st.fit(byUid.get(u).p, m) >= 0.85) && got.length <= 64, `${key}: only what fits`);
  }
  assert.ok(st.mood(all, st.MOODS.peak).every((u) => byUid.get(u).p.energy > 0.7), 'PEAK holds the loud ones');
  assert.ok(st.mood(all, st.MOODS.dark).every((u) => byUid.get(u).p.bright < 0.4), 'DARK holds the dark ones');
  assert.equal(st.fit({ energy: 0.95, bright: 0.65, density: 0.75 }, st.MOODS.peak), 1);
  const examples = [...made].sort((a, b) => a.p.bright - b.p.bright).slice(0, 5);          // the five darkest
  const learned = st.moodFrom(examples, 'MINE');
  assert.ok(learned.w.bright === 1 || learned.w.bright > 0.5, 'what the examples agree on is what matters');
  const mine = st.mood(all, learned);
  assert.ok(examples.every((s) => mine.includes(s.uid)), 'a mood made from examples holds its examples');
  assert.ok(mine.length < made.length / 2, 'and not everything');
  assert.equal(st.moodFrom([made[0]]), null, 'one example is not a mood');

  assert.deepEqual(st.find(all, 'keeper'), [real[0].uid]);
  assert.deepEqual(st.find(all, ''), []);
  assert.equal(st.recent(all, 5).length, 5);
  assert.equal(st.recent(all, 5)[0], real[2].uid);
  const stacks = [{ kind: 'stack', items: [{ u: made[0].uid }] }, { kind: 'macro', items: [{ u: made[1].uid }] }, { kind: 'rule', items: [{ u: made[2].uid }] }];
  const loose = st.unsorted(all, stacks);
  assert.equal(loose.length, all.length - 2, 'in no stack of the hand\'s making (one that fills itself does not count)');
  assert.ok(!loose.includes(made[0].uid) && !loose.includes(made[1].uid) && loose.includes(made[2].uid));

  // auto sort: every sounded chip in one pile, once; the same deal every time; piles of like sounds
  const piles = st.piles(all);
  assert.ok(piles.length >= 3 && piles.length <= 12);
  assert.equal(piles.reduce((n, p) => n + p.uids.length, 0), all.filter((s) => s.p).length);
  assert.equal(new Set(piles.flatMap((p) => p.uids)).size, all.filter((s) => s.p).length);
  assert.deepEqual(st.piles([...all].reverse()).map((p) => [p.name, p.uids]), piles.map((p) => [p.name, p.uids]), 'the same library is dealt the same way, however it is listed');
  assert.equal(new Set(piles.map((p) => p.name)).size, piles.length, 'each pile has a name of its own');
  const spread = (uids) => { let t = 0, n = 0; for (const a of uids) for (const b of uids) if (a < b) { t += distance(byUid.get(a).p, byUid.get(b).p); n++; } return n ? t / n : 0; };
  const within = piles.filter((p) => p.uids.length > 1).reduce((a, p) => a + spread(p.uids), 0) / piles.filter((p) => p.uids.length > 1).length;
  assert.ok(within < spread(all.filter((s) => s.p).map((s) => s.uid)) * 0.75, 'chips in a pile are nearer each other than the library is to itself');
  assert.deepEqual(st.piles(all.slice(0, 3)), [], 'too few to sort');

  // a rule filled: what a stack of that rule holds now
  assert.deepEqual(st.fill({ type: 'like', uid: seed.uid, n: 6 }, all), st.like(all, seed, 6).map((u) => ({ u })));
  assert.deepEqual(Object.keys(st.fill({ type: 'song', uid: seed.uid }, all)[0]), ['u', 'bars', 'morph']);
  assert.deepEqual(st.fill({ type: 'mood', mood: 'dark' }, all), st.mood(all, st.MOODS.dark).map((u) => ({ u })));
  assert.deepEqual(st.fill({ type: 'mood', ...learned }, all).map((x) => x.u), mine);
  assert.deepEqual(st.fill({ type: 'like', uid: 'gone' }, all), [], 'a rule whose chip has gone holds nothing');
  assert.deepEqual(st.fill({ type: 'nonsense' }, all), []);
  assert.equal(st.ruleName({ type: 'like', uid: seed.uid }, all), `LIKE ${seed.name}`);
  assert.equal(st.ruleName({ type: 'mood', mood: 'dub' }, all), 'DUB');
}
console.log('unit tests ok');
