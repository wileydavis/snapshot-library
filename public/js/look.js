// The instrument's look, for the bench: what SF-000's 3D stage draws its plates, case, keys and
// knobs with (its Source/Stage.cpp), carried over sum for sum. The finishes (black anodized
// faceplates that have been used, a powder-coated case), the light (one sun from behind and to
// the left, a soft room above and below), the room behind and the glow under the case, the glow
// round what is lit, and the way the picture is brought to the window are all the instrument's.
// The scratches are the instrument's own sheet (wear.png: made by SF-000's tools/wear.py).
//
// Sizes: one of the bench's units is 66 of the instrument's screen units (a chip is a snapshot
// card: 272 by 66 of them), so a part made here from the instrument's figures is the same part.
import * as THREE from '../vendor/three.min.js';

export const UNIT = 66;
const MM = 5.46 / UNIT;                                   // the model's millimetre
export const PLATE = 1.27 * MM;                           // a plate's top above what it stands on
export const KEY = 1.27 * MM, KEY_ON = 0.66 * MM, KEY_DOWN = 0.26 * MM;
export const PANE = 0.51 * MM;                            // a display's glass above its plate
export const CASE = 25.4 * MM;                            // how deep the case is
export const CORNER = 7.5 / UNIT, ROLL = 1.2 / UNIT;      // a plate's corners, and the roll of its top edge
export const CAP_BIG = 27.74 / UNIT, CAP_SMALL = 19.82 / UNIT, CAP_R_BIG = 11.84 / UNIT, CAP_R_SMALL = 8.29 / UNIT;

// The light: from behind and to the left, 48 degrees up.
const up = (48 * Math.PI) / 180, round = (-50 * Math.PI) / 180;
export const SUN = new THREE.Vector3(Math.sin(round) * Math.cos(up), Math.sin(up), -Math.cos(round) * Math.cos(up)).normalize();

// What every surface shares. uFinish: 1 for the dark instrument (the worn anodizing and the
// powder coat are its; the pale one is plain).
const WEAR_SPAN = 330;
export const shared = {
  uSun: { value: SUN.clone() },
  uSunCol: { value: new THREE.Vector3(2.46, 2.40, 2.30) },
  uSky: { value: new THREE.Vector3(0.40, 0.42, 0.44) },
  uGround: { value: new THREE.Vector3(0.20, 0.17, 0.15) },
  uFinish: { value: 0 },
  uWear: { value: null },
  uWearOn: { value: 0 },
  uWearSpan: { value: new THREE.Vector2(WEAR_SPAN * (4096 / 2440), WEAR_SPAN) },
  uWarm: { value: new THREE.Vector3(1.0, 0.36, 0.10).multiplyScalar(0.13) },
  uCaseDepth: { value: CASE * UNIT },
  uUnit: { value: UNIT },
};

// The scratch sheet: white where the surface is scratched through; it repeats without a seam.
export function loadWear(renderer, then) {
  new THREE.TextureLoader().load('wear.png', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.format = THREE.RedFormat;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.flipY = false;
    const im = t.image;
    if (im && im.width > 16) shared.uWearSpan.value.set(WEAR_SPAN * (im.width / im.height), WEAR_SPAN);
    shared.uWear.value = t; shared.uWearOn.value = 1;
    then?.();
  }, undefined, () => then?.());
}

// ---------------------------------------------------------------- the surface: every solid thing
const SURFACE_VERT = /* glsl */`
#include <common>
#include <batching_pars_vertex>
#include <shadowmap_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vPos; varying vec3 vOwn; varying vec3 vNrm; varying float vUp; varying vec2 vUv2; varying vec3 vTint;
void main() {
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vec4 wp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  vPos = wp.xyz;
  vNrm = inverseTransformDirection( transformedNormal, viewMatrix );
  vUp = normal.y;
  vOwn = position;
  vUv2 = uv;
  vTint = vec3( -1.0 );                       // (each of a crowd drawn together has its own colour; a thing drawn alone has its finish's)
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
}`;

// uKind says what it is: 0 plain; 1 its top carries print (uMap); 2 a display (its print is
// light); 3 a lit key; 4 the case. uWorn: 0 no finish; 1 a faceplate (anodized, with its own
// wear: uNumber says which); 2 the case's powder coat. uRect: the thing's own footprint
// (its middle, half its width, half its depth), in the instrument's units, for the wear at its edges.
const SURFACE_FRAG = /* glsl */`
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uWarm;
uniform float uFinish; uniform float uCaseDepth; uniform float uUnit;
uniform sampler2D uWear; uniform vec2 uWearSpan; uniform float uWearOn;
uniform vec3 uColour; uniform float uRough; uniform float uMetal; uniform float uKind; uniform float uEmit; uniform float uWorn; uniform float uNumber;
uniform vec4 uRect;
uniform sampler2D uMap; uniform float uMapOn;
uniform vec3 uEdge; uniform float uEdgeOn;
varying vec3 vPos; varying vec3 vOwn; varying vec3 vNrm; varying float vUp; varying vec2 vUv2; varying vec3 vTint;
#include <common>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
#include <clipping_planes_pars_fragment>
vec3 sfLinear( vec3 c ) { return mix( c / 12.92, pow( ( c + vec3( 0.055 ) ) / 1.055, vec3( 2.4 ) ), step( vec3( 0.04045 ), c ) ); }
// numbers with no pattern to them, from a place: one for a point, and one that changes smoothly between points
float sfHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float sfNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( sfHash( i ), sfHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( sfHash( i + vec2( 0.0, 1.0 ) ), sfHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
vec4 sfHash4( vec2 p ) {
  vec4 q = fract( vec4( p.xyxy ) * vec4( 0.1031, 0.1030, 0.0973, 0.1099 ) );
  q += dot( q, q.wzxy + 33.33 );
  return fract( ( q.xxyz + q.yzzw ) * q.zywx );
}
// The wear sheet: each plate takes its own window of it, its own way up (one of four, and as
// often as not mirrored), so that no two plates are worn alike.
vec2 sfTurn( vec2 q, vec4 rect, vec4 h ) {
  float k = floor( h.x * 4.0 );
  if ( rect.z > 2.0 * rect.w ) k = 2.0 * floor( h.x * 2.0 );
  else if ( rect.w > 2.0 * rect.z ) k = 2.0 * floor( h.x * 2.0 ) + 1.0;
  q = k < 0.5 ? q : ( k < 1.5 ? vec2( -q.y, q.x ) : ( k < 2.5 ? -q : vec2( q.y, -q.x ) ) );
  if ( h.y > 0.5 ) q.x = -q.x;
  return q;
}
float sfWear( vec2 p, vec4 rect, float scale, float number ) {
  if ( uWearOn < 0.5 ) return 0.0;
  vec4 h = sfHash4( vec2( number, number * 0.37 + 11.0 ) );
  vec2 span = uWearSpan * scale;
  vec2 uv = sfTurn( p - rect.xy, rect, h ) / span + h.zw;
  return textureGrad( uWear, uv, sfTurn( dFdx( p ), rect, h ) / span, sfTurn( dFdy( p ), rect, h ) / span ).r;
}
void main() {
  #include <clipping_planes_fragment>
  vec3 n = normalize( vNrm );
  if ( ! gl_FrontFacing ) n = -n;
  float top = step( 0.999, vUp );
  vec3 albedo = uColour;
  if ( vTint.r >= 0.0 ) albedo = vTint;
  if ( uEdgeOn > 0.5 && vUp < 0.02 ) albedo = uEdge;
  float rough = clamp( uRough, 0.06, 1.0 ), metal = clamp( uMetal, 0.0, 1.0 ), kind = uKind;
  vec3 emit = vec3( 0.0 );
  vec3 own = vOwn * uUnit;
  if ( uWorn > 0.5 && uFinish > 0.0 ) {
    float f = uFinish;
    float px = max( length( fwidth( own.xz ) ), 0.05 );     // how much of the surface one pixel covers: nothing here is drawn finer than that
    if ( uWorn < 1.5 && top > 0.5 ) {
      // A faceplate: black anodized aluminium that has been used. Its dye is never quite even (a
      // slow mottling, a fine blasted grain); things dragged across it have left their scratches
      // (the wear sheet: a photograph's); and along its edges, more in some stretches than in
      // others, it is rubbed through to the metal in specks that thin out as they come inward.
      vec2 p = own.xz;
      float grain = sfHash( floor( p * 2.3 ) ) - 0.5;
      float mottle = sfNoise( p * 0.035 ) * 0.6 + sfNoise( p * 0.11 + vec2( 17.0, 5.0 ) ) * 0.4 - 0.5;
      float w = sfWear( p, uRect, 1.0, uNumber );
      float busy = smoothstep( 0.30, 0.72, sfNoise( p * 0.013 + vec2( uNumber, 3.0 ) ) );
      float scratch = w * ( 0.30 + 0.70 * w ) * ( 0.45 + 0.55 * busy );
      float corner = min( 7.5, min( uRect.z, uRect.w ) );
      vec2 a = abs( p - uRect.xy ) - ( uRect.zw - corner );
      float edge = corner - ( length( max( a, 0.0 ) ) + min( max( a.x, a.y ), 0.0 ) );
      float patchy = smoothstep( 0.36, 0.80, sfNoise( p * 0.045 + vec2( 3.0, 41.0 + uNumber ) ) );
      float near = 1.0 - clamp( edge / ( 1.1 + 5.5 * patchy ), 0.0, 1.0 );
      float cover = clamp( near * near * ( 0.20 + 0.60 * patchy ), 0.0, 1.0 );
      float speck = step( 1.0 - cover, sfHash( floor( p * 3.7 ) + vec2( 2.0, 87.0 ) ) );
      float worn = mix( speck, cover, clamp( px * 2.4 - 0.5, 0.0, 1.0 ) );
      albedo *= 1.0 + f * ( grain * 0.06 + mottle * 0.07 );
      albedo = mix( albedo, vec3( 0.50, 0.51, 0.52 ), clamp( f * ( worn * 0.40 + scratch * 0.62 ), 0.0, 1.0 ) );
      rough = clamp( rough + f * ( grain * 0.05 - mottle * 0.06 - worn * 0.20 - scratch * 0.25 ), 0.06, 1.0 );
      metal = clamp( metal + f * ( worn * 0.50 + scratch * 0.40 ), 0.0, 1.0 );
    } else if ( uWorn > 1.5 ) {
      // The case: powder coat. Never quite flat (an orange-peel that breaks up what shines in
      // it), a fine speckle in the colour, a few scuffs (the wear sheet again, larger and
      // fainter), and its upper edge rubbed where it has met tables and bags.
      vec2 p = own.xz + own.y * vec2( 0.61, 0.37 );
      float a1 = sfNoise( p * 1.5 ) - 0.5, a2 = sfNoise( p * 1.5 + vec2( 31.0, 7.0 ) ) - 0.5;
      float soft = min( 1.0, 1.2 / px );
      n = normalize( n + f * soft * 0.20 * ( top > 0.5 ? vec3( a1, 0.0, a2 ) : vec3( a1, a2, a1 * a2 * 2.0 ) ) );
      float speckle = sfHash( floor( p * 2.9 ) ) - 0.5;
      float scuff = sfWear( p, uRect, 1.6, 23.0 );
      float edge = min( uRect.z - abs( own.x - uRect.x ), uRect.w - abs( own.z - uRect.y ) );
      float rubbed = top > 0.5 ? ( 1.0 - smoothstep( 0.5, 8.0, edge ) ) * smoothstep( 0.45, 0.85, sfNoise( p * 0.05 + vec2( 77.0, 3.0 ) ) ) : 0.0;
      albedo *= 1.0 + f * ( speckle * 0.05 + ( sfNoise( p * 0.04 ) - 0.5 ) * 0.06 );
      albedo = mix( albedo, albedo * 1.7 + vec3( 0.03 ), clamp( f * ( rubbed * 0.40 + scuff * 0.30 ), 0.0, 1.0 ) );
      rough = clamp( rough + f * ( speckle * 0.05 - rubbed * 0.10 - scuff * 0.10 ), 0.06, 1.0 );
    }
  }
  if ( top > 0.5 && uMapOn > 0.5 ) {
    // what is printed on it (the print keeps how much of the surface it covers: nothing where it is clear)
    vec4 pr = texture2D( uMap, vUv2 );
    float cover = clamp( pr.a, 0.0, 1.0 );
    vec3 ink = cover > 0.002 ? sfLinear( clamp( pr.rgb / cover, 0.0, 1.0 ) ) : vec3( 0.0 );
    albedo = mix( albedo, ink, cover );
    if ( kind > 1.5 && kind < 2.5 ) {
      // a display: what it shows is light. A dark one's letters glow; a pale one is lit evenly and does not dazzle.
      float pale = smoothstep( 0.15, 0.55, dot( uColour, vec3( 0.2126, 0.7152, 0.0722 ) ) );
      emit = albedo * mix( 1.35, 0.80, pale );
      albedo *= 0.10;
    }
  }
  if ( kind > 2.5 && kind < 3.5 ) emit += uColour * uEmit;
  if ( kind > 3.5 ) {
    float drop = clamp( -vPos.y * uUnit / uCaseDepth, 0.0, 1.0 );
    emit += uWarm * ( drop * drop * sqrt( drop ) ) * clamp( 1.0 - n.y, 0.0, 1.0 );
  }
  vec3 V = normalize( cameraPosition - vPos );
  float ndl = max( dot( n, uSun ), 0.0 ), ndv = max( dot( n, V ), 0.001 );
  float sh = ndl > 0.0 ? getShadowMask() : 0.0;
  vec3 f0 = mix( vec3( 0.04 ), albedo, metal );
  vec3 diff = albedo * ( 1.0 - metal );
  vec3 H = normalize( uSun + V );
  float ndh = max( dot( n, H ), 0.0 ), vdh = max( dot( V, H ), 0.0 );
  float a = rough * rough, a2 = a * a;
  float d = ndh * ndh * ( a2 - 1.0 ) + 1.0;
  float D = a2 / ( PI * d * d );
  float k = ( rough + 1.0 ) * ( rough + 1.0 ) / 8.0;
  float G = ( ndl / ( ndl * ( 1.0 - k ) + k ) ) * ( ndv / ( ndv * ( 1.0 - k ) + k ) );
  vec3 F = f0 + ( vec3( 1.0 ) - f0 ) * pow( 1.0 - vdh, 5.0 );
  vec3 c = ( diff / PI + D * G * F / max( 4.0 * ndl * ndv, 0.001 ) ) * uSunCol * ndl * sh;
  c += diff * mix( uGround, uSky, n.y * 0.5 + 0.5 );
  // what shines in it: a soft room, brighter overhead
  vec3 Rv = reflect( -V, n );
  vec3 room = mix( uGround, uSky, smoothstep( -0.3, 0.8, Rv.y ) ) * 1.5;
  vec3 Fr = f0 + ( max( vec3( 1.0 - rough ), f0 ) - f0 ) * pow( 1.0 - ndv, 5.0 );
  c += room * Fr * ( 1.0 - rough * 0.7 );
  c += emit;
  if ( ! ( c.r >= 0.0 ) ) c.r = 0.0;
  if ( ! ( c.g >= 0.0 ) ) c.g = 0.0;
  if ( ! ( c.b >= 0.0 ) ) c.b = 0.0;
  gl_FragColor = vec4( min( c, vec3( 60.0 ) ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
BLANK.needsUpdate = true;
const lights = () => THREE.UniformsUtils.clone(THREE.UniformsLib.lights);

// A surface. colour: as written (#RRGGBB) or a THREE.Color. rect: [middle x, middle z, half width,
// half depth] in the bench's units, of the thing itself (its own space).
export function surface(spec = {}) {
  const { colour = '#808080', rough = 0.7, metal = 0, kind = 0, emit = 0, worn = 0, number = 0, rect = null, map = null, edge = null, clip = null } = spec;
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...lights(), ...shared,
      uColour: { value: new THREE.Color(colour) }, uRough: { value: rough }, uMetal: { value: metal }, uKind: { value: kind }, uEmit: { value: emit },
      uWorn: { value: worn }, uNumber: { value: number },
      uRect: { value: new THREE.Vector4(0, 0, 1e6, 1e6) },
      uMap: { value: map || BLANK }, uMapOn: { value: map ? 1 : 0 },
      uEdge: { value: new THREE.Color(edge || '#000000') }, uEdgeOn: { value: edge ? 1 : 0 },
    },
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG, lights: true, clipping: true,
  });
  if (rect) setRect(m, rect);
  if (clip) { m.clippingPlanes = clip; m.clipShadows = true; }
  m.userData.spec = spec;
  return m;
}
export function setRect(m, [x, z, hw, hd]) { m.uniforms.uRect.value.set(x * UNIT, z * UNIT, hw * UNIT, hd * UNIT); }
export function setMap(m, map) { m.uniforms.uMap.value = map || BLANK; m.uniforms.uMapOn.value = map ? 1 : 0; }
export function setColour(m, colour) { m.uniforms.uColour.value.set(colour); }
// A print let go of (the blank one is everybody's).
export function dropMap(m) { const t = m.uniforms?.uMap?.value; if (t && t !== BLANK) t.dispose(); }
// A surface like this one for another thing, with what is different about it.
export function another(m, changes = {}) { return surface({ ...m.userData.spec, ...changes }); }

// A light: it is its colour, whatever falls on it. What a light gives off is brighter than white
// can be drawn, and as bright to the eye whatever the colour.
const LIGHT_FRAG = /* glsl */`
uniform vec3 uColour;
#include <common>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  gl_FragColor = vec4( clamp( uColour, 0.0, 60.0 ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const LIGHT_VERT = /* glsl */`
#include <common>
#include <clipping_planes_pars_vertex>
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
}`;
export function glowOf(colour) {
  const srgb = new THREE.Color(colour).convertLinearToSRGB();
  const max = Math.max(srgb.r, srgb.g, srgb.b), min = Math.min(srgb.r, srgb.g, srgb.b), sat = max > 0 ? (max - min) / max : 0;
  const white = sat < 0.15;
  let on;
  if (white) on = new THREE.Color('#FFFDF6');
  else {
    // more of its colour and brighter (hue, saturation, brightness: the instrument's sums), then a touch toward white
    const v = Math.min(1, max * 1.42), s = Math.min(1, sat * 1.15);
    const h = hsvHue(srgb.r, srgb.g, srgb.b);
    on = fromHsv(h, s, v);
    on.r += (1 - on.r) * 0.08; on.g += (1 - on.g) * 0.08; on.b += (1 - on.b) * 0.08;
    on = new THREE.Color().setRGB(on.r, on.g, on.b, THREE.SRGBColorSpace);
  }
  const lum = 0.2126 * on.r + 0.7152 * on.g + 0.0722 * on.b;
  return on.multiplyScalar((white ? 1.3 : 1.7) / Math.max(0.05, lum));
}
function hsvHue(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d <= 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h / 6) % 1 + 1) % 1;
}
function fromHsv(h, s, v) {
  const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return { r: f(5), g: f(3), b: f(1) };
}
export function light(colour, clip = null) {
  const m = new THREE.ShaderMaterial({ uniforms: { uColour: { value: colour.isColor ? colour : glowOf(colour) } }, vertexShader: LIGHT_VERT, fragmentShader: LIGHT_FRAG, clipping: true });
  if (clip) m.clippingPlanes = clip;
  return m;
}
// A key that is lit: its own colour, a little more of it, and giving off light besides.
export function litColour(colour) {
  const c = new THREE.Color(colour).convertLinearToSRGB();
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b), sat = max > 0 ? (max - min) / max : 0;
  const o = fromHsv(hsvHue(c.r, c.g, c.b), Math.min(1, sat * 1.1), Math.min(1, max * 1.25));
  return new THREE.Color().setRGB(o.r, o.g, o.b, THREE.SRGBColorSpace);
}

// ---------------------------------------------------------------- the room, and the glow under the case
// One sheet below the case, as far as the eye sees: the room (dark, a little lit behind the
// window's middle) and on it the case's own outline, soft and warm.
const ROOM_VERT = /* glsl */`
varying vec2 vAt;
void main() { vec4 wp = modelMatrix * vec4( position, 1.0 ); vAt = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ROOM_FRAG = /* glsl */`
uniform vec2 uRes; uniform vec3 uNear; uniform vec3 uFar; uniform vec4 uBox; uniform vec3 uGlow; uniform float uSoft;
varying vec2 vAt;
#include <common>
void main() {
  vec2 p = ( gl_FragCoord.xy / uRes - vec2( 0.5, 0.56 ) ) * vec2( uRes.x / uRes.y, 1.0 );
  float d = clamp( length( p ) / 0.95, 0.0, 1.0 );
  vec3 c = mix( uNear, uFar, smoothstep( 0.0, 1.0, d ) );
  vec2 q = abs( vAt - uBox.xy ) - uBox.zw;
  float sd = length( max( q, vec2( 0.0 ) ) ) + min( max( q.x, q.y ), 0.0 );
  float g = exp( -pow( max( sd + uSoft * 0.25, 0.0 ) / uSoft, 2.0 ) );
  c += uGlow * g;
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const ROOM_Y = -CASE - 80 / UNIT;
export function makeRoom() {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: new THREE.Vector3(0.0180, 0.0150, 0.0140) }, uFar: { value: new THREE.Vector3(0.0018, 0.0018, 0.0022) },
      uBox: { value: new THREE.Vector4(0, 0, 1, 1) },
      uGlow: { value: new THREE.Vector3(1.0, 0.19, 0.027).multiplyScalar(0.115) },         // (warm, and dim: it is felt more than seen)
      uSoft: { value: 190 / UNIT },
    },
    vertexShader: ROOM_VERT, fragmentShader: ROOM_FRAG, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = ROOM_Y; m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------- shapes
// A slab: a box with rounded corners and a rounded top edge. w by d on the ground, h tall, its
// foot at 0. Its top is printed edge to edge (uv), the far edge the print's top.
export function slabGeo(w, d, h, corner = CORNER, roll = ROLL, S = 6, B = 3, lid = true) {
  const r = Math.max(0.0005, Math.min(corner, w / 2, d / 2)), bev = Math.max(0, Math.min(roll, r, h));
  const pos = [], nor = [], uv = [], idx = [];
  const N = 4 * (S + 1);
  const ring = (inset, y, nr, ny) => {
    for (let c = 0; c < 4; c++) for (let j = 0; j <= S; j++) {
      const th = (c + j / S) * Math.PI * 0.5, ax = Math.cos(th), az = Math.sin(th);
      const sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1;
      const x = sx * (w / 2 - r) + ax * (r - inset), z = sz * (d / 2 - r) + az * (r - inset);
      pos.push(x, y, z); nor.push(ax * nr, ny, az * nr); uv.push(x / w + 0.5, 0.5 - z / d);
    }
  };
  ring(0, 0, 1, 0);
  ring(0, h - bev, 1, 0);
  let rings = 2;
  if (bev > 0) for (let j = 1; j <= B; j++) { const th = (j / B) * Math.PI * 0.5; ring(bev * (1 - Math.cos(th)), h - bev + bev * Math.sin(th), Math.cos(th), Math.sin(th)); rings++; }
  if (lid) { ring(bev, h, 0, 1); rings++; pos.push(0, h, 0); nor.push(0, 1, 0); uv.push(0.5, 0.5); }
  for (let q = 0; q + 1 < rings; q++) for (let k = 0; k < N; k++) {
    const a = q * N + k, b = q * N + ((k + 1) % N), c = a + N, e = b + N;
    idx.push(a, e, b, a, c, e);
  }
  if (lid) {                                              // (a layer in the middle of a pile has no top to draw: only its wall shows)
    const mid = rings * N, base = (rings - 1) * N;
    for (let k = 0; k < N; k++) idx.push(base + ((k + 1) % N), base + k, mid);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A plate with holes cut through it: x0..x1 by z0..z1 on the ground, its top at `top`, `h` thick.
// holes: [{ x, z, w, d }] (their far left corners). Its corners are round and its edges eased, as a plate's are.
export function plateGeo(x0, z0, x1, z1, top, h, holes = [], { corner = CORNER, roll = ROLL, holeCorner = 2.6 / UNIT } = {}) {
  const path = (p, ax, az, bx, bz, r) => {
    r = Math.max(0.0005, Math.min(r, (bx - ax) / 2, (bz - az) / 2));
    p.moveTo(ax + r, az); p.lineTo(bx - r, az); p.absarc(bx - r, az + r, r, -Math.PI / 2, 0, false);
    p.lineTo(bx, bz - r); p.absarc(bx - r, bz - r, r, 0, Math.PI / 2, false);
    p.lineTo(ax + r, bz); p.absarc(ax + r, bz - r, r, Math.PI / 2, Math.PI, false);
    p.lineTo(ax, az + r); p.absarc(ax + r, az + r, r, Math.PI, Math.PI * 1.5, false);
    return p;
  };
  const shape = path(new THREE.Shape(), x0, z0, x1, z1, corner);
  for (const o of holes) shape.holes.push(path(new THREE.Path(), o.x, o.z, o.x + o.w, o.z + o.d, holeCorner));
  const bev = Math.min(roll, h * 0.5);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bev, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 2, curveSegments: 6 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, top - bev, 0);
  return geo;
}

// A turned shape (a cap, a lens): an outline of (radius, height) spun round. Where the outline
// turns a sharp corner the surface does too; elsewhere it is smooth.
export function turnedGeo(outline, segs = 32, scale = 1 / UNIT) {
  const n = outline.length, pts = [];
  const normalOf = (a, b) => { const dr = outline[b][0] - outline[a][0], dy = outline[b][1] - outline[a][1], l = Math.hypot(dr, dy) + 1e-9; return [dy / l, -dr / l]; };
  for (let i = 0; i < n; i++) {
    const [r, y] = outline[i];
    if (i === 0) { const m = normalOf(0, 1); pts.push([r, y, m[0], m[1]]); continue; }
    if (i === n - 1) { const m = normalOf(n - 2, n - 1); pts.push([r, y, m[0], m[1]]); continue; }
    const a = normalOf(i - 1, i), b = normalOf(i, i + 1);
    if (a[0] * b[0] + a[1] * b[1] < 0.72) { pts.push([r, y, a[0], a[1]]); pts.push([r, y, b[0], b[1]]); }
    else { const sr = a[0] + b[0], sy = a[1] + b[1], l = Math.hypot(sr, sy) + 1e-9; pts.push([r, y, sr / l, sy / l]); }
  }
  const cols = segs + 1, rows = pts.length, pos = [], nor = [], uv = [], idx = [];
  const rMost = Math.max(...outline.map((o) => o[0]));
  for (let j = 0; j < rows; j++) for (let k = 0; k < cols; k++) {
    const th = (k / segs) * 2 * Math.PI, cs = Math.cos(th), sn = Math.sin(th), p = pts[j];
    pos.push(p[0] * cs * scale, p[1] * scale, p[0] * sn * scale); nor.push(p[2] * cs, p[3], p[2] * sn);
    uv.push((p[0] * cs) / (2 * rMost) + 0.5, 0.5 - (p[0] * sn) / (2 * rMost));
  }
  for (let j = 0; j + 1 < rows; j++) {
    if (pts[j][0] === pts[j + 1][0] && pts[j][1] === pts[j + 1][1]) continue;
    for (let k = 0; k < segs; k++) { const a = j * cols + k, b = a + 1, c = a + cols, e = c + 1; idx.push(a, e, b, a, c, e); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// The knob caps, as the model has them (radius, height above the plate; the instrument's units).
export const CAP_BIG_OUTLINE = [[0, 0], [11.12, 0], [11.84, 0.16], [11.12, 8.30], [11.12, 16.65], [11.84, 24.84], [11.10, 25.28], [10.75, 26.37], [10.20, 27.03], [9.47, 27.52], [8.63, 27.74], [0, 27.74]];
export const CAP_SMALL_OUTLINE = [[0, 0], [7.78, 0], [8.29, 0.49], [7.78, 6.22], [7.78, 12.07], [8.29, 17.80], [7.77, 18.07], [7.61, 18.67], [7.14, 19.33], [6.25, 19.82], [0, 19.82]];
export const BASE_BIG_OUTLINE = [[0, 0], [19.5, 0], [19.3, 0.16], [0, 0.16]];
export const BASE_SMALL_OUTLINE = [[0, 0], [13.65, 0], [13.45, 0.16], [0, 0.16]];
export const LENS_OUTLINE = [[0, 0], [1, 0], [0.96, 0.26], [0.82, 0.46], [0.58, 0.60], [0.30, 0.66], [0, 0.68]];

// One light of a knob's ring: a short curved block lying toward the player (six o'clock).
export function segmentGeo(r0, r1, y0, y1, scale = 1 / UNIT) {
  const half = ((16.64 * Math.PI) / 180) * 0.5, n = 3, pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = -half + (2 * half * i) / n, s = Math.sin(t), c = Math.cos(t);
    pos.push(s * r0, y0, c * r0, s * r1, y0, c * r1, s * r0, y1, c * r0, s * r1, y1, c * r1);
  }
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    idx.push(o + 2, o + 3, o + 7, o + 2, o + 7, o + 6, o + 1, o + 5, o + 7, o + 1, o + 7, o + 3, o, o + 2, o + 6, o, o + 6, o + 4);
  }
  const e = n * 4;
  idx.push(0, 1, 3, 0, 3, 2, e, e + 2, e + 3, e, e + 3, e + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.map((v) => v * scale), 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- the picture, as the window shows it
// The scene is drawn with more light than a screen can show; the bright parts are made smaller
// and softer step by step, brought back up and laid over it (the glow round the lights); then the
// brightest parts are eased down and the whole is set in the display's own scale of greys, with a
// grain too fine to see that stops the dark gradients from banding. Where the browser cannot keep
// such a picture, the scene is drawn straight to the window, eased the same way, without the glow.
const FULL_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
const DOWN_FRAG = /* glsl */`
varying vec2 vUv;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uKnee;
vec3 at( float x, float y ) { return texture2D( uTex, vUv + vec2( x, y ) * uTexel ).rgb; }
void main() {
  vec3 e = at( 0.0, 0.0 );
  vec3 c = e * 0.125 + ( at( -2.0, 2.0 ) + at( 2.0, 2.0 ) + at( -2.0, -2.0 ) + at( 2.0, -2.0 ) ) * 0.03125
         + ( at( 0.0, 2.0 ) + at( -2.0, 0.0 ) + at( 2.0, 0.0 ) + at( 0.0, -2.0 ) ) * 0.0625
         + ( at( -1.0, 1.0 ) + at( 1.0, 1.0 ) + at( -1.0, -1.0 ) + at( 1.0, -1.0 ) ) * 0.125;
  if ( uKnee > 0.0 ) { float peak = max( c.r, max( c.g, c.b ) ); c *= smoothstep( uKnee, uKnee * 1.5, peak ); }
  if ( ! ( c.r >= 0.0 ) ) c.r = 0.0;
  if ( ! ( c.g >= 0.0 ) ) c.g = 0.0;
  if ( ! ( c.b >= 0.0 ) ) c.b = 0.0;
  gl_FragColor = vec4( min( c, vec3( 60.0 ) ), 1.0 );
}`;
const UP_FRAG = /* glsl */`
varying vec2 vUv;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uGain;
vec3 at( float x, float y ) { return texture2D( uTex, vUv + vec2( x, y ) * uTexel ).rgb; }
void main() {
  vec3 c = at( 0.0, 0.0 ) * 4.0 + ( at( -1.0, 0.0 ) + at( 1.0, 0.0 ) + at( 0.0, -1.0 ) + at( 0.0, 1.0 ) ) * 2.0
         + at( -1.0, -1.0 ) + at( 1.0, -1.0 ) + at( -1.0, 1.0 ) + at( 1.0, 1.0 );
  gl_FragColor = vec4( c * ( uGain / 16.0 ), 1.0 );
}`;
const FINAL_FRAG = /* glsl */`
varying vec2 vUv;
uniform sampler2D uTex; uniform sampler2D uBloom; uniform float uBloomGain; uniform float uExposure;
vec3 ease( vec3 c ) {
  float x = min( c.r, min( c.g, c.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= vec3( offset );
  float peak = max( c.r, max( c.g, c.b ) );
  if ( peak < 0.76 ) return c;
  float d = 0.24;
  float newPeak = 1.0 - d * d / ( peak + d - 0.76 );
  c *= newPeak / peak;
  float g = 1.0 - 1.0 / ( 0.15 * ( peak - newPeak ) + 1.0 );
  return mix( c, vec3( newPeak ), g );
}
void main() {
  vec3 c = texture2D( uTex, vUv ).rgb + texture2D( uBloom, vUv ).rgb * uBloomGain;
  c = ease( max( c, vec3( 0.0 ) ) * uExposure );
  c = clamp( c, 0.0, 1.0 );
  c = mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - vec3( 0.055 ), step( vec3( 0.0031308 ), c ) );
  float grain = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5;
  gl_FragColor = vec4( c + vec3( grain / 255.0 ), 1.0 );
}`;
const MIPS = 6, WEIGHT = [1.0, 0.75, 0.5, 0.32, 0.2, 0.12];

export class Picture {
  constructor(renderer) {
    this.r = renderer;
    // (?plain in the page's address asks for the straight way: something to try if a browser draws the deep one wrong)
    const plain = typeof location !== 'undefined' && /[?&]plain\b/.test(location.search);
    this.deep = !plain && renderer.capabilities.isWebGL2 !== false && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    renderer.toneMapping = THREE.NeutralToneMapping;       // (the same easing, for the straight way)
    renderer.toneMappingExposure = 1;
    this.w = 0; this.h = 0;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.flat = new THREE.Scene(); this.flat.add(this.quad);
    this.eye = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pass = (frag, uniforms, more = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: FULL_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false, ...more });
    this.down = pass(DOWN_FRAG, { uTex: { value: null }, uTexel: { value: new THREE.Vector2() }, uKnee: { value: 0 } });
    this.up = pass(UP_FRAG, { uTex: { value: null }, uTexel: { value: new THREE.Vector2() }, uGain: { value: 1 } }, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });
    this.last = pass(FINAL_FRAG, { uTex: { value: null }, uBloom: { value: null }, uBloomGain: { value: 0.34 }, uExposure: { value: 1 } });
    this.mips = [];
  }
  // w, h: the window's own pixels
  setSize(w, h) {
    if (!this.deep || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
    this.scene?.dispose(); for (const m of this.mips) m.dispose();
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.scene = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true, samples: Math.min(4, this.r.capabilities.maxSamples || 0) });
    this.mips = [];
    let mw = w, mh = h;
    for (let i = 0; i < MIPS; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); this.mips.push(new THREE.WebGLRenderTarget(mw, mh, { ...opts, depthBuffer: false })); }
  }
  run(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.flat, this.eye); }
  render(scene, camera) {
    const r = this.r;
    if (!this.deep || !this.scene) { r.setRenderTarget(null); r.render(scene, camera); return; }
    r.setRenderTarget(this.scene); r.render(scene, camera);
    const auto = r.autoClear, shadows = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    let from = this.scene;
    for (let i = 0; i < MIPS; i++) {
      this.down.uniforms.uTex.value = from.texture; this.down.uniforms.uTexel.value.set(1 / from.width, 1 / from.height); this.down.uniforms.uKnee.value = i === 0 ? 1.05 : 0;
      this.run(this.down, this.mips[i]);
      from = this.mips[i];
    }
    r.autoClear = false;
    for (let i = MIPS - 1; i > 0; i--) {
      this.up.uniforms.uTex.value = this.mips[i].texture; this.up.uniforms.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height); this.up.uniforms.uGain.value = WEIGHT[i] / WEIGHT[i - 1];
      this.run(this.up, this.mips[i - 1]);
    }
    r.autoClear = auto;
    this.last.uniforms.uTex.value = this.scene.texture; this.last.uniforms.uBloom.value = this.mips[0].texture;
    this.run(this.last, null);
    r.shadowMap.autoUpdate = shadows;
  }
}
