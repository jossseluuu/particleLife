import particlesCode from '../shaders/particles.wgsl?raw';
import postCode from '../shaders/post.wgsl?raw';
import { Config, hexToLinear, MAX_SPECIES } from '../config';
import { Camera } from '../camera';
import { Simulation } from '../sim/simulation';

const HDR: GPUTextureFormat = 'rgba16float';
const MAX_MIPS = 7;

export interface RenderTimestamps {
  querySet: GPUQuerySet;
  beginIndex: number;
  endIndex: number;
}

/**
 * Pipeline de render:
 *   escena HDR (estelas opcionales + partículas aditivas/alfa)
 *   → bloom (prefiltro + pirámide down/up dual-Kawase)
 *   → composición (fondo, tone mapping, viñeta, gamma, dithering) al canvas
 */
export class Renderer {
  private readonly device: GPUDevice;
  private readonly cfg: Config;

  private readonly particleAdd: GPURenderPipeline;
  private readonly particleAlpha: GPURenderPipeline;
  private readonly fade: GPURenderPipeline;
  private readonly prefilter: GPURenderPipeline;
  private readonly down: GPURenderPipeline;
  private readonly up: GPURenderPipeline;
  private readonly composite: GPURenderPipeline;
  private readonly sampler: GPUSampler;

  private readonly renderParams: GPUBuffer;
  private readonly renderData = new ArrayBuffer(64);
  private readonly renderF = new Float32Array(this.renderData);
  private readonly renderU = new Uint32Array(this.renderData);
  private readonly speciesBuf: GPUBuffer;
  private readonly postParams: GPUBuffer;
  private readonly postData = new ArrayBuffer(48);
  private readonly postF = new Float32Array(this.postData);
  private readonly postU = new Uint32Array(this.postData);

  private width = 0;
  private height = 0;
  private scene?: GPUTexture;
  private mips: GPUTexture[] = [];
  private particleBG?: { add: GPUBindGroup; alpha: GPUBindGroup; src: GPUBuffer };
  private postBG?: { prefilter: GPUBindGroup; down: GPUBindGroup[]; up: GPUBindGroup[]; composite: GPUBindGroup };

  constructor(device: GPUDevice, targetFormat: GPUTextureFormat, cfg: Config) {
    this.device = device;
    this.cfg = cfg;
    const pm = device.createShaderModule({ label: 'particles.wgsl', code: particlesCode });
    const post = device.createShaderModule({ label: 'post.wgsl', code: postCode });

    const particlePipeline = (blend: GPUBlendState, label: string) =>
      device.createRenderPipeline({
        label,
        layout: 'auto',
        vertex: { module: pm, entryPoint: 'vs' },
        fragment: { module: pm, entryPoint: 'fs', targets: [{ format: HDR, blend }] },
        primitive: { topology: 'triangle-list' },
      });
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const over: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' };
    this.particleAdd = particlePipeline({ color: add, alpha: add }, 'particles additive');
    this.particleAlpha = particlePipeline({ color: over, alpha: over }, 'particles alpha');

    const fadeBlend: GPUBlendComponent = { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' };
    this.fade = device.createRenderPipeline({
      label: 'trail fade',
      layout: 'auto',
      vertex: { module: pm, entryPoint: 'vsFade' },
      fragment: { module: pm, entryPoint: 'fsFade', targets: [{ format: HDR, blend: { color: fadeBlend, alpha: fadeBlend } }] },
    });

    const fullscreen = (entryPoint: string, format: GPUTextureFormat, blend?: GPUBlendState) =>
      device.createRenderPipeline({
        label: entryPoint,
        layout: 'auto',
        vertex: { module: post, entryPoint: 'vsFull' },
        fragment: { module: post, entryPoint, targets: [{ format, blend }] },
      });
    this.prefilter = fullscreen('fsPrefilter', HDR);
    this.down = fullscreen('fsDown', HDR);
    this.up = fullscreen('fsUp', HDR, { color: add, alpha: add });
    this.composite = fullscreen('fsComposite', targetFormat);

    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const U = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    this.renderParams = device.createBuffer({ label: 'renderParams', size: 64, usage: U });
    this.postParams = device.createBuffer({ label: 'postParams', size: 48, usage: U });
    this.speciesBuf = device.createBuffer({
      label: 'speciesRender',
      size: MAX_SPECIES * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.updateSpecies();
  }

  /** Sube color/forma/tamaño de cada especie. */
  updateSpecies(): void {
    const data = new ArrayBuffer(MAX_SPECIES * 32);
    const f = new Float32Array(data);
    const u = new Uint32Array(data);
    this.cfg.species.forEach((sp, i) => {
      const [r, g, b] = hexToLinear(sp.color);
      f.set([r, g, b, 1, sp.size], i * 8);
      u[i * 8 + 5] = sp.shape;
    });
    this.device.queue.writeBuffer(this.speciesBuf, 0, data);
  }

  resize(width: number, height: number): void {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.scene?.destroy();
    this.mips.forEach((t) => t.destroy());
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.scene = this.device.createTexture({ label: 'scene', size: [width, height], format: HDR, usage });
    this.mips = [];
    let w = width;
    let h = height;
    for (let i = 0; i < MAX_MIPS; i++) {
      w = Math.max(1, Math.ceil(w / 2));
      h = Math.max(1, Math.ceil(h / 2));
      this.mips.push(this.device.createTexture({ label: `bloom${i}`, size: [w, h], format: HDR, usage }));
    }
    const bg = (p: GPURenderPipeline, src: GPUTexture, extra: GPUBindGroupEntry[] = []) =>
      this.device.createBindGroup({
        layout: p.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: src.createView() },
          ...extra,
        ],
      });
    this.postBG = {
      prefilter: bg(this.prefilter, this.scene, [{ binding: 2, resource: { buffer: this.postParams } }]),
      down: this.mips.map((_, i) => bg(this.down, this.mips[Math.max(0, i - 1)])), // down[i]: mips[i-1] -> mips[i]
      up: this.mips.map((_, i) => bg(this.up, this.mips[Math.min(MAX_MIPS - 1, i + 1)])), // up[i]: mips[i+1] -> mips[i]
      composite: bg(this.composite, this.scene, [
        { binding: 2, resource: { buffer: this.postParams } },
        { binding: 3, resource: this.mips[0].createView() },
      ]),
    };
  }

  private ensureParticleBindGroups(sim: Simulation): void {
    if (this.particleBG?.src === sim.particlesA) return;
    const mk = (p: GPURenderPipeline) =>
      this.device.createBindGroup({
        layout: p.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.renderParams } },
          { binding: 1, resource: { buffer: sim.particlesA } },
          { binding: 2, resource: { buffer: sim.speciesA } },
          { binding: 3, resource: { buffer: this.speciesBuf } },
        ],
      });
    this.particleBG = { add: mk(this.particleAdd), alpha: mk(this.particleAlpha), src: sim.particlesA };
  }

  private writeParams(sim: Simulation, cam: Camera, time: number): void {
    const rc = this.cfg.render;
    const f = this.renderF;
    const u = this.renderU;
    f[0] = cam.x;
    f[1] = cam.y;
    f[2] = sim.worldW;
    f[3] = sim.worldH;
    f[4] = this.width;
    f[5] = this.height;
    f[6] = cam.pxPerUnit;
    f[7] = rc.pointSize * sim.effectiveRMax;
    f[8] = rc.minPx;
    f[9] = rc.softness;
    // Con estelas, cada partícula se acumula ~1/(1-persistencia) veces: compensamos la ganancia
    // para que el brillo percibido sea parecido con y sin estelas.
    const trailGain = rc.trails ? Math.min(1, (1 - Math.min(0.995, rc.trailFade)) * 2.5) : 1;
    f[10] = rc.brightness * trailGain;
    f[11] = Math.max(1e-3, rc.speedRef * sim.effectiveRMax);
    u[12] = rc.colorMode;
    u[13] = rc.orient ? 1 : 0;
    f[14] = time;
    u[15] = this.cfg.numSpecies;
    this.device.queue.writeBuffer(this.renderParams, 0, this.renderData);

    const [br, bgc, bb] = hexToLinear(rc.background);
    const p = this.postF;
    p[0] = rc.bloomThreshold;
    p[1] = Math.max(1e-3, rc.bloomKnee);
    p[2] = rc.bloomIntensity / Math.max(1, rc.bloomRadius - 1) * 2;
    p[3] = rc.exposure;
    p[4] = br;
    p[5] = bgc;
    p[6] = bb;
    p[7] = rc.vignette;
    this.postU[8] = rc.tonemap;
    this.postU[9] = rc.bloom ? 1 : 0;
    p[10] = time % 1000;
    this.device.queue.writeBuffer(this.postParams, 0, this.postData);
  }

  render(sim: Simulation, cam: Camera, target: GPUTextureView, ts?: RenderTimestamps, time = 0): void {
    if (!this.scene || !this.postBG) return;
    this.ensureParticleBindGroups(sim);
    this.writeParams(sim, cam, time);
    const rc = this.cfg.render;
    const enc = this.device.createCommandEncoder({ label: 'render' });

    // ---- escena
    const scenePass = enc.beginRenderPass({
      label: 'scene',
      colorAttachments: [
        {
          view: this.scene.createView(),
          loadOp: rc.trails ? 'load' : 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
      timestampWrites: ts ? { querySet: ts.querySet, beginningOfPassWriteIndex: ts.beginIndex } : undefined,
    });
    if (rc.trails) {
      const k = Math.max(0, Math.min(0.995, rc.trailFade));
      scenePass.setPipeline(this.fade);
      scenePass.setBlendConstant({ r: k, g: k, b: k, a: k });
      scenePass.draw(3);
    }
    const alpha = rc.blend === 'alfa';
    scenePass.setPipeline(alpha ? this.particleAlpha : this.particleAdd);
    scenePass.setBindGroup(0, alpha ? this.particleBG!.alpha : this.particleBG!.add);
    scenePass.draw(6, sim.numParticles);
    scenePass.end();

    // ---- bloom
    const levels = Math.max(2, Math.min(MAX_MIPS, Math.round(rc.bloomRadius)));
    const fsPass = (view: GPUTextureView, pipe: GPURenderPipeline, bg: GPUBindGroup, load: boolean) => {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      });
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bg);
      pass.draw(3);
      pass.end();
    };
    if (rc.bloom) {
      fsPass(this.mips[0].createView(), this.prefilter, this.postBG.prefilter, false);
      for (let i = 1; i < levels; i++) fsPass(this.mips[i].createView(), this.down, this.postBG.down[i], false);
      for (let i = levels - 2; i >= 0; i--) fsPass(this.mips[i].createView(), this.up, this.postBG.up[i], true);
    }

    // ---- composición
    const comp = enc.beginRenderPass({
      label: 'composite',
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      timestampWrites: ts ? { querySet: ts.querySet, endOfPassWriteIndex: ts.endIndex } : undefined,
    });
    comp.setPipeline(this.composite);
    comp.setBindGroup(0, this.postBG.composite);
    comp.draw(3);
    comp.end();
    this.device.queue.submit([enc.finish()]);
  }

  destroy(): void {
    this.scene?.destroy();
    this.mips.forEach((t) => t.destroy());
    this.renderParams.destroy();
    this.postParams.destroy();
    this.speciesBuf.destroy();
  }
}
