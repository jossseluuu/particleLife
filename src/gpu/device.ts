export interface GpuContext {
  device: GPUDevice;
  adapterName: string;
  timestamps: boolean;
}

export class GpuUnavailableError extends Error {}

/** Explica por qué no hay WebGPU y cómo solucionarlo, según el navegador. */
function diagnose(reason: string): string {
  const ua = navigator.userAgent;
  const tips: string[] = [];
  if (/Code\/|Electron/i.test(ua)) {
    tips.push('Parece el navegador integrado de VS Code: no expone WebGPU. Abre la URL en Chrome o Edge.');
  } else if (/Firefox/i.test(ua)) {
    tips.push('Firefox: usa la versión 141+ o activa dom.webgpu.enabled en about:config (o usa Chrome/Edge).');
  } else if (/Chrome|Edg/i.test(ua)) {
    tips.push('Comprueba que la aceleración por hardware está activada (Configuración → Sistema).');
    tips.push('Revisa chrome://gpu (o edge://gpu): "WebGPU" debe aparecer como "Hardware accelerated".');
    tips.push('Si tu GPU está en lista negra, activa chrome://flags/#enable-unsafe-webgpu y reinicia el navegador.');
  } else if (/Safari/i.test(ua)) {
    tips.push('Safari: requiere macOS/iOS 26+ (o activar WebGPU en Funciones experimentales).');
  }
  if (!window.isSecureContext) tips.push('WebGPU sólo funciona en contexto seguro: abre la página por http://localhost o https.');
  return `${reason}\n\n${tips.map((t) => '• ' + t).join('\n')}`;
}

async function findAdapter(): Promise<GPUAdapter | null> {
  // En portátiles con dos GPUs pedimos la dedicada; si falla, cualquier otra opción.
  const attempts: GPURequestAdapterOptions[] = [
    { powerPreference: 'high-performance' },
    {},
    { powerPreference: 'low-power' },
    { featureLevel: 'compatibility' } as GPURequestAdapterOptions,
  ];
  for (const opts of attempts) {
    try {
      const adapter = await navigator.gpu.requestAdapter(opts);
      if (adapter) return adapter;
    } catch (e) {
      console.warn('requestAdapter falló con', opts, e);
    }
  }
  return null;
}

export async function initGpu(): Promise<GpuContext> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    throw new GpuUnavailableError(diagnose('Este navegador no expone WebGPU.'));
  }
  const adapter = await findAdapter();
  if (!adapter) throw new GpuUnavailableError(diagnose('El navegador tiene WebGPU, pero no ofreció ningún adaptador de GPU.'));

  const timestamps = adapter.features.has('timestamp-query');
  const want = (name: keyof GPUSupportedLimits, value: number) => Math.min(value, adapter.limits[name] as number);
  const device = await adapter.requestDevice({
    requiredFeatures: timestamps ? ['timestamp-query'] : [],
    requiredLimits: {
      maxStorageBufferBindingSize: want('maxStorageBufferBindingSize', 256 * 1024 * 1024),
      maxBufferSize: want('maxBufferSize', 256 * 1024 * 1024),
      maxStorageBuffersPerShaderStage: want('maxStorageBuffersPerShaderStage', 10),
    },
  });
  const info = adapter.info;
  const adapterName = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' ') || 'GPU';
  return { device, adapterName, timestamps };
}
