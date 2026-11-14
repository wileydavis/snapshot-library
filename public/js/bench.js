// The bench: the library as things to handle, made as SF-000 is made. A powder-coated case in
// a dark room; on it a faceplate with a cut-out for every stack, the stacks standing in them as
// piles of chips; in front, on the case itself, the open stack dealt out; on the right the plate
// of what SF-000 loads. A chip is one of the instrument's plates: a snapshot's card printed on
// worn black anodizing, its colour on its edge. Everything is drawn with the instrument's own
// finishes and light (look.js). This file draws and is handled; what anything means is main.js's
// business, told here through setRack / setTray / deal / setMarks and heard back through the handlers.
import * as THREE from '../vendor/three.min.js';
import { faceCanvas, COL, NIGHT } from './card.js';
import { heat } from './profile.js';
import { PLATE, PANE, CASE, CORNER, UNIT, SUN, shared, surface, another, setRect, setMap, setColour, dropMap, litColour, makeRoom, slabGeo, plateGeo, Picture, loadWear, KnobBatch, RING } from './look.js';

// ---------------------------------------------------------------- sizes (a chip is 4.12 by 1: the card's own shape, and as thick as one of the instrument's plates)
export const CW = 4.12, CD = 1.0, CT = PLATE;
const PITCH_X = CW + 0.32, PITCH_Z = CD + 0.3;                         // the table's cells
const POCKET_W = CW + 0.44, POCKET_D = CD + 0.36;                      // a stack's cut-out in the rack's plate
const LABEL_D = 0.52;                                                  // a stack's name plate, in front of its cut-out
const RACK_PITCH_X = POCKET_W + 0.46, RACK_PITCH_Z = POCKET_D + LABEL_D + 0.78;
const PILE_MOST = 0.95;                                                // the tallest a pile stands
const STRATA = 96;                                                     // a pile is drawn as no more layers than this (a taller one's are too fine to see apart)
const MARGIN = 0.55, LIP = 0.34;
// A knob module: a small plate with a name on a display and its two knobs, TURN and DEPTH (the
// instrument's small ones). Sizes in the instrument's units, from its far left corner.
const MOD = { w: 140, d: 88, name: [3, 3, 134, 22], knobs: [[94, 50], [122, 50]] };
const MW = MOD.w / UNIT, MD = MOD.d / UNIT;
// The chassis: the model of SF-000 the tray has become. Sixteen pockets, four by four, as its snapshot knobs are.
const BAY_X = MW + 0.12, BAY_Z = MD + 0.2, CH = 0.42;                  // the pockets' pitch; how high its case stands on the bench
const TRAY_W = 4 * BAY_X + 0.3;
const RAIL = 0.3, RAIL_H = 0.2;                                        // the rails the rack's plate slides under
const MINI = 0.3;                                                      // the tray's chips are a quarter the size
const TILT = (57 * Math.PI) / 180, FOV = 26;
const MIN_CHIP_PX = 226;

const TEAL = '#4490A1';                                                // a sweeping knob's light on the instrument
const KNOB_LIGHT = { macro: TEAL, cue: '#C5843F', learn: '#E9E6E2' };  // (a stack's knob steps: amber)
const KNOB_KIND = { macro: 'MACRO', cue: 'CUE STACK', learn: 'KNOB MACRO' };
const EDGE_NONE = '#9A9B96';                                           // a chip with no sound kept
const edgeColour = (s) => (s && s.move ? (s.move.d >= 0 ? COL.amber : TEAL) : s && s.p ? heat(s.p.bright) : EDGE_NONE);      // (a knob macro's move: up or down)
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Print: a picture that keeps how much of the surface it covers (clear where nothing is printed).
function printOf(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = true; t.anisotropy = 8;
  return t;
}
function plateTexture(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return printOf(c);
}
// A thing's own number (0 to 999), from its name: which of the wear it has.
function numberOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1000;
}
const LEGEND = (px) => `600 ${px}px "Barlow Condensed", sans-serif`;
const LABEL = (px) => `500 ${px}px "Barlow Semi Condensed", sans-serif`;
function fitText(g, text, room) {
  let t = text;
  while (t.length > 2 && g.measureText(t).width > room) t = t.slice(0, -1);
  return t === text ? t : `${t.trimEnd()}.`;
}

export class Bench {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.on = handlers;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    // (a browser with no graphics card draws every point by sums on the processor: there the bench is drawn less sharp, or it could not be used at all. ?sharp asks for it whole.)
    const gl = this.renderer.getContext(), told = gl.getExtension('WEBGL_debug_renderer_info');
    this.soft = /swiftshader|llvmpipe|software/i.test(told ? String(gl.getParameter(told.UNMASKED_RENDERER_WEBGL)) : '') && !/[?&]sharp\b/.test(location.search);
    this.picture = new Picture(this.renderer);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
    this.ray = new THREE.Raycaster();

    this.rackPiles = []; this.trayData = { bays: [], stacks: [] }; this.dealt = []; this.items = new Map();
    this.faces = new Map();                                 // uid -> { tex, label, used }
    this.knobSpots = []; this.turns = new Map();            // the modules' knobs, for the hand; and how far each TURN has been turned
    this.marks = { selected: null, playing: null, marked: new Set() };
    this.scroll = 0; this.scrollTo = 0; this.rackRow = 0; this.rackShift = 0;
    this.drag = null; this.hover = null; this.gap = -1;
    this.clipTable = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.clipRack = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.clipFar = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.inRack = [this.clipRack, this.clipFar]; this.onTable = [this.clipTable];
    this.frame = 0; this.active = true; this.tick = this.tick.bind(this);

    this.makeMaterials();
    this.fixed = new THREE.Group(); this.rack = new THREE.Group(); this.table = new THREE.Group(); this.tray = new THREE.Group(); this.held = new THREE.Group();
    this.scene.add(this.fixed, this.rack, this.table, this.tray, this.held);
    this.room = makeRoom(); this.scene.add(this.room);
    this.lights();
    this.layout();
    this.listen();
    loadWear(this.renderer, () => this.poke());
    this.poke();
  }

  // ---------------------------------------------------------------- what things are made of
  makeMaterials() {
    this.mat = {
      case: surface({ kind: 4, worn: 2, metal: 0.55 }),                                 // the case: powder coat
      rail: surface({ worn: 2, metal: 0.55 }),
      rack: surface({ worn: 1, number: 371, clip: this.inRack }),                       // the plates: anodized, each with its own wear
      tray: surface({ worn: 1, number: 644 }),
      badge: surface({ rough: 0.2, kind: 2 }),                                          // a name plate: one of the instrument's displays (glass; what it shows is light, whatever shade it stands in)
      yellow: surface({ rough: 0.5, kind: 3, emit: 0.85 }), green: surface({ rough: 0.5, kind: 3, emit: 0.85 }),      // lit, as a lit key is
      chip: surface({ kind: 1, worn: 1, rect: [0, 0, CW / 2, CD / 2] }),
      module: surface({ kind: 1, worn: 1, rect: [0, 0, MW / 2, MD / 2] }),
      pile: surface({ rough: 0.62, clip: this.inRack }), mini: surface({ rough: 0.62 }),
    };
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.chipGeo = slabGeo(CW, CD, CT); this.chipGeo.translate(0, -CT / 2, 0);          // (a chip's place is its middle)
    this.layerGeo = slabGeo(CW, CD, 1, CORNER, 0, 4, 1, false);                         // one layer of a pile, as tall as it is made: its wall alone (its top is under the next)
    this.capGeo = slabGeo(CW, CD, 1, CORNER, 0, 4);                                     // the top layer of a small pile, which has a top
    this.moduleGeo = slabGeo(MW, MD, PLATE);
    this.badgeGeos = new Map(); this.modulePrints = new Map();
    this.paint();
  }
  // The bench's finishes, light or dark: each is its instrument's (the dark one's plates are worn, its case powder-coated).
  paint() {
    const D = !!this.dark, m = this.mat;
    this.P = D
      ? { body: NIGHT.body, plate: NIGHT.plate, badge: NIGHT.badge, caseRough: 0.40, plateRough: 0.7, blank: NIGHT.plate }
      : { body: '#A4B1B7', plate: COL.putty, badge: COL.black, caseRough: 0.46, plateRough: 0.82, blank: COL.putty };
    const P = this.P;
    shared.uFinish.value = D ? 1 : 0;
    for (const x of [m.case, m.rail]) { setColour(x, P.body); x.uniforms.uRough.value = P.caseRough; }
    for (const x of [m.rack, m.tray, m.chip, m.module]) { setColour(x, P.plate); x.uniforms.uRough.value = P.plateRough; }
    setColour(m.badge, P.badge);
    setColour(m.yellow, litColour(COL.yellow)); setColour(m.green, litColour(COL.green));
    for (const x of Object.values(m)) Object.assign(x.userData.spec, { colour: x.uniforms.uColour.value.clone(), rough: x.uniforms.uRough.value });
  }
  // A name plate's shape, by its size (the same few sizes, over and over).
  badgeGeo(w, d) {
    const key = `${w.toFixed(3)}x${d.toFixed(3)}`;
    let g = this.badgeGeos.get(key);
    if (!g) { g = slabGeo(w, d, PANE, 1.4 / UNIT, 0.5 / UNIT, 3, 2); this.badgeGeos.set(key, g); }
    return g;
  }
  // Light or dark. Everything printed is printed again: the chips' faces, the plates.
  setDark(on) {
    if (!!on === !!this.dark) return;
    this.dark = !!on;
    this.paint();
    for (const f of this.faces.values()) f.tex.dispose();
    this.faces.clear();
    for (const t of this.modulePrints.values()) t.dispose();
    this.modulePrints.clear();
    for (const it of this.items.values()) { it.textured = false; setColour(it.mat, this.P.plate); it.mat.uniforms.uRough.value = this.P.plateRough; }
    this.buildFixed(); this.buildRack(); this.buildTray(); this.place(false);
    this.poke();
  }

  // The light is the instrument's (look.js works it out for every surface); this one is there to throw its shadows.
  lights() {
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.soft ? 2048 : 4096, this.soft ? 2048 : 4096);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.7 / UNIT; sun.shadow.radius = 2;
    this.sun = sun;
    this.scene.add(sun, sun.target);
  }

  // ---------------------------------------------------------------- where everything is: from the window's shape
  layout() {
    const w = Math.max(320, this.canvas.clientWidth), h = Math.max(240, this.canvas.clientHeight);
    const dpr = this.soft ? 0.6 : Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.picture.setSize(size.x, size.y);
    this.room.material.uniforms.uRes.value.copy(size);
    const tf = Math.tan((FOV * Math.PI) / 360), tx = tf * (w / h), sin = Math.sin(TILT), cos = Math.cos(TILT);
    // the table's columns: as many as leave a chip at least MIN_CHIP_PX wide
    const cols = clamp(Math.floor(((w / MIN_CHIP_PX) * CW - TRAY_W - 3 * MARGIN + 0.32) / PITCH_X), 2, 12);
    const W = cols * PITCH_X - 0.32 + TRAY_W + 3 * MARGIN;
    // the eye: looking down at TILT, as far off as shows W across the bottom edge of the window
    const tb = sin / (sin + cos * tf), tt = sin / (sin - cos * tf);
    const zNear1 = cos + tb * (-cos + sin * tf), zFar1 = cos + tt * (-cos - sin * tf);
    const D = W / (2 * (1 - zNear1 * cos) * tx);
    this.camera.aspect = w / h;
    this.camera.position.set(0, D * sin, D * cos);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = D * 0.2; this.camera.far = D * 4;
    this.camera.updateProjectionMatrix();
    this.halfWidthAt = (z) => (D - z * cos) * tx;
    const zNear = D * zNear1, zFar = D * zFar1;

    const L = this.L = { cols, W, w, h, zNear, zFar };
    L.rackRows = zNear - zFar > 16.5 ? 2 : 1;
    L.zc0 = zFar + 0.42;                                             // the case's far edge: a strip of the room shows beyond it
    L.zf0 = L.zc0 + 0.2;                                             // the far rail
    L.zr0 = L.zf0 + RAIL - 0.25;                                     // the rack's first row begins a little this side of it
    L.zr1 = L.zr0 + 0.55 + L.rackRows * RACK_PITCH_Z;                // and the rack ends at the lip
    L.caseHalf = this.halfWidthAt(L.zc0) - 0.5;                      // the case is wider than the window is at its near edge: its far corners show, with the room round them
    L.zt0 = L.zr1 + LIP + 0.22;                                      // the table's first row
    L.zt1 = zNear + 0.6;
    L.rows = Math.max(1, Math.ceil((zNear - L.zt0) / PITCH_Z));       // rows that show at all
    L.wholeRows = Math.max(1, Math.floor((zNear - 0.25 - L.zt0) / PITCH_Z));
    L.tx0 = -W / 2 + MARGIN;                                         // the table's left edge
    L.trayX = W / 2 - MARGIN - TRAY_W;
    L.rackCols = Math.max(2, Math.floor((2 * this.halfWidthAt(L.zr1 - RACK_PITCH_Z * 0.5) - 2 * MARGIN + 0.46) / RACK_PITCH_X));
    L.rackX0 = -(L.rackCols * RACK_PITCH_X - 0.46) / 2;
    this.clipTable.constant = -(L.zr1 + LIP * 0.5);
    this.clipRack.constant = L.zr1 + LIP * 0.5;
    this.clipFar.constant = -(L.zf0 + RAIL * 0.5);

    // the light: the instrument's, from behind and to the left. Its shadows are worked out for what the window shows.
    const mid = (zNear + zFar) / 2, far = this.halfWidthAt(zFar) + 1, R = Math.max(far, (zNear - zFar) / 2) * 3;
    const at = new THREE.Vector3(0, 0, mid), from = at.clone().addScaledVector(SUN, R);
    this.sun.target.position.copy(at); this.sun.position.copy(from);
    const f = SUN.clone().negate(), sx = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), sy = new THREE.Vector3().crossVectors(sx, f);
    const box = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 }, p = new THREE.Vector3();
    for (const x of [-far, far]) for (const y of [-0.2, PILE_MOST + 0.4]) for (const z of [zFar - 1, zNear + 1.5]) {
      p.set(x, y, z).sub(at);
      const a = p.dot(sx), b = p.dot(sy), c = p.dot(f) + R;
      box.x0 = Math.min(box.x0, a); box.x1 = Math.max(box.x1, a); box.y0 = Math.min(box.y0, b); box.y1 = Math.max(box.y1, b); box.z0 = Math.min(box.z0, c); box.z1 = Math.max(box.z1, c);
    }
    const s = this.sun.shadow.camera;
    s.left = box.x0; s.right = box.x1; s.bottom = box.y0; s.top = box.y1; s.near = Math.max(0.1, box.z0 - 2); s.far = box.z1 + 2;
    s.updateProjectionMatrix();
    // a chip's face is drawn as fine as it shows
    this.faceScale = clamp(((w / W) * CW * dpr) / 272 * 1.12, 1.5, 3);

    this.buildFixed(); this.buildRack(); this.buildTray(); this.place(true);
    this.poke();
    this.tellRows();
  }
  // Which rows of the rack show, of how many, and where the lip is in the window (for the page's row keys).
  tellRows() {
    const L = this.L, rows = Math.ceil(this.rackPiles.length / L.rackCols);
    this.on.rows?.({ first: this.rackRow, shown: L.rackRows, rows, y: this.screenOf(0, 0.3, L.zr1 + LIP / 2).y - this.canvas.getBoundingClientRect().top });
  }
  turnRack(by) { const row = clamp(this.rackRow + by, 0, this.rackRowsMost()); if (row !== this.rackRow) { this.rackRow = row; this.tellRows(); this.poke(); } }

  // Take a group's things away. What a thing owns goes with it (userData: geo, mat, map); what it
  // shares (the one box, the bench's finishes, a chip's face) stays.
  clear(group) {
    for (const o of [...group.children]) {
      group.remove(o);
      o.traverse?.((m) => {
        if (m.isInstancedMesh) m.dispose();
        const u = m.userData || {};
        if (u.geo) m.geometry?.dispose();
        if (u.mat) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (u.map && x) dropMap(x); x?.dispose(); });
      });
    }
  }
  // A rounded block of one of the bench's finishes, standing on y0. Its finish knows its own shape (for the wear at its edges).
  block(group, like, x0, z0, x1, z1, y0, h, corner, roll, changes = {}) {
    const w = x1 - x0, d = z1 - z0;
    const m = new THREE.Mesh(slabGeo(w, d, h, corner, roll), another(like, { rect: [0, 0, w / 2, d / 2], ...changes }));
    m.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
    m.receiveShadow = true; m.castShadow = true; m.userData = { geo: true, mat: true };
    group.add(m);
    return m;
  }
  // A plain bar (a frame's side, a mark), of a finish that is the bench's own.
  bar(group, mat, x0, z0, x1, z1, y0, y1, owns = false) {
    const m = new THREE.Mesh(this.box, mat);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.receiveShadow = true; m.castShadow = true; if (owns) m.userData = { mat: true };
    group.add(m);
    return m;
  }
  // A name plate: a small display with its print on it, standing on y.
  badge(group, tex, x0, z0, x1, z1, y, { colour = null, clip = null } = {}) {
    const m = new THREE.Mesh(this.badgeGeo(x1 - x0, z1 - z0), another(this.mat.badge, { map: tex, clip, ...(colour ? { colour } : {}) }));
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true; m.castShadow = true; m.userData = { mat: true, map: true };
    group.add(m);
    return m;
  }

  // The case, the rails the rack slides under, the room under and behind it all.
  buildFixed() {
    const L = this.L, half = L.caseHalf, zEnd = L.zNear + 7;
    this.clear(this.fixed);
    this.block(this.fixed, this.mat.case, -half, L.zc0, half, zEnd, -CASE, CASE, 26 / UNIT, 4.5 / UNIT);
    this.block(this.fixed, this.mat.rail, -half + 0.1, L.zf0, half - 0.1, L.zf0 + RAIL, 0, RAIL_H, 0.07, 0.035);                  // the far rail
    this.block(this.fixed, this.mat.rail, -half + 0.1, L.zr1, half - 0.1, L.zr1 + LIP, 0, RAIL_H + 0.06, 0.07, 0.035);            // the lip chips slide under
    // the room: one sheet under everything, with the glow of the case's outline on it
    const far = this.halfWidthAt(L.zFar) * 6;
    this.room.scale.set(far * 2, 1, far * 2); this.room.position.z = (L.zNear + L.zFar) / 2;
    const inX = half * 0.1, inZ = 1.3;
    this.room.material.uniforms.uBox.value.set(0, (L.zc0 + zEnd) / 2, half - inX, (zEnd - L.zc0) / 2 - inZ);
  }

  // ---------------------------------------------------------------- a knob module
  // What is printed on a module's plate: what kind of knob it is, how much it holds, and its two knobs' names.
  modulePrint(kind, count) {
    const key = `${kind}|${count}`;
    let t = this.modulePrints.get(key);
    if (t) return t;
    const k = 3, D = this.dark, ink = D ? NIGHT.ink : COL.black;
    t = plateTexture((g) => {
      g.scale(k, k);
      g.textBaseline = 'middle';
      g.fillStyle = D ? NIGHT.badge : COL.black; g.fillRect(4, 31, 72, 17);
      g.fillStyle = COL.lit; g.font = LEGEND(12.5); g.letterSpacing = '0.8px'; g.textAlign = 'left';
      g.fillText(fitText(g, KNOB_KIND[kind] || 'KNOB', 64), 8, 40);
      g.fillStyle = ink; g.font = LABEL(11.5); g.letterSpacing = '0.6px';
      g.fillText(count, 5, 62);
      g.textAlign = 'center'; g.font = LABEL(9.5); g.letterSpacing = '0.5px';
      g.fillText('TURN', MOD.knobs[0][0], 76); g.fillText('DEPTH', MOD.knobs[1][0], 76);
      g.letterSpacing = '0px';
    }, MOD.w * k, MOD.d * k);
    this.modulePrints.set(key, t);
    return t;
  }
  // A module, its far left corner at x, z, standing on y. m: { kind, name, slot, depth, count, open }.
  // Its knobs go into the batch its group's knobs are drawn from.
  addModule(group, batch, m, x, y, z, clip = null) {
    const plate = new THREE.Mesh(this.moduleGeo, another(this.mat.module, { map: this.modulePrint(m.kind, m.count), number: numberOf(`knob ${m.name} ${m.kind}`), clip }));
    plate.position.set(x + MW / 2, y, z + MD / 2);
    plate.castShadow = true; plate.receiveShadow = true; plate.userData = { mat: true };       // (its print is one of a few, kept: modulePrint())
    group.add(plate);
    // its name, on a display: with its knob's number before it once it is in the chassis
    const D = this.dark, [nx, nz, nw, nd] = MOD.name, light = KNOB_LIGHT[m.kind] || TEAL;
    const ground = m.open ? COL.yellow : D ? NIGHT.paper : COL.white;
    const tex = plateTexture((g, w, h) => {
      g.fillStyle = ground; g.fillRect(0, 0, w, h);
      let tx = 10;
      g.textBaseline = 'middle';
      if (m.slot) {
        g.fillStyle = light; g.fillRect(0, 0, 58, h);
        g.fillStyle = COL.black; g.textAlign = 'center'; g.font = LEGEND(44); g.fillText(String(m.slot), 29, h / 2 + 3);
        tx = 70;
      }
      g.textAlign = 'left'; g.fillStyle = D && !m.open ? NIGHT.ink : COL.black; g.font = LEGEND(42); g.letterSpacing = '1.5px';
      g.fillText(fitText(g, String(m.name || 'UNNAMED').toUpperCase(), w - tx - 8), tx, h / 2 + 3);
      g.letterSpacing = '0px';
    }, nw * 3, nd * 3);
    this.badge(group, tex, x + nx / UNIT, z + nz / UNIT, x + (nx + nw) / UNIT, z + (nz + nd) / UNIT, y + PLATE, { colour: ground, clip });
    const turned = m.key ? this.turns.get(m.key) || 0 : 0;
    const iT = batch.add(x + MOD.knobs[0][0] / UNIT, y + PLATE, z + MOD.knobs[0][1] / UNIT, turned, light, false);        // TURN: where the hand left it
    const iD = batch.add(x + MOD.knobs[1][0] / UNIT, y + PLATE, z + MOD.knobs[1][1] / UNIT, m.kind === 'cue' ? 0 : m.depth ?? 1, '#E9E6E2', true);      // DEPTH: how far it is up (a stack's knob has none)
    // (where each knob is, for the hand: the group's own place, a little above the plate)
    if (m.key && group !== this.held) for (const [which, i, at] of [['turn', iT, MOD.knobs[0]], ['depth', iD, MOD.knobs[1]]]) {
      if (which === 'depth' && m.kind === 'cue') continue;
      this.knobSpots.push({ key: m.key, which, batch, i, group, x: x + at[0] / UNIT, y: y + PLATE + 0.16, z: z + at[1] / UNIT });
    }
  }
  // The knob of a module under the pointer, if there is one.
  knobUnder(e) {
    for (const k of this.knobSpots) {
      const dz = k.group === this.rack ? this.rackShift : 0;
      if (k.group === this.rack && (k.z + dz > this.L.zr1 || k.z + dz < this.L.zf0)) continue;
      const g = this.ground(e, k.y);
      if (Math.hypot(g.x - k.x, g.z - (k.z + dz)) < RING * 1.1) return k;
    }
    return null;
  }
  // Where a module's knob is in the window (for the checks). inTray: the one in the chassis, not the rack's.
  whereKnob(key, which, inTray = false) {
    const k = this.knobSpots.find((s) => s.key === key && s.which === which && (s.group === this.tray) === inTray);
    return k ? this.screenOf(k.x, k.y, k.z + (k.group === this.rack ? this.rackShift : 0)) : null;
  }

  // ---------------------------------------------------------------- the rack: pockets, piles, their plates
  // piles: [{ key, name, count, tone, heats: [bright or -1, top first], top: chip or null, lamp, open, add }]
  setRack(piles) { this.rackPiles = piles; this.rackRow = clamp(this.rackRow, 0, this.rackRowsMost()); this.buildRack(); this.poke(); this.tellRows(); }
  rackRowsMost() { return Math.max(0, Math.ceil(this.rackPiles.length / this.L.rackCols) - this.L.rackRows); }

  // A pile's layers, top first: [{ bright, t }]. A pile stands no taller than PILE_MOST, and a tall one is drawn in fewer layers than it has chips.
  strata(heats, thick, most) {
    const n = heats.length;
    if (!n) return { layers: [], top: 0 };
    const top = Math.min(n * thick, most), m = Math.min(n, STRATA), t = top / m, layers = [];
    for (let k = 0; k < m; k++) layers.push(heats[Math.floor((k * n) / m)]);
    return { layers, top, t };
  }

  buildRack() {
    const L = this.L, piles = this.rackPiles;
    this.clear(this.rack);
    this.knobSpots = this.knobSpots.filter((k) => k.group !== this.rack);
    this.rackHits = [];
    const rows = Math.max(L.rackRows, Math.ceil(piles.length / L.rackCols));
    // (the plate runs on under the rails, so that slid back it still fills the space between them)
    const x0 = -L.caseHalf + 0.16, x1 = -x0, z0 = L.zf0 - 0.4, z1 = L.zr0 + 0.55 + (rows + L.rackRows + 1) * RACK_PITCH_Z;
    const at = (i) => {
      const col = i % L.rackCols, row = Math.floor(i / L.rackCols);
      const x = L.rackX0 + col * RACK_PITCH_X, z = L.zr0 + 0.55 + row * RACK_PITCH_Z;
      return { x, z, row };
    };
    // the plate, with a cut-out for every pile: in it the case shows, and the pile stands on that
    const holes = piles.map((p, i) => { const { x, z } = at(i); return { x, z, w: POCKET_W, d: POCKET_D }; });
    setRect(this.mat.rack, [(x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2]);
    const plate = new THREE.Mesh(plateGeo(x0, z0, x1, z1, PLATE, PLATE, holes), this.mat.rack);
    plate.receiveShadow = true; plate.castShadow = true; plate.userData = { geo: true };
    this.rack.add(plate);

    // the piles: one drawn thing for every layer under the top chip of every pile
    const made = piles.map((p) => this.strata(p.heats || [], CT, PILE_MOST));
    const total = made.reduce((n, s) => n + Math.max(0, s.layers.length - 1), 0);
    const inst = new THREE.InstancedMesh(this.layerGeo, this.mat.pile, Math.max(1, total));
    inst.castShadow = true; inst.receiveShadow = true;
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const knobs = new KnobBatch({ dark: this.dark, clip: this.inRack });
    let n = 0;
    piles.forEach((p, i) => {
      const { x, z, row } = at(i);
      const { layers, top, t } = made[i];
      const cx = x + POCKET_W / 2, cz = z + POCKET_D / 2;
      layers.forEach((b, k) => {                                     // (the top chip is layers[0])
        if (k === 0) return;
        m4.makeScale(1, t * 0.94, 1); m4.setPosition(cx, (layers.length - 1 - k) * t, cz);
        inst.setMatrixAt(n, m4);
        inst.setColorAt(n, c.set(b < 0 ? EDGE_NONE : heat(b)));
        n++;
      });
      if (layers.length && p.top) {                                  // the top chip: a chip, with its face
        const chip = new THREE.Mesh(this.chipGeo, another(this.mat.chip, { map: this.face(p.top, null), edge: edgeColour(p.top), number: numberOf(p.top.uid), clip: this.inRack }));
        chip.scale.y = (t * 0.94) / CT; chip.position.set(cx, top - t + t * 0.47, cz);
        chip.castShadow = true; chip.receiveShadow = true;
        chip.userData = { mat: true };                              // (its face is the cache's: face())
        this.rack.add(chip);
      }
      // a knob: its module rides on the chips it works with (or lies in the cut-out, if it has none)
      if (p.knob) this.addModule(this.rack, knobs, { ...p.knob, name: p.name, key: p.key }, cx - CW / 2, top, cz - MD / 2, this.inRack);
      // its plate: the name, how many, and what it is
      const tone = this.plateTone(p);
      const tex = plateTexture((g, w, h) => this.drawPlate(g, w, h, p, tone), 736, 84);
      this.badge(this.rack, tex, x, z + POCKET_D + 0.08, x + POCKET_W, z + POCKET_D + 0.08 + LABEL_D, PLATE, { colour: tone[0], clip: this.inRack });
      if (p.open) {                                                  // the open pile: a lit yellow frame round its cut-out
        const e = 0.07, y1 = PLATE + 0.035, lit = another(this.mat.yellow, { clip: this.inRack });
        const sides = [[x - e, z - e, x + POCKET_W + e, z], [x - e, z + POCKET_D, x + POCKET_W + e, z + POCKET_D + e], [x - e, z, x, z + POCKET_D], [x + POCKET_W, z, x + POCKET_W + e, z + POCKET_D]];
        sides.forEach(([a, b, cc, d], k) => { this.bar(this.rack, lit, a, b, cc, d, PLATE, y1, k === 0).castShadow = false; });
      }
      this.rackHits.push({ key: p.key, pile: p, row, x0: x - 0.2, x1: x + POCKET_W + 0.2, z0: z - 0.15, z1: z + POCKET_D + LABEL_D + 0.2, top: top + (p.knob ? PLATE + 0.25 : 0), cx, cz });
    });
    knobs.addTo(this.rack);
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.rack.add(inst);
    this.rackShift = -this.rackRow * RACK_PITCH_Z;
    this.rack.position.z = this.rackShift;
  }

  // A name plate's ground and print, by what its stack is (dark: every plate is dark with light print, as the dark instrument's are; the open one is yellow in both).
  plateTone(p) {
    const tones = this.dark
      ? { black: [NIGHT.badge, COL.lit], white: [NIGHT.paper, NIGHT.ink], blue: ['#232B31', COL.bluegrey], grey: [NIGHT.plate2, NIGHT.dim], amber: ['#2C2416', COL.amber], yellow: [COL.yellow, COL.black] }
      : { black: [COL.black, COL.lit], white: [COL.white, COL.black], blue: [COL.bluegrey, COL.black], grey: [COL.grey, COL.black], amber: [COL.amber, COL.black], yellow: [COL.yellow, COL.black] };
    return tones[p.open ? 'yellow' : p.tone] || tones.black;
  }
  drawPlate(g, w, h, p, [bg, fg]) {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textBaseline = 'middle';
    const count = p.add ? '' : String(p.count);
    g.font = LEGEND(44);
    const wc = count ? Math.ceil(g.measureText(count).width) + 34 : 0;
    let right = w;
    if (count) {                                                     // (how many: turned over on a light plate; on a dark one a quieter box, as the dark instrument's tags are)
      const quiet = this.dark && !p.open;
      g.fillStyle = quiet ? NIGHT.plate : fg; g.fillRect(right - wc, 0, wc, h);
      g.fillStyle = quiet ? fg : bg; g.textAlign = 'center'; g.fillText(count, right - wc / 2, h / 2 + 3);
      right -= wc;
    }
    if (p.lamp) { g.fillStyle = this.dark ? NIGHT.room : COL.black; g.fillRect(right - 58, 0, 58, h); g.fillStyle = COL.green; g.fillRect(right - 46, 20, 34, h - 40); right -= 58; }
    g.textAlign = 'left'; g.fillStyle = fg;
    let x = 22;
    if (p.kind) {                                                    // what kind of stack, small, before its name
      g.font = LEGEND(30); g.letterSpacing = '2px';
      g.fillText(p.kind, x, h / 2 + 3);
      x += Math.ceil(g.measureText(p.kind).width) + 18;
      g.fillRect(x - 9, 18, 2, h - 36);
      x += 6;
    }
    g.font = LEGEND(46); g.letterSpacing = '2px';
    g.fillText(fitText(g, String(p.name || '').toUpperCase(), right - x - 16), x, h / 2 + 3);
    g.letterSpacing = '0px';
  }

  // ---------------------------------------------------------------- the tray: what SF-000 loads
  // tray: { bays: [16 x { key or null, name, heats }], stacks: [{ key, name, count, heats }] }
  setTray(tray) { this.trayData = tray; this.buildTray(); this.poke(); }

  // The chassis: a model of SF-000 standing on the bench. Its sixteen pockets are its sixteen
  // snapshot knobs, four by four as the instrument has them; a knob module dropped in one is on
  // that knob at the next LOAD. Under them, the stacks LOAD brings.
  buildTray() {
    const L = this.L, T = this.trayData, x0 = L.trayX, x1 = x0 + TRAY_W, z0 = L.zt0 - 0.05, D = this.dark;
    this.clear(this.tray);
    this.knobSpots = this.knobSpots.filter((k) => k.group !== this.tray);
    this.trayHits = [];
    const zEnd = L.zNear + 4, top = CH + PLATE;
    this.block(this.tray, this.mat.rail, x0, z0, x1, zEnd, 0, CH, 0.3, 4.5 / UNIT);                // its own case
    const mw = CW * MINI + 0.14, md = CD * MINI + 0.12;
    const bayAt = (i) => ({ x: x0 + 0.21 + (i % 4) * BAY_X, z: z0 + 0.74 + Math.floor(i / 4) * BAY_Z });
    const holes = [];
    for (let i = 0; i < 16; i++) { const b = bayAt(i); holes.push({ x: b.x - 0.04, z: b.z - 0.04, w: MW + 0.08, d: MD + 0.08 }); }
    const zs = z0 + 0.74 + 4 * BAY_Z + 0.5;                          // the loaded stacks begin here
    const room = Math.max(1, Math.floor((L.zNear - 0.2 - zs) / 0.6));
    const stacks = (T.stacks || []).slice(0, room);
    stacks.forEach((s, i) => holes.push({ x: x0 + 0.3, z: zs + i * 0.6 + 0.06, w: mw, d: md }));
    const px0 = x0 + 0.07, pz0 = z0 + 0.07, px1 = x1 - 0.07;
    setRect(this.mat.tray, [(px0 + px1) / 2, (pz0 + zEnd) / 2, (px1 - px0) / 2, (zEnd - pz0) / 2]);
    const plate = new THREE.Mesh(plateGeo(px0, pz0, px1, zEnd, top, PLATE, holes), this.mat.tray);
    plate.receiveShadow = true; plate.castShadow = true; plate.userData = { geo: true };
    this.tray.add(plate);

    const title = (text, z, sub) => {
      const tex = plateTexture((g, w, h) => {
        g.textBaseline = 'middle'; g.fillStyle = COL.lit; g.font = LEGEND(40); g.letterSpacing = '3px';
        g.fillText(text, 18, h / 2 + 2);
        if (sub) { g.font = LABEL(24); g.textAlign = 'right'; g.letterSpacing = '2px'; g.fillText(sub, w - 16, h / 2 + 2); }
        g.letterSpacing = '0px';
      }, 1160, 60);
      this.badge(this.tray, tex, x0 + 0.21, z, x1 - 0.21, z + 0.4, top);
    };
    title('SF-000', z0 + 0.2, 'ITS SIXTEEN SNAPSHOT KNOBS, AS LOAD LEAVES THEM');

    const knobs = new KnobBatch({ dark: D });
    for (let i = 0; i < 16; i++) {
      const b = bayAt(i), bay = (T.bays || [])[i] || {};
      if (bay.key && bay.knob) this.addModule(this.tray, knobs, { ...bay.knob, name: bay.name, slot: i + 1, open: bay.open, key: bay.key }, b.x, CH, b.z);
      else {
        // an empty pocket: its number, on the floor of it
        const tex = plateTexture((g, w, h) => {
          g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = D ? NIGHT.dim : COL.lit; g.font = LEGEND(44);
          g.fillText(String(i + 1), w / 2, h / 2 + 3);
        }, 84, 60);
        this.badge(this.tray, tex, b.x + 0.06, b.z + 0.06, b.x + 0.48, b.z + 0.36, CH, { colour: D ? NIGHT.badge : COL.black });
      }
      this.trayHits.push({ bay: i + 1, key: bay.key || null, pile: bay, x0: b.x - 0.06, x1: b.x + BAY_X - 0.06, z0: b.z - 0.1, z1: b.z + BAY_Z - 0.1, cx: b.x + MW / 2, cz: b.z + MD / 2 });
    }
    knobs.addTo(this.tray);

    title('LIBRARY', zs - 0.48, stacks.length < (T.stacks || []).length ? `${stacks.length} OF ${T.stacks.length} SHOWN` : 'DROP A STACK HERE: LOAD BRINGS IT');
    const made = [];
    stacks.forEach((s, i) => {
      const z = zs + i * 0.6;
      made.push({ ...this.strata((s.heats || []).slice(0, 4000), 0.06, 0.6), cx: x0 + 0.3 + mw / 2, cz: z + 0.06 + md / 2 });
      const ground = s.open ? COL.yellow : D ? NIGHT.paper : COL.white;
      const tex = plateTexture((g, w, h) => {
        g.fillStyle = ground; g.fillRect(0, 0, w, h);
        g.textBaseline = 'middle'; g.fillStyle = D && !s.open ? NIGHT.ink : COL.black; g.font = LEGEND(34); g.letterSpacing = '2px';
        const count = String(s.count);
        g.textAlign = 'right'; g.fillText(count, w - 12, h / 2 + 2);
        g.textAlign = 'left'; g.fillText(fitText(g, String(s.name || '').toUpperCase(), w - g.measureText(count).width - 40), 12, h / 2 + 2);
        g.letterSpacing = '0px';
      }, 960, 52);
      this.badge(this.tray, tex, x0 + 0.3 + mw + 0.14, z + 0.07, x1 - 0.26, z + 0.07 + md - 0.02, top, { colour: ground });
      this.trayHits.push({ stack: true, key: s.key, pile: s, x0, x1, z0: z, z1: z + 0.6, cx: x0 + 3, cz: z + 0.3 });
    });
    this.trayHits.push({ pockets: true, key: null, x0, x1, z0: zs - 0.5, z1: zEnd, cx: x0 + TRAY_W / 2, cz: Math.min(L.zNear - 0.8, zs + stacks.length * 0.6 + 0.6) });
    // the small piles: every layer of every one, drawn together
    const total = made.reduce((n, s) => n + s.layers.length, 0);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (const [geo, want] of [[this.layerGeo, (k) => k > 0], [this.capGeo, (k) => k === 0]]) {
      const inst = new THREE.InstancedMesh(geo, this.mat.mini, Math.max(1, total));
      inst.castShadow = true; inst.receiveShadow = true;
      let n = 0;
      for (const s of made) s.layers.forEach((b, k) => {
        if (!want(k)) return;
        m4.makeScale(MINI, s.t * 0.92, MINI); m4.setPosition(s.cx, CH + (s.layers.length - 1 - k) * s.t, s.cz);
        inst.setMatrixAt(n, m4); inst.setColorAt(n, c.set(b < 0 ? EDGE_NONE : heat(b))); n++;
      });
      inst.count = n; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      this.tray.add(inst);
    }
  }

  // ---------------------------------------------------------------- chips' faces
  face(s, label) {
    const key = s.uid, had = this.faces.get(key);
    const stamp = `${label}|${s.name}|${s.move ? s.move.d : ''}`;
    if (had && had.stamp === stamp) { had.used = ++this.frame; return had.tex; }
    if (had) had.tex.dispose();
    const tex = printOf(faceCanvas(s, label, this.faceScale || 2));
    this.faces.set(key, { tex, stamp, used: ++this.frame });
    if (this.faces.size > 280) {                                     // the least lately seen go, unless they lie on the bench now
      const live = new Set([...this.items.values()].map((it) => it.uid));
      for (const p of this.rackPiles) if (p.top) live.add(p.top.uid);
      const old = [...this.faces.entries()].filter(([k]) => !live.has(k)).sort((a, b) => a[1].used - b[1].used).slice(0, 90);
      for (const [k, v] of old) { v.tex.dispose(); this.faces.delete(k); }
    }
    return tex;
  }
  forgetFace(uid) { const f = this.faces.get(uid); if (f) { f.tex.dispose(); this.faces.delete(uid); } }

  // ---------------------------------------------------------------- the table: the open stack, dealt
  // chips: [{ uid, s, label, n }] in order (n: which of a chip's turns in a song this is). from: the
  // key of the pile they are dealt from: the ones that show fly out of its pocket. Only the chips in
  // the rows that show are made; a stack of thousands costs what a screenful costs.
  deal(chips, { from = null, keepScroll = false } = {}) {
    this.dealt = chips;
    this.view = null;
    const ids = new Set(chips.map((d) => `${d.uid}#${d.n || 0}`));
    for (const [id, it] of this.items) if (!ids.has(id)) { this.dropItem(it); this.items.delete(id); }
    for (const it of this.items.values()) it.textured = false;
    this.origin = this.pileSpot(from);
    if (!keepScroll) this.scroll = this.scrollTo = 0;
    this.clampScroll();
    this.place(false);
    this.origin = null;
    this.poke();
  }
  makeItem(d, id) {
    const it = { id, uid: d.uid, group: new THREE.Group() };
    it.mat = another(this.mat.chip, { edge: edgeColour(d.s), number: numberOf(d.uid), clip: this.onTable });
    it.mesh = new THREE.Mesh(this.chipGeo, it.mat);
    it.mesh.castShadow = true; it.mesh.receiveShadow = true;
    it.group.add(it.mesh);
    this.table.add(it.group);
    return it;
  }
  dropItem(it) {
    this.table.remove(it.group);
    it.mat.dispose();
    if (it.ring) it.ring.material.dispose();
    if (it.clip) it.clip.material.dispose();
  }
  pileSpot(key) {
    const hit = (this.rackHits || []).find((h) => h.key === key);
    return hit ? new THREE.Vector3(hit.cx, Math.max(0.3, hit.top + 0.2), Math.min(hit.cz + this.rackShift, this.L.zr1 - 0.6)) : null;
  }
  // The chips as they lie now: all of them, or (while some are held over the table) the rest.
  lying() {
    if (!(this.drag && this.drag.kind === 'chips' && this.drag.on)) return this.dealt;
    if (!this.view) { const held = new Set(this.drag.uids); this.view = this.dealt.filter((d) => !held.has(d.uid)); }
    return this.view;
  }
  rowsOf() { return Math.ceil(this.dealt.length / this.L.cols); }
  clampScroll() { const most = Math.max(0, this.rowsOf() - this.L.wholeRows); this.scrollTo = clamp(this.scrollTo, 0, most); this.scroll = clamp(this.scroll, -0.5, most + 0.5); }
  spot(index) {
    const L = this.L, col = index % L.cols, row = Math.floor(index / L.cols);
    return { x: L.tx0 + col * PITCH_X + CW / 2, z: L.zt0 + (row - this.scroll) * PITCH_Z + CD / 2, row };
  }
  // Where each chip is going. With chips held over the table, the others make room where they would go.
  place(jump) {
    const L = this.L, list = this.lying(), gap = list === this.dealt ? -1 : this.gap;
    const first = Math.max(0, (Math.floor(this.scroll) - 1) * L.cols), last = Math.min(list.length + 1, (Math.floor(this.scroll) + L.rows + 2) * L.cols);
    const seen = new Set();
    for (let slot = first; slot < last; slot++) {
      const j = gap >= 0 && slot >= gap ? slot - 1 : slot;
      if (gap >= 0 && slot === gap) continue;
      if (j < 0 || j >= list.length) continue;
      const d = list[j], id = `${d.uid}#${d.n || 0}`;
      let it = this.items.get(id), born = false;
      if (!it) { it = this.makeItem(d, id); this.items.set(id, it); born = true; }
      seen.add(id);
      it.index = this.dealt === list ? j : this.dealt.indexOf(d);
      it.s = d.s; it.label = d.label;
      if (!it.textured) { setMap(it.mat, this.face(d.s, d.label)); it.textured = true; }
      const p = this.spot(slot);
      const lift = it.uid === this.marks.selected ? 0.2 : this.hover && this.hover.key === it.id ? 0.07 : 0;
      it.target = { x: p.x, y: CT / 2 + 0.006 + lift, z: p.z };
      if (born && this.origin && p.z > L.zr1 && p.z < L.zNear + 1) it.group.position.copy(this.origin);       // dealt: it flies out of its pile
      else if (born || jump) it.group.position.set(it.target.x, it.target.y, it.target.z);
      if (born) this.markItem(it);
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { this.dropItem(it); this.items.delete(id); }
  }

  // selected (lifted, in a yellow tray), playing (green), marked (a yellow clip on its end)
  setMarks(marks) { this.marks = { ...this.marks, ...marks }; for (const it of this.items.values()) this.markItem(it); this.place(false); this.poke(); }
  markItem(it) {
    const sel = it.uid === this.marks.selected, play = it.uid === this.marks.playing, mark = this.marks.marked.has(it.uid);
    const want = play ? 'green' : sel ? 'yellow' : '';
    if ((it.ringTone || '') !== want) {
      if (it.ring) { it.group.remove(it.ring); it.ring.material.dispose(); it.ring = null; }
      if (want) {
        if (!this.ringGeo) this.ringGeo = slabGeo(CW + 0.2, CD + 0.2, CT * 0.55, CORNER + 0.1, 0.012);
        it.ring = new THREE.Mesh(this.ringGeo, another(this.mat[want], { clip: this.onTable }));
        it.ring.position.y = -CT * 0.5 - 0.002;
        it.ring.castShadow = true;
        it.group.add(it.ring);
      }
      it.ringTone = want;
    }
    if (!!it.clip !== mark) {
      if (it.clip) { it.group.remove(it.clip); it.clip.material.dispose(); it.clip = null; }
      if (mark) {
        it.clip = new THREE.Mesh(this.box, another(this.mat.yellow, { clip: this.onTable }));
        it.clip.scale.set(0.2, CT + 0.07, CD + 0.1); it.clip.position.set(-CW / 2 + 0.02, 0.01, 0);
        it.clip.castShadow = true;
        it.group.add(it.clip);
      }
    }
  }
  // Bring a chip into view (its row among those that show whole).
  reveal(uid) {
    const i = this.dealt.findIndex((d) => d.uid === uid);
    if (i < 0) return;
    const row = Math.floor(i / this.L.cols);
    if (row < this.scrollTo) this.scrollTo = row;
    else if (row > this.scrollTo + this.L.wholeRows - 1) this.scrollTo = row - this.L.wholeRows + 1;
    this.clampScroll();
    this.poke();
  }
  // Bring a pile's row of the rack into view.
  revealPile(key) {
    const hit = (this.rackHits || []).find((h) => h.key === key);
    if (!hit) return;
    const row = clamp(hit.row < this.rackRow ? hit.row : hit.row > this.rackRow + this.L.rackRows - 1 ? hit.row - this.L.rackRows + 1 : this.rackRow, 0, this.rackRowsMost());
    if (row !== this.rackRow) { this.rackRow = row; this.tellRows(); this.poke(); }
  }

  // ---------------------------------------------------------------- drawing, only while something moves
  poke() { this.dirty = true; if (!this.running) { this.running = true; requestAnimationFrame(this.tick); } }
  tick(now) {
    const dt = Math.min(0.12, (now - (this.last || now)) / 1000 || 0.016);
    this.last = now;
    let moving = false;
    const ease = 1 - Math.exp(-dt * 16);
    if (Math.abs(this.scrollTo - this.scroll) > 0.002) { this.scroll += (this.scrollTo - this.scroll) * ease; moving = true; this.place(false); }
    else if (this.scroll !== this.scrollTo) { this.scroll = this.scrollTo; this.place(false); }
    const rz = -this.rackRow * RACK_PITCH_Z;
    if (Math.abs(rz - this.rackShift) > 0.004) { this.rackShift += (rz - this.rackShift) * ease; moving = true; } else this.rackShift = rz;
    this.rack.position.z = this.rackShift;
    const k = 1 - Math.exp(-dt * 14);
    for (const it of this.items.values()) {
      if (!it.target) continue;
      const p = it.group.position, t = it.target;
      const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0.003) { p.x += dx * k; p.y += dy * k; p.z += dz * k; moving = true; } else p.set(t.x, t.y, t.z);
    }
    if (this.drag && this.drag.on) {
      const p = this.held.position, t = this.drag.at;
      p.x += (t.x - p.x) * Math.min(1, k * 1.6); p.z += (t.z - p.z) * Math.min(1, k * 1.6); p.y += (1.15 - p.y) * k;
      if (Math.abs(t.x - p.x) + Math.abs(t.z - p.z) + Math.abs(1.15 - p.y) > 0.004) moving = true;
    }
    if (this.dirty || moving) { this.picture.render(this.scene, this.camera); this.dirty = false; }
    if (moving) requestAnimationFrame(this.tick); else { this.running = false; this.last = 0; }
  }

  // ---------------------------------------------------------------- the hand
  ground(e, y = 0) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction, t = (y - o.y) / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }
  // What is under the pointer: a dealt chip, a pile, a bay, the tray's pockets, the table, the rack.
  under(e) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const L = this.L;
    if (!(this.drag && this.drag.on)) {
      const meshes = [];
      for (const it of this.items.values()) meshes.push(it.mesh);
      const hit = this.ray.intersectObjects(meshes, false).find((h) => h.point.z > L.zr1 + LIP * 0.5);
      if (hit) { const it = [...this.items.values()].find((x) => x.mesh === hit.object); if (it) return { type: 'chip', item: it, uid: it.uid, index: it.index }; }
    }
    const g = this.ground(e, 0.1);
    // a pile is as tall as it stands: the nearest one the pointer's line passes through, or the pocket and plate under it
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    let best = null, bestT = Infinity;
    for (const p of this.rackHits || []) {
      if (p.row < this.rackRow - 0.5 || p.row >= this.rackRow + L.rackRows) continue;
      const lo = [p.cx - CW / 2, 0, p.cz - CD / 2 + this.rackShift], hi = [p.cx + CW / 2, Math.max(0.02, p.top), p.cz + CD / 2 + this.rackShift];
      let t0 = 0, t1 = Infinity;
      for (let a = 0; a < 3; a++) {
        const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
        const ta = (lo[a] - oa) / da, tb = (hi[a] - oa) / da;
        t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
      }
      if (t0 <= t1 && t0 < bestT && o.z + d.z * t0 < L.zr1 + LIP * 0.5) { bestT = t0; best = p; }
    }
    if (best) return { type: 'pile', key: best.key, pile: best.pile };
    if (g.z < L.zr1) {
      const z = g.z - this.rackShift;
      const h = (this.rackHits || []).find((p) => g.x >= p.x0 && g.x <= p.x1 && z >= p.z0 && z <= p.z1 && p.row >= this.rackRow - 0.5 && p.row < this.rackRow + L.rackRows);
      return h ? { type: 'pile', key: h.key, pile: h.pile } : { type: 'rack' };
    }
    const gt = this.ground(e, CH + PLATE);                             // (the chassis stands higher than the bench)
    if (gt.x >= L.trayX && gt.z >= L.zt0 - 0.05) {
      const h = (this.trayHits || []).find((p) => gt.x >= p.x0 && gt.x <= p.x1 && gt.z >= p.z0 && gt.z <= p.z1);
      if (h && h.bay) return { type: 'bay', slot: h.bay, key: h.key, pile: h.pile };
      if (h && h.stack) return { type: 'pile', key: h.key, pile: h.pile, inTray: true };
      return { type: 'tray' };
    }
    // the table: which place the pointer is at (for a chip put down among the others)
    const col = clamp(Math.floor((g.x - L.tx0 + 0.16) / PITCH_X), 0, L.cols - 1), row = Math.max(0, Math.floor((g.z - L.zt0 + 0.15) / PITCH_Z + this.scroll));
    const after = g.x - (L.tx0 + col * PITCH_X) > CW / 2 ? 1 : 0;
    return { type: 'table', index: Math.min(this.lying().length, row * L.cols + col + after) };
  }

  listen() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const kn = this.knobUnder(e);
      if (kn) {                                                      // a hand on a module's knob: it turns (up for more), and nothing is picked up
        this.turning = { k: kn, y: e.clientY, v: kn.batch.knobs[kn.i].v, moved: false };
        c.setPointerCapture(e.pointerId); c.style.cursor = 'ns-resize';
        return;
      }
      const u = this.under(e);
      this.down = { x: e.clientX, y: e.clientY, u, shift: e.shiftKey || e.metaKey || e.ctrlKey };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.turning) {
        const t = this.turning, v = clamp(t.v + (t.y - e.clientY) / 150, 0, 1);
        if (v !== t.k.batch.knobs[t.k.i].v) {
          t.moved = true;
          t.k.batch.set(t.k.i, v);
          if (t.k.which === 'turn') this.turns.set(t.k.key, v);
          this.on.turn?.(t.k.key, t.k.which, v, false);
          this.poke();
        }
        return;
      }
      if (this.down && !this.drag && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6) this.startDrag(e);
      if (this.drag) { this.moveDrag(e); return; }
      if (this.knobUnder(e)) {                                      // over a module's knob: it is for turning
        if (this.hover) { this.hover = null; this.place(false); this.poke(); this.on.hover?.(null); }
        c.style.cursor = 'ns-resize';
        return;
      }
      const u = this.under(e);
      const key = u.type === 'chip' ? u.item.id : u.type === 'pile' ? `p${u.key}` : u.type === 'bay' ? `b${u.slot}` : '';
      if (key !== (this.hover ? this.hover.key : '')) {
        this.hover = key ? { ...u, key: u.type === 'chip' ? u.item.id : key } : null;
        c.style.cursor = key && (u.type !== 'bay' || u.key) ? 'pointer' : 'default';
        this.place(false); this.poke();
        this.on.hover?.(this.hover);
      }
    });
    const up = (e) => {
      if (this.turning) {
        const t = this.turning; this.turning = null; c.style.cursor = 'default';
        this.on.turn?.(t.k.key, t.k.which, t.k.batch.knobs[t.k.i].v, true, t.moved);
        return;
      }
      const down = this.down; this.down = null;
      if (this.drag) { this.endDrag(e); return; }
      if (!down) return;
      const u = down.u;
      if (u.type === 'chip') this.on.chip?.(u.uid, u.index, { shift: down.shift });
      else if (u.type === 'pile') this.on.pile?.(u.key, { inTray: !!u.inTray });
      else if (u.type === 'bay') this.on.bay?.(u.slot, u.key);
      else this.on.nothing?.();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { this.down = null; this.turning = null; this.cancelDrag(); });
    c.addEventListener('dblclick', (e) => { const u = this.under(e); if (u.type === 'chip') this.on.chipTwice?.(u.uid); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const g = this.ground(e, 0);
      const by = e.deltaMode === 1 ? e.deltaY / 3 : e.deltaY / 100;
      if (g.z < this.L.zr1) {
        this.wheelRack = (this.wheelRack || 0) + by;
        if (Math.abs(this.wheelRack) >= 0.5) { this.turnRack(Math.sign(this.wheelRack)); this.wheelRack = 0; }
      } else {
        this.scrollTo += by * 1.0;
        this.clampScroll();
      }
      this.poke();
    }, { passive: false });
    this.resizer = new ResizeObserver(() => { clearTimeout(this.resizeWait); this.resizeWait = setTimeout(() => this.layout(), 60); });
    this.resizer.observe(c);
  }

  // A chip picked up (with the marked ones, if it is one of them), or a whole pile by its pocket.
  startDrag(e) {
    const u = this.down.u;
    this.clear(this.held);
    if (u.type === 'chip') {
      const uids = this.on.dragSet ? this.on.dragSet(u.uid) : [u.uid];
      this.drag = { kind: 'chips', uids, from: u.index, on: true, at: this.ground(e, 1) };
      this.view = null;
      const n = Math.min(4, uids.length);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(this.chipGeo, another(this.mat.chip, { map: i === n - 1 ? this.face(u.item.s, u.item.label) : null, edge: edgeColour(u.item.s), number: numberOf(u.uid) + i }));
        m.position.set(i * 0.05, i * (CT + 0.012), i * -0.04); m.castShadow = true; m.userData = { mat: true };
        this.held.add(m);
      }
      this.held.position.copy(u.item.group.position);
      this.held.rotation.set(0, 0, -0.035);
    } else if ((u.type === 'pile' || u.type === 'bay') && u.key && !(u.pile && u.pile.add)) {             // (a knob's macro is picked up by its bay)
      this.drag = { kind: 'pile', key: u.key, on: true, at: this.ground(e, 1) };
      const heats = (u.pile && u.pile.knob ? [] : u.pile && u.pile.heats ? u.pile.heats : []).slice(0, 14);
      if (u.pile && u.pile.knob) {                                   // a knob: its module comes up
        const batch = new KnobBatch({ dark: this.dark });
        this.addModule(this.held, batch, { ...u.pile.knob, name: u.pile.name, slot: u.type === 'bay' ? u.slot : u.pile.knob.slot }, -MW / 2, 0, -MD / 2);
        batch.addTo(this.held);
      }
      heats.forEach((b, i) => {
        const tint = b < 0 ? EDGE_NONE : heat(b);
        const m = new THREE.Mesh(this.chipGeo, another(this.mat.mini, { colour: i === 0 ? this.P.plate : tint, edge: tint, rough: i === 0 ? this.P.plateRough : 0.62 }));
        m.scale.set(0.5, 1, 0.5); m.position.y = (heats.length - 1 - i) * CT * 1.02; m.castShadow = true; m.userData = { mat: true };
        this.held.add(m);
      });
      const g = this.ground(e, 0);
      this.held.position.set(g.x, 0.2, g.z);
      this.held.rotation.set(0, 0, 0);
    } else return;
    this.canvas.style.cursor = 'grabbing';
    this.place(false); this.poke();
  }
  moveDrag(e) {
    const d = this.drag;
    d.at = this.ground(e, 1);
    const u = this.under(e);
    const to = u.type === 'chip' ? { type: 'table', index: u.index } : u;
    const ok = this.on.canDrop ? this.on.canDrop(d, to) : true;
    d.to = ok ? to : null;
    const gap = ok && to.type === 'table' && d.kind === 'chips' && this.on.orders?.() ? clamp(to.index, 0, this.lying().length) : -1;
    if (gap !== this.gap) { this.gap = gap; this.place(false); }
    this.on.over?.(d, d.to);
    // near the top or the bottom of the table, it scrolls
    const r = this.canvas.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    if (y > 0.94) { this.scrollTo += 0.12; this.clampScroll(); }
    this.poke();
  }
  // Put down. On the table the place is among the chips that were left lying (the held ones taken out).
  endDrag() {
    const d = this.drag;
    this.drag = null; this.view = null; this.clear(this.held); this.canvas.style.cursor = 'default';
    const gap = this.gap; this.gap = -1;
    this.place(false); this.poke();
    if (d && d.to) this.on.drop?.(d, d.to.type === 'table' ? { ...d.to, index: gap >= 0 ? gap : d.to.index } : d.to);
    this.on.over?.(null, null);
  }
  cancelDrag() { if (!this.drag) return; this.drag = null; this.view = null; this.gap = -1; this.clear(this.held); this.canvas.style.cursor = 'default'; this.place(false); this.poke(); this.on.over?.(null, null); }
  // Where things are in the window (client pixels): for the checks, which press and drag as a hand does.
  screenOf(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  whereChip(index) { const p = this.spot(index); return this.screenOf(p.x, CT, p.z); }
  wherePile(key, onPlate = false) {
    const h = (this.rackHits || []).find((p) => p.key === key);
    // (a knob's pile is pressed beside its module, where its top chip shows: on the module are its knobs, which turn)
    if (h) return this.screenOf(h.cx + (h.pile.knob && !onPlate ? CW * 0.3 : 0), onPlate ? 0 : Math.max(0, h.top - (h.pile.knob ? PLATE + 0.25 : 0)), (onPlate ? h.z1 - 0.45 : h.cz) + this.rackShift);
    const t = (this.trayHits || []).find((p) => p.key === key && (p.stack || p.bay));
    return t ? this.screenOf(t.cx, CH + PLATE, t.cz) : null;
  }
  whereBay(slot) { const t = (this.trayHits || []).find((p) => p.bay === slot); return t ? this.screenOf(t.cx, CH + PLATE, t.cz) : null; }
  whereTray() { const t = (this.trayHits || []).find((p) => p.pockets); return this.screenOf(t.cx, CH + PLATE, t.cz); }
  wholeRows() { return this.L.wholeRows; }
  columns() { return this.L.cols; }
}
