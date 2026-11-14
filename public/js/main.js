// The library as a bench (index.html). bench.js draws the things and feels the hand; stacks.js
// fills the stacks that fill themselves; this file knows what there is: the chips, the stacks,
// which stack is open, what is selected, and what each press and each drop means. Everything is
// worked out here from two lists (the snapshots, the stacks); the server is asked only to keep a change.
import { MEASURES, unpack } from './profile.js';
import { when as whenText, setNight, moveName, partName } from './card.js';
import * as stems from './stems.js';
import { narrow } from './narrow.js';
import * as rules from './stacks.js';
import { Bench } from './bench.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const up = (t) => String(t || '').toUpperCase();

const state = {
  all: [],                  // every snapshot, as /api/snapshots gives them, each with .p (profile unpacked)
  byUid: new Map(),
  stacks: [],               // the stacks kept in the library, as /api/stacks gives them
  open: null,               // the stack dealt on the table: { key, name, kind, items: [{ u, bars, morph }], stack, rule, temp }
  shown: [],                // its chips as they lie (after FIND and ORDER): [{ uid, s, label, n, part }]
  selected: null, selectedN: 0, playing: null,
  marked: new Set(),
  sorted: null,             // AUTO SORT's piles, while they are out
  off: new Map(),           // the keys put out on chips lying on the table from a pile that is not a stack of your own: uid -> [part, ...]
  build: null,              // the stack knob in the column: its stack's id
  where: 'table',           // where the selected chip was pressed: 'table' or 'column'
  armed: null,              // 'chip' or 'stack': REMOVE pressed once
  version: 0,               // goes up when the snapshots or the stacks change: what is worked out from them is kept until then
};
const audio = $('audio');
let bench = null;
const memo = new Map();
const cached = (key, make) => { const k = `${state.version}|${key}`; if (!memo.has(k)) { if (memo.size > 400) memo.clear(); memo.set(k, make()); } return memo.get(k); };

async function api(path, options) {
  const r = await fetch(path, { credentials: 'same-origin', ...options });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status}`);
  return r;
}
const send = (path, method, body) => api(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const say = (text) => { $('status').textContent = text; };
// (a chip by its uid. The moves of the knob macro that is open are plates on the table too, and are found the same way.)
const chip = (uid) => state.byUid.get(uid) || (state.moves && state.moves.get(uid)) || null;
const linksOf = (s) => (s && s.extra && Array.isArray(s.extra.links) ? s.extra.links : []);
const stackOf = (key) => (key && key.startsWith('st:') ? state.stacks.find((s) => s.id === key.slice(3)) || null : null);
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const changed = () => { state.version++; };

// ---------------------------------------------------------------- what each stack holds
const here = (items) => items.filter((it) => state.byUid.has(it.u));             // (a chip removed from the library is in no stack)
// A kept stack's chips now: its own list, or what its rule gives.
function itemsOf(s) {
  return cached(`items:${s.id}`, () => here(s.kind === 'rule' && s.rule ? rules.fill(s.rule, state.all) : s.items || []));
}
const allByTime = () => cached('all', () => [...state.all].sort((a, b) => rules.when(b) - rules.when(a)).map((s) => ({ u: s.uid })));
const sittings = () => cached('sittings', () => rules.sittings(state.all));
const KIND = { stack: '', macro: 'STACK', song: 'SONG', rule: 'RULE', learn: 'MACRO' };
// SF-000's snapshot module: its places 1 to 4 take a macro knob (a knob's moves), 5 to 16 a stack knob (chips in an order).
const MACRO_PLACES = 4, STACK_MOST = 128;
const placeKind = (slot) => (slot <= MACRO_PLACES ? 'macro' : 'stack');
const plain = (s) => !!s && (s.kind === 'stack' || s.kind === 'macro');          // a stack of chips of your own (one called a macro, from before the two kinds, is one)
const knobKindOf = (s) => (!s ? null : s.kind === 'learn' || (s.kind === 'macro' && !(s.items || []).length && linksOf(s).length) ? 'macro' : plain(s) ? 'stack' : null);
const freePlace = (kind) => { for (let n = kind === 'macro' ? 1 : MACRO_PLACES + 1; n <= (kind === 'macro' ? MACRO_PLACES : 16); n++) if (!state.stacks.some((x) => x.slot === n)) return n; return 0; };
const buildStack = () => (state.build ? state.stacks.find((x) => x.id === state.build && plain(x)) || null : null);
const withOff = (it, off) => { const { off: was, ...rest } = it; void was; return off && off.length ? { ...rest, off } : rest; };
const names = (parts) => parts.map(partName).join(', ');
const sittingName = (sit) => `${whenText(sit.from)}`.replace(/\s+/g, ' ');

// Every pile there is, by key: what the rack shows and what a press on one opens.
function pileList() {
  return cached('piles', () => {
    const list = [];
    const add = (key, name, items, tone, more = {}) => list.push({ key, name, items, tone, ...more });
    add('all', 'ALL', allByTime(), 'black');
    add('unsorted', 'UNSORTED', rules.unsorted(state.all, state.stacks).map((u) => ({ u })), 'black');
    add('recent', 'RECENT', rules.recent(state.all).map((u) => ({ u })), 'black');
    for (const s of state.stacks) add(`st:${s.id}`, s.name || 'UNNAMED', itemsOf(s), 'white', { kind: KIND[s.kind] || '', stack: s, lamp: inTray(s), knob: knobOf(s) });
    add('new', '+ NEW STACK', [], 'grey', { add: true });
    for (const [id, m] of Object.entries(rules.MOODS)) {
      const items = rules.mood(state.all, m).map((u) => ({ u }));
      if (items.length) add(`mood:${id}`, m.name, items, 'blue', { kind: 'MOOD', rule: { type: 'mood', mood: id } });
    }
    sittings().slice(0, 6).forEach((sit) => add(`sit:${sit.from}`, sittingName(sit), sit.uids.map((u) => ({ u })), 'grey', { kind: 'SITTING' }));
    (state.sorted || []).forEach((p, i) => add(`auto:${i}`, p.name, p.uids.map((u) => ({ u })), 'amber', { kind: 'SORTED' }));
    return list;
  });
}
const pileOf = (key) => pileList().find((p) => p.key === key) || null;
// What kind of knob a stack is, if it is one: a macro knob (its moves) always; a stack of chips once it is on the module.
function knobOf(s) {
  const kind = knobKindOf(s) === 'macro' ? 'learn' : plain(s) && s.slot ? 'stack' : '';
  if (!kind) return null;
  const n = itemsOf(s).length, m = linksOf(s).length;
  const count = kind === 'learn' ? `${m} MOVE${m === 1 ? '' : 'S'}` : `${n} CHIP${n === 1 ? '' : 'S'}`;
  return { kind, slot: s.slot || 0, depth: s.depth === null || s.depth === undefined ? 1 : s.depth, count };
}
// In the tray: on one of its knobs (a macro, which sweeps, or a stack, which steps: a cue stack), or a stack marked for it.
// For SF-000: on the module (one of its sixteen knobs), or in the list under it (the stacks its own LIBRARY screen steps through).
const inList = (s) => s.kind !== 'macro' && s.kind !== 'learn' && !!s.load;
const inTray = (s) => !!s.slot || inList(s);
const heatsOf = (items) => items.slice(0, 4000).map((it) => { const s = chip(it.u); return s && s.p ? s.p.bright : -1; });

// ---------------------------------------------------------------- drawing: the rack, the tray, the table, the strips
function showRack() {
  const piles = pileList().map((p) => ({
    key: p.key, name: p.name, count: p.items.length, tone: p.tone, kind: p.kind || '', lamp: !!p.lamp, add: !!p.add, knob: p.knob || null,
    heats: heatsOf(p.items), top: p.items.length ? chip(p.items[0].u) : null, open: !!state.open && state.open.key === p.key,
  }));
  if (state.open && state.open.temp) {            // a stack not kept yet stands in the rack while it is out, after RECENT
    const o = state.open;
    piles.splice(3, 0, { key: 'temp', name: o.name, count: o.items.length, tone: 'amber', kind: 'NEW', heats: heatsOf(o.items), top: o.items.length ? chip(o.items[0].u) : null, open: true });
  }
  bench.setRack(piles);
  const bays = Array.from({ length: 16 }, (_, i) => {
    const s = state.stacks.find((x) => x.slot === i + 1);
    return s ? { key: `st:${s.id}`, name: s.name, knob: knobOf(s), heats: heatsOf(itemsOf(s)), open: (!!state.open && state.open.key === `st:${s.id}`) || state.build === s.id } : { key: null, name: '' };
  });
  const loaded = state.stacks.filter(inList).map((s) => ({ key: `st:${s.id}`, name: s.name || 'UNNAMED', count: itemsOf(s).length, heats: heatsOf(itemsOf(s)), open: !!state.open && state.open.key === `st:${s.id}` }));
  bench.setTray({ bays, stacks: loaded });
}

// The open stack's chips as they lie: FIND narrows them, ORDER orders them (AS IT IS STACKED: its own order).
function lay() {
  const o = state.open;
  state.moves = null;
  if (!o) { state.shown = []; return; }
  if (o.moves) {                                    // a knob macro: its moves, in the order it has them
    state.moves = new Map();
    state.shown = linksOf(o.stack).map((l, i) => {
      const uid = `move:${l.c}`, s = { uid, name: moveName(l.c), move: l, tags: [], p: null, has_clip: false };
      state.moves.set(uid, s);
      return { uid, s, n: 0, part: i, item: l, label: i };
    });
    return;
  }
  const count = new Map();
  const own = plain(o.stack);
  let list = here(o.items).map((it, i) => {
    const n = count.get(it.u) || 0; count.set(it.u, n + 1);
    // (its keys: in a stack of your own, what the stack says this chip takes; anywhere else, what was put out on it here, which goes with it into a stack)
    return { uid: it.u, s: chip(it.u), n, part: i, item: it, off: o.kind === 'song' ? null : own ? it.off || [] : state.off.get(it.u) || [] };
  });
  const order = $('order').value, find = $('find').value.trim();
  if (find || order !== 'own') {
    const keep = narrow(list.map((d) => d.s), { find, order: order === 'own' ? 'none' : order, near: chip(state.selected) });
    if (order === 'own') { const ok = new Set(keep.map((s) => s.uid)); list = list.filter((d) => ok.has(d.uid)); }
    else { const first = new Map(); list.forEach((d) => { if (!first.has(d.uid)) first.set(d.uid, d); }); list = [...new Set(keep.map((s) => s.uid))].map((u) => first.get(u)); }
  }
  list.forEach((d, i) => { d.label = i; });
  state.shown = list;
}
const orders = () => !!state.open && state.open.editable && $('order').value === 'own' && !$('find').value.trim();

function showTable({ from = null, keepScroll = false } = {}) {
  lay();
  bench.deal(state.shown, { from, keepScroll });
  bench.setMarks({ selected: state.selected, playing: state.playing, marked: state.marked });
  showBar(); showChip(); showFoot();
}

// The column: the stack knob being built, as its stack has it now.
function showColumn() {
  const b = buildStack();
  if (state.build && !b) { state.build = null; try { localStorage.removeItem('sf-library-build'); } catch { /* no storage here */ } }
  bench.setColumn(b ? { key: `st:${b.id}`, name: b.name, slot: b.slot || 0, chips: here(b.items).map((it) => ({ uid: it.u, s: chip(it.u), off: it.off || [] })) } : null);
  const add = $('b-add'), name = $('b-name');
  add.querySelector('span').textContent = b && b.slot ? `ON KNOB ${b.slot}: TAKE OFF` : 'ADD TO MODULE';
  add.disabled = !b || !here(b.items).length;
  add.setAttribute('aria-pressed', String(!!(b && b.slot)));
  if (document.activeElement !== name) name.value = b ? up(b.name) : '';
  name.disabled = !b;
  $('b-new').disabled = !b;
  $('b-kind').textContent = b && b.slot ? `KNOB ${b.slot}` : 'STACK KNOB';
  $('b-count').textContent = String(b ? here(b.items).length : 0);
}
function setBuild(id) {
  state.build = id || null;
  try { if (id) localStorage.setItem('sf-library-build', id); else localStorage.removeItem('sf-library-build'); } catch { /* no storage here */ }
  showRack(); showColumn();
}

function refresh(options = {}) { showRack(); showColumn(); showTable(options); }

// ---------------------------------------------------------------- opening a stack
function describe(p) {
  const s = p.stack || null;
  return {
    key: p.key, name: p.name, items: p.items, stack: s, rule: p.rule || (s && s.rule) || null,
    kind: s ? s.kind : p.key.split(':')[0],
    editable: !!s && s.kind !== 'rule',                       // chips can be put in, taken out and put in order
    moves: !!s && s.kind === 'learn',                         // (a knob macro: what lies on the table is its moves)
  };
}
function openPile(key, { quiet = false } = {}) {
  if (key === 'new') { makeStack({ name: 'NEW STACK', items: [] }, 'A NEW STACK. DRAG CHIPS ONTO ITS POCKET, AND NAME IT ABOVE.'); return; }
  if (key === 'temp') return;
  const p = pileOf(key);
  if (!p) return;
  state.open = describe(p);
  state.armed = null;
  $('find').value = '';
  if ($('order').value === 'like') $('order').value = 'own';
  refresh({ from: key });
  bench.revealPile(key);
  const mv = p.stack && p.stack.kind === 'learn' ? linksOf(p.stack).length : -1;
  if (!quiet) say(mv >= 0 ? `${up(p.name)}: A KNOB MACRO OF ${mv} MOVE${mv === 1 ? '' : 'S'}. CLICK ONE TO SET HOW FAR ITS KNOB GOES; TAKE OUT TAKES IT OFF.` : `${up(p.name)}: ${p.items.length} CHIP${p.items.length === 1 ? '' : 'S'}.`);
}
// A stack worked out and not kept yet: it is dealt, and KEEP makes it a stack.
function openTemp(name, kind, items, rule) {
  state.open = { key: 'temp', name, kind, items, rule, temp: true, editable: false };
  state.armed = null;
  $('find').value = ''; $('order').value = 'own';
  refresh({ from: 'temp' });
}
// After a change to the stacks or the snapshots: the open stack as it now is.
function reopen({ keepScroll = true } = {}) {
  const o = state.open;
  if (o && !o.temp) { const p = pileOf(o.key); state.open = p ? describe(p) : describe(pileOf('all')); }
  else if (o && o.temp) o.items = here(o.items);
  refresh({ keepScroll });
}

// ---------------------------------------------------------------- the bar: the open stack
function showBar() {
  const o = state.open, s = o && o.stack;
  const kinds = { all: 'LIBRARY', unsorted: 'LIBRARY', recent: 'LIBRARY', mood: 'MOOD', sit: 'SITTING', auto: 'SORTED', stack: 'STACK', macro: 'STACK', song: 'SONG', rule: 'RULE', learn: 'MACRO KNOB' };
  $('s-kind').textContent = o ? (o.temp ? 'NEW' : kinds[o.kind] || 'STACK') : 'STACK';
  const name = $('s-name');
  if (document.activeElement !== name) name.value = o ? up(o.name) : '';
  name.disabled = !o || !(s || o.temp);
  const n = state.shown.length, of = o ? (o.moves ? linksOf(o.stack).length : here(o.items).length) : 0;
  $('s-count').textContent = n === of ? String(of) : `${n} OF ${of}`;
  const load = $('s-load');
  load.hidden = !!(s && (s.kind === 'macro' || s.kind === 'learn'));
  load.disabled = !s;
  load.setAttribute('aria-pressed', String(!!s && inList(s)));
  // (the knob it is on: 1 to 4 for a macro knob, 5 to 16 for a stack knob. DEPTH is a macro knob's.)
  const kk = knobKindOf(s);
  $('s-knob-field').hidden = !kk; $('s-depth-field').hidden = kk !== 'macro';
  if (kk) {
    for (const op of $('s-knob').options) { const n = Number(op.value); op.hidden = op.disabled = n > 0 && placeKind(n) !== kk; }
    $('s-knob').value = String(s.slot || 0);
  }
  if (kk === 'macro' && document.activeElement !== $('s-depth')) $('s-depth').value = s.depth === null || s.depth === undefined ? '' : String(Math.round(s.depth * 100));
  // KEEP: what is out and not a stack of its own becomes one. FREEZE: a stack that fills itself stops.
  const keep = $('s-keep'), freeze = $('s-freeze');
  keep.disabled = !o || !!s || o.key === 'all' || !of;
  keep.querySelector('span').textContent = o && o.temp ? (o.kind === 'macro' ? 'KEEP AS STACK KNOB' : o.kind === 'song' ? 'KEEP AS SONG' : 'KEEP') : 'KEEP';
  freeze.disabled = !o || !of || !((s && s.kind === 'rule') || (o.temp && o.kind === 'rule') || o.kind === 'mood');
  const rm = $('s-remove');
  rm.disabled = !s;
  rm.setAttribute('aria-pressed', String(state.armed === 'stack'));
}

async function patchStack(s, fields, done) {
  try {
    const back = await send(`/api/stacks/${s.id}`, 'PATCH', fields);
    Object.assign(s, back);
    if (fields.slot) for (const other of state.stacks) if (other !== s && other.slot === fields.slot) other.slot = null;     // (a knob holds one macro)
    changed(); reopen();
    if (done) say(done);
  } catch (e) { say(`COULD NOT KEEP THAT: ${up(e.message)}`); await loadStacks(); reopen(); }
}
async function makeStack(fields, done, { open = true } = {}) {
  try {
    const s = await send('/api/stacks', 'POST', { id: newId(), ...fields });
    state.stacks.push(s);
    changed();
    if (open) { state.open = describe(pileOf(`st:${s.id}`)); refresh({ from: `st:${s.id}` }); bench.revealPile(`st:${s.id}`); } else reopen();
    if (done) say(done);
    return s;
  } catch (e) { say(`COULD NOT MAKE IT: ${up(e.message)}`); return null; }
}
async function loadStacks() {
  try { state.stacks = (await (await api('/api/stacks')).json()).stacks; changed(); } catch (e) { say(`COULD NOT READ THE STACKS: ${up(e.message)}`); }
}

// KEEP: the stack that is out, as a stack of its own.
function keepOpen() {
  const o = state.open;
  if (!o || o.stack) return;
  const items = here(o.items).map((it) => ({ u: it.u, bars: it.bars, morph: it.morph }));
  const name = up($('s-name').value.trim() || o.name);
  if (o.temp && o.kind === 'song') return makeStack({ name, kind: 'song', items }, `KEPT AS A SONG OF ${items.length} PARTS. PUT IT ON THE CHASSIS AND SF-000 LOADS IT AS AN ARRANGEMENT.`);
  // (a stack for a knob: kept, and put in the column, where its chips' keys are set and ADD TO MODULE gives it a knob)
  if (o.temp && o.kind === 'macro') return makeStack({ name, kind: 'stack', items: items.slice(0, STACK_MOST).map((it) => ({ u: it.u })) }, 'KEPT, AND IN THE COLUMN: SET EACH CHIP\'S KEYS THERE, THEN ADD TO MODULE.').then((made) => { if (made) setBuild(made.id); return made; });
  if (o.rule) return makeStack({ name, kind: 'rule', rule: o.rule, items }, 'KEPT. IT FILLS ITSELF AS SNAPSHOTS ARRIVE; FREEZE STOPS IT.');
  return makeStack({ name, kind: 'stack', items }, `KEPT AS A STACK OF ${items.length}.`);
}
// FREEZE: what it holds now, as an ordinary stack.
function freezeOpen() {
  const o = state.open;
  if (!o) return;
  const items = here(o.items).map((it) => ({ u: it.u }));
  if (o.stack && o.stack.kind === 'rule') return patchStack(o.stack, { kind: 'stack', rule: null, items }, 'FROZEN: IT HOLDS WHAT IT HELD, AND IS YOURS TO CHANGE.');
  return makeStack({ name: up($('s-name').value.trim() || o.name), kind: 'stack', items }, `KEPT AS A STACK OF ${items.length}, AS IT STOOD.`);
}
async function removeOpen() {
  const s = state.open && state.open.stack;
  if (!s) return;
  if (state.armed !== 'stack') { state.armed = 'stack'; showBar(); say('PRESS REMOVE STACK AGAIN TO TAKE THE STACK AWAY. ITS CHIPS STAY IN THE LIBRARY.'); return; }
  try {
    await api(`/api/stacks/${s.id}`, { method: 'DELETE' });
    state.stacks = state.stacks.filter((x) => x !== s);
    state.armed = null; changed();
    state.open = describe(pileOf('all'));
    refresh();
    say(`${up(s.name)} IS GONE. ITS CHIPS ARE IN THE LIBRARY AS THEY WERE.`);
  } catch (e) { say(`COULD NOT REMOVE IT: ${up(e.message)}`); }
}

// A stack that fills itself keeps, for SF-000, what it held when this page last looked.
async function syncRules() {
  for (const s of state.stacks) {
    if (s.kind !== 'rule' || !s.rule) continue;
    const now = itemsOf(s).map((it) => it.u).join(','), was = (s.items || []).map((it) => it.u).join(',');
    if (now === was) continue;
    try { Object.assign(s, await send(`/api/stacks/${s.id}`, 'PATCH', { items: itemsOf(s) })); } catch { /* next time */ }
  }
}

// ---------------------------------------------------------------- hearing
// What a chip does not take, where it lies: the column's chip by its stack, the table's as it is dealt.
function offAt(uid, where = state.where) {
  if (where === 'column') { const b = buildStack(), it = b && b.items.find((x) => x.u === uid); return (it && it.off) || []; }
  const d = state.shown.find((x) => x.uid === uid);
  return (d && d.off) || [];
}
function press(uid, n = 0, where = 'table') {
  const s = chip(uid);
  if (s && s.move) { select(uid, n); say(`${s.name}: THE KNOB'S WHOLE TURN TAKES IT ${s.move.d >= 0 ? 'UP' : 'DOWN'} ${Math.round(Math.abs(s.move.d) * 100)} OF ITS TRAVEL. SET IT IN AMOUNT.`); return; }
  if (uid === state.selected && uid === state.playing && where === state.where) { stop(); return; }
  select(uid, n, where);
  play(uid);
}
function select(uid, n = 0, where = 'table') {
  state.selected = uid; state.selectedN = n; state.armed = null; state.where = where;
  if ($('order').value === 'like') showTable({ keepScroll: false });
  bench.setMarks({ selected: uid, playing: state.playing, marked: state.marked });
  if (where === 'table') bench.reveal(uid);
  showChip(); showFoot(); showBar();
  history.replaceState(null, '', uid ? `#${uid}` : '#');
}
// Heard: whole, from its clip; or with keys put out on it, from its stems (each part of the rig on its own, the ones put out silent).
async function play(uid, off = null) {
  const s = chip(uid);
  if (s && s.move) return;                          // (a move has no sound of its own)
  if (!s || !s.has_clip) { stop(); if (s) say('NO SOUND WAS KEPT WITH THIS ONE: IT WAS TAKEN WITH THE CLOCK STOPPED, OR ITS CLIP HAS NOT ARRIVED.'); return; }
  const out = (off || offAt(uid)).filter((k) => k !== 'master');           // (the key is not something to hear)
  state.playing = uid;
  audio.pause(); stems.stop();
  marks(); showChip();
  if (out.length && s.stems && s.stems.length) {
    say(`${up(s.name)}: FETCHING ITS STEMS...`);
    const ok = await stems.play(uid, out);
    if (state.playing !== uid) { if (ok && stems.playing() === uid) stems.stop(); return; }          // (another was pressed meanwhile)
    if (ok) { say(`PLAYING ${up(s.name)} WITHOUT ${names(out)}. CLICK IT AGAIN, OR PRESS SPACE, TO STOP.`); return; }
  }
  audio.src = `/api/clips/${encodeURIComponent(uid)}`;
  audio.play().catch(() => { state.playing = null; marks(); showChip(); });
  say(!out.length ? `PLAYING ${up(s.name)}. CLICK IT AGAIN, OR PRESS SPACE, TO STOP.`
    : `PLAYING ${up(s.name)} WHOLE: ${s.stems && s.stems.length ? 'ITS STEMS WOULD NOT PLAY HERE' : 'ITS STEMS ARE NOT IN THE LIBRARY (SF-000 SENDS THEM WHILE ONLINE IS LIT)'}. THE KEYS STILL SAY WHAT IT TAKES.`);
}
function stop() { state.playing = null; audio.pause(); stems.stop(); marks(); showChip(); }
// A key on a chip, pressed: that part of the rig is put out for it, or lit again. In a stack of your own (the column's, or
// one dealt on the table) the stack keeps it; on a chip lying anywhere else it is kept here until the chip goes into a stack.
function lane(uid, where, index, part) {
  const s = chip(uid);
  if (!s || s.move) return;
  const flip = (was) => (was.includes(part) ? was.filter((k) => k !== part) : [...was, part]);
  const o = state.open, st = where === 'column' ? buildStack() : o && plain(o.stack) ? o.stack : null;
  let off;
  if (st) {
    const it = st.items.find((x) => x.u === uid);
    if (!it) return;
    off = flip(it.off || []);
    patchStack(st, { items: st.items.map((x) => (x.u === uid ? withOff(x, off) : x)) });
  } else if (where === 'table' && o && o.kind !== 'song') {
    off = flip(state.off.get(uid) || []);
    if (off.length) state.off.set(uid, off); else state.off.delete(uid);
    showTable({ keepScroll: true });
  } else return;
  // (heard at once, if it is the one playing)
  if (state.playing === uid && state.where === where) { if (stems.playing() === uid) stems.setOff(off.filter((k) => k !== 'master')); else if (off.length) play(uid, off); }
  say(`${up(s.name)}: ${partName(part)} ${off.includes(part) ? 'PUT OUT. IT STAYS AS IT IS WHEN THIS SNAPSHOT COMES' : 'LIT. IT COMES WITH THIS SNAPSHOT'}${st ? '' : ' (IT GOES WITH THE CHIP INTO A STACK)'}.`);
}
// A knob macro from two marked chips: every knob of the rig that stands differently in the second than in the first, each
// turned by as much as it differs. On a knob of SF-000 it makes that change from wherever the rig is (it is LEARN's kind of
// knob: it holds moves, not snapshots).
async function knobMacro() {
  const [a, b] = markedInOrder();
  if (!a || !b) return;
  try {
    const [sa, sb] = await Promise.all([a, b].map(async (u) => (await (await fetch(`/api/snapshots/${encodeURIComponent(u)}`)).json()).snapshot || {}));
    const va = sa.values || {}, vb = sb.values || {};
    const links = Object.keys(vb).filter((c) => Number.isFinite(va[c]) && Number.isFinite(vb[c]) && Math.abs(vb[c] - va[c]) >= 0.005)
      .map((c) => ({ c, d: Math.round((vb[c] - va[c]) * 1000) / 1000 })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 64);
    if (!links.length) { say(`${up(chip(a).name)} AND ${up(chip(b).name)} HAVE EVERY KNOB IN THE SAME PLACE: THERE IS NOTHING FOR A KNOB MACRO TO MOVE.`); return; }
    makeStack({ name: `${up(chip(a).name)} TO ${up(chip(b).name)}`.slice(0, 40), kind: 'learn', items: [], depth: 1, extra: { links, from: [a, b] } },
      `A MACRO KNOB OF ${links.length} MOVE${links.length === 1 ? '' : 'S'}: WHAT DIFFERS FROM ${up(chip(a).name)} TO ${up(chip(b).name)}. DRAG IT ONTO ONE OF THE MODULE'S FIRST FOUR PLACES.`);
  } catch { say('THE TWO SNAPSHOTS COULD NOT BE READ. NOTHING WAS MADE.'); }
}

// A hand on a module's knob. DEPTH: how far the macro goes (kept when the hand lets go). TURN: through what the knob
// holds, as the instrument's would go: each chip it comes to is heard, as a turn of a stack's knob cues it there.
function turned(key, which, v, done, moved) {
  const p = pileOf(key), s = p && p.stack;
  if (!s) return;
  if (which === 'depth') {
    const d = Math.round(v * 100) / 100;
    if (!done) say(`${up(s.name)}: DEPTH ${Math.round(d * 100)}`);
    else if (moved && d !== s.depth) patchStack(s, { depth: d }, `${up(s.name)}: DEPTH ${Math.round(d * 100)}`);
    return;
  }
  const items = itemsOf(s);
  if (!done && s.kind === 'learn') { say(`${up(s.name)}: ITS TURN MOVES ${linksOf(s).length} OF THE RIG'S KNOBS. THERE IS NOTHING OF IT TO HEAR HERE.`); return; }
  if (done || !items.length) return;
  const i = Math.min(items.length - 1, Math.round(v * (items.length - 1))), uid = items[i].u, c = chip(uid);
  if (state.playing !== uid && state.turnedTo !== uid) {
    state.turnedTo = uid;
    play(uid, items[i].off || []);
    say(`${up(s.name)}: ${i + 1} OF ${items.length}${c ? `, ${up(c.name)}` : ''}${c && !c.has_clip ? ' (NO SOUND KEPT)' : ''}`);
  }
}
const marks = () => bench.setMarks({ selected: state.selected, playing: state.playing, marked: state.marked });
function step(by) {
  if (!state.shown.length) return;
  const at = state.shown.findIndex((d) => d.uid === state.selected && d.n === state.selectedN);
  const next = state.shown[Math.min(state.shown.length - 1, Math.max(0, at < 0 ? 0 : at + by))];
  const wasPlaying = state.playing !== null;
  select(next.uid, next.n);
  if (wasPlaying) play(next.uid);
}

// ---------------------------------------------------------------- the chip's strip
function showChip() {
  const s = chip(state.selected), o = state.open;
  const mv = s && s.move ? s : null;
  $('c-amount-field').hidden = !mv;
  if (mv && document.activeElement !== $('c-amount')) $('c-amount').value = String(Math.round(mv.move.d * 100));
  for (const id of ['c-name', 'c-tags', 'c-notes']) $(id).disabled = !s || !!mv;
  if (document.activeElement !== $('c-name')) $('c-name').value = s ? up(s.name || 'UNNAMED') : '';
  if (document.activeElement !== $('c-tags')) $('c-tags').value = s ? (s.tags || []).join(', ') : '';
  if (document.activeElement !== $('c-notes')) $('c-notes').value = s ? s.notes || '' : '';
  $('c-when').textContent = s ? `${whenText(s.taken_at || s.received_at)}${s.p ? `  ${s.p.bpm.toFixed(0)} BPM` : ''}` : '';
  const m = $('c-measures');
  m.textContent = '';
  if (s && s.p) for (const [k, label] of MEASURES) { const d = el('div'), b = el('b'); b.style.height = `${Math.round(s.p[k] * 100)}%`; d.title = `${label} ${Math.round(s.p[k] * 100)}`; d.append(b); m.append(d); }
  // a song's part: its bars and its way in
  const d = s && o && (o.kind === 'song') ? state.shown.find((x) => x.uid === state.selected && x.n === state.selectedN) : null;
  $('c-bars-field').hidden = !d; $('c-morph-field').hidden = !d;
  if (d) {
    if (document.activeElement !== $('c-bars')) $('c-bars').value = String(d.item.bars || 8);
    if (document.activeElement !== $('c-morph')) $('c-morph').value = String(d.item.morph || 0);
    $('c-bars').disabled = $('c-morph').disabled = !(o.stack);
  }
  $('play').disabled = !s || !s.has_clip;
  $('play').setAttribute('aria-pressed', String(!!s && state.playing === s.uid));
  $('mark').disabled = !s || !!mv;
  $('mark').setAttribute('aria-pressed', String(!!s && state.marked.has(s.uid)));
  for (const id of ['like', 'song', 'knob']) $(id).disabled = !s || !s.p;
  $('takeout').disabled = !s || !o || !o.editable || !(mv || o.items.some((it) => it.u === s.uid));
  $('delete').disabled = !s || !!mv;
  $('delete').setAttribute('aria-pressed', String(state.armed === 'chip'));
}

async function saveChip() {
  const s = chip(state.selected);
  if (!s) return;
  const name = $('c-name').value.trim(), notes = $('c-notes').value;
  const tags = $('c-tags').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const body = {};
  if (name && up(name) !== up(s.name)) body.name = up(name);
  if (tags.join(',') !== (s.tags || []).join(',')) body.tags = tags;
  if (notes !== (s.notes || '')) body.notes = notes;
  if (!Object.keys(body).length) return;
  try {
    const back = await send(`/api/snapshots/${encodeURIComponent(s.uid)}`, 'PATCH', body);
    s.name = back.name; s.tags = back.tags; s.notes = back.notes;
    bench.forgetFace(s.uid);
    changed(); reopen();
    say(body.name ? `IT IS ${up(back.name)} NOW, HERE AND IN SF-000 WHEN IT NEXT LOADS.` : 'KEPT.');
  } catch (e) { say(`COULD NOT KEEP THAT: ${up(e.message)}`); }
}
function savePart() {
  const o = state.open;
  if (!o || !o.stack || o.kind !== 'song') return;
  const d = state.shown.find((x) => x.uid === state.selected && x.n === state.selectedN);
  if (!d) return;
  const bars = Math.max(1, Math.min(256, Math.round(Number($('c-bars').value) || 8))), morph = Math.max(0, Math.min(256, Number($('c-morph').value) || 0));
  const items = o.stack.items.map((it, i) => (i === d.part ? { ...it, bars, morph } : it));
  patchStack(o.stack, { items }, `PART ${d.part + 1}: ${bars} BAR${bars === 1 ? '' : 'S'}, ${morph ? `${morph} ON THE WAY IN` : 'CUT IN'}.`);
}

function takeOut(uids) {
  const o = state.open;
  if (!o || !o.editable || !uids.length) return;
  if (o.moves) {                                    // a knob macro: the move comes off it
    const gone = new Set(uids.map((u) => String(u).replace(/^move:/, '')));
    const links = linksOf(o.stack).filter((l) => !gone.has(l.c));
    if (gone.has(String(state.selected).replace(/^move:/, ''))) state.selected = null;
    patchStack(o.stack, { extra: { ...(o.stack.extra || {}), links } }, `TAKEN OFF ${up(o.stack.name)}. IT HAS ${links.length} MOVE${links.length === 1 ? '' : 'S'}.`);
    return;
  }
  const gone = new Set(uids);
  const items = o.stack.items.filter((it) => !gone.has(it.u));
  if (gone.has(state.selected)) state.selected = null;
  patchStack(o.stack, { items }, `${uids.length} TAKEN OUT OF ${up(o.name)}. ${uids.length === 1 ? 'IT IS' : 'THEY ARE'} STILL IN THE LIBRARY.`);
}
async function removeChips(uids) {
  if (!uids.length) return;
  if (state.armed !== 'chip') { state.armed = 'chip'; showChip(); say(`PRESS REMOVE AGAIN TO TAKE ${uids.length === 1 ? 'IT' : `THESE ${uids.length}`} OUT OF THIS LIBRARY FOR GOOD. SF-000 KEEPS ITS OWN COPY.`); return; }
  let done = 0;
  for (const uid of uids) {
    try { await api(`/api/snapshots/${encodeURIComponent(uid)}`, { method: 'DELETE' }); done++; if (state.playing === uid) stop(); state.marked.delete(uid); state.byUid.delete(uid); }
    catch (e) { say(`COULD NOT REMOVE ONE: ${up(e.message)}`); }
  }
  state.all = state.all.filter((s) => state.byUid.has(s.uid));
  if (!state.byUid.has(state.selected)) state.selected = null;
  state.armed = null; changed(); reopen();
  say(`${done} REMOVED.`);
}

// ---------------------------------------------------------------- stacks from a chip
function fromChip(type) {
  const s = chip(state.selected);
  if (!s || !s.p) return;
  if (type === 'like') {
    const rule = { type: 'like', uid: s.uid, n: 24 };
    openTemp(rules.ruleName(rule, state.all), 'rule', rules.fill(rule, state.all), rule);
    say('THE NEAREST TO IT, ITSELF FIRST. KEEP MAKES IT A STACK THAT FILLS ITSELF; FREEZE, ONE THAT STAYS AS IT IS.');
  } else if (type === 'song') {
    const parts = rules.song(state.all, s);
    if (parts.length < 2) { say('ITS FAMILY IS TOO SMALL FOR A SONG YET: NOTHING ELSE SOUNDS OF A PIECE WITH IT.'); return; }
    openTemp(`SONG FROM ${up(s.name)}`, 'song', parts.map(({ u, bars, morph }) => ({ u, bars, morph })), null);
    say(`${parts.map((p) => p.role).join(', ')}. KEEP AS SONG, THEN SET EACH PART'S BARS BELOW.`);
  } else {
    const uids = rules.knob(state.all, s);
    if (uids.length < 2) { say('ITS FAMILY IS TOO SMALL FOR A KNOB YET.'); return; }
    openTemp(`KNOB FROM ${up(s.name)}`, 'macro', uids.map((u) => ({ u })), null);
    say('CALM TO FULL, IN ORDER. KEEP AS STACK KNOB PUTS IT IN THE COLUMN.');
  }
}

// ---------------------------------------------------------------- the marked chips
function toggleMark(uid) {
  if (String(uid).startsWith('move:')) return;                // (a move is not a chip: it is not marked)
  if (state.marked.has(uid)) state.marked.delete(uid); else state.marked.add(uid);
  marks(); showChip(); showFoot();
}
// The marked chips in the order they lie on the table, then any marked elsewhere.
function markedInOrder() {
  const lying = state.shown.filter((d) => state.marked.has(d.uid)).map((d) => d.uid);
  return [...new Set([...lying, ...[...state.marked].filter((u) => state.byUid.has(u))])];
}
function showFoot() {
  const n = state.marked.size, total = state.all.length;
  $('count').textContent = n ? `${n} MARKED` : `${total} SNAPSHOT${total === 1 ? '' : 'S'}`;
  for (const id of ['m-stack', 'unmark', 'm-tag']) $(id).disabled = !n;
  $('m-macro').disabled = n < 2;
  $('m-learn').disabled = n !== 2;
  $('m-mood').disabled = [...state.marked].filter((u) => chip(u) && chip(u).p).length < 2;
  $('export').disabled = !state.shown.length && !n;
  $('autosort').setAttribute('aria-pressed', String(!!state.sorted));
  $('autosort').disabled = state.all.filter((s) => s.p).length < 4;
}
async function tagMarked() {
  const words = $('m-tag').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const add = words.filter((t) => !t.startsWith('-')).map((t) => t.replace(/^\+/, '')), remove = words.filter((t) => t.startsWith('-')).map((t) => t.slice(1));
  if (!state.marked.size || (!add.length && !remove.length)) return;
  try {
    const back = await send('/api/tags', 'POST', { uids: [...state.marked], add, remove });
    for (const [uid, tags] of Object.entries(back.tags)) { const s = chip(uid); if (s) s.tags = tags; }
    $('m-tag').value = '';
    changed(); showChip();
    say(`${Object.keys(back.tags).length} TAGGED.`);
  } catch (e) { say(`COULD NOT TAG THEM: ${up(e.message)}`); }
}
async function exportChips() {
  const uids = state.marked.size ? markedInOrder() : state.shown.map((d) => d.uid);
  if (!uids.length) return;
  say(`EXPORTING ${Math.min(500, uids.length)}...`);
  try {
    const r = await api('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uids: [...new Set(uids)].slice(0, 500) }) });
    const a = el('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = 'snapshots.sf000lib.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    say(`EXPORTED ${Math.min(500, uids.length)} WITH THE DEFINITIONS THEY NAME${uids.length > 500 ? ' (THE FIRST 500)' : ''}.`);
  } catch (e) { say(`EXPORT FAILED: ${up(e.message)}`); }
}
function moodFromMarked() {
  const m = rules.moodFrom(markedInOrder().map(chip), 'MOOD');
  if (!m) return;
  const rule = { type: 'mood', name: 'MOOD FROM THE MARKED', t: m.t, w: m.w, cut: m.cut };
  const what = Object.keys(m.w).sort((a, b) => m.w[b] - m.w[a]).slice(0, 3).map((k) => `${MEASURES.find(([key]) => key === k)[1]} ${Math.round(m.t[k] * 100)}`).join(', ');
  openTemp('MOOD FROM THE MARKED', 'rule', rules.fill(rule, state.all), rule);
  say(`WHAT THEY SHARE: ${what}. EVERYTHING THAT FITS IS HERE. NAME IT ABOVE AND KEEP IT.`);
}
function autoSort() {
  if (state.sorted) { state.sorted = null; changed(); if (state.open && state.open.key.startsWith('auto:')) state.open = describe(pileOf('all')); refresh(); say('THE SORTED PILES ARE PUT AWAY.'); return; }
  state.sorted = rules.piles(state.all);
  changed(); refresh({ keepScroll: true });
  bench.revealPile('auto:0');
  say(`${state.sorted.length} PILES OF LIKE SOUNDS, THE MOST TYPICAL CHIP ON TOP OF EACH. OPEN ONE AND KEEP IT, OR PRESS AUTO SORT TO PUT THEM AWAY.`);
}

// ---------------------------------------------------------------- putting chips and stacks down
function addTo(s, uids, at = -1, offs = null) {
  if (!s || s.kind === 'rule') return;
  const had = new Set(s.items.map((it) => it.u));
  const fresh = s.kind === 'song' ? uids : uids.filter((u) => !had.has(u));
  if (!fresh.length) { say(`ALREADY IN ${up(s.name)}.`); return; }
  if (s.slot && s.items.length + fresh.length > STACK_MOST) { say(`A STACK KNOB HOLDS ${STACK_MOST} AT MOST.`); return; }
  // (each goes in with the keys that were put out on it where it lay)
  const add = fresh.map((u) => (s.kind === 'song' ? { u, bars: 16, morph: 4 } : withOff({ u }, offs ? offs.get(u) : null)));
  const items = at < 0 ? [...s.items, ...add] : [...s.items.slice(0, at), ...add, ...s.items.slice(at)];
  patchStack(s, { items }, `${fresh.length} PUT IN ${up(s.name)}.`);
}
const SEND_STACK = 'TO SF-000';          // the stack that chips dropped on the chassis go into
// Why a thing cannot go on a place of the module, or '' if it can.
function placeSays(s, slot) {
  const want = placeKind(slot), is = knobKindOf(s);
  if (!is) return 'A SONG OR A STACK THAT FILLS ITSELF GOES ON NO KNOB. FREEZE IT, OR DRAG ITS CHIPS.';
  if (is !== want) return want === 'macro' ? 'PLACES 1 TO 4 TAKE MACRO KNOBS. A STACK GOES ON 5 TO 16.' : 'PLACES 5 TO 16 TAKE STACK KNOBS. A MACRO KNOB GOES ON 1 TO 4.';
  return '';
}
function canDrop(d, to) {
  if (!to) return false;
  if (d.kind === 'chips') {
    if (d.uids.some((u) => String(u).startsWith('move:'))) return false;          // (a macro knob's moves stay on it)
    if (to.type === 'column') return true;                                           // (into the stack knob being built, or in its new place there)
    if (d.where === 'column') {
      // a chip of the column: put down anywhere off it, it is taken out of that stack; onto a stack, it goes into that one too
      if (to.type === 'table' || to.type === 'rack' || to.type === 'tray') return true;
      if (to.type === 'bay') { const on = stackOf(to.key); return placeKind(to.slot) === 'stack' && (!on || plain(on)); }
      if (to.type === 'pile') { const s = stackOf(to.key); return to.key === 'new' || (!!s && plain(s) && s.id !== state.build); }
      return false;
    }
    if (to.type === 'table') return orders();
    if (to.type === 'bay') { const on = stackOf(to.key); return placeKind(to.slot) === 'stack' && (!on || plain(on)); }       // (chips make a stack knob, or go into the one there)
    if (to.type === 'tray') return true;                                             // (onto the chassis, under its knobs: these chips are for SF-000)
    if (to.type === 'pile') { const s = stackOf(to.key); return to.key === 'new' || (!!s && s.kind !== 'rule' && s.kind !== 'learn' && to.key !== (state.open && state.open.key)); }
    return false;
  }
  // a whole pile: onto the module, into the column, onto the chassis's list, or (from there) off it
  const s = stackOf(d.key), mood = d.key.startsWith('mood:');
  if (to.type === 'bay') return !!s && !placeSays(s, to.slot);
  if (to.type === 'column') return plain(s);
  if (to.type === 'tray' || (to.type === 'pile' && to.inTray)) return (!!s && s.kind !== 'macro' && s.kind !== 'learn') || mood;
  return !!s && inTray(s);                                    // dropped anywhere else: off the module
}
function drop(d, to) {
  if (d.kind === 'chips') {
    const uids = d.uids;
    // (what each was not taking where it lay)
    const offs = new Map(uids.map((u) => [u, offAt(u, d.where || 'table')]));
    if (to.type === 'column') {
      const b = buildStack();
      if (!b) {
        const n = state.stacks.filter((x) => /^STACK KNOB \d+$/.test(x.name || '')).length + 1;
        makeStack({ name: `STACK KNOB ${n}`, kind: 'stack', items: uids.slice(0, STACK_MOST).map((u) => withOff({ u }, offs.get(u))) },
          `A NEW STACK KNOB OF ${uids.length}. DRAG MORE IN, PUT THEM IN ORDER, SET EACH ONE'S KEYS, THEN ADD TO MODULE.`, { open: false }).then((made) => { if (made) setBuild(made.id); });
        return;
      }
      const held = new Set(uids), rest = b.items.filter((it) => !held.has(it.u));
      const moved = uids.map((u) => b.items.find((it) => it.u === u) || withOff({ u }, offs.get(u)));
      if (rest.length + moved.length > STACK_MOST) { say(`A STACK KNOB HOLDS ${STACK_MOST} AT MOST.`); return; }
      const at = Math.max(0, Math.min(rest.length, to.index));
      patchStack(b, { items: [...rest.slice(0, at), ...moved, ...rest.slice(at)] }, d.where === 'column' ? 'PUT IN ITS NEW PLACE.' : `${uids.length} PUT IN ${up(b.name)}.`);
      return;
    }
    if (d.where === 'column' && (to.type === 'table' || to.type === 'rack' || to.type === 'tray')) {
      const b = buildStack(), held = new Set(uids);
      if (b) patchStack(b, { items: b.items.filter((it) => !held.has(it.u)) }, `TAKEN OUT OF ${up(b.name)}. IT IS STILL IN THE LIBRARY.`);
      return;
    }
    if (to.type === 'table') {
      const o = state.open, held = new Set(uids);
      const rest = o.stack.items.filter((it) => !held.has(it.u)), moved = o.stack.items.filter((it) => held.has(it.u));
      patchStack(o.stack, { items: [...rest.slice(0, to.index), ...moved, ...rest.slice(to.index)] }, 'PUT IN ITS NEW PLACE.');
    } else if (to.type === 'pile' && to.key === 'new') makeStack({ name: 'NEW STACK', items: uids.map((u) => withOff({ u }, offs.get(u))) }, `A NEW STACK OF ${uids.length}. PRESS IT TO DEAL IT OUT AND NAME IT.`, { open: false });       // (what was being looked through stays out)
    else if (to.type === 'pile') addTo(stackOf(to.key), uids, -1, offs);
    else if (to.type === 'tray') {
      // chips dropped on the chassis itself: the ones SF-000 is to have. They go in one stack kept for that, which LOAD brings.
      const s = state.stacks.find((x) => x.kind === 'stack' && x.load && !x.slot && x.name === SEND_STACK);
      if (s) addTo(s, uids);
      else makeStack({ name: SEND_STACK, items: uids, load: true }, `${uids.length === 1 ? 'IT IS' : `THE ${uids.length} ARE`} ON THE CHASSIS, IN A STACK CALLED ${SEND_STACK}: SF-000 TAKES ${uids.length === 1 ? 'IT' : 'THEM'} AT LOAD, AND NOTHING ELSE OF THE LIBRARY.`, { open: false });
    }
    else if (to.type === 'bay') {
      const s = stackOf(to.key);
      if (s) addTo(s, uids, -1, offs);
      // (chips on one of the module's stack places are a stack knob. It is in the column too, to be put in order.)
      else makeStack({ name: `STACK ${to.slot}`, kind: 'stack', items: uids.slice(0, STACK_MOST).map((u) => withOff({ u }, offs.get(u))), slot: to.slot },
        `A STACK KNOB ON ${to.slot}: IN SF-000 ITS TURN MORPHS THE SET THROUGH THESE, OR WITH CUE LIT CHOOSES AMONG THEM. IT IS IN THE COLUMN: DRAG MORE IN.`, { open: false }).then((made) => { if (made) setBuild(made.id); });
    }
    return;
  }
  const s = stackOf(d.key);
  // (one still called by its knob's number takes its new knob's)
  if (to.type === 'bay' && s) patchStack(s, { slot: to.slot, ...(/^(KNOB|CUE|STACK) \d+$/.test(s.name) ? { name: `${s.name.split(' ')[0]} ${to.slot}` } : {}) }, `${up(s.name)} IS ON KNOB ${to.slot}: ${placeKind(to.slot) === 'macro' ? 'A MACRO KNOB' : 'A STACK KNOB'}. LOAD ON SF-000 BRINGS IT.`);
  else if (to.type === 'column' && s) { setBuild(s.id); say(`${up(s.name)} IS IN THE COLUMN: PUT ITS CHIPS IN ORDER, SET EACH ONE'S KEYS${s.slot ? '' : ', THEN ADD TO MODULE'}.`); }
  else if ((to.type === 'tray' || to.type === 'pile') && d.key.startsWith('mood:')) { const p = pileOf(d.key); makeStack({ name: p.name, kind: 'rule', rule: p.rule, items: p.items, load: true }, `${p.name} IS ON THE CHASSIS, AS A STACK THAT FILLS ITSELF.`, { open: false }); }
  else if ((to.type === 'tray' || (to.type === 'pile' && to.inTray)) && s) patchStack(s, { load: true }, `${up(s.name)} IS ON THE CHASSIS: SF-000 TAKES IT AT LOAD.`);
  else if (s && s.slot) patchStack(s, { slot: null }, `${up(s.name)} IS OFF THE MODULE. IT IS STILL IN THE RACK.`);
  else if (s && inList(s)) patchStack(s, { load: false }, `${up(s.name)} IS OFF SF-000'S LIST. IT IS STILL IN THE RACK.`);
}

// ---------------------------------------------------------------- light or dark (D, as on the instrument)
// The first time it follows the computer's own setting; after that it is as it was left.
function nightWanted() {
  try { const kept = localStorage.getItem('sf-library-night'); if (kept === '1' || kept === '0') return kept === '1'; } catch { /* no storage here */ }
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function setLook(on, keep = false) {
  state.night = !!on;
  document.body.classList.toggle('night', state.night);
  setNight(state.night);
  if (bench) bench.setDark(state.night);
  $('night').setAttribute('aria-pressed', String(state.night));
  if (keep) { try { localStorage.setItem('sf-library-night', state.night ? '1' : '0'); } catch { /* it is dark until the page is shut */ } }
}

// ---------------------------------------------------------------- start
function wire() {
  $('night').addEventListener('click', () => setLook(!state.night, true));
  $('rows-up').addEventListener('click', () => bench.turnRack(-1));
  $('rows-down').addEventListener('click', () => bench.turnRack(1));
  $('find').addEventListener('input', () => showTable());
  $('order').addEventListener('change', () => showTable());
  $('s-name').addEventListener('change', () => {
    const o = state.open, name = up($('s-name').value.trim());
    if (!o || !name) return;
    if (o.stack) patchStack(o.stack, { name }, `IT IS ${name} NOW.`); else if (o.temp) { o.name = name; showRack(); }
  });
  $('s-load').addEventListener('click', () => { const s = state.open && state.open.stack; if (s) patchStack(s, { load: !inList(s) }, inList(s) ? `${up(s.name)} IS OFF SF-000'S LIST.` : `${up(s.name)} IS IN SF-000'S LIST: LOAD BRINGS IT TO ITS LIBRARY SCREEN.`); });
  const knobs = $('s-knob');
  knobs.append(new Option('NONE', '0'));
  for (let i = 1; i <= 16; i++) knobs.append(new Option(String(i), String(i)));
  knobs.addEventListener('change', () => { const s = state.open && state.open.stack; if (s) { const slot = Number(knobs.value) || null; const no = slot ? placeSays(s, slot) : ''; if (no) { say(no); showBar(); return; } patchStack(s, { slot }, slot ? `${up(s.name)} IS ON KNOB ${slot}: ${placeKind(slot) === 'macro' ? 'A MACRO KNOB' : 'A STACK KNOB'}.` : `${up(s.name)} IS ON NO KNOB.`); } });
  $('s-depth').addEventListener('change', () => { const s = state.open && state.open.stack; if (s) patchStack(s, { depth: Math.max(0, Math.min(100, Number($('s-depth').value) || 0)) / 100 }, 'DEPTH KEPT.'); });
  $('s-keep').addEventListener('click', keepOpen);
  $('s-freeze').addEventListener('click', freezeOpen);
  $('s-remove').addEventListener('click', removeOpen);

  for (const id of ['c-name', 'c-tags', 'c-notes']) $(id).addEventListener('change', saveChip);
  $('c-bars').addEventListener('change', savePart); $('c-morph').addEventListener('change', savePart);
  $('play').addEventListener('click', () => (state.playing === state.selected ? stop() : play(state.selected)));
  $('mark').addEventListener('click', () => state.selected && toggleMark(state.selected));
  $('like').addEventListener('click', () => fromChip('like'));
  $('song').addEventListener('click', () => fromChip('song'));
  $('knob').addEventListener('click', () => fromChip('knob'));
  $('takeout').addEventListener('click', () => takeOut(state.marked.has(state.selected) ? markedInOrder() : [state.selected]));
  $('delete').addEventListener('click', () => removeChips(state.marked.has(state.selected) ? markedInOrder() : [state.selected]));

  $('m-stack').addEventListener('click', () => makeStack({ name: 'NEW STACK', items: markedInOrder() }, `A STACK OF THE ${state.marked.size} MARKED. NAME IT ABOVE.`));
  // STACK KNOB: the marked chips, in the order they lie, as a new stack knob in the column (each with the keys put out on it)
  $('m-macro').addEventListener('click', () => {
    const uids = markedInOrder().slice(0, STACK_MOST);
    if (!uids.length) return;
    const n = state.stacks.filter((x) => /^STACK KNOB \d+$/.test(x.name || '')).length + 1;
    makeStack({ name: `STACK KNOB ${n}`, kind: 'stack', items: uids.map((u) => withOff({ u }, offAt(u, 'table'))) }, 'A STACK KNOB OF THE MARKED, IN THE ORDER THEY LAY. IT IS IN THE COLUMN: SET EACH ONE\'S KEYS, THEN ADD TO MODULE.', { open: false }).then((made) => { if (made) setBuild(made.id); });
  });
  // the column's own keys
  $('b-add').addEventListener('click', () => {
    const b = buildStack();
    if (!b) return;
    if (b.slot) { patchStack(b, { slot: null }, `${up(b.name)} IS OFF THE MODULE. IT IS STILL IN THE COLUMN, AND IN THE RACK.`); return; }
    const n = freePlace('stack');
    if (!n) { say('ALL TWELVE STACK KNOBS ARE TAKEN. DRAG ONE OFF THE MODULE FIRST.'); return; }
    patchStack(b, { slot: n }, `${up(b.name)} IS ON KNOB ${n}. LOAD, ON SF-000'S SNAPSHOT MODULE, BRINGS IT.`);
  });
  $('b-new').addEventListener('click', () => { const b = buildStack(); setBuild(null); say(`AN EMPTY COLUMN: THE FIRST CHIP PUT DOWN BEGINS A NEW STACK KNOB.${b ? ` ${up(b.name)} IS IN THE RACK${b.slot ? `, AND ON KNOB ${b.slot}` : ''}.` : ''}`); });
  $('b-name').addEventListener('change', () => { const b = buildStack(), name = up($('b-name').value.trim()); if (b && name) patchStack(b, { name }, `IT IS ${name} NOW.`); });
  $('m-learn').addEventListener('click', knobMacro);
  $('c-amount').addEventListener('change', () => {
    const o = state.open, s = chip(state.selected);
    if (!o || !o.moves || !s || !s.move) return;
    const d = Math.max(-100, Math.min(100, Math.round(Number($('c-amount').value) || 0))) / 100;
    const links = linksOf(o.stack).map((l) => (l.c === s.move.c ? { c: l.c, d } : l));
    patchStack(o.stack, { extra: { ...(o.stack.extra || {}), links } }, `${s.name}: ${d >= 0 ? '+' : '-'}${Math.round(Math.abs(d) * 100)}`);
  });
  $('m-mood').addEventListener('click', moodFromMarked);
  $('m-tag').addEventListener('change', tagMarked);
  $('export').addEventListener('click', exportChips);
  $('unmark').addEventListener('click', () => { state.marked.clear(); marks(); showChip(); showFoot(); });
  $('autosort').addEventListener('click', autoSort);

  audio.addEventListener('error', () => { if (state.playing) { say('THE CLIP WOULD NOT PLAY.'); stop(); } });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) { if (e.key === 'Escape' || e.key === 'Enter') e.target.blur(); return; }
    const cols = bench.columns();
    if (e.key === ' ') { e.preventDefault(); if (state.playing) stop(); else if (state.selected) play(state.selected); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(cols); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-cols); }
    else if (e.key === 'm' || e.key === 'M') { if (state.selected) toggleMark(state.selected); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { if (state.selected && !$('takeout').disabled) takeOut(state.marked.has(state.selected) ? markedInOrder() : [state.selected]); }
    else if (e.key === 'Escape') { if (state.armed) { state.armed = null; showBar(); showChip(); } else if (state.open && state.open.key !== 'all') openPile('all'); }
    else if (e.key === '/') { e.preventDefault(); $('find').focus(); }
    else if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey) setLook(!state.night, true);
  });
}

function startBench() {
  try {
    bench = new Bench($('bench'), {
      chip: (uid, index, { shift, where }) => { const d = where === 'column' ? null : state.shown[index]; if (shift && where !== 'column') toggleMark(uid); else press(uid, d ? d.n : 0, where || 'table'); },
      lane,
      pile: (key) => openPile(key),
      // (a stack knob pressed on the module comes into the column, where it is built; it is dealt out too, as any stack is)
      bay: (slot, key) => {
        const s = stackOf(key);
        if (s && plain(s)) setBuild(s.id);
        if (key) openPile(key);
        else say(placeKind(slot) === 'macro' ? `KNOB ${slot} HOLDS NOTHING. IT TAKES A MACRO KNOB: DRAG ONE ONTO IT (KNOB MACRO MAKES ONE FROM TWO MARKED CHIPS; LEARN ON SF-000 MAKES ONE THERE).` : `KNOB ${slot} HOLDS NOTHING. IT TAKES A STACK KNOB: DRAG CHIPS OR A STACK ONTO IT, OR BUILD ONE IN THE COLUMN AND ADD TO MODULE.`);
      },
      hover: (h) => {
        if (!h || h.type !== 'chip' || !h.lane) return;
        const s = chip(h.uid), out = offAt(h.uid, h.where).includes(h.lane);
        if (s && !s.move) say(`${up(s.name)}: ${partName(h.lane)} ${out ? 'IS PUT OUT. CLICK TO LIGHT IT' : 'COMES WITH IT. CLICK TO PUT IT OUT'}.`);
      },
      columnAt: ({ x, y, w }) => { const b = $('build'); b.style.left = `${Math.round(x)}px`; b.style.top = `${Math.round(y)}px`; b.style.width = `${Math.max(120, Math.round(w))}px`; b.hidden = false; },
      dragSet: (uid) => (state.marked.has(uid) ? markedInOrder() : [uid]),
      turn: turned,
      rows: ({ first, shown, rows, y }) => {
        const more = rows > shown;
        $('rows').hidden = !more;
        if (!more) return;
        $('rows').style.top = `${Math.round(y)}px`;
        $('rows-say').textContent = `STACKS: ROW${shown > 1 ? 'S' : ''} ${first + 1}${shown > 1 ? ` TO ${Math.min(rows, first + shown)}` : ''} OF ${rows}`;
        $('rows-up').disabled = first <= 0; $('rows-down').disabled = first + shown >= rows;
      },
      canDrop, drop, orders,
      over: (d, to) => {
        if (!d) return;
        if (!to) { say(d.kind === 'chips' ? 'DROP IN THE COLUMN (THE STACK KNOB BEING BUILT), ON A STACK, ON ONE OF THE MODULE\'S PLACES 5 TO 16, OR ON + NEW STACK.' : 'DROP ON THE MODULE (A MACRO KNOB ON 1 TO 4, A STACK ON 5 TO 16), OR IN THE COLUMN TO BUILD IT.'); return; }
        const s = to.type === 'pile' ? stackOf(to.key) : null, b = buildStack();
        say(to.type === 'bay' ? `ON KNOB ${to.slot}` : to.type === 'column' ? (d.kind === 'pile' ? 'INTO THE COLUMN, TO BUILD IT' : b ? `INTO ${up(b.name)}, HERE` : 'A NEW STACK KNOB') : to.type === 'table' ? (d.where === 'column' ? 'OUT OF THE STACK KNOB' : 'HERE') : to.type === 'rack' && d.where === 'column' ? 'OUT OF THE STACK KNOB' : to.type === 'tray' ? (d.where === 'column' ? 'OUT OF THE STACK KNOB' : 'ONTO THE CHASSIS') : s ? `INTO ${up(s.name)}` : to.key === 'new' ? 'A NEW STACK' : '');
      },
    });
  } catch (e) {
    console.error(e);
    $('bench').hidden = true; $('no3d').hidden = false;
    return false;
  }
  return true;
}

async function start() {
  document.body.classList.toggle('night', nightWanted());       // (before anything is drawn: no flash of the other look)
  if (!startBench()) return;
  wire();
  setLook(nightWanted());
  say('LOADING...');
  try {
    const [snaps, stacks] = await Promise.all([api('/api/snapshots').then((r) => r.json()), api('/api/stacks').then((r) => r.json())]);
    state.all = snaps.snapshots.map((s) => ({ ...s, p: unpack(s.profile) }));
    state.byUid = new Map(state.all.map((s) => [s.uid, s]));
    state.stacks = stacks.stacks;
    try { state.build = localStorage.getItem('sf-library-build') || null; } catch { state.build = null; }
    changed();
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    await Promise.all(['600 15px "Barlow Condensed"', '500 11.5px "Barlow Semi Condensed"'].map((f) => (document.fonts ? document.fonts.load(f) : null)));
    state.open = describe(pileOf('all'));
    refresh();
    const asked = decodeURIComponent(location.hash.slice(1));
    if (asked && chip(asked)) select(asked);
    say(state.all.length ? 'CLICK A STACK TO DEAL IT OUT, A CHIP TO HEAR IT. DRAG CHIPS ONTO A STACK. ARROWS MOVE, SPACE PLAYS, M MARKS.' : 'NOTHING HERE YET. SNAPSHOTS ARRIVE FROM SF-000 AS THEY ARE TAKEN, WHILE ITS ONLINE KEY IS LIT.');
    syncRules();
  } catch (e) {
    say(`COULD NOT READ THE LIBRARY: ${up(e.message)}`);
  }
}

window.sfLibrary = { state, get bench() { return bench; } };       // (for the checks, and for looking in from the console)
start();
