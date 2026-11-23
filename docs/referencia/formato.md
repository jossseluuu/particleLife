# Formato de guardado

Un mundo se describe con un único objeto JSON, el tipo `Config` de
[`src/config.ts`](https://github.com/jossseluuu/particleLife/blob/main/src/config.ts). Es lo que descarga
*Exportar JSON*, lo que viaja comprimido en un enlace compartible y lo que se guarda en `localStorage`.

- Esquema formal: [**config.schema.json**](/config.schema.json) (JSON Schema 2020-12, generado del código).
- Significado y rango de cada campo: [referencia de parámetros](./parametros).

## Estructura

```json
{
  "seed": 1234,
  "numParticles": 80000,
  "numSpecies": 3,
  "density": 30,
  "spawn": "aleatorio",
  "rMax": 40,
  "beta": 0.3,
  "repulsion": 1,
  "forceFactor": 10,
  "frictionHalfLife": 0.04,
  "dt": 0.02,
  "maxSpeed": 20,
  "stepsPerFrame": 1,
  "algorithm": "rejilla",
  "attraction": [0.3, 0.25, -0.1, -0.1, 0.3, 0.25, 0.25, -0.1, 0.3],
  "radius": [1, 1, 1, 1, 1, 1, 1, 1, 1],
  "conversion": [0, 2.5, 0, 0, 0, 2.5, 2.5, 0, 0],
  "conversionEnabled": true,
  "conversionRadius": 0.5,
  "species": [
    { "color": "#ff3b5c", "shape": 0, "size": 1, "mass": 1, "friction": 1, "propulsion": 0,
      "noise": 0.4, "spin": 0, "alignment": 0, "pulseAmp": 0, "pulseFreq": 0.5 }
  ],
  "drift": { "enabled": false, "rate": 0.15 },
  "mouse": { "radius": 6, "strength": 3 },
  "render": { "colorMode": 0, "bloom": true, "trails": false, "background": "#05060a" }
}
```

(Ejemplo abreviado del preset *Piedra, papel, tijera*: faltan dos especies y casi todo `render`.)

## Matrices

`attraction`, `radius` y `conversion` son matrices S×S **aplanadas por filas**: el elemento de la fila
`a` y la columna `b` está en el índice `a · S + b`, con `S = numSpecies`.

| Matriz | `m[a·S + b]` significa |
| --- | --- |
| `attraction` | Cómo reacciona la especie `a` ante `b` (−1 … 1) |
| `radius` | Escala del alcance de la interacción de `a` con `b` (0,1 … 1) |
| `conversion` | Tasa con la que `a` convierte a `b` al tocarla (0 … 5) |

## Compatibilidad: normalización

Toda configuración que entra (enlace, JSON importado o guardado en el navegador) pasa por
`normalizeConfig`:

- **Todos los campos son opcionales.** Los que faltan toman su valor por defecto; `{}` es un mundo válido.
- `numSpecies` se limita a 1 … 16 y `numParticles` a 100 … 2 000 000.
- Las matrices se recortan o rellenan hasta S×S (con 0, o 1 en `radius`); los valores no numéricos pasan a 0.
- `species` se ajusta a `numSpecies` elementos, completando los campos que falten.
- `drift`, `mouse` y `render` se fusionan campo a campo con los valores por defecto.

Gracias a esto, los enlaces y archivos de versiones antiguas siguen funcionando cuando se añaden parámetros
nuevos. Quien añada un campo debe darle valor por defecto (ver [Contribuir](../desarrollo/contribuir)).

## Enlace compartible

```text
https://jossseluuu.github.io/particleLife/#c=<datos>
```

`<datos>` se obtiene así:

1. Los números no enteros se redondean a 4 decimales (enlaces más cortos).
2. `JSON.stringify` → bytes UTF-8.
3. Compresión **deflate-raw** (`CompressionStream` del navegador).
4. **base64url** (`+` → `-`, `/` → `_`, sin `=` final).

Un mundo típico ocupa 600–900 caracteres. Al ir en el fragmento `#`, el navegador nunca lo envía al servidor.

### Decodificarlo fuera de la app

```js
// Node 18+ o la consola del navegador
async function decode(hash) {
  const b64 = hash.replace(/^#?c=/, '').replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}
```

### Otros fragmentos

| Fragmento / parámetro | Efecto |
| --- | --- |
| `#preset=N` | Carga el preset N (1 … 12) con el nº de partículas adecuado al dispositivo |
| `?cpu` | Fuerza el motor CPU |

## Guardados del navegador

*Guardar en este navegador* usa la clave `particleLife.saved.v1` de `localStorage`, con un objeto
`{ "nombre": Config, … }`. Se borra si se limpian
los datos del sitio.
