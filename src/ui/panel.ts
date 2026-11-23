import { Pane } from 'tweakpane';
import { Config, MAX_SPECIES, SHAPES, hslToHex, SpawnMode } from '../config';
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

const SPAWNS: SpawnMode[] = ['aleatorio', 'disco', 'anillo', 'espiral', 'franjas', 'cúmulos', 'big bang'];

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
      .addBinding(cfg, 'numParticles', { label: 'partículas', min: 1000, max: host.maxParticles, step: 1000 })
      .on('change', (ev: ChangeEv) => ev.last && host.reset());
    // proxy: el nº de especies sólo se aplica al soltar el slider (cambia el tamaño de las matrices)
    const speciesState = { n: cfg.numSpecies };
    eco
      .addBinding(speciesState, 'n', { label: 'especies', min: 1, max: MAX_SPECIES, step: 1 })
      .on('change', (ev: ChangeEv & { value: number }) => ev.last && ev.value !== host.cfg.numSpecies && host.setNumSpecies(ev.value));
    eco
      .addBinding(cfg, 'density', { label: 'densidad', min: 4, max: 120, step: 1 })
      .on('change', (ev: ChangeEv) => ev.last && host.reset());
    eco
      .addBinding(cfg, 'spawn', { label: 'aparición', options: Object.fromEntries(SPAWNS.map((s) => [s, s])) })
      .on('change', () => host.reset());
    eco.addBinding(cfg, 'seed', { label: 'semilla', step: 1, format: (v: number) => v.toFixed(0) });
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
    phys.addBinding(cfg, 'rMax', { label: 'radio máx.', min: 8, max: 150, step: 1 }).on('change', () => host.gridChanged());
    phys.addBinding(cfg, 'beta', { label: 'β (núcleo)', min: 0.05, max: 0.9, step: 0.01 });
    phys.addBinding(cfg, 'repulsion', { label: 'repulsión', min: 0, max: 5, step: 0.05 });
    phys.addBinding(cfg, 'forceFactor', { label: 'fuerza', min: 0.5, max: 40, step: 0.5 });
    phys.addBinding(cfg, 'frictionHalfLife', { label: 'semivida rozam.', min: 0.005, max: 1, step: 0.005 });
    phys.addBinding(cfg, 'dt', { label: 'dt', min: 0.002, max: 0.05, step: 0.001 });
    phys.addBinding(cfg, 'maxSpeed', { label: 'vel. máx (rMax/s)', min: 1, max: 80, step: 1 });
    phys.addBinding(cfg, 'stepsPerFrame', { label: 'pasos / frame', min: 1, max: 8, step: 1 });
    phys.addBinding(cfg, 'algorithm', {
      label: 'algoritmo',
      options: { 'rejilla O(N)': 'rejilla', 'fuerza bruta O(N²)': 'fuerza bruta' },
    }).on('change', (ev) => {
      if (ev.value === 'fuerza bruta' && cfg.numParticles > 30000)
        host.toast('Aviso: la fuerza bruta con muchas partículas será muy lenta');
    });

    // ------------------------------------------------------------ Conversión
    const conv = pane.addFolder({ title: 'Conversión / depredación', expanded: false });
    conv.addBinding(cfg, 'conversionEnabled', { label: 'activa' });
    conv.addBinding(cfg, 'conversionRadius', { label: 'radio contacto', min: 0.05, max: 1, step: 0.01 });
    conv.addBlade({ view: 'text', label: 'ayuda', parse: (v: string) => v, value: 'edita la pestaña "Conversión"' });

    // ------------------------------------------------------------ Evolución
    const evo = pane.addFolder({ title: 'Evolución de la matriz', expanded: false });
    evo.addBinding(cfg.drift, 'enabled', { label: 'deriva continua' });
    evo.addBinding(cfg.drift, 'rate', { label: 'velocidad', min: 0.01, max: 1, step: 0.01 });

    // ------------------------------------------------------------ Especies
    this.buildSpecies(pane);

    // ------------------------------------------------------------ Render
    const rc = cfg.render;
    const ren = pane.addFolder({ title: 'Render', expanded: false });
    const onR = () => host.renderChanged();
    // Color por velocidad, orientación, bloom y tone mapping sólo existen en el render WebGPU.
    if (gpu) ren.addBinding(rc, 'colorMode', {
      label: 'color',
      options: { especie: 0, velocidad: 1, 'especie × velocidad': 2, dirección: 3, 'degradado especies': 4 },
    });
    ren.addBinding(rc, 'blend', { label: 'mezcla', options: { aditiva: 'aditivo', alfa: 'alfa' } });
    ren.addBinding(rc, 'pointSize', { label: 'tamaño', min: 0.02, max: 0.8, step: 0.01 });
    ren.addBinding(rc, 'minPx', { label: 'tamaño mín. px', min: 0.5, max: 6, step: 0.1 });
    ren.addBinding(rc, 'softness', { label: 'halo', min: 0, max: 2, step: 0.05 });
    ren.addBinding(rc, 'brightness', { label: 'brillo', min: 0.05, max: 4, step: 0.05 });
    if (gpu) ren.addBinding(rc, 'orient', { label: 'orientar formas' });
    if (gpu) ren.addBinding(rc, 'speedRef', { label: 'vel. de saturación', min: 0.2, max: 20, step: 0.1 });
    ren.addBinding(rc, 'trails', { label: 'estelas' });
    ren.addBinding(rc, 'trailFade', { label: 'persistencia', min: 0.5, max: 0.99, step: 0.005 });
    if (gpu) ren.addBinding(rc, 'bloom', { label: 'bloom' });
    if (gpu) ren.addBinding(rc, 'bloomIntensity', { label: 'intensidad', min: 0, max: 4, step: 0.05 });
    if (gpu) ren.addBinding(rc, 'bloomThreshold', { label: 'umbral', min: 0, max: 3, step: 0.01 });
    if (gpu) ren.addBinding(rc, 'bloomKnee', { label: 'suavidad', min: 0, max: 1, step: 0.01 });
    if (gpu) ren.addBinding(rc, 'bloomRadius', { label: 'radio bloom', min: 2, max: 7, step: 1 });
    if (gpu) ren.addBinding(rc, 'exposure', { label: 'exposición', min: 0.1, max: 4, step: 0.05 });
    if (gpu) ren.addBinding(rc, 'tonemap', { label: 'tone mapping', options: { ACES: 0, Reinhard: 1, lineal: 2 } });
    ren.addBinding(rc, 'vignette', { label: 'viñeta', min: 0, max: 1, step: 0.01 });
    ren.addBinding(rc, 'background', { label: 'fondo' });
    ren.on('change', onR);
    ren.addButton({ title: 'Encuadrar mundo (doble clic)' }).on('click', () => host.fitCamera());
    ren.addButton({ title: 'Captura PNG (P)' }).on('click', () => host.screenshot());

    // ------------------------------------------------------------ Interacción
    const inter = pane.addFolder({ title: 'Ratón', expanded: false });
    inter.addBinding(cfg.mouse, 'radius', { label: 'radio (×rMax)', min: 1, max: 40, step: 0.5 });
    inter.addBinding(cfg.mouse, 'strength', { label: 'fuerza', min: -20, max: 20, step: 0.1 });
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

    const shapeOptions = Object.fromEntries(SHAPES.map((s, i) => [s, i]));
    cfg.species.forEach((sp, i) => {
      const f = folder.addFolder({ title: `Especie ${i + 1}`, expanded: false });
      f.addBinding(sp, 'color', { label: 'color' });
      f.addBinding(sp, 'shape', { label: 'forma', options: shapeOptions });
      f.addBinding(sp, 'size', { label: 'tamaño', min: 0.2, max: 4, step: 0.05 });
      f.addBinding(sp, 'mass', { label: 'masa', min: 0.1, max: 5, step: 0.05 });
      f.addBinding(sp, 'friction', { label: 'rozamiento ×', min: 0, max: 3, step: 0.05 });
      f.addBinding(sp, 'propulsion', { label: 'propulsión', min: 0, max: 2, step: 0.01 });
      f.addBinding(sp, 'noise', { label: 'ruido', min: 0, max: 2, step: 0.01 });
      f.addBinding(sp, 'spin', { label: 'giro', min: -2, max: 2, step: 0.01 });
      f.addBinding(sp, 'alignment', { label: 'alineamiento', min: 0, max: 8, step: 0.05 });
      f.addBinding(sp, 'pulseAmp', { label: 'pulso amplitud', min: 0, max: 0.9, step: 0.01 });
      f.addBinding(sp, 'pulseFreq', { label: 'pulso frec.', min: 0.02, max: 3, step: 0.01 });
      f.on('change', () => host.speciesChanged());
    });
  }
}
