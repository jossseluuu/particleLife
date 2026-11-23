# Política de seguridad

Particle Life es una aplicación web estática que se ejecuta por completo en el navegador: no tiene
servidor, cuentas ni recoge datos. Aun así, hay superficies que merecen cuidado:

- **Enlaces compartibles y JSON importados**: el estado del mundo se lee del `#hash` de la URL o de un archivo.
  Toda configuración entrante pasa por `normalizeConfig` (límites y tamaños), y nunca se interpreta como código.
- **`localStorage`**: sólo guarda configuraciones con nombre.
- **WebGPU**: valores extremos que pudieran colgar la GPU o el navegador también se consideran fallos de seguridad.

## Versiones con soporte

Sólo la versión desplegada desde la rama `main` (la [demo pública](https://jossseluuu.github.io/particleLife/)).

## Cómo informar de una vulnerabilidad

**No abras un issue público.** Usa el aviso privado de GitHub:
[*Security → Report a vulnerability*](https://github.com/jossseluuu/particleLife/security/advisories/new).

Incluye los pasos para reproducirlo (idealmente el enlace o JSON que lo provoca), navegador y GPU.
Recibirás respuesta en un plazo de 7 días y se te reconocerá en la corrección si lo deseas.
