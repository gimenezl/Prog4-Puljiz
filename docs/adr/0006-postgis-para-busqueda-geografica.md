# ADR-0006: PostGIS con índice espacial para buscar choferes cercanos

- **Estado:** Aceptado (2026-11-23, con la medición de `docs/mediciones.md` §1)
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
  SELECT u.chofer_id, ST_Distance(u.posicion, $1) AS distancia_m
    FROM ubicaciones_vigentes u
   WHERE u.actualizada_en > $2                -- ubicación reciente
     AND ST_DWithin(u.posicion, $1, $3)       -- radio en metros, usa el índice
     AND (SELECT c.habilitado AND c.disponible AND c.viaje_activo_id IS NULL
            FROM choferes c WHERE c.usuario_id = u.chofer_id)   -- elegible
   ORDER BY u.posicion <-> $1, u.chofer_id
   LIMIT $4;
  ```

  La elegibilidad va como **subconsulta escalar** y no como `JOIN`: PostGIS
  subestima las filas que deja pasar `ST_DWithin` y, con un `JOIN`, el
  planificador elegía un cruce cuadrático en muchos puntos de la ciudad (ver
  la medición). La consulta real está en
  `src/infrastructure/adapters/out/geografia/postgis-buscador-de-choferes.js`.
- Viajes cercanos al chofer (`GET /viajes/disponibles`): columna generada
  `viajes.origen geography(Point, 4326)` con índice GiST parcial sobre los
  viajes `SOLICITADO` (migración `012`).

- Pertenencia a zona: `ST_Covers(zona.area, $1)` sobre zonas activas, con índice
  GiST en `area`.
- La imagen de la base pasa de `postgres:15-alpine` a `postgis/postgis:15-3.4`
  (o equivalente) en `compose.yaml` y `compose.test.yaml`.

## Medición

Detalle completo, entorno y comandos para repetirla en `docs/mediciones.md` §1
(`pnpm medir:busqueda`). Se comparó A contra **D (filtrar en JavaScript)** en
lugar de B: D es el mecanismo que el proyecto ya usa (medidor de demanda de las
cotizaciones), así que la comparación responde a un problema real y no requiere
programar un mecanismo descartable.

| Choferes | A. PostGIS p50 / p95 | D. JavaScript p50 / p95 |
|---:|---:|---:|
| 500 | 1,6 ms / 2,0 ms | 5,7 ms / 8,2 ms |
| 5000 | 4,4 ms / 6,4 ms | 58,5 ms / 68,9 ms |

- Al multiplicar los choferes por 10, A crece unas 2,8 veces y D unas 10 veces.
- `EXPLAIN (ANALYZE, BUFFERS)` muestra `Bitmap Index Scan on
  ubicaciones_vigentes_posicion_idx` y 2,6 ms de ejecución con 5000 choferes.
- La primera versión con `JOIN` era cuadrática con 5000 choferes (p50 de 72 ms,
  peor que D); se corrigió con la subconsulta escalar.

**Pendiente:** p50, p95 y p99 con 500 choferes **actualizando cada 2 segundos**
mientras se busca. Lo mide la tarjeta «E4 · Simulador, carga y mediciones».

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
