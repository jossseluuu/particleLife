// =============================================================================
//  Post-proceso HDR: bloom (pirámide dual-Kawase) + composición con tone mapping.
// =============================================================================

struct PostParams {
  threshold: f32,
  knee: f32,
  intensity: f32,
  exposure: f32,
  bgR: f32, bgG: f32, bgB: f32,
  vignette: f32,
  tonemap: u32,
  bloomEnabled: u32,
  time: f32,
  _pad: f32,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var<uniform> PP: PostParams;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;

struct FOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsFull(@builtin(vertex_index) vi: u32) -> FOut {
  var out: FOut;
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  out.pos = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(uv.x, 1.0 - uv.y);
  return out;
}

// umbral suave (soft knee) para que sólo brille lo intenso
@fragment
fn fsPrefilter(in: FOut) -> @location(0) vec4f {
  let c = textureSample(src, samp, in.uv).rgb;
  let br = max(c.r, max(c.g, c.b));
  var soft = clamp(br - PP.threshold + PP.knee, 0.0, 2.0 * PP.knee);
  soft = soft * soft / (4.0 * PP.knee + 1e-4);
  let contrib = max(soft, br - PP.threshold) / max(br, 1e-4);
  return vec4f(c * max(contrib, 0.0), 1.0);
}

@fragment
fn fsDown(in: FOut) -> @location(0) vec4f {
  let hp = 0.5 / vec2f(textureDimensions(src));
  var s = textureSample(src, samp, in.uv).rgb * 4.0;
  s += textureSample(src, samp, in.uv - hp).rgb;
  s += textureSample(src, samp, in.uv + hp).rgb;
  s += textureSample(src, samp, in.uv + vec2f(hp.x, -hp.y)).rgb;
  s += textureSample(src, samp, in.uv - vec2f(hp.x, -hp.y)).rgb;
  return vec4f(s / 8.0, 1.0);
}

@fragment
fn fsUp(in: FOut) -> @location(0) vec4f {
  let hp = 0.5 / vec2f(textureDimensions(src));
  var s = textureSample(src, samp, in.uv + vec2f(-hp.x * 2.0, 0.0)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(-hp.x, hp.y)).rgb * 2.0;
  s += textureSample(src, samp, in.uv + vec2f(0.0, hp.y * 2.0)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(hp.x, hp.y)).rgb * 2.0;
  s += textureSample(src, samp, in.uv + vec2f(hp.x * 2.0, 0.0)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(hp.x, -hp.y)).rgb * 2.0;
  s += textureSample(src, samp, in.uv + vec2f(0.0, -hp.y * 2.0)).rgb;
  s += textureSample(src, samp, in.uv + vec2f(-hp.x, -hp.y)).rgb * 2.0;
  return vec4f(s / 12.0, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fsComposite(in: FOut) -> @location(0) vec4f {
  let scene = textureSample(src, samp, in.uv);
  let bloom = textureSample(bloomTex, samp, in.uv).rgb;
  var c = scene.rgb * PP.exposure;
  if (PP.bloomEnabled != 0u) { c += bloom * PP.intensity * PP.exposure; }
  c += vec3f(PP.bgR, PP.bgG, PP.bgB) * max(0.0, 1.0 - scene.a);

  switch (PP.tonemap) {
    case 1u: { c = c / (1.0 + c); }
    case 2u: { c = clamp(c, vec3f(0.0), vec3f(1.0)); }
    default: { c = aces(c); }
  }
  let v = in.uv - 0.5;
  c *= 1.0 - PP.vignette * dot(v, v) * 1.6;
  c = pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2));
  c += (hash12(in.pos.xy + PP.time) - 0.5) / 255.0; // dithering contra el banding
  return vec4f(c, 1.0);
}
