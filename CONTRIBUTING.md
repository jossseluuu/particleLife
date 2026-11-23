# Cómo contribuir

¡Gracias por tu interés en Particle Life! Puedes escribir issues y pull requests en **español o inglés**.

## Formas de ayudar

- **Informar de un fallo**: usa la plantilla *Bug report*. Incluye navegador, GPU y si estabas en modo GPU o CPU
  (se ve en el HUD, arriba a la izquierda). Un enlace compartible del mundo (*Guardar / compartir → Copiar enlace*)
  ayuda muchísimo a reproducirlo.
- **Proponer una idea**: usa la plantilla *Feature request*.
- **Compartir un mundo bonito**: abre un issue con el enlace; los mejores pueden acabar como preset.
- **Mejorar la documentación**: cada página de la [web de documentación](https://jossseluuu.github.io/particleLife/docs/)
  tiene un enlace *Editar esta página en GitHub*.
- **Enviar código**: sigue los pasos de abajo.

## Preparar el entorno

```bash
git clone https://github.com/jossseluuu/particleLife.git
cd particleLife
npm install
npm run dev          # la app en http://localhost:5173
npm run docs:dev     # la documentación en http://localhost:5174/particleLife/docs/
```

Necesitas Node.js 20.19+ o 22.12+ (recomendado 22: `nvm use` lee el archivo `.nvmrc`) y Chrome o Edge con WebGPU.

## Flujo de trabajo

1. Crea una rama desde `main`: `git checkout -b feat/mi-cambio`.
2. Haz cambios pequeños y enfocados; un PR = un tema.
3. Antes de abrir el PR, ejecuta la verificación completa (la misma que el CI):

   ```bash
   npm run check        # tipos + tests unitarios + docs generadas al día + markdownlint
   ```

   y, si tocas la simulación, el render o la interfaz, también:

   ```bash
   npm run test:gpu                         # simulación / shaders, en tu GPU
   npm run dev   # y en otra terminal:
   npm run test:browser                     # interfaz, en Chrome real
   ```

4. Si cambias algo visible, actualiza las capturas con `npm run screenshots`.
5. Añade una línea a la sección *Sin publicar* del `CHANGELOG.md`.

## Convenciones

- **TypeScript estricto**, sin `any` salvo causa justificada. Formato: 2 espacios, comillas simples y punto y coma
  (lo aplica `.editorconfig`).
- **Comentarios y textos de la interfaz en español.**
- **Paridad GPU/CPU**: cualquier cambio en `src/shaders/sim.wgsl` debe replicarse en `src/sim/cpuSimulation.ts`;
  `npm test` y `npm run test:gpu` comprueban que ambos motores coinciden.
- **Parámetros nuevos**: añade el campo a `Config` con su valor por defecto en `src/config.ts`, sus metadatos
  (etiqueta, rango, descripción) en `src/params.ts`, y ejecuta `npm run docs:gen`. El panel y la referencia de
  parámetros se actualizan solos; `npm run check` falla si falta algo.
- **Rendimiento**: evita lecturas síncronas de la GPU y asignaciones por frame en el bucle principal.
- **Commits** en imperativo y descriptivos (`Añade preset «Cristales»`, `Corrige zoom táctil en Safari`).

## Documentación

La documentación vive en `docs/` y se publica con [VitePress](https://vitepress.dev) junto a la demo.
Parte se escribe a mano y parte **se genera del código** para que nunca quede desfasada:

| Qué | Cómo se mantiene |
| --- | --- |
| Guías, conceptos, recetas | A mano, en `docs/guia/` y `docs/conceptos/` |
| Referencia de parámetros | Generada de `src/params.ts` y `src/config.ts` (`npm run docs:gen`) |
| Galería de presets y matrices | Generada de `src/presets.ts` (`npm run docs:gen`) |
| JSON Schema del formato | Generado (`docs/public/config.schema.json`) |
| Capturas | `npm run screenshots` (Chrome real con WebGPU) |

Explicación completa: [Sistema de documentación](https://jossseluuu.github.io/particleLife/docs/desarrollo/documentacion).

## Ideas para empezar

| Tarea | Dónde |
| --- | --- |
| Un preset nuevo | `PRESETS` en `src/presets.ts` (con `description`), luego `npm run docs:gen` y `npm run screenshots` |
| Un patrón de matriz | `MATRIX_PATTERNS` en `src/presets.ts` |
| Una forma SDF nueva | `SHAPES` en `src/config.ts`, `src/shaders/particles.wgsl` y `src/ui/shapes.ts` |
| Un modo de color | `src/shaders/particles.wgsl` y las opciones de `render.colorMode` en `src/params.ts` |
| Una receta o una pregunta frecuente | `docs/guia/recetas.md`, `docs/guia/problemas.md` |

La [guía de arquitectura](https://jossseluuu.github.io/particleLife/docs/referencia/arquitectura) explica cómo encajan las piezas.

## Código de conducta

Al participar aceptas el [código de conducta](https://github.com/jossseluuu/particleLife/blob/main/CODE_OF_CONDUCT.md).
