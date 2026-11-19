// =============================================================================
//  Render de partículas: quads instanciados que leen directamente el buffer de la
//  simulación (sin copias a CPU). Formas por SDF con antialiasing y halo.
// =============================================================================

struct RenderParams {
  camX: f32, camY: f32,
  worldW: f32, worldH: f32,
  viewW: f32, viewH: f32,
  pxPerUnit: f32,
  sizeWorld: f32,   // diámetro base en unidades de mundo
  minPx: f32,
  softness: f32,
  brightness: f32,
  speedRef: f32,    // velocidad que satura las paletas (unidades de mundo / s)
  colorMode: u32,
  orient: u32,
  time: f32,
  numSpecies: u32,
}

struct SpeciesRender {
  color: vec4f,     // rgb lineal
  size: f32,
  shape: u32,
  _p0: f32, _p1: f32,
}

@group(0) @binding(0) var<uniform> R: RenderParams;
@group(0) @binding(1) var<storage, read> particles: array<vec4f>;
@group(0) @binding(2) var<storage, read> species: array<u32>;
@group(0) @binding(3) var<storage, read> speciesR: array<SpeciesRender>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
  @location(2) @interpolate(flat) shape: u32,
  @location(3) px: f32,
}

const QUAD = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);

fn heat(t: f32) -> vec3f {
  let c = vec3f(smoothstep(0.0, 0.45, t), smoothstep(0.3, 0.8, t), smoothstep(0.65, 1.0, t));
  return c * c + vec3f(0.02, 0.04, 0.25) * (1.0 - t);
}

fn hue(h: f32) -> vec3f {
  let c = 0.5 + 0.5 * cos(6.28318530718 * (h + vec3f(0.0, 0.333, 0.667)));
  return c * c;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var out: VOut;
  let p = particles[ii];
  let s = species[ii];
  let info = speciesR[s];

  // posición relativa a la cámara con envoltura toroidal (paneo infinito)
  let w = vec2f(R.worldW, R.worldH);
  var d = p.xy - vec2f(R.camX, R.camY);
  d -= w * round(d / w);

  let px = max(R.sizeWorld * info.size * R.pxPerUnit, R.minPx);
  let pad = 1.0 + R.softness * 1.5;
  let uv = QUAD[vi] * pad;

  var local = uv;
  let sp = length(p.zw);
  if (R.orient != 0u && sp > 1e-4) {
    let f = p.zw / sp; // +y local apunta en la dirección del movimiento
    local = uv.x * vec2f(-f.y, f.x) + uv.y * f;
  }
  let screen = d * R.pxPerUnit + local * (px * 0.5);
  out.pos = vec4f(screen.x / (R.viewW * 0.5), -screen.y / (R.viewH * 0.5), 0.0, 1.0);
  out.uv = vec2f(uv.x, uv.y);
  out.shape = info.shape;
  out.px = px;

  let t = clamp(sp / R.speedRef, 0.0, 1.0);
  var col = info.color.rgb;
  switch (R.colorMode) {
    case 1u: { col = heat(t); }
    case 2u: { col = info.color.rgb * (0.25 + 1.6 * t); }
    case 3u: { col = hue(atan2(p.w, p.z) / 6.28318530718 + 0.5) * (0.4 + 0.8 * t); }
    case 4u: { col = mix(info.color.rgb, speciesR[(s + 1u) % R.numSpecies].color.rgb, t); }
    default: {}
  }
  out.color = col;
  return out;
}

// ----------------------------------------------------------------------------- SDFs (radio ≈ 1)

fn sdBox(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}

fn sdTriangle(pin: vec2f, r: f32) -> f32 {
  let k = sqrt(3.0);
  var p = vec2f(abs(pin.x) - r, pin.y + r / k);
  if (p.x + k * p.y > 0.0) { p = vec2f(p.x - k * p.y, -k * p.x - p.y) / 2.0; }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

fn sdHexagon(pin: vec2f, r: f32) -> f32 {
  let k = vec3f(-0.866025404, 0.5, 0.577350269);
  var p = abs(pin);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2f(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

fn sdStar5(pin: vec2f, r: f32, rf: f32) -> f32 {
  let k1 = vec2f(0.809016994375, -0.587785252292);
  let k2 = vec2f(-k1.x, k1.y);
  var p = vec2f(abs(pin.x), pin.y);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  let ba = rf * vec2f(-k1.y, k1.x) - vec2f(0.0, 1.0);
  let h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

fn sdShape(p: vec2f, shape: u32) -> f32 {
  switch (shape) {
    case 1u: { return abs(length(p) - 0.72) - 0.22; }                       // anillo
    case 2u: { return sdTriangle(vec2f(p.x, p.y + 0.15), 1.0); }             // triángulo
    case 3u: { return sdBox(p, vec2f(0.78)) - 0.05; }                        // cuadrado
    case 4u: { return (abs(p.x) * 0.75 + abs(p.y) - 1.0) * 0.6; }            // rombo
    case 5u: { return sdHexagon(p, 0.88); }                                  // hexágono
    case 6u: { return sdStar5(vec2f(p.x, -p.y), 1.0, 0.45); }                // estrella
    case 7u: { return min(sdBox(p, vec2f(1.0, 0.28)), sdBox(p, vec2f(0.28, 1.0))); } // cruz
    default: { return length(p) - 1.0; }                                     // círculo
  }
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  // con pocos píxeles la forma no se aprecia: círculo suave
  var d: f32;
  if (in.px < 5.0) { d = length(in.uv) - 1.0; } else { d = sdShape(in.uv, in.shape); }
  let aa = 2.0 / max(in.px, 1.0);
  let core = 1.0 - smoothstep(-aa, aa, d);
  var glow = 0.0;
  if (R.softness > 0.0) { glow = 0.45 * exp(-max(d, 0.0) * 3.0 / R.softness); }
  let a = clamp(core + glow * (1.0 - core), 0.0, 1.0);
  if (a < 0.004) { discard; }
  return vec4f(in.color * (R.brightness * a), a); // premultiplicado
}

// ----------------------------------------------------------------------------- desvanecimiento de estelas

@vertex
fn vsFade(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fsFade() -> @location(0) vec4f {
  return vec4f(0.0); // el blend constante multiplica el destino por el factor de estela
}
