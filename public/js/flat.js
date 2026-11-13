// The library page: every snapshot as a card, heard with a click, ordered and narrowed by what
// it sounded like. Everything is worked out here from one list; nothing is asked of the server
// until something is changed.
import { MEASURES, ROWS, COLS, unpack, energyRow, brightCol, heat } from './profile.js';
import { drawCard, when, setNight } from './card.js';
import { narrow } from './narrow.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

const state = {
  all: [],                // every snapshot, as /api/snapshots gives them, each with .p (profile, unpacked)
  shown: [],              // after FIND, the map and the order
  selected: null,         // uid
  playing: null,          // uid
  marked: new Set(),
  cell: null,             // [row, col] of the map, or null
  soundOnly: false,
  armedDelete: null,
};
const audio = $('audio');
const cards = new Map();  // uid -> { button, canvas, index }

async function api(path, options) {
  const r = await fetch(path, { credentials: 'same-origin', ...options });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status}`);
  return r;
}
const say = (text) => { $('status').textContent = text; };
const byUid = (uid) => state.all.find((s) => s.uid === uid) || null;

// ---------------------------------------------------------------- what is shown, and in what order
function refresh() {
  const order = $('order').value;
  state.shown = narrow(state.all, { find: $('find').value, cell: state.cell, soundOnly: state.soundOnly, order, near: byUid(state.selected) });
  const grid = $('grid');
  grid.textContent = '';
  cards.clear();
  if (!state.all.length) {
    grid.append(el('div', 'empty', 'NOTHING HERE YET. SNAPSHOTS ARRIVE FROM SF-000 AS THEY ARE TAKEN, WHILE ITS ONLINE KEY IS LIT.'));
  } else if (!state.shown.length) {
    grid.append(el('div', 'empty', 'NONE OF THE SNAPSHOTS FIT. SHOW ALL BRINGS THEM BACK.'));
  }
  state.shown.forEach((s, index) => {
    const button = el('button', 'card');
    button.type = 'button';
    button.setAttribute('aria-label', `${s.name || 'snapshot'}, ${when(s.taken_at || s.received_at)}`);
    const canvas = el('canvas');
    button.append(canvas);
    button.addEventListener('click', (e) => (e.shiftKey ? toggleMark(s.uid) : press(s.uid)));
    grid.append(button);
    cards.set(s.uid, { button, canvas, index });
    paint(s.uid);
  });
  const n = state.shown.length, of = state.all.length;
  $('count').textContent = n === of ? `${of} SNAPSHOT${of === 1 ? '' : 'S'}` : `${n} OF ${of} SNAPSHOTS`;
  $('export').disabled = !n;
  $('unmark').disabled = !state.marked.size;
  drawMap();
}

function paint(uid) {
  const c = cards.get(uid), s = byUid(uid);
  if (c && s) drawCard(c.canvas, s, c.index, { selected: uid === state.selected, playing: uid === state.playing, marked: state.marked.has(uid) });
}

// ---------------------------------------------------------------- hearing
function press(uid) {
  if (uid === state.selected && uid === state.playing) { stop(); return; }
  select(uid);
  play(uid);
}

function select(uid) {
  const was = state.selected;
  state.selected = uid;
  state.armedDelete = null;
  paint(was); paint(uid);
  showDetail();
  if ($('order').value === 'like') refresh();
  cards.get(uid)?.button.scrollIntoView({ block: 'nearest' });
  history.replaceState(null, '', `#${uid}`);                 // a snapshot has an address of its own
}

function play(uid) {
  const s = byUid(uid);
  const was = state.playing;
  if (!s || !s.has_clip) { stop(); if (s) say('NO SOUND WAS KEPT WITH THIS ONE: IT WAS TAKEN WITH THE CLOCK STOPPED, OR ITS CLIP HAS NOT ARRIVED.'); return; }
  state.playing = uid;
  audio.src = `/api/clips/${encodeURIComponent(uid)}`;
  audio.play().catch(() => { state.playing = null; paint(uid); syncKeys(); });
  paint(was); paint(uid);
  syncKeys();
  say(`PLAYING ${String(s.name).toUpperCase()}. CLICK IT AGAIN, OR PRESS SPACE, TO STOP.`);
}

function stop() {
  const was = state.playing;
  state.playing = null;
  audio.pause();
  paint(was);
  syncKeys();
}

function step(by) {
  if (!state.shown.length) return;
  const at = state.shown.findIndex((s) => s.uid === state.selected);
  const next = state.shown[Math.min(state.shown.length - 1, Math.max(0, (at < 0 ? 0 : at + by)))];
  const wasPlaying = state.playing !== null;
  select(next.uid);
  if (wasPlaying) play(next.uid);
}

function columns() {
  const tracks = getComputedStyle($('grid')).gridTemplateColumns.split(' ').filter(Boolean).length;
  return Math.max(1, tracks);
}

// ---------------------------------------------------------------- marking, export, removing
function toggleMark(uid) {
  if (state.marked.has(uid)) state.marked.delete(uid); else state.marked.add(uid);
  paint(uid);
  syncKeys();
  $('unmark').disabled = !state.marked.size;
}

async function exportMarked() {
  const uids = state.marked.size ? state.shown.filter((s) => state.marked.has(s.uid)).map((s) => s.uid).concat([...state.marked].filter((u) => !state.shown.some((s) => s.uid === u)))
                                 : state.shown.map((s) => s.uid);
  if (!uids.length) return;
  say(`EXPORTING ${uids.length}...`);
  try {
    const r = await api('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uids: uids.slice(0, 500) }) });
    const a = el('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = 'snapshots.sf000lib.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    say(`EXPORTED ${Math.min(500, uids.length)} SNAPSHOT${uids.length === 1 ? '' : 'S'} WITH THE DEFINITIONS THEY NAME${uids.length > 500 ? ' (THE FIRST 500)' : ''}.`);
  } catch (e) { say(`EXPORT FAILED: ${String(e.message).toUpperCase()}`); }
}

async function removeSelected() {
  const uid = state.selected;
  if (!uid) return;
  if (state.armedDelete !== uid) { state.armedDelete = uid; syncKeys(); say('PRESS REMOVE AGAIN TO TAKE IT OUT OF THIS LIBRARY. SF-000 KEEPS ITS OWN COPY.'); return; }
  try {
    await api(`/api/snapshots/${encodeURIComponent(uid)}`, { method: 'DELETE' });
    if (state.playing === uid) stop();
    state.all = state.all.filter((s) => s.uid !== uid);
    state.marked.delete(uid);
    state.selected = null; state.armedDelete = null;
    showDetail(); refresh();
    say('REMOVED.');
  } catch (e) { say(`COULD NOT REMOVE IT: ${String(e.message).toUpperCase()}`); }
}

// ---------------------------------------------------------------- the map
function drawMap() {
  const map = $('map');
  map.textContent = '';
  map.append(el('span', 'lab'));
  COLS.forEach((c) => map.append(el('span', 'lab top', c)));
  const counts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (const s of state.all) if (s.p && (!state.soundOnly || s.has_clip)) counts[3 - energyRow(s.p)][brightCol(s.p)]++;
  ROWS.forEach((name, r) => {
    map.append(el('span', 'lab', name));
    for (let c = 0; c < 4; c++) {
      const n = counts[r][c];
      const b = el('button', n ? '' : 'none', String(n));
      b.type = 'button';
      b.setAttribute('aria-label', `${name}, ${COLS[c]}: ${n}`);
      b.setAttribute('aria-pressed', String(!!state.cell && state.cell[0] === r && state.cell[1] === c));
      const sw = el('span', 'sw'); sw.style.background = heat((c + 0.5) / 4);
      b.append(sw);
      b.addEventListener('click', () => { state.cell = state.cell && state.cell[0] === r && state.cell[1] === c ? null : [r, c]; refresh(); });
      map.append(b);
    }
  });
}

// ---------------------------------------------------------------- the selected one
function bars(into, rows) {
  into.textContent = '';
  for (const [label, v] of rows) {
    into.append(el('span', '', label));
    const track = el('div'), fill = el('b');
    fill.style.width = `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
    track.append(fill); into.append(track);
  }
}

function showDetail() {
  const s = byUid(state.selected);
  $('detail').hidden = !s;
  if (!s) return;
  $('d-name').textContent = String(s.name || 'UNNAMED').toUpperCase();
  $('d-when').textContent = when(s.taken_at || s.received_at);
  bars($('d-measures'), s.p ? MEASURES.map(([k, label]) => [label, s.p[k]]) : []);
  $('d-tempo').textContent = s.p ? `${s.p.bpm.toFixed(1)} BPM, ${s.p.bars} BAR${s.p.bars === 1 ? '' : 'S'} KEPT` : 'NO SOUND WAS KEPT WITH IT';
  const lanes = s.lanes || [];
  bars($('d-lanes'), lanes.map((name, l) => [name.replace(/_/g, ' ').toUpperCase(), s.p ? (s.p.lanes[l] || 0) : (Number((s.fill || [])[l]) || 0)]));
  const fx = $('d-effects');
  fx.textContent = '';
  (s.effects && s.effects.length ? s.effects : ['NONE']).forEach((name) => fx.append(el('span', 'plate white', name)));
  $('d-tags').value = (s.tags || []).join(', ');
  $('d-notes').value = s.notes || '';
  const clip = $('d-clip'), file = $('d-json');
  clip.href = `/api/clips/${encodeURIComponent(s.uid)}`;
  clip.download = `${s.name || s.uid}.ogg`;
  clip.setAttribute('aria-disabled', String(!s.has_clip));
  file.href = '#';
  file.onclick = async (e) => {
    e.preventDefault();
    const full = await (await api(`/api/snapshots/${encodeURIComponent(s.uid)}`)).json();
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(full.snapshot, null, 1)], { type: 'application/json' }));
    a.download = `${s.name || s.uid}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('d-uid').textContent = `${s.uid}${s.app ? `  ·  BUILD ${s.app.toUpperCase()}` : ''}`;
  syncKeys();
}

function syncKeys() {
  const s = byUid(state.selected);
  $('play').setAttribute('aria-pressed', String(!!s && state.playing === s.uid));
  $('play').disabled = !s || !s.has_clip;
  $('mark').setAttribute('aria-pressed', String(!!s && state.marked.has(s.uid)));
  $('like').disabled = !s || !s.p;
  $('delete').setAttribute('aria-pressed', String(!!s && state.armedDelete === s.uid));
  $('sound').setAttribute('aria-pressed', String(state.soundOnly));
}

async function saveNotes() {
  const s = byUid(state.selected);
  if (!s) return;
  const tags = $('d-tags').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const notes = $('d-notes').value;
  if (tags.join(',') === (s.tags || []).join(',') && notes === (s.notes || '')) return;
  try {
    const back = await (await api(`/api/snapshots/${encodeURIComponent(s.uid)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tags, notes }) })).json();
    s.tags = back.tags; s.notes = back.notes;
    say('KEPT.');
  } catch (e) { say(`COULD NOT KEEP THAT: ${String(e.message).toUpperCase()}`); }
}

// ---------------------------------------------------------------- start
function wire() {
  $('find').addEventListener('input', refresh);
  $('order').addEventListener('change', refresh);
  $('sound').addEventListener('click', () => { state.soundOnly = !state.soundOnly; syncKeys(); refresh(); });
  $('clear').addEventListener('click', () => { state.cell = null; state.soundOnly = false; $('find').value = ''; syncKeys(); refresh(); });
  $('play').addEventListener('click', () => (state.playing === state.selected ? stop() : play(state.selected)));
  $('mark').addEventListener('click', () => state.selected && toggleMark(state.selected));
  $('like').addEventListener('click', () => { $('order').value = 'like'; refresh(); say('ORDERED BY HOW NEAR EACH SOUNDS TO THE SELECTED ONE.'); });
  $('delete').addEventListener('click', removeSelected);
  $('export').addEventListener('click', exportMarked);
  $('unmark').addEventListener('click', () => { const was = [...state.marked]; state.marked.clear(); was.forEach(paint); syncKeys(); $('unmark').disabled = true; });
  $('d-tags').addEventListener('change', saveNotes);
  $('d-notes').addEventListener('change', saveNotes);
  audio.addEventListener('error', () => { if (state.playing) { say('THE CLIP WOULD NOT PLAY.'); stop(); } });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === ' ') { e.preventDefault(); if (state.playing) stop(); else if (state.selected) play(state.selected); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(columns()); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-columns()); }
    else if (e.key === 'm' || e.key === 'M') { if (state.selected) toggleMark(state.selected); }
  });
  let waiting = 0;
  window.addEventListener('resize', () => { clearTimeout(waiting); waiting = setTimeout(() => state.shown.forEach((s) => paint(s.uid)), 150); });
}

// Light or dark: as the bench was left (D there), or the computer's own setting.
function look() {
  let night = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  try { const kept = localStorage.getItem('sf-library-night'); if (kept === '1' || kept === '0') night = kept === '1'; } catch { /* no storage here */ }
  document.body.classList.toggle('night', night);
  setNight(night);
}

async function start() {
  look();
  wire();
  syncKeys();
  say('LOADING...');
  try {
    const got = await (await api('/api/snapshots')).json();
    state.all = got.snapshots.map((s) => ({ ...s, p: unpack(s.profile) }));
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    await Promise.all(['600 15px "Barlow Condensed"', '500 11.5px "Barlow Semi Condensed"'].map((f) => (document.fonts ? document.fonts.load(f) : null)));
    refresh();
    const asked = decodeURIComponent(location.hash.slice(1));
    if (asked && byUid(asked)) select(asked);
    say(state.all.length ? 'CLICK A SNAPSHOT TO HEAR IT. ARROWS MOVE, SPACE STOPS AND STARTS, SHIFT-CLICK OR M MARKS FOR EXPORT.' : '');
  } catch (e) {
    say(`COULD NOT READ THE LIBRARY: ${String(e.message).toUpperCase()}`);
  }
}

start();
