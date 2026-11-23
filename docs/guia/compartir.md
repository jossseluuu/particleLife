# Guardar y compartir

Todo lo que define un mundo (matrices, especies, física y render) es un único objeto de configuración.
Guardar o compartir es simplemente serializarlo; las posiciones de las partículas **no** se guardan,
sólo las reglas y la semilla.

Todas las opciones están en el panel, carpeta **Guardar / compartir**.

## Enlace compartible

**Copiar enlace compartible** pone tu mundo en la URL y la copia al portapapeles:

```text
https://jossseluuu.github.io/particleLife/#c=bVLLbtswEPwXn...
```

Quien abra el enlace verá exactamente tus reglas. La configuración va comprimida en la parte `#`, así que
**nunca se envía a ningún servidor**. Los detalles del formato están en
[Formato de guardado](../referencia/formato).

Para enlazar un preset basta con `#preset=N` (de 1 a 12), por ejemplo
[`#preset=5`](https://jossseluuu.github.io/particleLife/#preset=5).

## Archivo JSON

- **Exportar JSON** descarga `particle-life.json`.
- **Importar JSON** carga uno. Acepta archivos de versiones anteriores: los campos que falten toman su
  valor por defecto.

El formato está descrito por un [JSON Schema](/config.schema.json) que puedes usar en tu editor para
validar y autocompletar.

## En este navegador

**Guardar en este navegador…** pide un nombre y lo guarda en `localStorage`. Aparece entonces un
desplegable *guardados* con botones para cargar y borrar. Sólo está en este navegador y este dispositivo.

## Captura PNG

<kbd>P</kbd> o *Render → Captura PNG* descarga una imagen a la resolución real del lienzo.
Oculta antes la interfaz con <kbd>H</kbd> si la quieres limpia.

## Versión en un solo archivo

`npm run build:single` genera `dist-single/index.html`: toda la app en un HTML que se abre con doble clic,
sin servidor ni conexión. Cada [release](https://github.com/jossseluuu/particleLife/releases) lo incluye ya compilado.
