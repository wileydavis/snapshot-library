// The parts that need no server: node test/unit.test.mjs
import assert from 'node:assert/strict';
import { summarise, cleanTags } from '../src/worker.js';
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
console.log('unit tests ok');
