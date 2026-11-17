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
assert.deepEqual(r.have, { [real.uid]: { clip: true, stems: false, lossless: false }, [old.uid]: { clip: false, stems: false, lossless: false }, [many[0].uid]: { clip: true, stems: false, lossless: false }, [many[2].uid]: { clip: false, stems: false, lossless: false } });

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

// The module SF-000 carries: its places 1 to 4 take a macro knob, 5 to 16 a stack knob. A stack of chips (one called a
// "macro", from before the two kinds, is one) goes on 5 to 16; a place holds one thing.
assert.equal((await j('/api/stacks', 'POST', { id: 'testmacro001', name: 'LIFT', kind: 'macro', items: [u[4], u[5], u[6]], depth: 0.8, slot: 3 })).status, 400, 'a stack of chips is refused a macro knob\'s place');
assert.equal((await j('/api/stacks/testmacro001')).status, 404, 'and was not made');
let macro = await (await j('/api/stacks', 'POST', { id: 'testmacro001', name: 'LIFT', kind: 'macro', items: [u[4], { u: u[5], off: ['kick', 'bass', 'returns', 'NOT A KEY', 7] }, u[6]], depth: 0.8, slot: 7 })).json();
assert.deepEqual([macro.kind, macro.slot, macro.depth, macro.items], ['macro', 7, 0.8, [{ u: u[4] }, { u: u[5], off: ['kick', 'bass', 'returns'] }, { u: u[6] }]], 'each chip keeps the parts of the rig it does not take, well formed');
await j('/api/stacks', 'POST', { id: 'testmacro002', name: 'DROP', kind: 'stack', items: [u[7], u[8]], slot: 7 });
macro = await (await j('/api/stacks/testmacro001')).json();
assert.equal(macro.slot, null, 'the knob went to the stack put on it last');
assert.equal((await j('/api/stacks/testmacro001', 'PATCH', { slot: 2 })).status, 400, 'and it is refused a macro knob\'s place when it is moved, too');
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
assert.equal(tray.load, 2);
assert.equal(tray.macro_places, 4);
const mineOnly = (list) => list.filter((x) => x.id.startsWith('test'));
assert.deepEqual(mineOnly(tray.stacks).map((x) => [x.id, x.name, x.kind, x.uids]), [
  ['teststack001', 'DEEP ROLLERS', 'stack', [u[2], u[0]]],
  ['testsong0001', 'FRIDAY', 'song', [u[0], u[9], u[0]]],
], 'the stacks in the tray, in order, without the chip that has gone; the rule stack was not put in it');
assert.deepEqual(mineOnly(tray.stacks)[1].parts, [{ uid: u[0], bars: 16, morph: 0 }, { uid: u[9], bars: 32, morph: 4 }, { uid: u[0], bars: 8, morph: 0.5 }]);
assert.deepEqual(mineOnly(tray.knobs).map((x) => [x.id, x.slot, x.kind, x.name, x.depth, x.uids, x.off || null]), [
  ['testmacro001', 5, 'macro', 'LIFT', 0.8, [u[4], u[5], u[6]], [[], ['kick', 'bass', 'returns'], []]],
  ['testmacro002', 7, 'stack', 'DROP', null, [u[7], u[8]], null],
], 'the stack knobs, each on its place, each chip with what it does not take (said only where one of them leaves something)');
assert.ok(!mineOnly(tray.stacks).some((x) => x.id === 'testmacro002'), 'a stack on a knob is the knob\'s: it is not among the stacks for the library screen unless it is marked for that too');
// a stack that fills itself, and a song, go on no knob
assert.equal((await j('/api/stacks/testrule0001', 'PATCH', { slot: 9 })).status, 400);
assert.equal((await j('/api/stacks/testsong0001', 'PATCH', { slot: 9 })).status, 400);
// a module put on a place of the other kind by a page from before the rule (written straight into the table here) is
// put right the next time anything looks: to the first free place of its kind, in the order of the places they were in
{
  const before = await (await j('/api/stacks/testmacro001')).json();
  await j('/api/stacks/testmacro001', 'PATCH', { kind: 'stack' });
  // (nothing through the door can misplace one: this is what the tidy is for, so the check asks for it by the rule's own words)
  const listed = (await (await j('/api/stacks')).json()).stacks.filter((x) => x.id.startsWith('test') && x.slot);
  assert.deepEqual(listed.map((x) => [x.id, x.slot]).sort(), [['testmacro001', 5], ['testmacro002', 7]], 'what is in a place of its kind stays there');
  await j('/api/stacks/testmacro001', 'PATCH', { kind: before.kind });
}
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

// a knob macro (LEARN's kind): no chips, its moves; on a knob, LOAD is given them. What is not a move is left out.
const learnBody = { id: 'testlearn001', name: 'OPEN UP', kind: 'learn', depth: 0.8,
  extra: { links: [{ c: 'bass.cutoff', d: 0.4 }, { c: 'lead.cutoff', d: -0.25 }, { c: '', d: 1 }, { c: 'kick.punch', d: 'much' }, { c: 'pad.level', d: 7 }] } };
assert.equal((await j('/api/stacks', 'POST', { ...learnBody, slot: 9 })).status, 400, 'a macro knob is refused a stack knob\'s place');
let learn = await (await j('/api/stacks', 'POST', { ...learnBody, slot: 2 })).json();
assert.deepEqual([learn.kind, learn.items, learn.slot, learn.depth], ['learn', [], 2, 0.8]);
tray = await (await j('/api/load')).json();
const lk = tray.knobs.find((k) => k.id === 'testlearn001');
assert.deepEqual(lk, { id: 'testlearn001', slot: 2, kind: 'learn', name: 'OPEN UP', depth: 0.8, uids: [], links: [{ c: 'bass.cutoff', d: 0.4 }, { c: 'lead.cutoff', d: -0.25 }, { c: 'pad.level', d: 1 }] }, 'a macro knob on one of the first four places: its moves, well formed and within a whole turn');
assert.ok(!tray.stacks.some((x) => x.id === 'testlearn001'), 'a knob macro is a knob\'s and not a stack');
learn = await (await j('/api/stacks/testlearn001', 'PATCH', { slot: null })).json();
assert.ok(!(await (await j('/api/load')).json()).knobs.some((k) => k.id === 'testlearn001'), 'off its knob, it is not loaded');
if (!process.env.SEED) await j('/api/stacks/testlearn001?forget=1', 'DELETE');

// a snapshot's stems: SF-000's own file, kept whole; one stem of it by its key
{
  const enc = new TextEncoder(), parts = [['kick', enc.encode('OggS-kick-bytes')], ['bass', enc.encode('OggS-bass')], ['dub', enc.encode('OggS-dub-return')]];
  const head = enc.encode(`SF0STEMS1\n${JSON.stringify({ rate: 48000, bars: 4, stems: parts.map(([key, b]) => ({ key, bytes: b.length })) })}\n`);
  const file = new Uint8Array(head.length + parts.reduce((n, [, b]) => n + b.length, 0));
  file.set(head, 0);
  let at = head.length;
  for (const [, b] of parts) { file.set(b, at); at += b.length; }
  const put = (uid, bytes) => fetch(`${BASE}/api/stems/${uid}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
  assert.equal((await put('7e577e577e577e57-never-sent', file)).status, 404, 'the snapshot first');
  assert.equal((await put(u[0], file.slice(0, file.length - 3))).status, 400, 'a file cut short is not taken');
  assert.equal((await put(u[0], enc.encode('not stems at all'))).status, 400);
  const took = await (await put(u[0], file)).json();
  assert.deepEqual([took.ok, took.keys], [true, ['kick', 'bass', 'dub']]);
  assert.deepEqual((await (await j('/api/have', 'POST', { uids: [u[0]] })).json()).have[u[0]], { clip: true, stems: true, lossless: false });
  assert.deepEqual((await (await j(`/api/snapshots/${u[0]}`)).json()).stems, ['kick', 'bass', 'dub'], 'the snapshot says which stems it has');
  const whole = new Uint8Array(await (await fetch(`${BASE}/api/stems/${u[0]}`)).arrayBuffer());
  assert.deepEqual([...whole], [...file], 'the file comes back to the byte');
  const one = await fetch(`${BASE}/api/stems/${u[0]}?key=bass`);
  assert.equal(one.headers.get('content-type'), 'audio/ogg');
  assert.equal(new TextDecoder().decode(await one.arrayBuffer()), 'OggS-bass', 'one stem of it, by its key');
  assert.equal((await fetch(`${BASE}/api/stems/${u[0]}?key=lead`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/stems/${u[1]}`)).status, 404, 'one with none says so');
}

// ---- what the instrument sends so that the library can be studied away from it
// a snapshot's sound without loss: SF-000's own file, kept whole; one part of it by its key, with the gain it was written at
{
  const enc = new TextEncoder();
  const u = many.slice(0, 2).map((s) => s.uid);
  const parts = [['mix', enc.encode('fLaC-the-mix'), 1], ['kick', enc.encode('fLaC-kick'), 1], ['bass', enc.encode('fLaC-bass'), 0.25]];
  const head = enc.encode(`SF0LOSSLESS1\n${JSON.stringify({ rate: 48000, bars: 4, bits: 24, parts: parts.map(([key, b, gain]) => ({ key, bytes: b.length, gain })) })}\n`);
  const file = new Uint8Array(head.length + parts.reduce((n, [, b]) => n + b.length, 0));
  file.set(head);
  let at = head.length;
  for (const [, b] of parts) { file.set(b, at); at += b.length; }
  const put = (uid, bytes) => fetch(`${BASE}/api/lossless/${uid}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
  assert.equal((await put('7e577e577e577e57-never-sent', file)).status, 404, 'the snapshot first');
  assert.equal((await put(u[0], file.slice(0, file.length - 3))).status, 400, 'a file cut short is not taken');
  assert.equal((await put(u[0], enc.encode('SF0STEMS1\n{}\n'))).status, 400, 'nor a stems file');
  const took = await (await put(u[0], file)).json();
  assert.deepEqual([took.ok, took.keys], [true, ['mix', 'kick', 'bass']]);
  assert.equal((await (await j('/api/have', 'POST', { uids: [u[0]] })).json()).have[u[0]].lossless, true);
  assert.equal((await (await j('/api/have', 'POST', { uids: [u[1]] })).json()).have[u[1]].lossless, false);
  const whole = new Uint8Array(await (await fetch(`${BASE}/api/lossless/${u[0]}`)).arrayBuffer());
  assert.deepEqual([...whole], [...file], 'the file comes back to the byte');
  const one = await fetch(`${BASE}/api/lossless/${u[0]}?key=bass`);
  assert.deepEqual([one.headers.get('content-type'), one.headers.get('x-gain')], ['audio/flac', '0.25']);
  assert.equal(new TextDecoder().decode(await one.arrayBuffer()), 'fLaC-bass', 'one part of it, by its key');
  assert.equal((await fetch(`${BASE}/api/lossless/${u[0]}?key=lead`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/lossless/${u[1]}`)).status, 404, 'one with none says so');
}
// a sound file a snapshot needs: kept under its SHA-256, and only if it is the file that name says
{
  const bytes = new TextEncoder().encode('RIFF....WAVEfmt a made-up sample ' + Date.now());
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const wrong = 'f'.repeat(64);
  assert.deepEqual((await (await j('/api/files/have', 'POST', { hashes: [sha, wrong, 'nonsense'] })).json()).have, {});
  assert.equal((await fetch(`${BASE}/api/files/${wrong}?name=kick.wav`, { method: 'PUT', body: bytes })).status, 400, 'not the file its name says');
  assert.equal((await fetch(`${BASE}/api/files/nothex`, { method: 'PUT', body: bytes })).status, 400);
  let r2 = await (await fetch(`${BASE}/api/files/${sha}?name=${encodeURIComponent('my kick.wav')}`, { method: 'PUT', body: bytes })).json();
  assert.deepEqual([r2.ok, r2.size, r2.had], [true, bytes.length, false]);
  r2 = await (await fetch(`${BASE}/api/files/${sha}?name=other.wav`, { method: 'PUT', body: bytes })).json();
  assert.equal(r2.had, true, 'sent again: kept once');
  assert.deepEqual((await (await j('/api/files/have', 'POST', { hashes: [sha, wrong] })).json()).have, { [sha]: true });
  const back = await fetch(`${BASE}/api/files/${sha}`);
  assert.equal(decodeURIComponent(back.headers.get('x-name')), 'my kick.wav', 'under the name it first came with');
  assert.deepEqual([...new Uint8Array(await back.arrayBuffer())], [...bytes], 'the file comes back to the byte');
  assert.equal((await fetch(`${BASE}/api/files/${wrong}`)).status, 404);
}
// the instrument's log of what was done with the chips: each line kept once, in the order it happened
{
  const lib = 'ac710457e57ac710';
  const t0 = Date.now() - 100000;
  const run = Math.random().toString(36).slice(2, 8);
  const lines = [
    { k: `${run}-0001`, t: t0 + 10, a: 'hear', u: real.uid, parts: 2047, from: 'bin' },
    { k: `${run}-0002`, t: t0 + 20, a: 'recall', u: real.uid, parts: 2047, notes: true },
    { k: `${run}-0003`, t: t0 + 30, a: 'add', u: real.uid, to: 'stack', name: 'BREAKS' },
  ];
  assert.equal((await j('/api/actions', 'POST', { lines })).status, 400, 'which library?');
  let r3 = await (await j('/api/actions', 'POST', { library: lib, lines: [...lines, { k: 'x', a: 'bad' }, null] })).json();
  assert.deepEqual([r3.ok, r3.taken, r3.refused], [true, 3, 2]);
  r3 = await (await j('/api/actions', 'POST', { library: lib, lines: [lines[2], { k: `${run}-0004`, t: t0 + 40, a: 'part', u: old.uid, at: 2 }] })).json();
  assert.equal(r3.taken, 2, 'one sent again is taken and kept once');
  const got3 = await (await j(`/api/actions?library=${lib}&after=${t0}`)).json();
  const mine = got3.actions.filter((x) => x.k.startsWith(run));
  assert.deepEqual(mine.map((x) => x.a), ['hear', 'recall', 'add', 'part'], 'each once, oldest first');
  assert.deepEqual(mine[0], lines[0], 'a line comes back as it went in');
  assert.deepEqual((await (await j(`/api/actions?library=${lib}&after=${t0 + 25}`)).json()).actions.filter((x) => x.k.startsWith(run)).map((x) => x.a), ['add', 'part']);
  assert.equal((await j('/api/actions?library=nope')).status, 400);
}
// the session as it stood, without its chips: kept when it has changed, each its own file
{
  const lib = 'ac710457e57ac710';
  const at = Date.now();
  const session = { sf000: 1, modules: [{ id: 'm1', name: 'LIVE SET 1' }], keptKnobs: [], stacks: [], stamp: at };
  assert.equal((await j('/api/sessions', 'POST', { library: lib, at })).status, 400, 'no session');
  let r4 = await (await j('/api/sessions', 'POST', { library: lib, at, app: '0.1.0 test', session })).json();
  assert.deepEqual([r4.ok, r4.at, !!r4.same], [true, at, false]);
  r4 = await (await j('/api/sessions', 'POST', { library: lib, at: at + 1000, app: '0.1.0 test', session })).json();
  assert.equal(r4.same, true, 'the same thing sent again is not kept twice');
  r4 = await (await j('/api/sessions', 'POST', { library: lib, at: at + 2000, app: '0.1.0 test', session: { ...session, modules: [...session.modules, { id: 'm2', name: 'DUB SET' }] } })).json();
  assert.deepEqual([r4.ok, r4.at, !!r4.same], [true, at + 2000, false]);
  const listed = (await (await j(`/api/sessions?library=${lib}`)).json()).sessions;
  assert.deepEqual(listed.slice(0, 2).map((x) => x.at), [at + 2000, at], 'the newest first; the one that was the same is not among them');
  assert.deepEqual(await (await j(`/api/sessions/${lib}/${at}`)).json(), session, 'it comes back as it went in');
  assert.equal((await (await j(`/api/sessions/${lib}/${at + 2000}`)).json()).modules.length, 2);
  assert.equal((await j(`/api/sessions/${lib}/${at + 1000}`)).status, 404);
}

const st = await (await j('/api/stats')).json();
assert.ok(st.snapshots >= many.length + 2 && st.clips >= 1 && st.defs >= 30 && st.libraries >= 2);
assert.ok(st.stacks >= 5 && st.in_tray >= 1);
assert.ok(st.archive.lossless >= 1 && st.archive.files >= 1 && st.archive.actions >= 4 && st.archive.sessions >= 2, 'what the instrument sent is counted');
if (!process.env.SEED) for (const id of ['teststack001', 'testmacro001', 'testmacro002', 'testsong0001', 'testrule0001']) await j(`/api/stacks/${id}?forget=1`, 'DELETE');

if (!process.env.SEED) {
  for (const s of [real, old, ...many]) await j(`/api/snapshots/${s.uid}?forget=1`, 'DELETE');
}
console.log(`live tests ok (${BASE})${process.env.SEED ? ': a made-up library is left to look at' : ''}`);
