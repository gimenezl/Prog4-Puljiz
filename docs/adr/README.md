# Registro de decisiones de arquitectura (ADR)

Cada decisión importante del proyecto queda en un archivo numerado de esta carpeta.
Un ADR no se borra: si una decisión cambia, se escribe un ADR nuevo que la reemplaza
y el anterior pasa a estado «Reemplazado por ADR-XXXX».

## Índice

| ADR                                                            | Decisión                                                                | Estado    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| [0001](0001-usar-modulos-esm.md)                               | Usar módulos ESM en todo el backend                                     | Aceptado  |
| [0002](0002-postgresql-con-sql-parametrizado-sin-orm.md)       | PostgreSQL con SQL parametrizado y sin ORM                              | Aceptado  |
| [0003](0003-jwt-y-bcrypt-para-autenticacion.md)                | JWT firmado y bcrypt para autenticación; permisos por rol y por recurso | Aceptado  |
| [0004](0004-bloqueo-de-filas-para-asignacion-y-cancelacion.md) | Bloqueo de filas en orden fijo para asignar y cancelar viajes           | Aceptado  |
| [0005](0005-cotizacion-inmutable-para-precio-dinamico.md)      | Cotización inmutable y confirmación condicional para el precio dinámico | Propuesto |
| [0006](0006-postgis-para-busqueda-geografica.md)               | PostGIS con índice espacial para buscar choferes cercanos               | Propuesto |
| [0007](0007-servicio-python-integrado-por-http.md)             | Reportes en un servicio Python separado, integrado por HTTP             | Aceptado  |

«Aceptado» significa que la decisión ya está en el código o el equipo la cerró.
«Propuesto» significa que falta acordarla entre los tres o medirla; pasa a
«Aceptado» en el PR que la implementa.

## Plantilla

Todos los ADR usan esta estructura:

```markdown
# ADR-XXXX: <la decisión, escrita como afirmación>

- **Estado:** Propuesto | Aceptado | Reemplazado por ADR-YYYY
- **Fecha:** AAAA-MM-DD
- **Participantes:** <integrantes que la discutieron>
- **Tarjeta:** <tarjeta de Trello>

## Contexto

Qué problema hay que resolver y qué restricciones aplican.

## Alternativas consideradas

Al menos dos alternativas reales, cada una con ventajas y desventajas.

## Decisión

Qué se eligió y por qué.

## Consecuencias

Qué gana y qué pierde el proyecto; qué queda pendiente.

## Condición de revisión

Situación concreta que obligaría a reabrir la decisión.
```
