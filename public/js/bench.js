// The bench: the library as things to handle. Chips are slabs with the instrument's card on
// their face and their colour on their edge; stacks are piles of them in pockets cut into the
// body; the open stack is dealt out on the table in front; the tray on the right is what SF-000
// loads. This file draws and is handled; what anything means is main.js's business, told here
// through setRack / setTray / deal / setMarks and heard back through the handlers.
import * as THREE from '../vendor/three.min.js';
import { faceCanvas, COL, NIGHT } from './card.js';
import { heat } from './profile.js';

// ---------------------------------------------------------------- sizes (a chip is 4.12 by 1: the card's own shape)
export const CW = 4.12, CD = 1.0, CT = 0.085;
const PITCH_X = CW + 0.32, PITCH_Z = CD + 0.3;                         // the table's cells
const POCKET_W = CW + 0.44, POCKET_D = CD + 0.36, POCKET_DEEP = 0.3;                 // (shallow: three chips lie just under the rim, a fourth stands proud)
const LABEL_D = 0.52;                                                  // a pocket's name plate, in front of it
const RACK_PITCH_X = POCKET_W + 0.46, RACK_PITCH_Z = POCKET_D + LABEL_D + 0.78;
const PILE_MOST = 1.25;                                                // the tallest a pile stands, floor to top
const TRAY_W = 6.5, MARGIN = 0.55, LIP = 0.34;
const MINI = 0.3;                                                      // the tray's chips are a quarter the size
const BAY_X = 1.55, BAY_Z = 1.22, TRAY_TOP = 0.1, TRAY_DEEP = 0.11;
const TILT = (57 * Math.PI) / 180, FOV = 26;
const MIN_CHIP_PX = 236;

const hex = (c) => new THREE.Color(c);
const EDGE_NONE = '#9A9B96';                                           // a chip with no sound kept
const edgeColour = (s) => (s && s.p ? heat(s.p.bright) : EDGE_NONE);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function plateTexture(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
    this.ray = new THREE.Raycaster();

    this.rackPiles = []; this.trayData = { bays: [], stacks: [] }; this.dealt = []; this.items = new Map();
    this.faces = new Map();                                 // uid -> { tex, label, used }
    this.marks = { selected: null, playing: null, marked: new Set() };
    this.scroll = 0; this.scrollTo = 0; this.rackRow = 0; this.rackShift = 0;
    this.drag = null; this.hover = null; this.gap = -1;
    this.clipTable = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.clipRack = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.frame = 0; this.active = true; this.tick = this.tick.bind(this);

    this.makeMaterials();
    this.fixed = new THREE.Group(); this.rack = new THREE.Group(); this.table = new THREE.Group(); this.tray = new THREE.Group(); this.held = new THREE.Group();
    this.scene.add(this.fixed, this.rack, this.table, this.tray, this.held);
    this.lights();
    this.layout();
    this.listen();
    this.poke();
  }

  // ---------------------------------------------------------------- what things are made of
  makeMaterials() {
    const std = (color, rough = 0.78, metal = 0.0) => new THREE.MeshStandardMaterial({ color: hex(color), roughness: rough, metalness: metal });
    this.mat = {
      body: std('#7C8683', 0.7, 0.15), plate: std(COL.putty, 0.82), table: std(COL.sea, 0.9), dark: std('#343431', 0.9), floor: std('#262624', 0.95),
      lip: std(COL.bluegrey, 0.6, 0.2), yellow: std(COL.yellow, 0.6), green: std(COL.green, 0.6), black: std(COL.black, 0.7), white: std(COL.white, 0.8),
      under: std('#3B3B37', 0.9),
    };
    this.mat.rackPlate = this.mat.plate.clone(); this.mat.rackSide = this.mat.dark.clone(); this.mat.rackFloor = this.mat.floor.clone();
    this.paint();
    this.pileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
    this.miniMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.chipGeo = new THREE.BoxGeometry(CW, CT, CD);
    this.faceGeo = new THREE.PlaneGeometry(CW, CD); this.faceGeo.rotateX(-Math.PI / 2);
  }
  rackClipped(m) { m.clippingPlanes = [this.clipRack]; m.clipShadows = true; return m; }
  // The bench's finishes, light or dark: the dark one is the dark instrument's (its case, its plates, its room).
  paint() {
    const P = this.dark
      ? { body: NIGHT.body, plate: NIGHT.plate, table: '#262827', dark: NIGHT.badge, floor: NIGHT.room, lip: '#2F3336', under: NIGHT.badge, room: NIGHT.room }
      : { body: '#7C8683', plate: COL.putty, table: COL.sea, dark: '#343431', floor: '#262624', lip: COL.bluegrey, under: '#3B3B37', room: COL.black };
    const m = this.mat;
    m.body.color.set(P.body); m.plate.color.set(P.plate); m.table.color.set(P.table); m.dark.color.set(P.dark); m.floor.color.set(P.floor); m.lip.color.set(P.lip); m.under.color.set(P.under);
    m.rackPlate.color.set(P.plate); m.rackSide.color.set(P.dark); m.rackFloor.color.set(P.floor);
    if (this.scene) this.scene.background = hex(P.room);
  }
  // Light or dark. Everything printed is printed again: the chips' faces, the plates.
  setDark(on) {
    if (!!on === !!this.dark) return;
    this.dark = !!on;
    this.paint();
    for (const f of this.faces.values()) f.tex.dispose();
    this.faces.clear();
    for (const it of this.items.values()) it.textured = false;
    this.buildRack(); this.buildTray(); this.place(false);
    this.poke();
  }

  lights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3a0, 1.25));
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.1);
    sun.position.set(-14, 30, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    this.sun = sun;
    this.scene.add(sun, sun.target);
  }

  // ---------------------------------------------------------------- where everything is: from the window's shape
  layout() {
    const w = Math.max(320, this.canvas.clientWidth), h = Math.max(240, this.canvas.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
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
    L.zr0 = zFar + 0.75;                                             // the rack's first row begins a pile's height under the top of the window
    L.zr1 = L.zr0 + 0.55 + L.rackRows * RACK_PITCH_Z;                // and the rack ends at the lip
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

    // the light: from over the left shoulder, far enough off to take the whole bench in
    const mid = (zNear + zFar) / 2, far = this.halfWidthAt(zFar) + 2, deep = (zNear - zFar) / 2 + 4, R = Math.max(far, deep) * 2;
    this.sun.target.position.set(0, 0, mid);
    this.sun.position.set(-0.3 * R, 0.9 * R, mid + 0.32 * R);
    const s = this.sun.shadow.camera;
    s.left = -far * 1.1; s.right = far * 1.1; s.top = deep * 1.2; s.bottom = -deep * 1.2; s.near = R * 0.1; s.far = R * 3;
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
  // shares (the one box, the body's finishes, a chip's face) stays.
  clear(group) {
    for (const o of [...group.children]) {
      group.remove(o);
      o.traverse?.((m) => {
        if (m.isInstancedMesh) m.dispose();
        const u = m.userData || {};
        if (u.geo) m.geometry?.dispose();
        if (u.mat) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (u.map) x?.map?.dispose(); x?.dispose(); });
      });
    }
  }
  slab(group, mat, x0, z0, x1, z1, y0, y1, shadow = true) {
    const m = new THREE.Mesh(this.box, mat);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.receiveShadow = true; m.castShadow = shadow;
    group.add(m);
    return m;
  }
  label(group, tex, x0, z0, x1, z1, y, mat = null) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat || new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true; m.userData = { geo: true, mat: true, map: true };
    group.add(m);
    return m;
  }

  // The body, the table, the lip between the rack and the table.
  buildFixed() {
    const L = this.L, far = this.halfWidthAt(L.zFar) + 6;
    this.clear(this.fixed);
    this.slab(this.fixed, this.mat.body, -far, L.zr1, far, L.zNear + 6, -1.4, -0.05, false);                              // (the rack is a plate of its own, behind the lip)
    this.slab(this.fixed, this.mat.table, -L.W / 2, L.zr1 + LIP, L.trayX - MARGIN * 0.5, L.zNear + 4, -0.3, 0, false);       // the table
    this.slab(this.fixed, this.mat.lip, -far, L.zr1, far, L.zr1 + LIP, -0.9, 0.3);                                          // the lip chips slide under
  }

  // ---------------------------------------------------------------- the rack: pockets, piles, their plates
  // piles: [{ key, name, count, tone, heats: [bright or -1, top first], top: chip or null, lamp, open, add }]
  setRack(piles) { this.rackPiles = piles; this.rackRow = clamp(this.rackRow, 0, this.rackRowsMost()); this.buildRack(); this.poke(); this.tellRows(); }
  rackRowsMost() { return Math.max(0, Math.ceil(this.rackPiles.length / this.L.rackCols) - this.L.rackRows); }

  buildRack() {
    const L = this.L, piles = this.rackPiles;
    this.clear(this.rack);
    this.rackHits = [];
    const rows = Math.max(L.rackRows, Math.ceil(piles.length / L.rackCols));
    // (the plate runs on under the lip and the table, so that slid back it still meets the lip)
    const x0 = -this.halfWidthAt(L.zFar) - 6, x1 = -x0, z0 = L.zr0 - 9, z1 = L.zr0 + 0.55 + (rows + L.rackRows + 1) * RACK_PITCH_Z;
    // the plate, with a pocket cut out for every pile
    const shape = new THREE.Shape([new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)]);
    const at = (i) => {
      const col = i % L.rackCols, row = Math.floor(i / L.rackCols);
      const x = L.rackX0 + col * RACK_PITCH_X, z = L.zr0 + 0.55 + row * RACK_PITCH_Z;
      return { x, z, row };
    };
    piles.forEach((p, i) => {
      const { x, z } = at(i);
      const hole = new THREE.Path();
      hole.moveTo(x, z); hole.lineTo(x, z + POCKET_D); hole.lineTo(x + POCKET_W, z + POCKET_D); hole.lineTo(x + POCKET_W, z); hole.closePath();
      shape.holes.push(hole);
    });
    const geo = new THREE.ExtrudeGeometry(shape, { depth: POCKET_DEEP, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    const plate = new THREE.Mesh(geo, [this.rackClipped(this.mat.rackPlate), this.rackClipped(this.mat.rackSide)]);
    plate.receiveShadow = true; plate.castShadow = true; plate.userData = { geo: true };
    this.rack.add(plate);
    this.slab(this.rack, this.rackClipped(this.mat.rackFloor), x0, z0, x1, z1, -POCKET_DEEP - 0.6, -POCKET_DEEP, false);

    // the piles: one drawn thing for every chip in every pile
    const total = piles.reduce((n, p) => n + Math.min(p.heats ? p.heats.length : 0, 4000), 0);
    const inst = new THREE.InstancedMesh(this.box, this.rackClipped(this.pileMat), Math.max(1, total));
    inst.castShadow = true; inst.receiveShadow = true;
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    let n = 0;
    piles.forEach((p, i) => {
      const { x, z, row } = at(i);
      const heats = (p.heats || []).slice(0, 4000);
      const t = heats.length ? Math.min(CT, PILE_MOST / heats.length) : 0;
      const cx = x + POCKET_W / 2, cz = z + POCKET_D / 2;
      heats.forEach((b, k) => {                                      // (the top chip is heats[0])
        const y = -POCKET_DEEP + (heats.length - 1 - k + 0.5) * t;
        m4.makeScale(CW, t * 0.94, CD); m4.setPosition(cx, y, cz);
        inst.setMatrixAt(n, m4);
        inst.setColorAt(n, c.set(b < 0 ? EDGE_NONE : heat(b)));
        n++;
      });
      const top = -POCKET_DEEP + heats.length * t;
      if (p.top) {
        const f = new THREE.Mesh(this.faceGeo, this.rackClipped(new THREE.MeshStandardMaterial({ map: this.face(p.top, null), roughness: 0.85 })));
        f.position.set(cx, top + 0.004, cz); f.receiveShadow = true;
        f.userData = { mat: true };                                 // (its face is the cache's: face())
        this.rack.add(f);
      }
      // its plate: the name, how many, and what it is
      const tex = plateTexture((g, w, h) => this.drawPlate(g, w, h, p), 736, 84);
      this.label(this.rack, tex, x, z + POCKET_D + 0.08, x + POCKET_W, z + POCKET_D + 0.08 + LABEL_D, 0.012, this.rackClipped(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })));
      if (p.open) {                                                  // the open pile: a yellow frame round its pocket
        const y = 0.02, e = 0.09;
        for (const [a, b, cc, d] of [[x - e, z - e, x + POCKET_W + e, z], [x - e, z + POCKET_D, x + POCKET_W + e, z + POCKET_D + e], [x - e, z, x, z + POCKET_D], [x + POCKET_W, z, x + POCKET_W + e, z + POCKET_D]]) {
          this.slab(this.rack, this.rackClipped(this.mat.yellow.clone()), a, b, cc, d, 0, y + 0.03, false).userData = { mat: true };
        }
      }
      this.rackHits.push({ key: p.key, pile: p, row, x0: x - 0.2, x1: x + POCKET_W + 0.2, z0: z - 0.15, z1: z + POCKET_D + LABEL_D + 0.2, top, cx, cz });
    });
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.rack.add(inst);
    this.rackShift = -this.rackRow * RACK_PITCH_Z;
    this.rack.position.z = this.rackShift;
  }

  drawPlate(g, w, h, p) {
    // (dark: every plate is dark with light print, as the dark instrument's are; the open one is yellow in both)
    const tones = this.dark
      ? { black: [NIGHT.badge, COL.lit], white: [NIGHT.paper, NIGHT.ink], blue: ['#232B31', COL.bluegrey], grey: [NIGHT.plate2, NIGHT.dim], amber: ['#2C2416', COL.amber], yellow: [COL.yellow, COL.black] }
      : { black: [COL.black, COL.lit], white: [COL.white, COL.black], blue: [COL.bluegrey, COL.black], grey: [COL.grey, COL.black], amber: [COL.amber, COL.black], yellow: [COL.yellow, COL.black] };
    const [bg, fg] = tones[p.open ? 'yellow' : p.tone] || tones.black;
    g.fillStyle = this.dark ? NIGHT.room : COL.black; g.fillRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(3, 3, w - 6, h - 6);
    g.textBaseline = 'middle';
    const count = p.add ? '' : String(p.count);
    g.font = LEGEND(44);
    const wc = count ? Math.ceil(g.measureText(count).width) + 34 : 0;
    let right = w - 3;
    if (count) {                                                     // (how many: turned over on a light plate; on a dark one a quieter box, as the dark instrument's tags are)
      const quiet = this.dark && !p.open;
      g.fillStyle = quiet ? NIGHT.plate : fg; g.fillRect(right - wc, 3, wc, h - 6);
      g.fillStyle = quiet ? fg : bg; g.textAlign = 'center'; g.fillText(count, right - wc / 2, h / 2 + 3);
      right -= wc;
    }
    if (p.lamp) { g.fillStyle = this.dark ? NIGHT.room : COL.black; g.fillRect(right - 58, 3, 58, h - 6); g.fillStyle = COL.green; g.fillRect(right - 46, 20, 34, h - 40); right -= 58; }
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

  buildTray() {
    const L = this.L, T = this.trayData, x0 = L.trayX, x1 = x0 + TRAY_W, z0 = L.zt0 - 0.05;
    this.clear(this.tray);
    this.trayHits = [];
    const zEnd = L.zNear + 4;
    // its plate, raised a little off the body, with a pocket for each bay and each stack
    const shape = new THREE.Shape([new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, zEnd), new THREE.Vector2(x0, zEnd)]);
    const cut = (x, z, w, d) => { const hole = new THREE.Path(); hole.moveTo(x, z); hole.lineTo(x, z + d); hole.lineTo(x + w, z + d); hole.lineTo(x + w, z); hole.closePath(); shape.holes.push(hole); };
    const mw = CW * MINI + 0.14, md = CD * MINI + 0.12;
    const bayAt = (i) => ({ x: x0 + 0.2 + (i % 4) * BAY_X, z: z0 + 0.62 + Math.floor(i / 4) * BAY_Z });
    for (let i = 0; i < 16; i++) { const b = bayAt(i); cut(b.x + 0.04, b.z + 0.08, mw, md); }
    const zs = z0 + 0.62 + 4 * BAY_Z + 0.56;                         // the loaded stacks begin here
    const room = Math.max(1, Math.floor((L.zNear - 0.2 - zs) / 0.6));
    const stacks = (T.stacks || []).slice(0, room);
    stacks.forEach((s, i) => cut(x0 + 0.3, zs + i * 0.6 + 0.06, mw, md));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: TRAY_DEEP, bevelEnabled: false });
    geo.rotateX(Math.PI / 2); geo.translate(0, TRAY_TOP, 0);
    const plate = new THREE.Mesh(geo, [this.mat.plate, this.mat.dark]);
    plate.receiveShadow = true; plate.castShadow = true; plate.userData = { geo: true };
    this.tray.add(plate);
    this.slab(this.tray, this.mat.floor, x0, z0, x1, zEnd, -0.3, TRAY_TOP - TRAY_DEEP, false);

    const title = (text, z, sub) => {
      const tex = plateTexture((g, w, h) => {
        g.fillStyle = this.dark ? NIGHT.badge : COL.black; g.fillRect(0, 0, w, h);
        g.textBaseline = 'middle'; g.fillStyle = COL.lit; g.font = LEGEND(40); g.letterSpacing = '3px';
        g.fillText(text, 18, h / 2 + 2);
        if (sub) { g.font = LABEL(24); g.textAlign = 'right'; g.letterSpacing = '2px'; g.fillText(sub, w - 16, h / 2 + 2); }
        g.letterSpacing = '0px';
      }, 912, 60);
      this.label(this.tray, tex, x0 + 0.2, z, x1 - 0.2, z + 0.4, TRAY_TOP + 0.012);
    };
    title('SF-000', z0 + 0.12, 'WHAT LOAD BRINGS: KNOBS 1 TO 16');

    const total = [...(T.bays || []), ...stacks].reduce((n, b) => n + (b && b.heats ? Math.min(b.heats.length, 400) : 0), 0);
    const inst = new THREE.InstancedMesh(this.box, this.miniMat, Math.max(1, total));
    inst.castShadow = true; inst.receiveShadow = true;
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    let n = 0;
    const pile = (heats, cx, cz) => {
      heats = (heats || []).slice(0, 400);
      const t = heats.length ? Math.min(0.06, 0.6 / heats.length) : 0;
      heats.forEach((b, k) => {
        m4.makeScale(CW * MINI, t * 0.92, CD * MINI); m4.setPosition(cx, TRAY_TOP - TRAY_DEEP + (heats.length - 1 - k + 0.5) * t, cz);
        inst.setMatrixAt(n, m4); inst.setColorAt(n, c.set(b < 0 ? EDGE_NONE : heat(b))); n++;
      });
    };
    for (let i = 0; i < 16; i++) {
      const b = bayAt(i), bay = (T.bays || [])[i] || {};
      pile(bay.heats, b.x + 0.04 + mw / 2, b.z + 0.08 + md / 2);
      const tex = plateTexture((g, w, h) => {
        const D = this.dark;
        g.fillStyle = bay.open ? COL.yellow : bay.key ? (D ? NIGHT.paper : COL.white) : D ? NIGHT.plate2 : COL.grey; g.fillRect(0, 0, w, h);
        g.fillStyle = D ? NIGHT.badge : COL.black; g.fillRect(0, 0, 52, h);
        g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = D && !bay.key ? NIGHT.dim : COL.lit; g.font = LEGEND(40);
        g.fillText(String(i + 1), 26, h / 2 + 2);
        g.textAlign = 'left'; g.fillStyle = D && !bay.open ? NIGHT.ink : COL.black; g.font = LEGEND(36); g.letterSpacing = '1px';
        g.fillText(fitText(g, String(bay.name || '').toUpperCase(), w - 64), 60, h / 2 + 2);
        g.letterSpacing = '0px';
      }, 240, 56);
      this.label(this.tray, tex, b.x + 0.04, b.z + 0.08 + md + 0.1, b.x + 0.04 + mw, b.z + 0.08 + md + 0.44, TRAY_TOP + 0.012);
      this.trayHits.push({ bay: i + 1, key: bay.key || null, pile: bay, x0: b.x - 0.04, x1: b.x + BAY_X - 0.04, z0: b.z, z1: b.z + BAY_Z, cx: b.x + 0.04 + mw / 2, cz: b.z + 0.3 });
    }
    title('POCKETS', zs - 0.48, stacks.length < (T.stacks || []).length ? `${stacks.length} OF ${T.stacks.length} SHOWN` : 'DROP A STACK HERE TO LOAD IT');
    stacks.forEach((s, i) => {
      const z = zs + i * 0.6;
      pile(s.heats, x0 + 0.3 + mw / 2, z + 0.06 + md / 2);
      const tex = plateTexture((g, w, h) => {
        g.fillStyle = s.open ? COL.yellow : this.dark ? NIGHT.paper : COL.white; g.fillRect(0, 0, w, h);
        g.textBaseline = 'middle'; g.fillStyle = this.dark && !s.open ? NIGHT.ink : COL.black; g.font = LEGEND(34); g.letterSpacing = '2px';
        const count = String(s.count);
        g.textAlign = 'right'; g.fillText(count, w - 12, h / 2 + 2);
        g.textAlign = 'left'; g.fillText(fitText(g, String(s.name || '').toUpperCase(), w - g.measureText(count).width - 40), 12, h / 2 + 2);
        g.letterSpacing = '0px';
      }, 736, 52);
      this.label(this.tray, tex, x0 + 0.3 + mw + 0.14, z + 0.07, x1 - 0.22, z + 0.07 + md - 0.02, TRAY_TOP + 0.012);
      this.trayHits.push({ stack: true, key: s.key, pile: s, x0, x1, z0: z, z1: z + 0.6, cx: x0 + 3, cz: z + 0.3 });
    });
    this.trayHits.push({ pockets: true, key: null, x0, x1, z0: zs - 0.5, z1: zEnd, cx: x0 + TRAY_W / 2, cz: Math.min(L.zNear - 0.8, zs + stacks.length * 0.6 + 0.6) });
    inst.count = n; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.tray.add(inst);
  }

  // ---------------------------------------------------------------- chips' faces
  face(s, label) {
    const key = s.uid, had = this.faces.get(key);
    const stamp = `${label}|${s.name}`;
    if (had && had.stamp === stamp) { had.used = ++this.frame; return had.tex; }
    if (had) had.tex.dispose();
    const tex = new THREE.CanvasTexture(faceCanvas(s, label, this.faceScale || 2));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
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
    it.edge = new THREE.MeshStandardMaterial({ color: hex(edgeColour(d.s)), roughness: 0.7, clippingPlanes: [this.clipTable], clipShadows: true });
    it.top = new THREE.MeshStandardMaterial({ roughness: 0.85, clippingPlanes: [this.clipTable], clipShadows: true });
    it.mesh = new THREE.Mesh(this.chipGeo, [it.edge, it.edge, it.top, this.mat.under, it.edge, it.edge]);
    it.mesh.castShadow = true; it.mesh.receiveShadow = true;
    it.group.add(it.mesh);
    this.table.add(it.group);
    return it;
  }
  dropItem(it) {
    this.table.remove(it.group);
    it.edge.dispose(); it.top.dispose();
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
      if (!it.textured) { it.top.map = this.face(d.s, d.label); it.top.needsUpdate = true; it.textured = true; }
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
        const m = this.mat[want].clone(); m.clippingPlanes = [this.clipTable];
        it.ring = new THREE.Mesh(this.box, m);
        it.ring.scale.set(CW + 0.2, CT * 0.55, CD + 0.2); it.ring.position.y = -CT * 0.25;
        it.ring.castShadow = true;
        it.group.add(it.ring);
      }
      it.ringTone = want;
    }
    if (!!it.clip !== mark) {
      if (it.clip) { it.group.remove(it.clip); it.clip.material.dispose(); it.clip = null; }
      if (mark) {
        const m = this.mat.yellow.clone(); m.clippingPlanes = [this.clipTable];
        it.clip = new THREE.Mesh(this.box, m);
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
    if (this.dirty || moving) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
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
      const lo = [p.cx - CW / 2, -POCKET_DEEP, p.cz - CD / 2 + this.rackShift], hi = [p.cx + CW / 2, Math.max(0.02, p.top), p.cz + CD / 2 + this.rackShift];
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
    if (g.x >= L.trayX - 0.1 && g.z >= L.zt0 - 0.1) {
      const h = (this.trayHits || []).find((p) => g.x >= p.x0 && g.x <= p.x1 && g.z >= p.z0 && g.z <= p.z1);
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
      const u = this.under(e);
      this.down = { x: e.clientX, y: e.clientY, u, shift: e.shiftKey || e.metaKey || e.ctrlKey };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.down && !this.drag && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6) this.startDrag(e);
      if (this.drag) { this.moveDrag(e); return; }
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
    c.addEventListener('pointercancel', () => { this.down = null; this.cancelDrag(); });
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
        const top = new THREE.MeshStandardMaterial({ map: i === n - 1 ? this.face(u.item.s, u.item.label) : null, color: i === n - 1 ? 0xffffff : hex(this.dark ? NIGHT.plate : COL.putty), roughness: 0.85 });
        const edge = new THREE.MeshStandardMaterial({ color: hex(edgeColour(u.item.s)), roughness: 0.7 });
        const m = new THREE.Mesh(this.chipGeo, [edge, edge, top, this.mat.under, edge, edge]);
        m.position.set(i * 0.05, i * (CT + 0.012), i * -0.04); m.castShadow = true; m.userData = { mat: true };
        this.held.add(m);
      }
      this.held.position.copy(u.item.group.position);
      this.held.rotation.set(0, 0, -0.035);
    } else if ((u.type === 'pile' || u.type === 'bay') && u.key && !(u.pile && u.pile.add)) {             // (a knob's macro is picked up by its bay)
      this.drag = { kind: 'pile', key: u.key, on: true, at: this.ground(e, 1) };
      const heats = (u.pile && u.pile.heats ? u.pile.heats : []).slice(0, 14);
      heats.forEach((b, i) => {
        const m = new THREE.Mesh(this.chipGeo, new THREE.MeshStandardMaterial({ color: hex(b < 0 ? EDGE_NONE : heat(b)), roughness: 0.75 }));
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
    if (h) return this.screenOf(h.cx, onPlate ? 0 : Math.max(0, h.top), (onPlate ? h.z1 - 0.45 : h.cz) + this.rackShift);
    const t = (this.trayHits || []).find((p) => p.key === key && (p.stack || p.bay));
    return t ? this.screenOf(t.cx, TRAY_TOP, t.cz) : null;
  }
  whereBay(slot) { const t = (this.trayHits || []).find((p) => p.bay === slot); return t ? this.screenOf(t.cx, TRAY_TOP, t.cz) : null; }
  whereTray() { const t = (this.trayHits || []).find((p) => p.pockets); return this.screenOf(t.cx, TRAY_TOP, t.cz); }
  wholeRows() { return this.L.wholeRows; }
  columns() { return this.L.cols; }
}
