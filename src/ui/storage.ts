import { Config, normalizeConfig } from '../config';

// ---------------------------------------------------------------- URL compartible (JSON comprimido en el hash)

async function streamBytes(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function encodeConfig(cfg: Config): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(roundConfig(cfg)));
  return toBase64Url(await streamBytes(json, new CompressionStream('deflate-raw')));
}

export async function decodeConfig(text: string): Promise<Config> {
  const raw = await streamBytes(fromBase64Url(text), new DecompressionStream('deflate-raw'));
  return normalizeConfig(JSON.parse(new TextDecoder().decode(raw)));
}

/** Redondea los números para que las URLs sean más cortas. */
function roundConfig(cfg: Config): Config {
  return JSON.parse(JSON.stringify(cfg, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v)));
}

export async function shareUrl(cfg: Config): Promise<string> {
  const url = new URL(location.href);
  url.hash = 'c=' + (await encodeConfig(cfg));
  return url.toString();
}

export async function configFromHash(): Promise<Config | null> {
  const m = location.hash.match(/c=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    return await decodeConfig(m[1]);
  } catch (e) {
    console.warn('Estado de la URL no válido', e);
    return null;
  }
}

// ---------------------------------------------------------------- archivos JSON

export function downloadJson(cfg: Config, name = 'particle-life.json'): void {
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  downloadBlob(blob, name);
}

export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickJsonFile(): Promise<Config | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(normalizeConfig(JSON.parse(await file.text())));
      } catch (e) {
        alert('El archivo no es una configuración válida.');
        resolve(null);
      }
    };
    input.click();
  });
}

// ---------------------------------------------------------------- guardados locales (por navegador)

const KEY = 'particleLife.saved.v1';

export function listSaved(): Record<string, Config> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveLocal(name: string, cfg: Config): boolean {
  try {
    const all = listSaved();
    all[name] = cfg;
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function deleteLocal(name: string): void {
  try {
    const all = listSaved();
    delete all[name];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* almacenamiento no disponible */
  }
}
