# Pruebas

Tres niveles de pruebas, de más rápido y portátil a más realista:

| Comando | Dónde corre | Duración | En CI |
| --- | --- | --- | --- |
| `npm test` | Node, sin GPU | segundos | ✅ |
| `npm run test:gpu` | Node + Dawn sobre tu GPU real | ~1 min | — (los runners no tienen GPU) |
| `npm run test:browser` | Chrome real vía Puppeteer | ~1 min | — |
| `npm run check` | Tipos + `npm test` + docs + markdownlint | segundos | ✅ |

## Unitarias: `npm test`

[`test/unit.ts`](https://github.com/jossseluuu/particleLife/blob/main/test/unit.ts), 201 comprobaciones
sobre el motor CPU (que replica fielmente al de GPU):

- **Rejilla vs fuerza bruta**: el algoritmo O(N) da el mismo resultado que comparar todas las parejas,
  incluidas las conversiones de especie.
- **Física**: dos partículas que se atraen se estabilizan exactamente a `β · rMax`; las que se repelen se
  separan; la interacción funciona a través del borde toroidal; el centro de masas se conserva.
- **Estabilidad de los 12 presets**: sin NaN, dentro del mundo, población conservada y velocidad acotada.
- **Configuración**: redimensionado de matrices, normalización, presets válidos y enlace comprimido de ida y vuelta.
- **Metadatos de parámetros**: los valores por defecto y los de cada preset caben en los rangos y opciones
  que declara `src/params.ts` (los mismos que muestra el panel), y cada preset tiene descripción.
- **Modos de aparición**: todas las partículas dentro del mundo.

## En GPU real: `npm run test:gpu`

[`test/validate.ts`](https://github.com/jossseluuu/particleLife/blob/main/test/validate.ts) usa
[Dawn](https://dawn.googlesource.com/dawn) (el motor WebGPU de Chrome, a través del paquete `webgpu`)
para ejecutar los shaders reales:

1. **Rejilla GPU vs fuerza bruta GPU** desde el mismo estado (error ~3e-5).
2. **Motor CPU vs motor GPU**: un paso desde el mismo estado coincide (error ~1e-4, float64 frente a float32).
3. **Estabilidad**: 300 pasos de cada preset.
4. **Render**: crea los pipelines y dibuja un frame a textura.
5. **Rendimiento**: ms por paso con 50 000 a 1 000 000 de partículas (las cifras de [Rendimiento](../referencia/rendimiento)).

## En el navegador: `npm run test:browser`

Con `npm run dev` arrancado, [`test/browser.mjs`](https://github.com/jossseluuu/particleLife/blob/main/test/browser.mjs)
abre Chrome (variable `CHROME_PATH` para otro navegador) y recorre tres escenarios:

| Escenario | Comprueba |
| --- | --- |
| Escritorio · WebGPU | Arranque, presets por teclado, desplegable y `#preset=N`, editor de matrices, zoom, pausa, ayuda, enlace compartible que restaura el mundo |
| Escritorio · `?cpu` | Modo CPU, aviso y explicación en la ayuda |
| Móvil 390×844 táctil | 30 000 partículas, paneles plegados, pellizco de dos dedos, botón ☰ |

En todos verifica que **no hay errores en la consola**. Guarda capturas en `screenshots/` (ignorada por git).

## Documentación

`npm run check` incluye:

- `npm run docs:gen -- --check`: falla si las páginas generadas no coinciden con el código o si algún
  campo de `Config` no tiene metadatos.
- `markdownlint-cli2`: estilo de todos los `.md`.

El CI además compila la web de documentación, que **falla ante cualquier enlace interno roto**.
Ver [Sistema de documentación](./documentacion).
