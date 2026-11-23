# Sistema de documentación

Cómo está hecha esta documentación y cómo mantenerla. La idea central: **todo lo que se puede derivar del
código se genera**, y lo que se escribe a mano se verifica automáticamente.

## Piezas

```text
src/params.ts ──┬──▶ panel de la app (etiquetas, rangos, opciones)
                └──▶ scripts/gen-docs.ts ──▶ docs/referencia/parametros.md
src/config.ts ──────▶        │            ──▶ docs/public/config.schema.json
src/presets.ts ─────▶        │            ──▶ docs/guia/presets.md
                                      
scripts/screenshots.mjs ──▶ docs/media/*.webp   (Chrome real + WebGPU)
scripts/check-links.mjs ──▶ verifica anclas y enlaces tras compilar

docs/**/*.md ──▶ VitePress ──▶ dist/docs/  ──▶ GitHub Pages /particleLife/docs/
README.md, README.en.md, CONTRIBUTING.md, CHANGELOG.md  (los dos últimos se incluyen en la web)
```

| Pieza | Fuente | Se actualiza con |
| --- | --- | --- |
| Guías, conceptos, recetas, formato, rendimiento | `docs/**/*.md` | A mano |
| Referencia de parámetros | `src/params.ts` + valores por defecto | `npm run docs:gen` |
| Galería de presets (descripción, diferencias, matrices) | `src/presets.ts` | `npm run docs:gen` |
| JSON Schema | `src/params.ts` + `src/config.ts` | `npm run docs:gen` |
| Capturas y animación | La app real | `npm run screenshots` |
| Contribuir, changelog | `CONTRIBUTING.md`, `CHANGELOG.md` | A mano (se incluyen con `<!--@include-->`) |
| Arquitectura | `docs/referencia/arquitectura.md` | A mano |

## Una única fuente de verdad para los parámetros

[`src/params.ts`](https://github.com/jossseluuu/particleLife/blob/main/src/params.ts) describe cada
campo de `Config`: etiqueta, carpeta, rango, paso, unidad, opciones, descripción y marcas (sólo GPU,
reinicia, se edita en el editor de matrices).

- El **panel** construye cada control con `bindOpts('render.bloom')`, así que etiqueta y rango salen de ahí.
- El **generador** escribe la referencia y el JSON Schema con esos mismos datos y los valores por defecto
  reales de `defaultConfig()`.
- El generador **falla** si un campo de `Config` no tiene metadatos o si hay metadatos de un campo que ya no
  existe. Es imposible añadir un parámetro sin documentarlo.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run docs:dev` | Servidor de la documentación con recarga en caliente |
| `npm run docs:gen` | Regenera las páginas derivadas del código |
| `npm run docs:build` | Compila la web en `dist/docs/` (falla con enlaces internos rotos) |
| `npm run docs:links` | Comprueba anclas `#sección` en la web compilada y enlaces relativos de los `.md` de GitHub |
| `npm run docs:preview` | Sirve la web compilada |
| `npm run screenshots` | Regenera `docs/media/` con Chrome real |
| `npm run check` | Tipos, tests, `docs:gen --check` y markdownlint |
| `npm run build:all` | App + documentación en `dist/` y comprobación de enlaces, como en producción |

## Controles automáticos (CI)

En cada push y pull request, [`.github/workflows/deploy.yml`](https://github.com/jossseluuu/particleLife/blob/main/.github/workflows/deploy.yml):

1. `npm run check`, que incluye **`docs:gen --check`**: si cambiaste un parámetro o un preset y no
   regeneraste la documentación, el CI falla y te dice qué archivo está desfasado.
2. **markdownlint** sobre todos los `.md` (configuración en `.markdownlint-cli2.jsonc`).
3. **Build de VitePress**, que falla ante cualquier enlace interno roto.
4. **`docs:links`**: VitePress no comprueba las anclas (`#seccion`); este script verifica cada una sobre el
   HTML compilado, y también los enlaces relativos de README, CONTRIBUTING y demás.
5. En `main`, publica la app y la documentación juntas en GitHub Pages.

## Escribir una página nueva

1. Crea el `.md` en la carpeta que toque (`guia/`, `conceptos/`, `referencia/`, `desarrollo/`).
2. Añádela al `sidebar` en [`docs/.vitepress/config.mts`](https://github.com/jossseluuu/particleLife/blob/main/docs/.vitepress/config.mts).
3. Enlaza otras páginas con rutas relativas sin extensión: `[recetas](../guia/recetas)`.
4. Imágenes desde `docs/media/`: `![texto](../media/archivo.webp)` o `<img class="shot" src="../media/archivo.webp">`.
5. Comprueba con `npm run docs:dev` y `npm run check`.

### Recursos de formato disponibles

| Recurso | Uso |
| --- | --- |
| Avisos | `::: tip`, `::: info`, `::: warning`, `::: danger`, `::: details` |
| Marcas | `<Badge type="tip" text="GPU" />` |
| Capturas | `<img class="shot" …>` con `<figure>` y `<figcaption>` |
| Enlace a la demo | `<a class="demo-link" href="https://jossseluuu.github.io/particleLife/#preset=5">▶ …</a>` |
| Galería | `<div class="grid">` con `<figure>` dentro |
| Diagramas | SVG en línea con `class="diagram"` y `currentColor` para que se adapten al tema claro/oscuro |
| Teclas | `<kbd>Espacio</kbd>` |

## Estilo

- Español, tono cercano y directo; tuteo.
- Etiquetas del panel en *cursiva*, rutas de parámetros en `código`.
- Cada afirmación técnica debe corresponder al código; las cifras de rendimiento, a mediciones reales
  con `npm run test:gpu`.
- Las páginas generadas llevan un comentario de cabecera: no se editan a mano.
