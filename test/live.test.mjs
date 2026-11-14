// The whole path against a running server: `npm run dev` in one terminal, then `npm run test:live`.
// (BASE=http://localhost:8787 by default. It adds and removes its own snapshots; SEED=1 leaves a
// library of made-up ones behind to look at.)
import assert from 'node:assert/strict';
import { library, clip, madeUp } from './sample.mjs';

const BASE = process.env.BASE || 'http://localhost:8787';
const j = (path, method = 'GET', body) => fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
const by = (name) => library.snapshots.find((s) => s.name === name);
const real = by('SNAP 010'), old = by('INIT');

assert.equal((await j('/api/health')).status, 200);
// (anything an earlier run left, removed or not, is forgotten first)
const fresh = [real, old, ...madeUp(60), { uid: '7e577e577e577e57-stranger' }];
for (const s of fresh) await j(`/api/snapshots/${s.uid}?forget=1`, 'DELETE');

// 1. a snapshot as SF-000 sends it, with the definitions it names
let r = await (await j('/api/snapshots', 'POST', { snapshot: real, defs: library.defs })).json();
assert.equal(r.ok, true);
assert.equal(r.uid, real.uid);
assert.deepEqual(r.missingDefs, [], 'every definition it names came with it');
assert.equal(r.clip, false);

// 2. it is kept exactly as it came
let got = await (await j(`/api/snapshots/${real.uid}`)).json();
assert.deepEqual(got.snapshot, real, 'the snapshot comes back as it went in, with everything in it');
assert.equal(got.has_clip, false);
assert.equal(got.effects.join(','), 'DELAY,RADIO');
assert.ok(got.prints.length >= 14);

// 3. its clip: refused before the snapshot is known, kept after, served whole and in part
assert.equal((await fetch(`${BASE}/api/clips/0000000000000000-nope`, { method: 'PUT', body: clip })).status, 404);
r = await (await fetch(`${BASE}/api/clips/${real.uid}`, { method: 'PUT', headers: { 'content-type': 'audio/ogg' }, body: clip })).json();
assert.equal(r.size, clip.length);
let a = await fetch(`${BASE}/api/clips/${real.uid}`);
assert.equal(a.status, 200);
assert.equal(a.headers.get('content-type'), 'audio/ogg');
assert.ok(Buffer.from(await a.arrayBuffer()).equals(clip), 'the clip comes back to the byte');
a = await fetch(`${BASE}/api/clips/${real.uid}`, { headers: { range: 'bytes=4-11' } });
assert.equal(a.status, 206);
assert.equal(a.headers.get('content-range'), `bytes 4-11/${clip.length}`);
assert.ok(Buffer.from(await a.arrayBuffer()).equals(clip.subarray(4, 12)));

// 4. sent again (renamed in SF-000): the same snapshot, its new name, its clip still there
r = await (await j('/api/snapshots', 'POST', { snapshot: { ...real, name: 'ROLLER' } })).json();
assert.equal(r.clip, true);
got = await (await j(`/api/snapshots/${real.uid}`)).json();
assert.equal(got.name, 'ROLLER');
assert.equal(got.has_clip, true);

// 5. one from before a snapshot said what it was made with, and one naming a definition not sent
r = await (await j('/api/snapshots', 'POST', { snapshot: old })).json();
assert.deepEqual(r.missingDefs, []);
const stranger = { ...madeUp(1, 99)[0], uid: '7e577e577e577e57-stranger', made: { ...real.made, chassis: '00000000deadbeef' } };
r = await (await j('/api/snapshots', 'POST', { snapshot: stranger })).json();
assert.deepEqual(r.missingDefs, ['00000000deadbeef'], 'it says which definitions it still wants');

// 6. what is refused
assert.equal((await j('/api/snapshots', 'POST', { snapshot: { name: 'no uid' } })).status, 400);
assert.equal((await j('/api/snapshots', 'POST', { snapshot: { uid: '../../etc' } })).status, 400);
assert.equal((await fetch(`${BASE}/api/snapshots`, { method: 'POST', body: '{ not json' })).status, 400);
assert.equal((await j('/api/snapshots/not-a-uid')).status, 400);
assert.equal((await j('/api/nothing')).status, 404);

// 7. catching up: which of these are here, and which have their clip
const many = madeUp(process.env.SEED ? 60 : 12);
for (const s of many) assert.equal((await j('/api/snapshots', 'POST', { snapshot: s })).status, 200);
for (const s of many.filter((_, i) => i % 3 !== 2)) assert.equal((await fetch(`${BASE}/api/clips/${s.uid}`, { method: 'PUT', body: clip })).status, 200);
r = await (await j('/api/have', 'POST', { uids: [real.uid, old.uid, many[0].uid, many[2].uid, '7e577e577e577e57-never-sent'] })).json();
assert.deepEqual(r.have, { [real.uid]: { clip: true }, [old.uid]: { clip: false }, [many[0].uid]: { clip: true }, [many[2].uid]: { clip: false } });

// 8. the list the page draws from
const listed = (await (await j('/api/snapshots')).json()).snapshots;
const mine = listed.find((s) => s.uid === real.uid);
assert.ok(listed.length >= many.length + 3);
assert.equal(mine.profile.bands.length, 16);
assert.equal(mine.lanes.length, 11);
assert.equal(typeof mine.energy, 'number');
for (let i = 1; i < listed.length; i++) assert.ok((listed[i - 1].taken_at || listed[i - 1].received_at) >= (listed[i].taken_at || listed[i].received_at), 'newest first');

// 9. tags and notes are this library's own: beside the snapshot, never in it
r = await (await j(`/api/snapshots/${real.uid}`, 'PATCH', { tags: ['Dark', 'rolling', 'dark'], notes: 'opens the second hour' })).json();
assert.deepEqual(r.tags, ['dark', 'rolling']);
assert.deepEqual(r.snapshot.ext, real.ext, 'the snapshot itself is untouched');

// 10. a library file: each snapshot as it came, the notes under ext.web, and every definition named (an engine's too)
const file = await (await j('/api/export', 'POST', { uids: [real.uid, old.uid, 'ffffffffffffffff-missing'] })).json();
assert.equal(file.sf000lib, 1);
assert.equal(file.snapshots.length, 2);
const out = file.snapshots.find((s) => s.uid === real.uid);
assert.deepEqual(out.ext.web, { tags: ['dark', 'rolling'], notes: 'opens the second hour' });
assert.deepEqual({ ...out, ext: undefined, name: real.name }, { ...real, ext: undefined });
const laneDef = file.defs[real.made.lanes.kick];
assert.equal(laneDef.kind, 'lane');
assert.equal(file.defs[laneDef.engine].kind, 'engine', 'the engine a lane is built on comes too');
assert.ok(Object.values(real.made.fx).every((p) => file.defs[p].kind === 'fx'));
r = await (await j(`/api/defs?prints=${real.made.chassis}`)).json();
assert.equal(r.defs[real.made.chassis].kind, 'chassis');

// 11. removed here: its files go, and SF-000 is told not to send it again
assert.equal((await j(`/api/snapshots/${stranger.uid}`, 'DELETE')).status, 200);
assert.equal((await j(`/api/snapshots/${stranger.uid}`)).status, 404);
r = await (await j('/api/have', 'POST', { uids: [stranger.uid] })).json();
assert.deepEqual(r.have, { [stranger.uid]: { gone: true } });
r = await (await j('/api/snapshots', 'POST', { snapshot: stranger })).json();
assert.equal(r.gone, true);
assert.equal((await j(`/api/snapshots/${stranger.uid}`)).status, 404, 'sending it again does not bring it back');
// forgotten altogether, it may come again
assert.equal((await j(`/api/snapshots/${stranger.uid}?forget=1`, 'DELETE')).status, 200);
r = await (await j('/api/snapshots', 'POST', { snapshot: stranger })).json();
assert.equal(r.gone, undefined);
assert.equal((await j(`/api/snapshots/${stranger.uid}`)).status, 200);
assert.equal((await j(`/api/snapshots/${stranger.uid}?forget=1`, 'DELETE')).status, 200);

// 12. a name has two hands on it: the page's stands until SF-000 renames it there
r = await (await j(`/api/snapshots/${real.uid}`, 'PATCH', { name: '  Night Roller  ' })).json();
assert.equal(r.name, 'Night Roller');
assert.equal(r.snapshot.name, 'ROLLER', 'the snapshot as it last arrived is not rewritten');
r = await (await j('/api/export', 'POST', { uids: [real.uid] })).json();
assert.equal(r.snapshots[0].name, 'Night Roller', 'a library file has it under the name it has now');
r = await (await j('/api/snapshots', 'POST', { snapshot: { ...real, name: 'ROLLER' } })).json();          // SF-000 catching up, with the name it had (test 4)
assert.equal(r.name, 'Night Roller', 'sent again with the name it had there: the name given here stands');
r = await (await j('/api/snapshots', 'POST', { snapshot: { ...real, name: 'RENAMED THERE' } })).json();
assert.equal(r.name, 'RENAMED THERE', 'renamed in SF-000 since: that is its name');
assert.equal((await (await j(`/api/snapshots/${real.uid}`)).json()).tags.join(','), 'dark,rolling', 'and its tags are as they were');
assert.equal((await j(`/api/snapshots/${real.uid}`, 'PATCH', { name: '   ' })).status, 400, 'no name is not a name');

// 13. tags on many at once
r = await (await j('/api/tags', 'POST', { uids: [real.uid, many[0].uid, many[1].uid, 'ffffffffffffffff-missing'], add: ['Set A', 'dark'], remove: ['rolling'] })).json();
assert.deepEqual(r.tags, { [real.uid]: ['dark', 'set a'], [many[0].uid]: ['set a', 'dark'], [many[1].uid]: ['set a', 'dark'] });
assert.equal((await j('/api/tags', 'POST', { uids: [real.uid] })).status, 400);

// 14. stacks: made, filled, put in order, renamed, removed and put back
for (const id of ['teststack001', 'testmacro001', 'testmacro002', 'testsong0001', 'testrule0001']) await j(`/api/stacks/${id}?forget=1`, 'DELETE');
const u = many.map((s) => s.uid);
let stack = await (await j('/api/stacks', 'POST', { id: 'teststack001', name: 'ROLLERS', items: [u[0], u[1], u[0], 'not a uid', { u: u[2], bars: 4 }] })).json();
assert.equal(stack.id, 'teststack001');
assert.equal(stack.kind, 'stack');
assert.deepEqual(stack.items, [{ u: u[0] }, { u: u[1] }, { u: u[2] }], 'a chip once, in the order given');
assert.equal(stack.load, false);
r = await (await j('/api/stacks', 'POST', { id: 'teststack001', name: 'SENT TWICE' })).json();
assert.equal(r.name, 'ROLLERS', 'made twice is one stack, as it was');
stack = await (await j('/api/stacks/teststack001', 'PATCH', { name: 'DEEP ROLLERS', items: [u[2], u[0], u[3]], load: true })).json();
assert.deepEqual([stack.name, stack.load, stack.items.map((x) => x.u)], ['DEEP ROLLERS', true, [u[2], u[0], u[3]]]);
assert.equal((await j('/api/stacks/teststack001', 'PATCH', { nothing: 1 })).status, 400);
assert.equal((await j('/api/stacks/nosuchstack1', 'PATCH', { name: 'x' })).status, 404);
assert.equal((await j('/api/stacks/NOT-AN-ID', 'PATCH', { name: 'x' })).status, 400);
const made1 = await (await j('/api/stacks', 'POST', { name: 'NAMED BY THE LIBRARY' })).json();
assert.match(made1.id, /^[0-9a-z]{12}$/, 'with no id given it is given one');
assert.ok(made1.pos > stack.pos, 'and stands after the last');
await j(`/api/stacks/${made1.id}?forget=1`, 'DELETE');

// a macro is a knob's chips in sweep order; a knob holds one macro
let macro = await (await j('/api/stacks', 'POST', { id: 'testmacro001', name: 'LIFT', kind: 'macro', items: [u[4], u[5], u[6]], depth: 0.8, slot: 3 })).json();
assert.deepEqual([macro.kind, macro.slot, macro.depth, macro.items.length], ['macro', 3, 0.8, 3]);
await j('/api/stacks', 'POST', { id: 'testmacro002', name: 'DROP', kind: 'macro', items: [u[7], u[8]], slot: 3 });
macro = await (await j('/api/stacks/testmacro001')).json();
assert.equal(macro.slot, null, 'the knob went to the macro put on it last');
await j('/api/stacks/testmacro001', 'PATCH', { slot: 5 });
// a song is parts in a line; the same chip may come round again
const song = await (await j('/api/stacks', 'POST', { id: 'testsong0001', name: 'FRIDAY', kind: 'song', load: true, items: [{ u: u[0], bars: 16 }, { u: u[9], bars: 32, morph: 4 }, { u: u[0], bars: 8, morph: 0.5 }] })).json();
assert.deepEqual(song.items, [{ u: u[0], bars: 16, morph: 0 }, { u: u[9], bars: 32, morph: 4 }, { u: u[0], bars: 8, morph: 0.5 }]);
// a rule stack keeps its rule, and what it held when the page last looked
const rule = await (await j('/api/stacks', 'POST', { id: 'testrule0001', name: 'LIKE MADE 001', kind: 'rule', rule: { type: 'like', uid: u[0], n: 4 }, items: [u[0], u[10], u[11]] })).json();
assert.deepEqual(rule.rule, { type: 'like', uid: u[0], n: 4 });
let listedStacks = (await (await j('/api/stacks')).json()).stacks;
assert.deepEqual(listedStacks.filter((x) => x.id.startsWith('test')).map((x) => x.id), ['teststack001', 'testmacro001', 'testmacro002', 'testsong0001', 'testrule0001'], 'in the order they stand');

// 15. what SF-000 takes at LOAD: the tray's stacks with the chips they hold now, the macros on their knobs
await j(`/api/snapshots/${u[3]}`, 'DELETE');                                // (one of DEEP ROLLERS' chips is removed from the library)
let tray = await (await j('/api/load')).json();
assert.equal(tray.load, 1);
const mineOnly = (list) => list.filter((x) => x.id.startsWith('test'));
assert.deepEqual(mineOnly(tray.stacks).map((x) => [x.id, x.name, x.kind, x.uids]), [
  ['teststack001', 'DEEP ROLLERS', 'stack', [u[2], u[0]]],
  ['testsong0001', 'FRIDAY', 'song', [u[0], u[9], u[0]]],
], 'the stacks in the tray, in order, without the chip that has gone; the rule stack was not put in it');
assert.deepEqual(mineOnly(tray.stacks)[1].parts, [{ uid: u[0], bars: 16, morph: 0 }, { uid: u[9], bars: 32, morph: 4 }, { uid: u[0], bars: 8, morph: 0.5 }]);
assert.deepEqual(mineOnly(tray.knobs).map((x) => [x.id, x.slot, x.kind, x.name, x.depth, x.uids]), [
  ['testmacro001', 5, 'macro', 'LIFT', 0.8, [u[4], u[5], u[6]]],
  ['testmacro002', 3, 'macro', 'DROP', null, [u[7], u[8]]],
], 'a macro is in the tray when it has a knob');
// a stack on a knob is a cue stack: on its knob, and among the stacks whether or not it was marked for the tray
await j('/api/stacks/testrule0001', 'PATCH', { slot: 9 });
tray = await (await j('/api/load')).json();
assert.deepEqual(mineOnly(tray.knobs).filter((x) => x.kind === 'stack').map((x) => [x.id, x.slot, x.depth, x.uids]), [['testrule0001', 9, null, [u[0], u[10], u[11]]]]);
assert.ok(mineOnly(tray.stacks).some((x) => x.id === 'testrule0001' && x.kind === 'stack'), 'and it is among the stacks');
await j('/api/stacks/testmacro002', 'PATCH', { slot: 9 });
assert.equal((await (await j('/api/stacks/testrule0001')).json()).slot, null, 'a knob holds one thing: the stack gave it up to the macro put there');
await j('/api/stacks/testmacro002', 'PATCH', { slot: 3 });
tray = await (await j('/api/load')).json();
assert.deepEqual(tray.chips[u[0]], { name: many[0].name, clip: true, tags: ['set a', 'dark'], at: tray.chips[u[0]].at });
assert.equal(tray.chips[u[2]].clip, false);
assert.ok(!tray.chips[u[3]] && !tray.chips[u[10]], 'only the chips the tray holds');
await j(`/api/snapshots/${u[3]}?forget=1`, 'DELETE');
await j('/api/snapshots', 'POST', { snapshot: many[3] });

// removed: out of the list and the tray, and put back as it was
assert.equal((await j('/api/stacks/teststack001', 'DELETE')).status, 200);
assert.equal((await j('/api/stacks/teststack001')).status, 404);
assert.equal((await j('/api/stacks/teststack001', 'PATCH', { name: 'x' })).status, 404);
assert.ok(!(await (await j('/api/stacks')).json()).stacks.some((x) => x.id === 'teststack001'));
assert.ok((await (await j('/api/stacks?removed=1')).json()).stacks.some((x) => x.id === 'teststack001'), 'it is among the removed');
tray = await (await j('/api/load')).json();
assert.ok(!tray.stacks.some((x) => x.id === 'teststack001'));
stack = await (await j('/api/stacks/teststack001', 'PATCH', { restore: true })).json();
assert.deepEqual([stack.name, stack.items.map((x) => x.u), stack.load], ['DEEP ROLLERS', [u[2], u[0], u[3]], false], 'put back: its name and chips as they were, out of the tray');

const st = await (await j('/api/stats')).json();
assert.ok(st.snapshots >= many.length + 2 && st.clips >= 1 && st.defs >= 30 && st.libraries >= 2);
assert.ok(st.stacks >= 5 && st.in_tray >= 1);
if (!process.env.SEED) for (const id of ['teststack001', 'testmacro001', 'testmacro002', 'testsong0001', 'testrule0001']) await j(`/api/stacks/${id}?forget=1`, 'DELETE');

if (!process.env.SEED) {
  for (const s of [real, old, ...many]) await j(`/api/snapshots/${s.uid}?forget=1`, 'DELETE');
}
console.log(`live tests ok (${BASE})${process.env.SEED ? ': a made-up library is left to look at' : ''}`);
