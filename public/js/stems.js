// A snapshot's stems, heard in the page. SF-000 keeps a snapshot's bars lane by lane (each lane,
// the two returns, the drum bus) and ONLINE sends them here as one file: "SF0STEMS1\n", a line of
// JSON ({ rate, bars, stems: [{ key, bytes }] }), then the stems one after another, each an Ogg
// file. Played, every stem runs on a gain of its own, in step with the others and round and round
// as the clip does: a key put out on a chip silences its part at once, and lit again brings it back.
// (The key and the master have no stem: they are what a recall takes, not something to hear.)
const MARK = 'SF0STEMS1\n';
const kept = new Map();                 // uid -> a promise of { bars, parts: Map(key -> AudioBuffer) }: the last few asked for
let ctx = null, now = null;             // what is playing: { uid, gains: Map(key -> GainNode), sources: [] }

// What a stems file holds: { rate, bars, stems: [{ key, at, bytes }] }, or null if it is not one.
export function readHead(buffer) {
  const u8 = new Uint8Array(buffer);
  if (new TextDecoder().decode(u8.subarray(0, MARK.length)) !== MARK) return null;
  let end = -1;
  for (let i = MARK.length; i < Math.min(u8.length, MARK.length + 16384); i++) if (u8[i] === 10) { end = i; break; }
  if (end < 0) return null;
  let head;
  try { head = JSON.parse(new TextDecoder().decode(u8.subarray(MARK.length, end))); } catch { return null; }
  if (!head || !Array.isArray(head.stems)) return null;
  const stems = [];
  let at = end + 1;
  for (const st of head.stems) {
    const n = Number(st && st.bytes);
    if (!st || typeof st.key !== 'string' || !Number.isInteger(n) || n <= 0 || at + n > u8.length) return null;
    stems.push({ key: st.key, at, bytes: n });
    at += n;
  }
  return { rate: Number(head.rate) || 0, bars: Number(head.bars) || 0, stems };
}

// The stem that carries a part of the rig: a lane's own; the returns are two (the dub and the space).
export const stemKeys = (part) => (part === 'returns' ? ['dub', 'space'] : part === 'master' ? [] : [part]);

function audioContext() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = AC ? new AC() : null; }
  return ctx;
}

function load(uid) {
  if (kept.has(uid)) return kept.get(uid);
  const made = (async () => {
    const ac = audioContext();
    if (!ac) throw new Error('no sound here');
    const r = await fetch(`/api/stems/${encodeURIComponent(uid)}`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(String(r.status));
    const buffer = await r.arrayBuffer(), head = readHead(buffer);
    if (!head) throw new Error('not a stems file');
    const parts = new Map();
    await Promise.all(head.stems.map(async (st) => {
      try { parts.set(st.key, await ac.decodeAudioData(buffer.slice(st.at, st.at + st.bytes))); } catch { /* one that will not decode is one not heard */ }
    }));
    if (!parts.size) throw new Error('nothing to hear');
    return { bars: head.bars, parts };
  })();
  kept.set(uid, made);
  made.catch(() => kept.delete(uid));
  if (kept.size > 6) kept.delete(kept.keys().next().value);
  return made;
}

export function stop() {
  if (!now) return;
  for (const s of now.sources) { try { s.stop(); } catch { /* not started */ } s.disconnect(); }
  for (const g of now.gains.values()) g.disconnect();
  now = null;
}

// Which parts are out: the stems of each go silent, the rest sound. (A short ramp: no click.)
export function setOff(off) {
  if (!now) return;
  const out = new Set((off || []).flatMap(stemKeys)), t = ctx.currentTime;
  for (const [key, g] of now.gains) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(out.has(key) ? 0 : 1, t, 0.008); }
}

export const playing = () => (now ? now.uid : null);

// Play a snapshot from its stems, with the parts in `off` silent. Resolves true once it sounds;
// false if it has no stems that will play here (the caller plays its clip instead).
export async function play(uid, off) {
  stop();
  let got;
  try { got = await load(uid); } catch { return false; }
  const ac = audioContext();
  if (!ac) return false;
  if (ac.state === 'suspended') { try { await ac.resume(); } catch { return false; } }
  stop();                                 // (another may have been asked for while this one was being fetched)
  const out = new Set((off || []).flatMap(stemKeys));
  const at = ac.currentTime + 0.03, gains = new Map(), sources = [];
  for (const [key, buffer] of got.parts) {
    const g = ac.createGain();
    g.gain.value = out.has(key) ? 0 : 1;
    g.connect(ac.destination);
    const src = ac.createBufferSource();
    src.buffer = buffer; src.loop = true;
    src.connect(g); src.start(at);
    gains.set(key, g); sources.push(src);
  }
  now = { uid, gains, sources };
  return true;
}
