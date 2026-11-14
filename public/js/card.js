// A snapshot's card, drawn as SF-000 draws it in its own library: a number, the name, when it was
// taken, and under them what it sounded like: a block as tall as its energy and as hot as it is
// bright, the spectrum's shape, where the hits fall in the bar, and how much of each lane.
import { heat } from './profile.js';

export const CARD_W = 272, CARD_H = 66;
export const COL = {
  putty: '#CFC8BC', grey: '#ABACA7', bluegrey: '#A4B1B7', sea: '#8D9794', white: '#E8E5E1', black: '#2B2B28',
  green: '#428F47', red: '#B54142', amber: '#C5843F', yellow: '#D7C352', lit: '#E9E6E2',
};
// The dark instrument (SF-000 with D): plates are dark, a pale display's ground is dark, and print
// and marks are light. Lights and the yellow keys are as they were. Its own figures, from its Screen.cpp.
export const NIGHT = { plate: '#3B3C3A', plate2: '#303231', ink: '#D8D3C8', paper: '#1A1C1B', key: '#565955', keyOff: '#484A47', faint: '#5A605D', dim: '#7C807A', room: '#0D0E0F', body: '#24272A', badge: '#151615' };
let night = false;
export function setNight(on) { night = !!on; }
export const isNight = () => night;
// What a card is drawn in: its ground, its frame, the ground of its name and its boxes, its marks.
const ink = () => (night
  ? { frame: NIGHT.badge, ground: NIGHT.plate, pane: NIGHT.paper, mark: NIGHT.ink, tag: NIGHT.badge, tagInk: COL.lit, markRgb: '216, 211, 200' }
  : { frame: COL.black, ground: COL.putty, pane: COL.white, mark: COL.black, tag: COL.black, tagInk: COL.lit, markRgb: '43, 43, 40' });

const LEGEND = '600 15px "Barlow Condensed", sans-serif';
const LABEL = '500 11.5px "Barlow Semi Condensed", sans-serif';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function when(ms) {
  if (!ms) return '';
  const d = new Date(ms), two = (n) => String(n).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}  ${two(d.getHours())}:${two(d.getMinutes())}`;
}

function spaced(ctx, text, x, y, gap) {             // the instrument's lettering is tracked out a little
  ctx.letterSpacing = `${gap}px`;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
}

// s: a row from /api/snapshots with .p (its profile unpacked, or null).
export function drawCard(canvas, s, index, flags = {}) {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== CARD_W * dpr) { canvas.width = CARD_W * dpr; canvas.height = CARD_H * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintCard(g, s, index, flags);
}

// A chip's face for the bench: the card's print alone on a canvas of its own, `scale` pixels to
// the card's one, clear wherever nothing is printed (the chip itself is the card's ground: a plate,
// with a plate's own wear showing between the print).
export function faceCanvas(s, index, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CARD_W * scale); canvas.height = Math.round(CARD_H * scale);
  const g = canvas.getContext('2d');
  g.setTransform(scale, 0, 0, scale, 0, 0);
  paintCard(g, s, index, { bare: true });
  return canvas;
}

// The card itself, on any context already scaled so that it is CARD_W by CARD_H. index: its
// number where it lies (0 the first), or a string to print in the number's place, or null for none.
export function paintCard(g, s, index, { selected = false, playing = false, marked = false, bare = false } = {}) {
  g.textBaseline = 'middle';
  const c = ink();
  if (s.move) { paintMove(g, s, index, c); return; }

  if (!bare) {
    g.fillStyle = selected && night ? c.mark : c.frame; g.fillRect(0, 0, CARD_W, CARD_H);
    const inset = selected ? 4 : 1;
    g.fillStyle = c.ground; g.fillRect(inset, inset, CARD_W - 2 * inset, CARD_H - 2 * inset);
  }

  const x0 = 6, y0 = 6;
  g.font = LEGEND;
  const num = index === null || index === undefined ? '' : typeof index === 'string' ? index : String(index + 1);
  const wTag = num ? Math.max(30, Math.ceil(g.measureText(num).width) + 10) : 0;
  g.fillStyle = marked ? COL.yellow : c.tag; g.fillRect(x0, y0, wTag, 24);
  g.fillStyle = marked ? COL.black : c.tagInk; g.textAlign = 'center';
  g.fillText(num, x0 + wTag / 2, y0 + 13);

  g.textAlign = 'left';
  const right = playing ? 'PLAYING' : when(s.taken_at || s.received_at);
  g.font = playing ? LEGEND : LABEL;
  const wRight = Math.ceil(g.measureText(right).width) + (playing ? 22 : 8);
  g.font = LEGEND;
  let name = (s.name || 'UNNAMED').toUpperCase();
  const room = CARD_W - 12 - wTag - wRight - 20;
  while (name.length > 3 && g.measureText(name).width + name.length * 0.6 > room) name = name.slice(0, -1);
  const wName = Math.ceil(g.measureText(name).width + name.length * 0.6) + 16;
  g.fillStyle = c.pane; g.fillRect(x0 + wTag, y0, wName, 24);
  g.fillStyle = c.mark; spaced(g, name, x0 + wTag + 8, y0 + 13, 0.6);

  if (playing) {
    g.fillStyle = COL.green; g.fillRect(CARD_W - 6 - wRight, y0, wRight, 24);
    g.fillStyle = COL.lit; spaced(g, right, CARD_W - 6 - wRight + 8, y0 + 13, 0.6);
  } else {
    g.font = LABEL; g.fillStyle = c.mark; g.textAlign = 'right';
    spaced(g, right, CARD_W - 6, y0 + 13, 0.5);
    g.textAlign = 'left';
  }

  const gy = y0 + 28, gh = 30;
  const box = (x, w) => { g.fillStyle = c.frame; g.fillRect(x, gy, w, gh); g.fillStyle = c.pane; g.fillRect(x + 1, gy + 1, w - 2, gh - 2); return { x: x + 1, y: gy + 1, w: w - 2, h: gh - 2 }; };
  const p = s.p;
  if (p) {
    const e = box(x0, 16);
    const eh = Math.round(p.energy * e.h);
    g.fillStyle = heat(p.bright); g.fillRect(e.x, e.y + e.h - eh, e.w, eh);

    const sp = box(x0 + 20, 82);                                // the spectrum's shape, low to high
    g.fillStyle = c.mark;
    for (let k = 0; k < 16; k++) { const h = Math.round(p.bands[k] * sp.h); g.fillRect(sp.x + k * 5, sp.y + sp.h - h, 4, h); }

    const pu = box(x0 + 106, 98);                               // where the hits fall: the top above, the low end below
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 16; k++) {
        const v = p.pulse[(row === 0 ? 16 : 0) + k];
        if (v < 0.08) continue;
        g.fillStyle = `rgba(${c.markRgb}, ${Math.min(1, v)})`;
        g.fillRect(pu.x + k * 6, pu.y + row * 14, 5, 13);
      }
    }
    const la = box(x0 + 208, 52);                               // how much of each lane
    g.fillStyle = c.mark;
    const n = p.lanes.length || 11, step = (la.w - 2) / n;
    for (let l = 0; l < n; l++) { const h = Math.round(p.lanes[l] * la.h); g.fillRect(la.x + 1 + l * step, la.y + la.h - h, Math.max(1, step - 1), h); }
    return;
  }
  // no sound was kept with it: how full each lane's pattern is
  const fill = s.fill || [], n = Math.max(1, fill.length || 11), pitch = 260 / n;
  for (let l = 0; l < n; l++) {
    const x = x0 + l * pitch, w = Math.min(20, pitch - 3.6);
    g.fillStyle = c.mark; g.fillRect(x, y0 + 30, w, 16);
    g.fillStyle = c.pane; g.fillRect(x + 1, y0 + 31, w - 2, 14);
    const h = Math.round((Number(fill[l]) || 0) * 14);
    g.fillStyle = c.mark; g.fillRect(x + 1, y0 + 45 - h, w - 2, h);
  }
}

// One move of a knob macro, as a plate: which of the rig's knobs it turns (its lane, its name) and
// how far the whole turn takes it: a share of that knob's travel, up (to the right) or down.
export const moveName = (c) => String(c).replace(/[._]/g, ' ').toUpperCase();
function paintMove(g, s, index, c) {
  const x0 = 6, y0 = 6, d = Math.max(-1, Math.min(1, Number(s.move.d) || 0));
  g.font = LEGEND;
  const num = index === null || index === undefined ? '' : typeof index === 'string' ? index : String(index + 1);
  const wTag = num ? Math.max(30, Math.ceil(g.measureText(num).width) + 10) : 0;
  g.fillStyle = c.tag; g.fillRect(x0, y0, wTag, 24);
  g.fillStyle = c.tagInk; g.textAlign = 'center'; g.fillText(num, x0 + wTag / 2, y0 + 13);
  const amount = `${d >= 0 ? '+' : '\u2212'}${Math.round(Math.abs(d) * 100)}`;
  const wRight = Math.ceil(g.measureText(amount).width) + 16;
  g.textAlign = 'left';
  let name = s.name;
  const room = CARD_W - 12 - wTag - wRight - 12;
  while (name.length > 3 && g.measureText(name).width + name.length * 0.6 > room) name = name.slice(0, -1);
  g.fillStyle = c.pane; g.fillRect(x0 + wTag, y0, Math.ceil(g.measureText(name).width + name.length * 0.6) + 16, 24);
  g.fillStyle = c.mark; spaced(g, name, x0 + wTag + 8, y0 + 13, 0.6);
  g.fillStyle = c.tag; g.fillRect(CARD_W - 6 - wRight, y0, wRight, 24);
  g.fillStyle = c.tagInk; g.textAlign = 'center'; g.fillText(amount, CARD_W - 6 - wRight / 2, y0 + 13);
  // its travel: a slot from all the way down to all the way up, the middle marked, and how far it goes
  const gy = y0 + 28, gh = 30, w = CARD_W - 12, mid = x0 + w / 2;
  g.fillStyle = c.frame; g.fillRect(x0, gy, w, gh); g.fillStyle = c.pane; g.fillRect(x0 + 1, gy + 1, w - 2, gh - 2);
  g.fillStyle = d >= 0 ? COL.amber : '#4490A1';
  const len = Math.abs(d) * (w / 2 - 2);
  g.fillRect(d >= 0 ? mid : mid - len, gy + 5, len, gh - 10);
  g.fillStyle = c.mark; g.fillRect(mid - 1, gy + 2, 2, gh - 4);
}
