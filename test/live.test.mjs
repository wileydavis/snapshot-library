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

const st = await (await j('/api/stats')).json();
assert.ok(st.snapshots >= many.length + 2 && st.clips >= 1 && st.defs >= 30 && st.libraries >= 2);

if (!process.env.SEED) {
  for (const s of [real, old, ...many]) await j(`/api/snapshots/${s.uid}?forget=1`, 'DELETE');
}
console.log(`live tests ok (${BASE})${process.env.SEED ? ': a made-up library is left to look at' : ''}`);
