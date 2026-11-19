// =============================================================================
//  Simulación de "particle life" en GPU — O(N) mediante rejilla uniforme + counting sort
//
//  Pases por paso de simulación (todos en un mismo compute pass):
//    1. countCells   : celda de cada partícula + atomicAdd en su contador   (A)
//    2. scanBlocks   : prefix-sum exclusivo por bloques de 1024 celdas
//    3. scanSums     : prefix-sum de las sumas de bloque (1 workgroup)
//    4. addSums      : suma el offset de bloque => cellStart definitivo
//    5. scatter      : reordena físicamente las partículas por celda       (A -> B)
//    6. forces       : fuerzas con vecinos de las 3×3 celdas + integración  (B -> A)
//       (o forcesBrute: O(N²), referencia para validar)
// =============================================================================

struct Params {
  worldW: f32, worldH: f32,
  cellW: f32, cellH: f32,
  gridW: u32, gridH: u32,
  numCells: u32,
  numParticles: u32,
  numSpecies: u32,
  rMax: f32,
  beta: f32,
  repulsion: f32,
  forceFactor: f32,
  friction: f32,       // factor de velocidad conservada por paso (base)
  dt: f32,
  maxSpeed: f32,       // unidades de mundo / s
  mouseX: f32, mouseY: f32,
  mouseRadius: f32,
  mouseStrength: f32,  // 0 = ratón inactivo
  time: f32,
  frame: u32,
  seed: u32,
  convEnabled: u32,
  convRadius: f32,
  _pad0: f32, _pad1: f32, _pad2: f32,
}

const MAX_S: u32 = 16u;

struct SpeciesData {
  attraction: array<f32, 256>,  // [a*S+b] reacción de a ante b
  radius: array<f32, 256>,      // escala del radio por pareja
  conversion: array<f32, 256>,  // [a*S+b] tasa con la que a convierte a b
  // behavior[2s]   = (masa, multiplicador de rozamiento, propulsión, ruido)
  // behavior[2s+1] = (giro, alineamiento, amplitud de pulso, frecuencia de pulso)
  behavior: array<vec4f, 32>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> SD: SpeciesData;
@group(0) @binding(2) var<storage, read_write> particlesA: array<vec4f>; // xy = pos, zw = vel
@group(0) @binding(3) var<storage, read_write> speciesA: array<u32>;
@group(0) @binding(4) var<storage, read_write> particlesB: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> speciesB: array<u32>;
@group(0) @binding(6) var<storage, read_write> cellCountAtomic: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read> cellCount: array<u32>; // mismo buffer que 6 (en otros pases)
@group(0) @binding(8) var<storage, read_write> cellStart: array<u32>;
@group(0) @binding(9) var<storage, read_write> blockSums: array<u32>;
@group(0) @binding(10) var<storage, read_write> cellIndex: array<u32>;
@group(0) @binding(11) var<storage, read_write> rankInCell: array<u32>;
@group(0) @binding(12) var<storage, read_write> popCount: array<atomic<u32>>;

// ----------------------------------------------------------------------------- utilidades

fn cellCoord(pos: vec2f) -> vec2u {
  let cx = min(u32(max(pos.x, 0.0) / P.cellW), P.gridW - 1u);
  let cy = min(u32(max(pos.y, 0.0) / P.cellH), P.gridH - 1u);
  return vec2u(cx, cy);
}

fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand01(i: u32, salt: u32) -> f32 {
  let h = pcg(i ^ pcg(P.frame * 9781u + P.seed * 6271u + salt * 1013904223u));
  return f32(h >> 8u) / 16777216.0;
}

fn randUnit(i: u32, salt: u32) -> vec2f {
  let a = rand01(i, salt) * 6.28318530718;
  return vec2f(cos(a), sin(a));
}

fn minImage(d: vec2f) -> vec2f {
  let w = vec2f(P.worldW, P.worldH);
  return d - w * round(d / w);
}

// ----------------------------------------------------------------------------- 1. conteo

@compute @workgroup_size(256)
fn countCells(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.numParticles) { return; }
  let c = cellCoord(particlesA[i].xy);
  let cell = c.y * P.gridW + c.x;
  cellIndex[i] = cell;
  rankInCell[i] = atomicAdd(&cellCountAtomic[cell], 1u);
}

// ----------------------------------------------------------------------------- 2-4. prefix sum

var<workgroup> scanTmp: array<u32, 256>;

// Hillis-Steele inclusivo sobre 256 valores en memoria compartida.
fn workgroupInclusiveScan(lid: u32, value: u32) -> u32 {
  scanTmp[lid] = value;
  workgroupBarrier();
  for (var offset = 1u; offset < 256u; offset = offset << 1u) {
    var t = 0u;
    if (lid >= offset) { t = scanTmp[lid - offset]; }
    workgroupBarrier();
    scanTmp[lid] = scanTmp[lid] + t;
    workgroupBarrier();
  }
  return scanTmp[lid];
}

// Cada workgroup procesa 1024 celdas (4 por hilo).
@compute @workgroup_size(256)
fn scanBlocks(@builtin(local_invocation_id) lid3: vec3u, @builtin(workgroup_id) wid: vec3u) {
  let lid = lid3.x;
  let base = wid.x * 1024u + lid * 4u;
  var local: array<u32, 4>;
  var sum = 0u;
  for (var k = 0u; k < 4u; k++) {
    let idx = base + k;
    var v = 0u;
    if (idx < P.numCells) { v = cellCount[idx]; }
    local[k] = sum;
    sum += v;
  }
  let inclusive = workgroupInclusiveScan(lid, sum);
  let exclusive = inclusive - sum;
  for (var k = 0u; k < 4u; k++) {
    let idx = base + k;
    if (idx < P.numCells) { cellStart[idx] = local[k] + exclusive; }
  }
  if (lid == 255u) { blockSums[wid.x] = inclusive; }
}

// Un único workgroup: prefix-sum exclusivo de hasta 256 sumas de bloque.
@compute @workgroup_size(256)
fn scanSums(@builtin(local_invocation_id) lid3: vec3u) {
  let lid = lid3.x;
  let numBlocks = (P.numCells + 1023u) / 1024u;
  var v = 0u;
  if (lid < numBlocks) { v = blockSums[lid]; }
  let inclusive = workgroupInclusiveScan(lid, v);
  if (lid < numBlocks) { blockSums[lid] = inclusive - v; }
}

@compute @workgroup_size(256)
fn addSums(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= P.numCells) { return; }
  cellStart[idx] = cellStart[idx] + blockSums[idx / 1024u];
}

// ----------------------------------------------------------------------------- 5. scatter

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.numParticles) { return; }
  let dst = cellStart[cellIndex[i]] + rankInCell[i];
  particlesB[dst] = particlesA[i];
  speciesB[dst] = speciesA[i];
}

// ----------------------------------------------------------------------------- 6. fuerzas

struct Acc {
  force: vec2f,     // suma de fuerzas radiales (× radio de pareja)
  tangent: vec2f,   // suma de componentes tangenciales (para el giro)
  velSum: vec2f,    // velocidades vecinas ponderadas (alineamiento)
  wSum: f32,
  convTotal: f32,
  convBest: f32,
  convBestS: u32,
}

fn interact(acc: ptr<function, Acc>, j: u32, pos: vec2f, sa: u32, pulse: f32) {
  let q = particlesB[j];
  let d = minImage(q.xy - pos);
  let d2 = dot(d, d);
  let sb = speciesB[j];
  let pair = sa * P.numSpecies + sb;
  let rij = P.rMax * SD.radius[pair] * pulse;
  if (d2 >= rij * rij || d2 < 1e-10) { return; }
  let dist = sqrt(d2);
  let r = dist / rij;
  let dir = d / dist;
  var f: f32;
  if (r < P.beta) {
    f = P.repulsion * (r / P.beta - 1.0);
  } else {
    f = SD.attraction[pair] * (1.0 - abs(2.0 * r - 1.0 - P.beta) / (1.0 - P.beta));
  }
  (*acc).force += dir * (f * rij);
  let w = 1.0 - r;
  (*acc).tangent += vec2f(-dir.y, dir.x) * (w * rij);
  (*acc).velSum += q.zw * w;
  (*acc).wSum += w;
  if (P.convEnabled != 0u && r < P.convRadius) {
    let rate = SD.conversion[sb * P.numSpecies + sa]; // sb convierte a sa
    if (rate > 0.0) {
      (*acc).convTotal += rate;
      if (rate > (*acc).convBest) { (*acc).convBest = rate; (*acc).convBestS = sb; }
    }
  }
}

fn pulseFor(sa: u32) -> f32 {
  let b1 = SD.behavior[sa * 2u + 1u];
  return 1.0 - b1.z * 0.5 * (1.0 + sin(6.28318530718 * b1.w * P.time));
}

fn integrate(i: u32, p: vec4f, sa: u32, acc: Acc) {
  var pos = p.xy;
  var vel = p.zw;
  let b0 = SD.behavior[sa * 2u];       // masa, rozamiento, propulsión, ruido
  let b1 = SD.behavior[sa * 2u + 1u];  // giro, alineamiento, pulso…
  let unit = P.rMax * P.forceFactor;
  let invMass = 1.0 / max(b0.x, 0.05);

  var a = (acc.force + acc.tangent * b1.x) * (P.forceFactor * invMass);

  // autopropulsión (materia activa)
  if (b0.z != 0.0) {
    let sp = length(vel);
    var heading = randUnit(i, 1u);
    if (sp > 1e-5) { heading = vel / sp; }
    a += heading * (b0.z * unit * invMass);
  }
  // agitación browniana
  if (b0.w != 0.0) {
    a += randUnit(i, 2u) * (b0.w * unit * invMass * rand01(i, 3u) * 2.0);
  }
  // alineamiento tipo bandada
  if (b1.y != 0.0 && acc.wSum > 0.0) {
    a += (acc.velSum / acc.wSum - vel) * b1.y;
  }
  // interacción con el ratón
  if (P.mouseStrength != 0.0) {
    let dm = minImage(vec2f(P.mouseX, P.mouseY) - pos);
    let dist = length(dm);
    if (dist < P.mouseRadius && dist > 1e-5) {
      a += dm / dist * (P.mouseStrength * (1.0 - dist / P.mouseRadius) * unit);
    }
  }

  let fr = pow(P.friction, max(b0.y, 0.0));
  vel = vel * fr + a * P.dt;
  let sp = length(vel);
  if (sp > P.maxSpeed) { vel = vel * (P.maxSpeed / sp); }
  pos += vel * P.dt;
  let w = vec2f(P.worldW, P.worldH);
  pos = pos - w * floor(pos / w);

  var newS = sa;
  if (acc.convTotal > 0.0) {
    let prob = 1.0 - exp(-acc.convTotal * P.dt);
    if (rand01(i, 4u) < prob) { newS = acc.convBestS; }
  }

  particlesA[i] = vec4f(pos, vel);
  speciesA[i] = newS;
  atomicAdd(&popCount[newS], 1u);
}

@compute @workgroup_size(256)
fn forces(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.numParticles) { return; }
  let p = particlesB[i];
  let sa = speciesB[i];
  let pulse = pulseFor(sa);
  var acc = Acc(vec2f(0.0), vec2f(0.0), vec2f(0.0), 0.0, 0.0, 0.0, sa);
  let c = cellCoord(p.xy);
  for (var dy = 0u; dy < 3u; dy++) {
    let ny = (c.y + P.gridH + dy - 1u) % P.gridH;
    for (var dx = 0u; dx < 3u; dx++) {
      let nx = (c.x + P.gridW + dx - 1u) % P.gridW;
      let cell = ny * P.gridW + nx;
      let start = cellStart[cell];
      let end = start + cellCount[cell];
      for (var j = start; j < end; j++) {
        if (j != i) { interact(&acc, j, p.xy, sa, pulse); }
      }
    }
  }
  integrate(i, p, sa, acc);
}

// Referencia O(N²): mismo resultado (salvo orden de suma) que `forces`.
@compute @workgroup_size(256)
fn forcesBrute(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.numParticles) { return; }
  let p = particlesB[i];
  let sa = speciesB[i];
  let pulse = pulseFor(sa);
  var acc = Acc(vec2f(0.0), vec2f(0.0), vec2f(0.0), 0.0, 0.0, 0.0, sa);
  for (var j = 0u; j < P.numParticles; j++) {
    if (j != i) { interact(&acc, j, p.xy, sa, pulse); }
  }
  integrate(i, p, sa, acc);
}
