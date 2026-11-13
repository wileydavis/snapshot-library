// Snapshot Library: the Cloudflare Worker API.
// The page is served from ./public by the assets binding; everything under /api/* lands here.
// SF-000's session format (FORMAT.md in its repo) is the contract: a snapshot is kept exactly as
// it arrives, and whatever it holds that this code does not know stays in it.
import { SCHEMA, ADDED } from './schema.js';

const MAX_JSON = 2 * 1024 * 1024;       // a snapshot with the definitions it names
const MAX_CLIP = 8 * 1024 * 1024;       // four bars of Ogg are a few hundred kilobytes
const MAX_LIST = 5000;
const UID = /^[0-9a-f]{16}-[0-9A-Za-z_.-]{1,64}$/;
const PRINT = /^[0-9a-f]{16}$/;
const STACK_ID = /^[0-9a-z]{8,24}$/;
const STACK_KINDS = ['stack', 'macro', 'song', 'rule'];
const MAX_ITEMS = 5000;                 // chips in one stack
// A snapshot from before it said which lanes it had: SF-000's eleven, in its order.
const FIRST_LANES = ['kick', 'closed_hat', 'open_hat', 'clap', 'perc', 'bass', 'rumble', 'lead', 'chord', 'pad', 'voice'];

let certCache = { at: 0, keys: null };
let schemaReady = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const auth = await authorize(request, env);
    if (!auth.ok) return json({ error: auth.error }, 401);
    if (url.pathname === '/api/health') return json({ ok: true, who: auth.email || auth.name || '' });

    try {
      await ensureSchema(env);
      return await route(request, env, url);
    } catch (err) {
      console.error(err);
      return json({ error: String((err && err.message) || err) }, 500);
    }
  },
};

function ensureSchema(env) {
  if (!schemaReady) schemaReady = makeSchema(env).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

// The tables, then whatever columns a table from before lacks. Nothing here changes or drops
// anything: a library that was already there is exactly as it was, with more room.
// A column that could not be added is done without (lacking): the library goes on taking
// snapshots in as it did before there was one, and says so in its log.
const lacking = new Set();
async function makeSchema(env) {
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  const has = {};
  lacking.clear();
  for (const [table, column, type] of ADDED) {
    if (!has[table]) {
      try { has[table] = (await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results.map((r) => r.name); }
      catch (e) { console.error(`could not read ${table}'s columns`, e); has[table] = []; }      // (then each is tried: one already there says so)
    }
    if (has[table].includes(column)) continue;
    try { await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run(); }
    catch (e) {
      if (!/duplicate column/i.test(String(e && e.message))) { console.error(`could not add ${table}.${column}`, e); lacking.add(`${table}.${column}`); continue; }
    }
    has[table].push(column);
  }
}

async function route(request, env, url) {
  const p = url.pathname;
  const m = request.method;

  if (p === '/api/snapshots' && m === 'POST') return receive(request, env);
  if (p === '/api/snapshots' && m === 'GET') return list(env, url);
  if (p === '/api/have' && m === 'POST') return have(request, env);
  if (p === '/api/export' && m === 'POST') return exportFile(request, env);
  if (p === '/api/defs' && m === 'GET') return defsFor(env, (url.searchParams.get('prints') || '').split(',').filter((x) => PRINT.test(x)));
  if (p === '/api/stats' && m === 'GET') return stats(env);
  if (p === '/api/tags' && m === 'POST') return tagMany(request, env);
  if (p === '/api/stacks' && m === 'GET') return stacks(env, url.searchParams.get('removed') === '1');
  if (p === '/api/stacks' && m === 'POST') return makeStack(request, env);
  if (p === '/api/load' && m === 'GET') return load(env);

  let hit = p.match(/^\/api\/snapshots\/([^/]+)$/);
  if (hit) {
    const uid = decodeURIComponent(hit[1]);
    if (!UID.test(uid)) return json({ error: 'not a uid' }, 400);
    if (m === 'GET') return one(env, uid);
    if (m === 'PATCH') return annotate(request, env, uid);
    if (m === 'DELETE') return remove(env, uid, url.searchParams.get('forget') === '1');
  }
  hit = p.match(/^\/api\/stacks\/([^/]+)$/);
  if (hit) {
    const id = decodeURIComponent(hit[1]);
    if (!STACK_ID.test(id)) return json({ error: 'not a stack' }, 400);
    if (m === 'GET') return oneStack(env, id);
    if (m === 'PATCH') return changeStack(request, env, id);
    if (m === 'DELETE') return removeStack(env, id, url.searchParams.get('forget') === '1');
  }
  hit = p.match(/^\/api\/clips\/([^/]+)$/);
  if (hit) {
    const uid = decodeURIComponent(hit[1]);
    if (!UID.test(uid)) return json({ error: 'not a uid' }, 400);
    if (m === 'PUT') return receiveClip(request, env, uid);
    if (m === 'GET' || m === 'HEAD') return serveClip(request, env, uid);
  }
  return json({ error: 'not found' }, 404);
}

// ======================================================================
// Taking snapshots in
// ======================================================================

// Body: { "snapshot": { ...as SF-000 keeps it... }, "defs": { "<print>": definition, ... } }.
// Sending one again is harmless: the same uid is the same snapshot (only its name may have changed).
// A name has two hands on it, SF-000's and the page's, and the last to change it has it: a name
// sent that is not the one SF-000 sent before is a rename there, and is taken; the same name sent
// again leaves a name given on the page alone.
async function receive(request, env) {
  const text = await request.text();
  if (text.length > MAX_JSON) return json({ error: 'too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'not JSON' }, 400); }
  const snap = body && body.snapshot;
  if (!snap || typeof snap !== 'object' || !UID.test(String(snap.uid || ''))) return json({ error: 'a snapshot needs a uid' }, 400);
  const uid = snap.uid;
  const now = Date.now();

  const was = await env.DB.prepare('SELECT has_clip, deleted_at FROM snapshots WHERE uid = ?').bind(uid).first();
  if (was && was.deleted_at) return json({ ok: true, uid, gone: true, clip: false, missingDefs: [] });

  const stmts = [];
  for (const [print, def] of Object.entries(body.defs || {})) {
    if (!PRINT.test(print) || !def || typeof def !== 'object') continue;
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO defs (print, kind, name, json, received_at) VALUES (?, ?, ?, ?, ?)')
      .bind(print, String(def.kind || ''), String(def.name || def.id || ''), JSON.stringify(def), now));
  }
  const kept = JSON.stringify(snap);
  await env.BUCKET.put(`snapshots/${uid}.json`, kept, { httpMetadata: { contentType: 'application/json' } });
  const s = summarise(snap);
  const named = !lacking.has('snapshots.sent_name');
  stmts.push(env.DB.prepare(
    `INSERT INTO snapshots (uid, library_id, local_id, name, taken_at, received_at, updated_at, app, has_profile,
       energy, weight, bright, density, tone, movement, wet, bpm, bars, profile_v, profile, lanes, fill, effects, prints, json_size${named ? ', sent_name' : ''})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${named ? ', ?' : ''})
     ON CONFLICT(uid) DO UPDATE SET
       ${named ? `name = CASE WHEN excluded.name <> COALESCE(snapshots.sent_name, snapshots.name) THEN excluded.name ELSE snapshots.name END,
       sent_name = excluded.sent_name` : 'name = excluded.name'}, updated_at = excluded.updated_at, app = excluded.app,
       has_profile = excluded.has_profile, energy = excluded.energy, weight = excluded.weight, bright = excluded.bright,
       density = excluded.density, tone = excluded.tone, movement = excluded.movement, wet = excluded.wet, bpm = excluded.bpm,
       bars = excluded.bars, profile_v = excluded.profile_v, profile = excluded.profile, lanes = excluded.lanes,
       fill = excluded.fill, effects = excluded.effects, prints = excluded.prints, json_size = excluded.json_size`)
    .bind(uid, uid.slice(0, 16), s.localId, s.name, s.takenAt, now, now, s.app, s.hasProfile ? 1 : 0,
      s.energy, s.weight, s.bright, s.density, s.tone, s.movement, s.wet, s.bpm, s.bars, s.profileV, s.profile,
      s.lanes.join(','), JSON.stringify(s.fill), s.effects.join(','), s.prints.join(','), kept.length, ...(named ? [s.name] : [])));
  await env.DB.batch(stmts);

  // (its name here: the one just sent, unless it was given a name on the page since SF-000 last named it)
  const now2 = await env.DB.prepare('SELECT name FROM snapshots WHERE uid = ?').bind(uid).first();
  return json({ ok: true, uid, clip: !!(was && was.has_clip), name: now2 ? now2.name : s.name, missingDefs: await missingDefs(env, s.prints) });
}

// What the index keeps of a snapshot. Exported for the tests.
export function summarise(snap) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const made = snap.made && typeof snap.made === 'object' ? snap.made : {};
  const p = snap.profile && typeof snap.profile === 'object' ? snap.profile : null;
  const lanes = Array.isArray(made.slots) && made.slots.length ? made.slots.map(String) : FIRST_LANES;

  const effects = [];
  for (const lane of Array.isArray(snap.inserts) ? snap.inserts : []) {
    for (const name of Array.isArray(lane) ? lane : []) {
      if (typeof name === 'string' && name !== 'NONE' && !effects.includes(name)) effects.push(name);
    }
  }
  // How full each lane's pattern is: lit steps over its length (sixteen at most), as SF-000 draws
  // a snapshot that has no sound kept.
  const fill = (Array.isArray(snap.patterns) ? snap.patterns : []).map((pat) => {
    const len = Math.max(1, Math.min(16, Number(pat && pat.len) || 16));
    const lit = (Array.isArray(pat && pat.steps) ? pat.steps : []).filter((st) => Array.isArray(st) && st[0] < (Number(pat.len) || 16)).length;
    return Math.round(Math.min(1, lit / len) * 100) / 100;
  });
  const prints = [];
  const add = (x) => { if (typeof x === 'string' && PRINT.test(x) && !prints.includes(x)) prints.push(x); };
  for (const group of [made.lanes, made.fx, made.returns]) if (group && typeof group === 'object') Object.values(group).forEach(add);
  add(made.chassis);

  return {
    localId: snap.id === undefined ? '' : String(snap.id),
    name: String(snap.name || '').slice(0, 80),
    takenAt: num(snap.time),
    app: String(made.app || '').slice(0, 80),
    hasProfile: !!p,
    energy: p ? num(p.energy) : null, weight: p ? num(p.weight) : null, bright: p ? num(p.bright) : null,
    density: p ? num(p.density) : null, tone: p ? num(p.tone) : null, movement: p ? num(p.movement) : null, wet: p ? num(p.wet) : null,
    bpm: p ? num(p.bpm) : null, bars: p ? num(p.bars) : null, profileV: p ? (num(p.v) || 1) : null,
    profile: p ? JSON.stringify(p) : '',
    lanes, fill, effects, prints,
  };
}

async function missingDefs(env, prints) {
  if (!prints.length) return [];
  const known = new Set();
  for (let i = 0; i < prints.length; i += 80) {
    const part = prints.slice(i, i + 80);
    const { results } = await env.DB.prepare(`SELECT print FROM defs WHERE print IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    for (const r of results) known.add(r.print);
  }
  return prints.filter((x) => !known.has(x));
}

async function receiveClip(request, env, uid) {
  const row = await env.DB.prepare('SELECT deleted_at FROM snapshots WHERE uid = ?').bind(uid).first();
  if (!row) return json({ error: 'send the snapshot first' }, 404);
  if (row.deleted_at) return json({ ok: true, uid, gone: true });
  if (Number(request.headers.get('content-length') || 0) > MAX_CLIP) return json({ error: 'too large' }, 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'empty' }, 400);
  if (bytes.byteLength > MAX_CLIP) return json({ error: 'too large' }, 413);
  const type = (request.headers.get('content-type') || 'audio/ogg').split(';')[0].trim();
  await env.BUCKET.put(`clips/${uid}`, bytes, { httpMetadata: { contentType: type } });
  await env.DB.prepare('UPDATE snapshots SET has_clip = 1, clip_size = ?, clip_type = ?, updated_at = ? WHERE uid = ?')
    .bind(bytes.byteLength, type, Date.now(), uid).run();
  return json({ ok: true, uid, size: bytes.byteLength });
}

// Body: { "uids": [...] }. Answers which of them are here, and which have their clip, so SF-000
// can catch up after time offline with one question. A snapshot removed here is "gone": known, not wanted again.
async function have(request, env) {
  const body = await request.json().catch(() => null);
  const uids = (body && Array.isArray(body.uids) ? body.uids : []).filter((u) => typeof u === 'string' && UID.test(u)).slice(0, MAX_LIST);
  const out = {};
  for (let i = 0; i < uids.length; i += 80) {
    const part = uids.slice(i, i + 80);
    const { results } = await env.DB.prepare(`SELECT uid, has_clip, deleted_at FROM snapshots WHERE uid IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    for (const r of results) out[r.uid] = r.deleted_at ? { gone: true } : { clip: !!r.has_clip };
  }
  return json({ have: out });
}

// ======================================================================
// The library
// ======================================================================
const LIST_COLUMNS = `uid, library_id, local_id, name, taken_at, received_at, app, has_profile, energy, weight, bright, density, tone,
  movement, wet, bpm, bars, profile_v, profile, lanes, fill, effects, has_clip, clip_size, tags, notes`;

function shape(r) {
  const parse = (t, d) => { try { return t ? JSON.parse(t) : d; } catch { return d; } };
  return {
    ...r,
    has_profile: !!r.has_profile, has_clip: !!r.has_clip,
    profile: parse(r.profile, null), fill: parse(r.fill, []),
    lanes: r.lanes ? r.lanes.split(',') : [], effects: r.effects ? r.effects.split(',') : [],
    tags: r.tags ? r.tags.split(',') : [],
  };
}

// Everything, newest first. Sorting, filtering and likeness are worked out on the page: a library
// is a few thousand small rows at most.
async function list(env, url) {
  const limit = Math.max(1, Math.min(MAX_LIST, Number(url.searchParams.get('limit')) || MAX_LIST));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const { results } = await env.DB.prepare(
    `SELECT ${LIST_COLUMNS} FROM snapshots WHERE deleted_at IS NULL ORDER BY COALESCE(taken_at, received_at) DESC, uid LIMIT ? OFFSET ?`)
    .bind(limit, offset).all();
  return json({ snapshots: results.map(shape) });
}

async function one(env, uid) {
  const row = await env.DB.prepare(`SELECT ${LIST_COLUMNS}, prints, json_size FROM snapshots WHERE uid = ? AND deleted_at IS NULL`).bind(uid).first();
  if (!row) return json({ error: 'not found' }, 404);
  const obj = await env.BUCKET.get(`snapshots/${uid}.json`);
  return json({ ...shape(row), prints: row.prints ? row.prints.split(',') : [], snapshot: obj ? await obj.json() : null });
}

// Tags and notes are this library's own: they are kept beside the snapshot, never in it, and go
// out with it under ext.web when it is exported. A name given here is the snapshot's name from
// then on (FORMAT.md: a snapshot's name is the one thing in it that may change); SF-000 takes it
// when it loads.
async function annotate(request, env, uid) {
  const body = await request.json().catch(() => ({}));
  const sets = [], args = [];
  if (typeof body.name === 'string' && body.name.trim()) { sets.push('name = ?'); args.push(body.name.trim().slice(0, 80)); }
  if (Array.isArray(body.tags)) { sets.push('tags = ?'); args.push(cleanTags(body.tags).join(',')); }
  if (typeof body.notes === 'string') { sets.push('notes = ?'); args.push(body.notes.slice(0, 4000)); }
  if (!sets.length) return json({ error: 'nothing to change' }, 400);
  const res = await env.DB.prepare(`UPDATE snapshots SET ${sets.join(', ')}, updated_at = ? WHERE uid = ? AND deleted_at IS NULL`).bind(...args, Date.now(), uid).run();
  if (!res.meta.changes) return json({ error: 'not found' }, 404);
  return one(env, uid);
}

export function cleanTags(tags) {
  const out = [];
  for (const t of tags) {
    const c = String(t).toLowerCase().replace(/[,\s]+/g, ' ').trim().slice(0, 40);
    if (c && !out.includes(c)) out.push(c);
  }
  return out.slice(0, 40);
}

// Removed: its files go, and a mark stays so SF-000 does not send it again. forget drops the mark
// too (and works on one already removed): the snapshot may then be sent and kept afresh.
async function remove(env, uid, forget) {
  const res = forget
    ? await env.DB.prepare('DELETE FROM snapshots WHERE uid = ?').bind(uid).run()
    : await env.DB.prepare('UPDATE snapshots SET deleted_at = ?, has_clip = 0 WHERE uid = ? AND deleted_at IS NULL').bind(Date.now(), uid).run();
  if (!res.meta.changes) return json({ error: 'not found' }, 404);
  await env.BUCKET.delete([`snapshots/${uid}.json`, `clips/${uid}`]);
  return json({ ok: true });
}

async function defsFor(env, prints) {
  const out = {};
  for (let i = 0; i < prints.length; i += 80) {
    const part = prints.slice(i, i + 80);
    const { results } = await env.DB.prepare(`SELECT print, json FROM defs WHERE print IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    for (const r of results) out[r.print] = JSON.parse(r.json);
  }
  // an engine is named from inside a lane's, effect's or return's definition
  const more = Object.values(out).map((d) => d && d.engine).filter((x) => typeof x === 'string' && PRINT.test(x) && !out[x] && !prints.includes(x));
  if (more.length) Object.assign(out, await (await defsFor(env, [...new Set(more)])).json().then((j) => j.defs));
  return json({ defs: out });
}

// A library file: the snapshots asked for, each as it arrived (under the name it has now) with this
// library's tags and notes under ext.web, and every definition they name. Body: { "uids": [...] }.
async function exportFile(request, env) {
  const body = await request.json().catch(() => null);
  const uids = (body && Array.isArray(body.uids) ? body.uids : []).filter((u) => typeof u === 'string' && UID.test(u)).slice(0, 500);
  const snapshots = [], prints = [];
  for (const uid of uids) {
    const row = await env.DB.prepare('SELECT name, tags, notes, prints FROM snapshots WHERE uid = ? AND deleted_at IS NULL').bind(uid).first();
    const obj = row && await env.BUCKET.get(`snapshots/${uid}.json`);
    if (!obj) continue;
    const snap = await obj.json();
    if (row.name) snap.name = row.name;                 // (its name now: the one thing in a snapshot that may change)
    if (row.tags || row.notes) {
      snap.ext = snap.ext && typeof snap.ext === 'object' ? snap.ext : {};
      snap.ext.web = { ...(snap.ext.web || {}), tags: row.tags ? row.tags.split(',') : [], notes: row.notes || '' };
    }
    snapshots.push(snap);
    for (const x of row.prints ? row.prints.split(',') : []) if (!prints.includes(x)) prints.push(x);
  }
  const defs = (await (await defsFor(env, prints)).json()).defs;
  return new Response(JSON.stringify({ sf000lib: 1, exported: Date.now(), snapshots, defs }), {
    headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="snapshots.sf000lib.json"', 'cache-control': 'no-store' },
  });
}

// Body: { "uids": [...], "add": [tags], "remove": [tags] }: the same tags put on, or taken off,
// many at once. Answers each one's tags as they now are.
async function tagMany(request, env) {
  const body = await request.json().catch(() => null);
  const uids = [...new Set((body && Array.isArray(body.uids) ? body.uids : []).filter((u) => typeof u === 'string' && UID.test(u)))].slice(0, MAX_LIST);
  const add = cleanTags(body && Array.isArray(body.add) ? body.add : []), drop = cleanTags(body && Array.isArray(body.remove) ? body.remove : []);
  if (!uids.length || (!add.length && !drop.length)) return json({ error: 'nothing to change' }, 400);
  const out = {}, now = Date.now();
  for (let i = 0; i < uids.length; i += 40) {
    const part = uids.slice(i, i + 40);
    const { results } = await env.DB.prepare(`SELECT uid, tags FROM snapshots WHERE deleted_at IS NULL AND uid IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    const stmts = [];
    for (const r of results) {
      const tags = cleanTags([...(r.tags ? r.tags.split(',') : []).filter((t) => !drop.includes(t)), ...add]);
      out[r.uid] = tags;
      if (tags.join(',') !== (r.tags || '')) stmts.push(env.DB.prepare('UPDATE snapshots SET tags = ?, updated_at = ? WHERE uid = ?').bind(tags.join(','), now, r.uid));
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return json({ tags: out });
}

// ======================================================================
// Stacks: named piles of chips. A macro is a stack that a snapshot knob holds; a song is parts in
// a line; a rule stack is filled by its rule, worked out on the page (which stores what it held
// when it last looked, so SF-000 can load it without knowing the rule).
// ======================================================================
const STACK_COLUMNS = 'id, name, kind, rule, items, depth, slot, load, pos, extra, created_at, updated_at';

function shapeStack(r) {
  const parse = (t, d) => { try { return t ? JSON.parse(t) : d; } catch { return d; } };
  return { ...r, rule: parse(r.rule, null), items: parse(r.items, []), extra: parse(r.extra, null), load: !!r.load };
}

// What a stack may hold, made safe: each item a chip by uid; a song's part keeps its bars and its
// way in. Only a song may hold a chip twice. Exported for the tests.
export function cleanItems(items, kind = 'stack') {
  const out = [], seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    const u = typeof it === 'string' ? it : it && it.u;
    if (typeof u !== 'string' || !UID.test(u)) continue;
    if (kind !== 'song') { if (seen.has(u)) continue; seen.add(u); }
    const item = { u };
    if (kind === 'song' && it && typeof it === 'object') {
      const bars = Math.round(Number(it.bars)), morph = Number(it.morph);
      item.bars = Number.isFinite(bars) ? Math.max(1, Math.min(256, bars)) : 8;
      item.morph = Number.isFinite(morph) ? Math.max(0, Math.min(256, morph)) : 0;
    }
    out.push(item);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

// The fields of a stack a request may set, checked. Exported for the tests.
export function stackFields(body, kindNow = 'stack') {
  const f = {};
  if (!body || typeof body !== 'object') return f;
  if (typeof body.name === 'string') f.name = body.name.trim().slice(0, 80);
  if (STACK_KINDS.includes(body.kind)) f.kind = body.kind;
  const kind = f.kind || kindNow;
  if (body.rule === null) f.rule = '';
  else if (body.rule && typeof body.rule === 'object') { const t = JSON.stringify(body.rule); if (t.length <= 8000) f.rule = t; }
  if (Array.isArray(body.items)) f.items = JSON.stringify(cleanItems(body.items, kind));
  if (body.depth === null) f.depth = null;
  else if (typeof body.depth === 'number' && Number.isFinite(body.depth)) f.depth = Math.max(0, Math.min(1, body.depth));
  if (body.slot === null) f.slot = null;
  else if (Number.isInteger(body.slot) && body.slot >= 1 && body.slot <= 16) f.slot = body.slot;
  if (typeof body.load === 'boolean') f.load = body.load ? 1 : 0;
  if (typeof body.pos === 'number' && Number.isFinite(body.pos)) f.pos = body.pos;
  if (body.extra === null) f.extra = '';
  else if (body.extra && typeof body.extra === 'object') { const t = JSON.stringify(body.extra); if (t.length <= 16000) f.extra = t; }
  return f;
}

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

async function stacks(env, removed) {
  const { results } = await env.DB.prepare(
    `SELECT ${STACK_COLUMNS}, deleted_at FROM stacks WHERE deleted_at IS ${removed ? 'NOT NULL' : 'NULL'} ORDER BY pos, created_at, id`).all();
  return json({ stacks: results.map(shapeStack) });
}

async function oneStack(env, id) {
  const row = await env.DB.prepare(`SELECT ${STACK_COLUMNS} FROM stacks WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
  return row ? json(shapeStack(row)) : json({ error: 'not found' }, 404);
}

// Body: any of name, kind, rule, items, depth, slot, load, pos, extra; and an id of the page's own
// making, so that a stack made twice (a request sent again) is one stack.
async function makeStack(request, env) {
  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === 'string' && STACK_ID.test(body.id) ? body.id : newId();
  const f = stackFields(body);
  const now = Date.now();
  if (f.pos === undefined) {
    const last = await env.DB.prepare('SELECT MAX(pos) AS p FROM stacks WHERE deleted_at IS NULL').first();
    f.pos = (last && typeof last.p === 'number' ? last.p : 0) + 1;
  }
  const stmts = [];
  if (f.slot) stmts.push(env.DB.prepare('UPDATE stacks SET slot = NULL, updated_at = ? WHERE slot = ? AND id <> ?').bind(now, f.slot, id));
  stmts.push(env.DB.prepare(
    `INSERT INTO stacks (id, name, kind, rule, items, depth, slot, load, pos, extra, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(id, f.name || '', f.kind || 'stack', f.rule || '', f.items || '[]', f.depth ?? null, f.slot ?? null, f.load || 0, f.pos, f.extra || '', now, now));
  await env.DB.batch(stmts);
  return oneStack(env, id);
}

async function changeStack(request, env, id) {
  const was = await env.DB.prepare('SELECT kind, deleted_at FROM stacks WHERE id = ?').bind(id).first();
  const body = await request.json().catch(() => null);
  if (was && was.deleted_at && body && body.restore === true) {            // put back, as it was
    await env.DB.prepare('UPDATE stacks SET deleted_at = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
    return oneStack(env, id);
  }
  if (!was || was.deleted_at) return json({ error: 'not found' }, 404);
  const f = stackFields(body, was.kind);
  const keys = Object.keys(f);
  if (!keys.length) return json({ error: 'nothing to change' }, 400);
  const now = Date.now();
  const stmts = [];
  // (a knob holds one macro: the one that had this knob lets go of it)
  if (f.slot) stmts.push(env.DB.prepare('UPDATE stacks SET slot = NULL, updated_at = ? WHERE slot = ? AND id <> ?').bind(now, f.slot, id));
  stmts.push(env.DB.prepare(`UPDATE stacks SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => f[k]), now, id));
  await env.DB.batch(stmts);
  return oneStack(env, id);
}

// Removed: marked, not erased, so it can be put back (PATCH { "restore": true }; any other change
// is refused on it, and POST /api/stacks with its id does nothing). Its chips are in the library
// as they were. It leaves the tray and its knob.
async function removeStack(env, id, forget) {
  const res = forget
    ? await env.DB.prepare('DELETE FROM stacks WHERE id = ?').bind(id).run()                     // (gone for good: a check clearing up after itself)
    : await env.DB.prepare('UPDATE stacks SET deleted_at = ?, load = 0, slot = NULL WHERE id = ? AND deleted_at IS NULL').bind(Date.now(), id).run();
  return res.meta.changes ? json({ ok: true }) : json({ error: 'not found' }, 404);
}

// What SF-000 takes at LOAD: every stack in the tray with the chips it holds now, and the macros
// that have a knob. Each chip is named with what the instrument needs to know before it asks for
// the snapshot itself (GET /api/snapshots/<uid>) and its clip: its name here, whether it has a clip.
async function load(env) {
  // (a macro is in the tray when it has a knob there: its bay; any other stack when it is marked for it)
  const { results } = await env.DB.prepare(
    `SELECT ${STACK_COLUMNS} FROM stacks WHERE deleted_at IS NULL AND ((kind = 'macro' AND slot IS NOT NULL) OR (kind <> 'macro' AND load = 1)) ORDER BY pos, created_at, id`).all();
  const all = results.map(shapeStack);
  const uids = [...new Set(all.flatMap((s) => s.items.map((it) => it.u)))];
  const chips = {};
  for (let i = 0; i < uids.length; i += 80) {
    const part = uids.slice(i, i + 80);
    const got = await env.DB.prepare(`SELECT uid, name, has_clip, tags, updated_at FROM snapshots WHERE deleted_at IS NULL AND uid IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    for (const r of got.results) chips[r.uid] = { name: r.name, clip: !!r.has_clip, tags: r.tags ? r.tags.split(',') : [], at: r.updated_at };
  }
  const here = (s) => s.items.filter((it) => chips[it.u]);              // (a chip removed from the library since is not loaded)
  const out = { load: 1, at: Date.now(), stacks: [], knobs: [], chips };
  for (const s of all) {
    const items = here(s);
    if (s.kind === 'macro') {
      if (s.slot && items.length) out.knobs.push({ id: s.id, slot: s.slot, name: s.name, depth: s.depth, uids: items.map((it) => it.u) });
      continue;
    }
    const st = { id: s.id, name: s.name, kind: s.kind === 'song' ? 'song' : 'stack', uids: items.map((it) => it.u) };
    if (s.kind === 'song') st.parts = items.map((it) => ({ uid: it.u, bars: it.bars || 8, morph: it.morph || 0 }));
    out.stacks.push(st);
  }
  for (const u of Object.keys(chips)) if (!out.stacks.some((s) => s.uids.includes(u)) && !out.knobs.some((k) => k.uids.includes(u))) delete chips[u];
  return json(out);
}

async function stats(env) {
  const all = await env.DB.prepare(
    `SELECT COUNT(*) AS snapshots, COALESCE(SUM(has_clip), 0) AS clips, COALESCE(SUM(has_profile), 0) AS profiled,
            COUNT(DISTINCT library_id) AS libraries, MAX(received_at) AS last_received,
            COALESCE(SUM(clip_size), 0) + COALESCE(SUM(json_size), 0) AS bytes
     FROM snapshots WHERE deleted_at IS NULL`).first();
  const defs = await env.DB.prepare('SELECT COUNT(*) AS n FROM defs').first();
  const st = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(load), 0) AS loaded FROM stacks WHERE deleted_at IS NULL').first();
  return json({ ...all, defs: defs.n, stacks: st.n, in_tray: st.loaded });
}

async function serveClip(request, env, uid) {
  const key = `clips/${uid}`;
  const range = parseRange(request.headers.get('range'));
  const obj = request.method === 'HEAD' ? await env.BUCKET.head(key) : await env.BUCKET.get(key, range ? { range } : undefined);
  if (!obj) return json({ error: 'no clip' }, 404);
  const headers = new Headers({
    'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'audio/ogg',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=31536000, immutable',     // a snapshot's clip never changes
    etag: obj.httpEtag,
  });
  if (request.method === 'HEAD') { headers.set('content-length', String(obj.size)); return new Response(null, { headers }); }
  if (range && obj.range) {
    const start = obj.range.offset ?? Math.max(0, obj.size - (obj.range.suffix ?? 0));
    const length = obj.range.length ?? obj.size - start;
    headers.set('content-range', `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
}

function parseRange(h) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(h || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') return { suffix: Number(m[2]) };
  if (m[2] === '') return { offset: Number(m[1]) };
  return { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

// ======================================================================
// Who is asking: Cloudflare Access, checked here as well as at the edge
// ======================================================================
// A person signs in through Access in the browser. SF-000 sends an Access service token (two
// headers); Access turns either into the same signed assertion, and this checks its signature.
async function authorize(request, env) {
  if (env.ALLOW_UNAUTHENTICATED === 'true') return { ok: true };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { ok: false, error: 'Access not configured (set ACCESS_TEAM_DOMAIN and ACCESS_AUD)' };
  }
  const token = request.headers.get('cf-access-jwt-assertion') || cookie(request, 'CF_Authorization');
  if (!token) return { ok: false, error: 'missing Access token' };
  try {
    const [h, pl, sig] = token.split('.');
    const header = JSON.parse(b64urlText(h));
    const payload = JSON.parse(b64urlText(pl));
    const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (payload.iss !== `https://${team}`) throw new Error('bad issuer');
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) throw new Error('bad audience');
    if (payload.exp * 1000 < Date.now()) throw new Error('expired');

    if (!certCache.keys || Date.now() - certCache.at > 3600_000) {
      const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
      certCache = { at: Date.now(), keys: (await r.json()).keys };
    }
    const jwk = certCache.keys.find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('unknown key');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${pl}`));
    if (!valid) throw new Error('bad signature');
    return { ok: true, email: payload.email, name: payload.common_name };
  } catch (e) {
    return { ok: false, error: `Access token rejected: ${e.message}` };
  }
}

function cookie(request, name) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
function b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlText(s) { return new TextDecoder().decode(b64urlBytes(s)); }
