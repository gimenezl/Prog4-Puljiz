# ADR-0006: PostGIS con índice espacial para buscar choferes cercanos

- **Estado:** Propuesto (falta medir; se acepta en el PR de RF-06 con los números)
- **Fecha:** 2026-11-11
- **Participantes:** Lucas Gimenez, Guido Ayala, Enzo Vernet
- **Tarjeta:** E3 · ADR de búsqueda geográfica

## Contexto

Dos operaciones necesitan geografía:

1. **Buscar choferes cercanos** al origen de un viaje (RF-06), entre los
   disponibles y con ubicación reciente (RF-03). El enunciado pide que la búsqueda
   no recorra todos los choferes en JavaScript y que se pueda medir.
2. **Ubicar un punto en una zona de demanda**, para calcular el multiplicador
   (RF-16, ADR-0005).

Carga de referencia (tarjeta «Simulador y tarea pesada»): 500 choferes enviando
ubicación cada 2 segundos, es decir unas 250 escrituras de ubicación por segundo,
mientras se piden viajes.

Estado actual del código: existe el puerto
`src/application/ports/out/buscador-de-choferes-cercanos.js`, pero todavía no hay
tabla de ubicaciones ni adaptador. `listar-viajes-disponibles.js` lista los viajes
solicitados por orden de llegada, sin distancia.

## Alternativas consideradas

| Alternativa                                                                                                                                                                                 | Ventajas                                                                                                                                                                                                   | Desventajas                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. PostGIS** (propuesta): columna `geography(Point)` con índice GiST, `ST_DWithin` para el radio y orden por `<->` (vecino más cercano). Zonas como `geography(Polygon)` con `ST_Covers`. | El índice descarta casi todos los choferes sin leerlos; distancias reales en metros; resuelve también la pertenencia a zonas con la misma herramienta; es una extensión estándar de PostgreSQL (ADR-0002). | Hay que usar la imagen `postgis/postgis` en Docker; más SQL específico que aprender; cada actualización de ubicación también actualiza el índice.                                 |
| B. Geohash en una columna de texto con índice B-tree                                                                                                                                        | Funciona en PostgreSQL sin extensiones; fácil de explicar (prefijo común = celdas cercanas).                                                                                                               | Hay que consultar la celda y sus 8 vecinas y después filtrar por distancia real; los bordes de celda dan resultados imprecisos; las zonas de demanda quedan aproximadas a celdas. |
| C. Caja de latitud y longitud con índice B-tree compuesto                                                                                                                                   | Simple, sin extensiones.                                                                                                                                                                                   | El índice compuesto solo filtra bien por la primera columna; con muchos choferes en la misma franja de latitud se leen muchas filas; la distancia se calcula aparte.              |
| D. Traer todos los disponibles y filtrar en JavaScript                                                                                                                                      | Lo más simple de programar.                                                                                                                                                                                | Lineal en la cantidad de choferes y bloquea el event loop con carga; el enunciado lo prohíbe sin justificación. Se descarta.                                                      |

## Decisión (propuesta)

Usar **PostGIS (A)**:

- Tabla de ubicación vigente del chofer con `posicion geography(Point, 4326)`,
  `actualizada_en` e índice `GIST (posicion)`. La ubicación vigente se reemplaza
  (`INSERT ... ON CONFLICT (chofer_id) DO UPDATE`); el histórico del recorrido
  (RF-20) va en otra tabla para no agrandar el índice de búsqueda.
- Búsqueda de candidatos:

  ```sql
  SELECT c.usuario_id, ST_Distance(u.posicion, $1) AS distancia_m
    FROM ubicaciones_vigentes u
    JOIN choferes c ON c.usuario_id = u.chofer_id
   WHERE c.habilitado AND c.disponible AND c.viaje_activo_id IS NULL
     AND u.actualizada_en > $2                -- ubicación reciente
     AND ST_DWithin(u.posicion, $1, $3)       -- radio en metros, usa el índice
   ORDER BY u.posicion <-> $1
   LIMIT $4;
  ```

- Pertenencia a zona: `ST_Covers(zona.area, $1)` sobre zonas activas, con índice
  GiST en `area`.
- La imagen de la base pasa de `postgres:15-alpine` a `postgis/postgis:15-3.4`
  (o equivalente) en `compose.yaml` y `compose.test.yaml`.

## Medición pendiente

Antes de aceptar este ADR hay que registrar en `docs/mediciones.md`:

- `EXPLAIN (ANALYZE, BUFFERS)` de la búsqueda con 500 y con 5000 choferes, mostrando
  que usa el índice GiST;
- p50, p95 y p99 de la búsqueda con 500 choferes actualizando cada 2 segundos;
- la misma medición con la alternativa B, para comparar.

## Consecuencias

- Cambia la imagen de la base y hace falta `CREATE EXTENSION IF NOT EXISTS postgis`
  en una migración.
- El adaptador PostGIS implementa el puerto `buscador-de-choferes-cercanos`; los
  tests de dominio siguen usando un buscador en memoria.
- El radio de búsqueda, la cantidad máxima de candidatos y la antigüedad máxima de
  la ubicación son «valores iniciales a configurar».

## Condición de revisión

Reabrir si las mediciones muestran que mantener el índice GiST con 250 escrituras
por segundo degrada el p95 de la solicitud de viaje por encima del objetivo, si la
imagen con PostGIS trae problemas en las máquinas del equipo o del entorno de
ataque, o si las zonas pasan a ser algo más simple que polígonos.
