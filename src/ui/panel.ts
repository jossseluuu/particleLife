import { Pane } from 'tweakpane';
import { Config, SHAPES, hslToHex } from '../config';
import { bindOpts as P } from '../params';
import { PRESETS } from '../presets';
import { mulberry32, randomSeed } from '../rng';
import { deleteLocal, downloadJson, inArtifactViewer, listSaved, pickJsonFile, saveLocal, shareUrl } from './storage';

export interface PanelHost {
  cfg: Config;
  paused: boolean;
  presetIndex: number;
  readonly engineKind: 'webgpu' | 'cpu';
  readonly maxParticles: number;
  reset(): void;
  speciesChanged(): void;
  gridChanged(): void;
  renderChanged(): void;
  applyConfig(cfg: Config): void;
  setNumSpecies(n: number): void;
  togglePause(): void;
  stepOnce(): void;
  fitCamera(): void;
  screenshot(): void;
  toast(msg: string): void;
}

type ChangeEv = { last: boolean };

export class Panel {
  private pane!: Pane;
  private rebuildPending = false;
  private readonly container: HTMLElement;

  constructor(private readonly host: PanelHost) {
    this.container = document.createElement('div');
    this.container.className = 'pane-container';
    this.build();
  }

  get element(): HTMLElement {
    return this.container;
  }

  /** Reconstruye el panel entero (tras cargar un preset o una configuración). */
  rebuild(): void {
    // Se aplaza a un microtask: suele llamarse desde el 'change' de un control de este mismo panel
    // (preset, nº de especies…) y Tweakpane sigue propagando el evento tras el callback; destruir
    // el panel en ese momento lanza «View has been already disposed». Varias llamadas seguidas → una.
    if (this.rebuildPending) return;
    this.rebuildPending = true;
    queueMicrotask(() => {
      this.rebuildPending = false;
      this.pane.dispose();
      this.build();
    });
  }

  refresh(): void {
    this.pane.refresh();
  }

  private build(): void {
    const host = this.host;
    const cfg = host.cfg;
    const pane = new Pane({
      container: this.container,
      title: host.engineKind === 'cpu' ? 'Particle Life · modo CPU' : 'Particle Life · ecosistema',
      expanded: !window.matchMedia('(max-width: 760px)').matches,
    });
    const gpu = host.engineKind === 'webgpu';
    this.pane = pane;

    // ------------------------------------------------------------ Ecosistema
    const eco = pane.addFolder({ title: 'Ecosistema' });
    const presetState = { preset: host.presetIndex };
    eco
      .addBinding(presetState, 'preset', {
        label: 'preset',
        options: Object.fromEntries(PRESETS.map((p, i) => [p.name, i])),
      })
      .on('change', (ev) => {
        host.presetIndex = ev.value;
        host.applyConfig(PRESETS[ev.value].build({ numParticles: host.cfg.numParticles }));
        host.toast(`Preset: ${PRESETS[ev.value].name}`);
      });
    eco
      .addBinding(cfg, 'numParticles', { ...P('numParticles'), max: host.maxParticles })
      .on('change', (ev: ChangeEv) => ev.last && host.reset());
    // proxy: el nº de especies sólo se aplica al soltar el slider (cambia el tamaño de las matrices)
    const speciesState = { n: cfg.numSpecies };
    eco
      .addBinding(speciesState, 'n', P('numSpecies'))
      .on('change', (ev: ChangeEv & { value: number }) => ev.last && ev.value !== host.cfg.numSpecies && host.setNumSpecies(ev.value));
    eco
      .addBinding(cfg, 'density', P('density'))
      .on('change', (ev: ChangeEv) => ev.last && host.reset());
    eco
      .addBinding(cfg, 'spawn', P('spawn'))
      .on('change', () => host.reset());
    eco.addBinding(cfg, 'seed', { ...P('seed'), format: (v: number) => v.toFixed(0) });
    eco.addButton({ title: 'Reiniciar posiciones (N)' }).on('click', () => host.reset());
    eco.addButton({ title: 'Nueva semilla + reiniciar' }).on('click', () => {
      cfg.seed = randomSeed();
      host.reset();
      pane.refresh();
    });
    eco.addButton({ title: 'Pausa / continuar (Espacio)' }).on('click', () => host.togglePause());
    eco.addButton({ title: 'Avanzar un paso (S)' }).on('click', () => host.stepOnce());

    // ------------------------------------------------------------ Física
    const phys = pane.addFolder({ title: 'Física', expanded: false });
    phys.addBinding(cfg, 'rMax', P('rMax')).on('change', () => host.gridChanged());
    phys.addBinding(cfg, 'beta', P('beta'));
    phys.addBinding(cfg, 'repulsion', P('repulsion'));
    phys.addBinding(cfg, 'forceFactor', P('forceFactor'));
    phys.addBinding(cfg, 'frictionHalfLife', P('frictionHalfLife'));
    phys.addBinding(cfg, 'dt', P('dt'));
    phys.addBinding(cfg, 'maxSpeed', P('maxSpeed'));
    phys.addBinding(cfg, 'stepsPerFrame', P('stepsPerFrame'));
    phys.addBinding(cfg, 'algorithm', P('algorithm')).on('change', (ev) => {
      if (ev.value === 'fuerza bruta' && cfg.numParticles > 30000)
        host.toast('Aviso: la fuerza bruta con muchas partículas será muy lenta');
    });

    // ------------------------------------------------------------ Conversión
    const conv = pane.addFolder({ title: 'Conversión / depredación', expanded: false });
    conv.addBinding(cfg, 'conversionEnabled', P('conversionEnabled'));
    conv.addBinding(cfg, 'conversionRadius', P('conversionRadius'));
    conv.addBlade({ view: 'text', label: 'ayuda', parse: (v: string) => v, value: 'edita la pestaña "Conversión"' });

    // ------------------------------------------------------------ Evolución
    const evo = pane.addFolder({ title: 'Evolución de la matriz', expanded: false });
    evo.addBinding(cfg.drift, 'enabled', P('drift.enabled'));
    evo.addBinding(cfg.drift, 'rate', P('drift.rate'));

    // ------------------------------------------------------------ Especies
    this.buildSpecies(pane);

    // ------------------------------------------------------------ Render
    const rc = cfg.render;
    const ren = pane.addFolder({ title: 'Render', expanded: false });
    const onR = () => host.renderChanged();
    // Color por velocidad, orientación, bloom y tone mapping sólo existen en el render WebGPU.
    if (gpu) ren.addBinding(rc, 'colorMode', P('render.colorMode'));
    ren.addBinding(rc, 'blend', P('render.blend'));
    ren.addBinding(rc, 'pointSize', P('render.pointSize'));
    ren.addBinding(rc, 'minPx', P('render.minPx'));
    ren.addBinding(rc, 'softness', P('render.softness'));
    ren.addBinding(rc, 'brightness', P('render.brightness'));
    if (gpu) ren.addBinding(rc, 'orient', P('render.orient'));
    if (gpu) ren.addBinding(rc, 'speedRef', P('render.speedRef'));
    ren.addBinding(rc, 'trails', P('render.trails'));
    ren.addBinding(rc, 'trailFade', P('render.trailFade'));
    if (gpu) ren.addBinding(rc, 'bloom', P('render.bloom'));
    if (gpu) ren.addBinding(rc, 'bloomIntensity', P('render.bloomIntensity'));
    if (gpu) ren.addBinding(rc, 'bloomThreshold', P('render.bloomThreshold'));
    if (gpu) ren.addBinding(rc, 'bloomKnee', P('render.bloomKnee'));
    if (gpu) ren.addBinding(rc, 'bloomRadius', P('render.bloomRadius'));
    if (gpu) ren.addBinding(rc, 'exposure', P('render.exposure'));
    if (gpu) ren.addBinding(rc, 'tonemap', P('render.tonemap'));
    ren.addBinding(rc, 'vignette', P('render.vignette'));
    ren.addBinding(rc, 'background', P('render.background'));
    ren.on('change', onR);
    ren.addButton({ title: 'Encuadrar mundo (doble clic)' }).on('click', () => host.fitCamera());
    ren.addButton({ title: 'Captura PNG (P)' }).on('click', () => host.screenshot());

    // ------------------------------------------------------------ Interacción
    const inter = pane.addFolder({ title: 'Ratón', expanded: false });
    inter.addBinding(cfg.mouse, 'radius', P('mouse.radius'));
    inter.addBinding(cfg.mouse, 'strength', P('mouse.strength'));
    inter.addBlade({ view: 'text', label: 'uso', parse: (v: string) => v, value: 'clic = atraer, Shift+clic = repeler' });

    // ------------------------------------------------------------ Guardar / compartir
    const io = pane.addFolder({ title: 'Guardar / compartir', expanded: false });
    io.addButton({ title: 'Copiar enlace compartible' }).on('click', async () => {
      if (inArtifactViewer()) {
        // el visor sólo deja pasar "#nombre" en la URL: el estado no viaja en el enlace
        host.toast('Aquí los enlaces no guardan el estado: usa «Exportar JSON» o la versión web');
        return;
      }
      const url = await shareUrl(host.cfg);
      history.replaceState(null, '', url);
      try {
        await navigator.clipboard.writeText(url);
        host.toast('Enlace copiado al portapapeles');
      } catch {
        host.toast('Enlace puesto en la barra de direcciones');
      }
    });
    io.addButton({ title: 'Exportar JSON' }).on('click', () => downloadJson(host.cfg));
    io.addButton({ title: 'Importar JSON' }).on('click', async () => {
      try {
        const c = await pickJsonFile();
        if (c) host.applyConfig(c);
      } catch (e) {
        host.toast((e as Error).message);
      }
    });
    const saved = listSaved();
    const names = Object.keys(saved);
    const slot = { name: names[0] ?? '' };
    io.addButton({ title: 'Guardar en este navegador…' }).on('click', () => {
      // el visor de Artifacts no muestra prompt() (devuelve null): ahí se usa el nombre por defecto
      const name = inArtifactViewer() ? `mundo ${names.length + 1}` : prompt('Nombre del guardado:', `mundo ${names.length + 1}`);
      if (!name) return;
      if (saveLocal(name, host.cfg)) {
        host.toast(`Guardado «${name}»`);
        this.rebuild();
      } else host.toast('No se pudo guardar (almacenamiento no disponible)');
    });
    if (names.length) {
      io.addBinding(slot, 'name', { label: 'guardados', options: Object.fromEntries(names.map((n) => [n, n])) });
      io.addButton({ title: 'Cargar guardado' }).on('click', () => saved[slot.name] && host.applyConfig(saved[slot.name]));
      io.addButton({ title: 'Borrar guardado' }).on('click', () => {
        deleteLocal(slot.name);
        this.rebuild();
      });
    }
  }

  private buildSpecies(pane: Pane): void {
    const host = this.host;
    const cfg = host.cfg;
    const folder = pane.addFolder({ title: 'Especies y comportamientos', expanded: false });
    folder.addButton({ title: 'Paleta aleatoria' }).on('click', () => {
      const r = mulberry32(randomSeed());
      const h0 = r();
      const span = 0.3 + r() * 0.7;
      cfg.species.forEach((s, i) => (s.color = hslToHex((h0 + (span * i) / cfg.numSpecies) % 1, 0.7 + r() * 0.3, 0.5 + r() * 0.2)));
      host.speciesChanged();
      pane.refresh();
    });
    folder.addButton({ title: 'Formas aleatorias' }).on('click', () => {
      cfg.species.forEach((s) => (s.shape = Math.floor(Math.random() * SHAPES.length)));
      host.speciesChanged();
      pane.refresh();
    });
    folder.addButton({ title: 'Comportamientos aleatorios' }).on('click', () => {
      const r = mulberry32(randomSeed());
      cfg.species.forEach((s) => {
        s.mass = 0.5 + r() * 1.5;
        s.friction = 0.5 + r();
        s.propulsion = r() < 0.4 ? r() * 0.8 : 0;
        s.noise = r() < 0.4 ? r() * 0.6 : 0;
        s.spin = r() < 0.35 ? (r() * 2 - 1) * 0.8 : 0;
        s.alignment = r() < 0.35 ? r() * 3 : 0;
        s.pulseAmp = r() < 0.3 ? r() * 0.6 : 0;
        s.pulseFreq = 0.1 + r() * 0.8;
      });
      host.speciesChanged();
      pane.refresh();
    });
    folder.addButton({ title: 'Comportamientos neutros' }).on('click', () => {
      cfg.species.forEach((s) => Object.assign(s, { mass: 1, friction: 1, propulsion: 0, noise: 0, spin: 0, alignment: 0, pulseAmp: 0 }));
      host.speciesChanged();
      pane.refresh();
    });

    cfg.species.forEach((sp, i) => {
      const f = folder.addFolder({ title: `Especie ${i + 1}`, expanded: false });
      f.addBinding(sp, 'color', P('species.color'));
      f.addBinding(sp, 'shape', P('species.shape'));
      f.addBinding(sp, 'size', P('species.size'));
      f.addBinding(sp, 'mass', P('species.mass'));
      f.addBinding(sp, 'friction', P('species.friction'));
      f.addBinding(sp, 'propulsion', P('species.propulsion'));
      f.addBinding(sp, 'noise', P('species.noise'));
      f.addBinding(sp, 'spin', P('species.spin'));
      f.addBinding(sp, 'alignment', P('species.alignment'));
      f.addBinding(sp, 'pulseAmp', P('species.pulseAmp'));
      f.addBinding(sp, 'pulseFreq', P('species.pulseFreq'));
      f.on('change', () => host.speciesChanged());
    });
  }
}
