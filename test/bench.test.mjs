// The bench, pressed and dragged as a hand does it, in a real browser with no window:
//   npm run dev                (in another terminal)
//   npm run test:bench
// It needs Chrome (CHROME=/path/to/chrome if it is not at /usr/bin/google-chrome) and a server on
// localhost: it seeds its own made-up library if there is none, makes stacks, and takes its
// stacks away when it is done. SHOTS=dir keeps a picture after each part.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { seeded } from './seed.mjs';
import { library, clip } from './sample.mjs';

const BASE = process.env.BASE || 'http://localhost:8787';
const SHOTS = process.env.SHOTS || '';
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('the bench checks change the library: they run against a local server only');
const j = (path, method = 'GET', body) => fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
const get = async (path) => (await j(path)).json();

// a library to work on
const want = seeded(240);
if (!(await get('/api/snapshots')).snapshots.some((s) => s.uid === want[0].uid)) {
  for (let i = 0; i < want.length; i += 8) {
    await Promise.all(want.slice(i, i + 8).map(async (s, k) => {
      await j('/api/snapshots', 'POST', { snapshot: s, defs: i + k === 0 ? library.defs : undefined });
      if (s.id % 5 !== 0) await fetch(`${BASE}/api/clips/${s.uid}`, { method: 'PUT', headers: { 'content-type': 'audio/ogg' }, body: clip });
    }));
  }
}
const stacksBefore = new Set((await get('/api/stacks')).stacks.map((s) => s.id));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 60000 });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// (things fly to their places, and what was asked of the server comes back: wait until the bench is still)
const settle = async () => { await wait(160); await page.waitForFunction(() => !window.sfLibrary.bench.running, { timeout: 20000, polling: 50 }); await wait(120); await page.waitForFunction(() => !window.sfLibrary.bench.running, { timeout: 20000, polling: 50 }); };
const S = (fn, ...args) => page.evaluate(fn, ...args);
const state = () => S(() => {
  const s = window.sfLibrary.state;
  return { n: s.all.length, open: s.open && { key: s.open.key, name: s.open.name, kind: s.open.kind, temp: !!s.open.temp, items: s.open.items.map((it) => it.u) },
           shown: s.shown.map((d) => d.uid), selected: s.selected, playing: s.playing, marked: [...s.marked], stacks: s.stacks.map((x) => ({ id: x.id, name: x.name, kind: x.kind, load: x.load, slot: x.slot, n: x.items.length })),
           sorted: s.sorted ? s.sorted.length : 0, made: window.sfLibrary.bench.items.size, status: document.getElementById('status').textContent };
});
const where = (what, ...args) => S((w, a) => window.sfLibrary.bench[w](...a), what, args);
const click = async (p, opts = {}) => { await page.mouse.move(p.x, p.y); if (opts.shift) await page.keyboard.down('Shift'); await page.mouse.down(); await page.mouse.up(); if (opts.shift) await page.keyboard.up('Shift'); await settle(); };
const drag = async (a, b) => {
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12); await wait(25); }
  await wait(120); await page.mouse.up(); await settle();
};
const key = async (id) => { await page.click(`#${id}`); await settle(); };
// a pile pressed (its row of the rack turned to first, as the wheel would)
const pile = async (k) => { await S((x) => window.sfLibrary.bench.revealPile(x), k); await settle(); const at = await where('wherePile', k); await click(at); };
const type = async (id, text) => { await page.focus(`#${id}`); await S((i) => document.getElementById(i).select(), id); await page.keyboard.type(text); await page.keyboard.press('Enter'); await settle(); };
let shotN = 0;
const shot = async (name) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${String(++shotN).padStart(2, '0')}-${name}.png` }); } };
const stack = async (id) => get(`/api/stacks/${id}`);
const part = (name) => console.log(`  ok  ${name}`);

await settle();
let st = await state();
// 1. it opens on everything, and makes only the chips that show
assert.equal(st.n >= 240, true);
assert.equal(st.open.key, 'all');
assert.equal(st.shown.length, st.n);
assert.ok(st.made > 8 && st.made <= 60, `of ${st.n} chips, ${st.made} are made: the rows that show`);
await shot('all');
part(`the whole library dealt (${st.n} chips, ${st.made} of them made)`);

// 2. a pile pressed is dealt out; a chip pressed is chosen and heard; space stops it
await pile('mood:dark');
st = await state();
assert.equal(st.open.key, 'mood:dark');
assert.ok(st.shown.length > 3 && st.shown.length < st.n);
await click(await where('whereChip', 1));
st = await state();
assert.equal(st.selected, st.shown[1]);
const hasClip = (await get(`/api/snapshots/${st.selected}`)).has_clip;
assert.equal(st.playing, hasClip ? st.selected : null, 'a chip with its sound kept plays when it is pressed');
await page.keyboard.press('ArrowRight'); await wait(150);
st = await state();
assert.equal(st.selected, st.shown[2], 'the arrows move along the chips');
await page.keyboard.press(' '); await wait(100);
if ((await state()).playing) { await page.keyboard.press(' '); await wait(100); }
assert.equal((await state()).playing, null);
await shot('dark');
part('a pile dealt, a chip chosen and heard, the arrows and space');

// 3. marked chips become a stack; it is named; it is in the library
await click(await where('whereChip', 0), { shift: true });
await click(await where('whereChip', 3), { shift: true });
st = await state();
assert.deepEqual(st.marked.sort(), [st.shown[0], st.shown[3]].sort());
const firstTwo = [st.shown[0], st.shown[3]];
await key('m-stack');
st = await state();
assert.equal(st.open.kind, 'stack');
assert.deepEqual(st.open.items, firstTwo, 'the marked, in the order they lay');
const mine = st.open.key.slice(3);
await type('s-name', 'night rollers');
assert.equal((await stack(mine)).name, 'NIGHT ROLLERS');
await key('unmark');
await shot('stack');
part('STACK THEM makes a stack of the marked, and its name is kept');

// 4. a chip dragged onto a stack's pocket goes in it; the stack's own chips are put in order by dragging
await pile('all');
st = await state();
const extra = st.shown[5];
await drag(await where('whereChip', 5), await where('wherePile', `st:${mine}`));
assert.deepEqual((await stack(mine)).items.map((x) => x.u), [...firstTwo, extra], 'dropped on its pocket, it is in the stack');
await drag(await where('whereChip', 5), await where('wherePile', `st:${mine}`));
assert.equal((await stack(mine)).items.length, 3, 'a chip is in a stack once');
await pile(`st:${mine}`);
await drag(await where('whereChip', 0), { x: (await where('whereChip', 2)).x + 60, y: (await where('whereChip', 2)).y });
assert.deepEqual((await stack(mine)).items.map((x) => x.u), [firstTwo[1], extra, firstTwo[0]], 'dragged past the last, the first chip is now the last');
await shot('ordered');
part('a chip dragged into a stack, and a stack put in order by hand');

// 5. taken out of a stack, a chip stays in the library
await click(await where('whereChip', 1));
await page.keyboard.press('Backspace'); await settle();
assert.deepEqual((await stack(mine)).items.map((x) => x.u), [firstTwo[1], firstTwo[0]]);
assert.equal((await j(`/api/snapshots/${extra}`)).status, 200, 'it is still in the library');
part('TAKE OUT leaves the chip in the library');

// 6. the tray: TO SF-000 puts the stack in it, dragged out it leaves, dragged in it is back; LOAD says what SF-000 gets
await key('s-load');
assert.equal((await stack(mine)).load, true);
let tray = await get('/api/load');
assert.deepEqual(tray.stacks.find((x) => x.id === mine).uids, [firstTwo[1], firstTwo[0]]);
await S((x) => window.sfLibrary.bench.revealPile(x), `st:${mine}`); await settle();
await drag(await where('wherePile', `st:${mine}`, true), await where('whereChip', 6));        // (its plate in the rack, dragged onto the table: out of the tray)
assert.equal((await stack(mine)).load, false, 'dragged out of the tray');
await drag(await where('wherePile', `st:${mine}`, true), await where('whereTray'));
assert.equal((await stack(mine)).load, true, 'dragged into the tray');
await shot('tray');
part('the tray: in by its key, out and in again by hand, and /api/load has it');

// 7. LIKE THIS: the nearest, kept as a stack that fills itself, then frozen
await pile('all');
await click(await where('whereChip', 2));
const seed = (await state()).selected;
await key('like');
st = await state();
assert.equal(st.open.temp, true);
assert.equal(st.open.items[0], seed, 'itself first');
assert.equal(st.open.items.length, 24);
await key('s-keep');
st = await state();
const likeId = st.open.key.slice(3);
let kept = await stack(likeId);
assert.deepEqual([kept.kind, kept.rule.type, kept.rule.uid, kept.items.length], ['rule', 'like', seed, 24]);
await key('s-freeze');
kept = await stack(likeId);
assert.deepEqual([kept.kind, kept.rule, kept.items.length], ['stack', null, 24], 'frozen: an ordinary stack of what it held');
await shot('like');
part('LIKE THIS, kept as a stack that fills itself, and frozen');

// 8. SONG FROM THIS: parts in a line with their bars, kept as a song; a part's bars are set
await pile('all');
await click(await where('whereChip', 2));
await key('song');
st = await state();
assert.equal(st.open.kind, 'song');
assert.equal(st.open.items.length, 8);
assert.ok(st.open.items.includes(seed));
await key('s-keep');
const songId = (await state()).open.key.slice(3);
let song = await stack(songId);
assert.equal(song.kind, 'song');
assert.ok(song.items.every((x) => x.bars >= 1 && x.morph >= 0) && song.items[0].morph === 0);
await click(await where('whereChip', 3));
await type('c-bars', '24');
song = await stack(songId);
assert.equal(song.items[3].bars, 24, 'the chosen part lasts what it was set to');
await key('s-load');
tray = await get('/api/load');
const sent = tray.stacks.find((x) => x.id === songId);
assert.deepEqual([sent.kind, sent.parts.length, sent.parts[3].bars], ['song', 8, 24]);
await shot('song');
part('SONG FROM THIS, kept as a song, a part\'s bars set, and loaded as parts');

// 9. KNOB FROM THIS: a macro, calm to full; it is given a knob; chips dropped on an empty knob make another
await pile('all');
await click(await where('whereChip', 2));
await key('knob');
st = await state();
assert.equal(st.open.kind, 'macro');
assert.ok(st.open.items.length >= 2 && st.open.items.length <= 3);
await key('s-keep');
const macroId = (await state()).open.key.slice(3);
await page.select('#s-knob', '4'); await settle();
assert.equal((await stack(macroId)).slot, 4);
await type('s-depth', '70');
assert.equal((await stack(macroId)).depth, 0.7);
await pile('all');
// chips dropped on an empty knob are a cue stack on it (the knob will step through them); more dropped there join it
const onto7 = (await state()).shown[9];
await drag(await where('whereChip', 9), await where('whereBay', 7));
st = await state();
const seven = st.stacks.find((x) => x.slot === 7);
assert.ok(seven && seven.kind === 'stack' && seven.n === 1, 'chips dropped on an empty knob make a cue stack there, not a macro');
assert.equal(st.open.key, 'all', 'and what was being looked through stays out');
await drag(await where('whereChip', 10), await where('whereBay', 7));
assert.equal((await stack(seven.id)).items.length, 2);
assert.equal((await stack(seven.id)).items[0].u, onto7);
tray = await get('/api/load');
assert.deepEqual(tray.knobs.map((k) => [k.slot, k.kind]).sort((x, y) => x[0] - y[0]), [[4, 'macro'], [7, 'stack']], 'LOAD says which knob sweeps and which steps');
assert.equal(tray.knobs.find((k) => k.slot === 4).depth, 0.7);
assert.ok(tray.stacks.some((x) => x.id === seven.id), 'a stack on a knob is among the instrument\'s stacks too');
await drag(await where('whereBay', 7), await where('whereBay', 12));               // (the cue stack on knob 7, dragged to knob 12)
assert.deepEqual([(await stack(seven.id)).slot, (await stack(seven.id)).name], [12, 'CUE 12'], 'dragged to another knob it is on that knob, and still called by its knob');
// a stack made by hand goes on a knob the same way (by its pocket, or KNOB on the bar); a macro put where a stack is takes the knob
await S((x) => window.sfLibrary.bench.revealPile(x), `st:${mine}`); await settle();
await drag(await where('wherePile', `st:${mine}`, true), await where('whereBay', 2));
assert.equal((await stack(mine)).slot, 2, 'a stack dragged onto a knob is a cue stack there');
await pile(`st:${macroId}`);
await page.select('#s-knob', '2'); await settle();
assert.deepEqual([(await stack(macroId)).slot, (await stack(mine)).slot], [2, null], 'a knob holds one thing');
await page.select('#s-knob', '4'); await settle();
await shot('knobs');
part('KNOB FROM THIS makes a macro and it is given a knob; chips dropped on a knob are a cue stack; stacks and macros move between knobs');

// 10. a mood from examples
await pile('mood:bright');
for (const i of [0, 1, 2, 4]) await click(await where('whereChip', i), { shift: true });
await key('m-mood');
st = await state();
assert.equal(st.open.temp, true);
assert.ok(st.marked.every((u) => st.open.items.includes(u)), 'the mood made from the marked holds the marked');
assert.ok(st.open.items.length < st.n / 2);
await type('s-name', 'glassy');
await key('s-keep');
const moodId = (await state()).open.key.slice(3);
kept = await stack(moodId);
assert.deepEqual([kept.name, kept.kind, kept.rule.type], ['GLASSY', 'rule', 'mood']);
assert.ok(kept.rule.t && kept.rule.w && kept.rule.cut > 0);
await key('unmark');
part('MOOD FROM THEM: what the marked share, kept as a stack that fills itself');

// 11. AUTO SORT: the library dealt into piles; one kept; put away
await key('autosort');
st = await state();
assert.ok(st.sorted >= 3);
await pile('auto:0');
st = await state();
assert.equal(st.open.key, 'auto:0');
await shot('sorted');
await key('s-keep');
const pileId = (await state()).open.key.slice(3);
assert.equal((await stack(pileId)).kind, 'stack');
await key('autosort');
assert.equal((await state()).sorted, 0);
part('AUTO SORT deals the library into piles, one is kept, and they are put away');

// 12. FIND and ORDER on what is dealt
await pile('all');
await type('find', 'snap 01');
st = await state();
assert.equal(st.shown.length, 13, 'every word is looked for: SNAP 001, 010 to 019, 101 and 201');
await page.select('#order', 'energy-up'); await settle();
const energies = await S(() => window.sfLibrary.state.shown.map((d) => d.s.p.energy));
for (let i = 1; i < energies.length; i++) assert.ok(energies[i - 1] <= energies[i]);
await type('find', ' ');
await page.select('#order', 'own'); await settle();
assert.equal((await state()).shown.length, (await state()).n);
part('FIND narrows what is dealt and ORDER orders it');

// 13. a chip's name and tags; tags on the marked
await click(await where('whereChip', 0));
const renamed = (await state()).selected;
await type('c-name', 'the opener');
await type('c-tags', 'Warm, set a');
let one = await get(`/api/snapshots/${renamed}`);
assert.deepEqual([one.name, one.tags], ['THE OPENER', ['warm', 'set a']]);
await click(await where('whereChip', 1), { shift: true });
await click(await where('whereChip', 2), { shift: true });
const two = (await state()).marked;
await type('m-tag', 'friday, -nothing');
for (const u of two) assert.deepEqual((await get(`/api/snapshots/${u}`)).tags, ['friday']);
await key('unmark');
await j(`/api/snapshots/${renamed}`, 'PATCH', { name: want.find((s) => s.uid === renamed).name, tags: [] });
await j('/api/tags', 'POST', { uids: two, remove: ['friday'] });
part('a chip named and tagged on its strip; a tag put on the marked');

// 14. scrolling: a long stack costs a screenful
await page.mouse.move(600, 600);
for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: 300 }); await wait(40); }
await settle();
st = await state();
const scrolled = await S(() => window.sfLibrary.bench.scrollTo);
assert.ok(scrolled > 20, `the table has moved on (${scrolled} rows)`);
assert.ok(st.made <= 60, `and ${st.made} chips are made`);
await page.mouse.move(600, 150);
const rowWas = await S(() => window.sfLibrary.bench.rackRow);
await page.mouse.wheel({ deltaY: 200 }); await settle();
assert.equal(await S(() => window.sfLibrary.bench.rackRow), rowWas + 1, 'over the rack the wheel turns its rows');
await page.mouse.wheel({ deltaY: -200 }); await settle();
part('the wheel moves the table, or the rack\'s rows, by where the pointer is');

// 15. a smaller window: fewer columns, everything still there
await page.setViewport({ width: 1180, height: 760, deviceScaleFactor: 1 });
await settle(); await settle();
const cols = await S(() => window.sfLibrary.bench.columns());
assert.ok(cols >= 2 && cols < 4);
assert.equal((await state()).shown.length, (await state()).n);
await shot('small');
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
await settle(); await settle();
part(`a smaller window lays the table in ${cols} columns`);

// 16. the dark library (D, as on the instrument): everything is printed again, and it stays as it was left
const lookWas = await S(() => document.body.classList.contains('night'));
await page.keyboard.press('d'); await settle();
assert.equal(await S(() => document.body.classList.contains('night')), !lookWas);
assert.equal(await S(() => window.sfLibrary.bench.dark), !lookWas);
assert.equal(await S(() => localStorage.getItem('sf-library-night')), lookWas ? '0' : '1', 'the choice is kept');
assert.ok((await state()).made > 8, 'the chips are on the table in the other look');
await shot('night');
await pile('mood:dub');
await shot('night-dub');
await pile('all');
await page.keyboard.press('d'); await settle();
assert.equal(await S(() => document.body.classList.contains('night')), lookWas);
await S(() => localStorage.removeItem('sf-library-night'));
part('D turns the library dark and back, and the choice is kept');

// 17. REMOVE STACK asks twice; the chips stay
await pile(`st:${pileId}`);
const held = (await stack(pileId)).items[0].u;
await key('s-remove');
assert.equal((await j(`/api/stacks/${pileId}`)).status, 200, 'once is not enough');
await key('s-remove');
assert.equal((await j(`/api/stacks/${pileId}`)).status, 404);
assert.equal((await j(`/api/snapshots/${held}`)).status, 200, 'its chips are in the library');
assert.equal((await state()).open.key, 'all');
part('REMOVE STACK pressed twice takes the stack away and leaves its chips');

assert.deepEqual(errors, [], 'nothing went wrong in the page');
await shot('end');
await browser.close();

// its stacks are taken away again
for (const s of [...(await get('/api/stacks')).stacks, ...(await get('/api/stacks?removed=1')).stacks]) if (!stacksBefore.has(s.id)) await j(`/api/stacks/${s.id}?forget=1`, 'DELETE');
console.log(`bench tests ok (${BASE})`);
