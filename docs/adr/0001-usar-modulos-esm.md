# ADR-0001: Usar módulos ESM en todo el backend

- **Estado:** Aceptado
- **Fecha:** 2026-11-11
- **Participantes:** Lucas Gimenez, Guido Ayala, Enzo Vernet
- **Tarjeta:** E0 · ADR de módulos y persistencia

## Contexto

Node.js 22 admite dos sistemas de módulos: CommonJS (`require` / `module.exports`)
y ECMAScript Modules (`import` / `export`). Hay que elegir uno para todo el
proyecto, porque mezclarlos complica las importaciones, los tests y las
herramientas.

Restricciones:

- El proyecto arranca de cero, sin código heredado en CommonJS.
- La arquitectura hexagonal necesita controlar qué capa importa a cuál. El test
  `tests/architecture/boundaries.test.js` analiza las importaciones de cada archivo.
- Las dependencias elegidas (`express` 5, `jose`, `pg`, `zod`, `pino`) funcionan con ESM.
  `jose` publica solo ESM.

## Alternativas consideradas

### A. CommonJS

- Ventajas: es el formato histórico de Node; casi todos los ejemplos y respuestas
  en internet lo usan; `require` es síncrono y se puede llamar en cualquier lugar.
- Desventajas: no es el estándar del lenguaje; las importaciones son dinámicas,
  así que un análisis estático de dependencias entre capas es menos confiable;
  las librerías que publican solo ESM (como `jose`) obligan a usar `import()`
  asíncrono.

### B. ESM (elegida)

- Ventajas: es el estándar de JavaScript; las importaciones son estáticas y se
  pueden analizar sin ejecutar el código (lo usa el test de arquitectura con
  `es-module-lexer`); permite `await` en el nivel superior; `import.meta.dirname`
  reemplaza a `__dirname`.
- Desventajas: las rutas relativas llevan la extensión `.js` obligatoria; algunas
  librerías viejas solo exponen CommonJS y hay que importarlas con su export por
  defecto; los mocks de módulos son menos directos que con `require`.

### C. TypeScript compilado

- Ventajas: tipos estáticos.
- Desventajas: agrega un paso de compilación y configuración que la cátedra no
  pide; el equipo tendría que aprenderlo durante el TP. Se descarta por costo.

## Decisión

Usamos **ESM estricto**: `"type": "module"` en `package.json`, `import` / `export`
en todos los archivos, extensiones `.js` explícitas en rutas relativas y ningún
`require`. ESLint analiza el código con `sourceType: 'module'`.

## Consecuencias

- El test de arquitectura puede leer las importaciones de cada archivo y fallar si
  el dominio importa Express, `pg` u otra librería de infraestructura.
- Toda dependencia nueva tiene que funcionar con `import`. Si alguna solo existe
  en CommonJS, se importa por defecto (`import pkg from '...'`) y se documenta.
- Los scripts (`scripts/migrate.js`, `scripts/seed.js`) también son ESM.

## Condición de revisión

Reabrir si una dependencia necesaria para un requisito funcional solo funciona
con CommonJS y no tiene alternativa razonable, o si el equipo decide migrar a
TypeScript.
