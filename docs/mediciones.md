# Mediciones

Registro de las mediciones del proyecto. Cada sección indica qué se midió, con qué entorno, cómo repetirlo y qué se concluye.

---

## 1. RF-06 — Búsqueda de choferes cercanos (ADR-0006)

### 1.1 Qué se midió

El tiempo de responder «¿cuáles son los 10 choferes elegibles más cercanos a este punto, dentro de 5 km?», con dos mecanismos que implementan el mismo puerto (`BuscadorDeChoferesCercanos`):

| Mecanismo | Implementación | Cómo funciona |
|---|---|---|
| **A. PostGIS** | `src/infrastructure/adapters/out/geografia/postgis-buscador-de-choferes.js` | La base filtra con `ST_DWithin` usando el índice GiST de `ubicaciones_vigentes.posicion`, ordena con `<->` y corta con `LIMIT`. A Node llegan como máximo 10 filas. |
| **D. Filtrar en JavaScript** | `src/infrastructure/adapters/out/geografia/javascript-buscador-de-choferes.js` | Node trae **todos** los choferes elegibles y **todas** las ubicaciones, calcula la distancia de cada uno con Haversine, ordena y corta. Es lo que hace hoy el medidor de demanda de las cotizaciones. |

Los dos devuelven los mismos choferes; lo comprueba el test de paridad en `tests/integration/postgres/busqueda-cercanos.test.js`.

**Hipótesis** (ADR-0006, escrita antes de medir): con un índice espacial, la base descarta casi todos los choferes sin leerlos, así que el tiempo de A no debería crecer en proporción a la cantidad de choferes, mientras que el de D sí.

### 1.2 Entorno

| Dato | Valor |
|---|---|
| Fecha | 2026-11-23 |
| Máquina | Intel Core i5-14400F (16 núcleos), 12 GB asignados a WSL2 |
| SO del contenedor | Linux 6.18 (WSL2), x64 |
| Node.js | 22.23.4 (`node:22-alpine`) |
| Base | PostgreSQL 15.8 + PostGIS 3.4.3 (`postgis/postgis:15-3.4-alpine`, servicio `db-test` de `compose.test.yaml`) |
| Conexión | Node en un contenedor Docker → base de pruebas por `host.docker.internal:5433`. La latencia de red afecta a los dos mecanismos por igual. |

### 1.3 Datos y procedimiento

- Choferes habilitados, disponibles y libres, con ubicaciones al azar dentro de una caja de la Ciudad de Buenos Aires (lat −34,70 a −34,53; lng −58,53 a −58,34). Las coordenadas salen de un generador con semilla fija, así que **cada corrida usa exactamente los mismos puntos**.
- 300 búsquedas por corrida desde 300 orígenes al azar (también con semilla fija), radio de 5000 m y hasta 10 candidatos.
- **3 corridas por mecanismo** para cada tamaño (500 y 5000 choferes), después de 20 búsquedas de calentamiento.
- Antes de cada corrida se renuevan las ubicaciones (`actualizada_en = now()`), como hace un chofer real; si no, vencen a mitad de la medición (vigencia de 60 s).
- Se mide el tiempo de punta a punta de `buscar(...)` desde Node: consulta, transferencia y, en D, el cálculo en JavaScript.
- Los datos de la medición usan un prefijo propio en el email y se borran al terminar.

**Para repetirla:**

```bash
pnpm test:db:up
```

```bash
TEST_DATABASE_URL=postgresql://admin:password@127.0.0.1:5433/proy_db_test pnpm medir:busqueda
```

Opciones: `--choferes 500,5000`, `--busquedas 300` y `--repeticiones 3`. El script se niega a correr sin `TEST_DATABASE_URL`, para no tocar la base de desarrollo.

### 1.4 Resultados

Tiempos en milisegundos, desde Node.

**500 choferes**

| Mecanismo | Corrida | p50 | p95 | p99 | máx |
|---|---:|---:|---:|---:|---:|
| A. PostGIS | 1 | 1,59 | 1,91 | 2,15 | 5,29 |
| A. PostGIS | 2 | 1,59 | 1,98 | 2,50 | 4,83 |
| A. PostGIS | 3 | 1,70 | 2,01 | 2,21 | 2,34 |
| D. JavaScript | 1 | 5,37 | 7,02 | 8,12 | 10,46 |
| D. JavaScript | 2 | 5,84 | 8,18 | 9,13 | 9,54 |
| D. JavaScript | 3 | 5,73 | 8,64 | 9,81 | 14,68 |

**5000 choferes**

| Mecanismo | Corrida | p50 | p95 | p99 | máx |
|---|---:|---:|---:|---:|---:|
| A. PostGIS | 1 | 4,72 | 6,42 | 8,09 | 9,44 |
| A. PostGIS | 2 | 4,42 | 5,85 | 6,73 | 7,61 |
| A. PostGIS | 3 | 4,41 | 13,45 | 14,56 | 27,23 |
| D. JavaScript | 1 | 58,30 | 68,90 | 75,59 | 87,44 |
| D. JavaScript | 2 | 58,52 | 67,28 | 73,76 | 86,53 |
| D. JavaScript | 3 | 58,95 | 69,65 | 79,96 | 83,88 |

Todas las búsquedas encontraron 10 candidatos.

**Resumen** (mediana de las tres corridas):

| Choferes | A. PostGIS p50 / p95 | D. JavaScript p50 / p95 | D / A en p50 |
|---:|---:|---:|---:|
| 500 | 1,59 / 1,98 | 5,73 / 8,18 | 3,6 veces |
| 5000 | 4,42 / 6,42 | 58,52 / 68,90 | 13,2 veces |

Al multiplicar los choferes por 10, el p50 de **PostGIS crece unas 2,8 veces** y el de **JavaScript, unas 10,2 veces**: D es lineal en la cantidad de choferes y A no.

**Plan de ejecución** (`EXPLAIN (ANALYZE, BUFFERS)` de la consulta real, con 5000 choferes):

```text
Limit (actual time=2.565..2.576 rows=10)
  ->  Sort  Sort Key: (u.posicion <-> origen), u.chofer_id   Sort Method: top-N heapsort
        ->  Bitmap Heap Scan on ubicaciones_vigentes u (actual rows=792)
              Filter: (actualizada_en > ...) AND (SubPlan 1) AND st_dwithin(posicion, origen, 5000)
              Rows Removed by Filter: 334
              ->  Bitmap Index Scan on ubicaciones_vigentes_posicion_idx (actual rows=2220)
                    Index Cond: (posicion && _st_expand(origen, 5000))
              SubPlan 1
                ->  Index Scan using choferes_pkey on choferes c (loops=1126)
Execution Time: 2.631 ms
```

Se lee así: el índice GiST devuelve solo las ~2200 ubicaciones de la caja que rodea al círculo de 5 km (de 5000), el filtro exacto deja 792 y, por cada una, se valida al chofer con su clave primaria. En ningún momento se leen todos los choferes.

### 1.5 Hallazgo: la primera versión de la consulta era cuadrática

La primera versión del adaptador unía `ubicaciones_vigentes` con `choferes` mediante un `JOIN`. Con 500 choferes no se notaba, pero con 5000 **era más lenta que filtrar en JavaScript**:

| Versión de la consulta | 5000 choferes, p50 | Tiempo en la base (`EXPLAIN`) |
|---|---:|---:|
| `JOIN choferes` (primera versión) | 71,8 ms | 233 ms |
| `IN (subconsulta)` | ~100 ms en 26 de 40 puntos | ~294 ms en esos puntos |
| Subconsulta escalar (versión final) | **4,4 ms** | **2,6 ms** |

**Causa:** PostGIS subestima cuántas filas deja pasar `ST_DWithin` (estimaba 1 fila cuando eran 792). Con esa estimación, el planificador elegía cruzar los 5000 choferes contra las ubicaciones cercanas fila por fila: `Rows Removed by Join Filter: 3646764`. `IN (subconsulta)` no lo resolvía, porque PostgreSQL lo convierte en un join, y el plan malo aparecía o no **según el punto de la ciudad**: un rendimiento impredecible.

**Solución:** la elegibilidad del chofer pasó a ser una **subconsulta escalar** en el `WHERE`. PostgreSQL nunca la convierte en join: la evalúa una vez por ubicación cercana con la clave primaria, así que el costo queda lineal en los vecinos, sin importar la estimación. Con el diagnóstico de 40 orígenes al azar, 40 de 40 usaron el plan bueno (3,5 ms de promedio en la base con 5000 choferes).

**Lección:** que la consulta «use el índice» no alcanza. Hay que mirar el plan completo con datos de volumen realista.

### 1.6 Limitaciones y pendientes

- **El valor aislado de la corrida 3 de PostGIS con 5000 choferes** (p95 13,5 ms y máximo 27 ms, frente a ~6 ms en las otras) coincide con el `UPDATE` de 5000 ubicaciones antes de esa corrida. Probablemente sea el autovacuum limpiando esas filas, pero **no se verificó**.
- **No es una medición con carga concurrente.** Las búsquedas son secuenciales y no hay escrituras de ubicación en simultáneo. El ADR-0006 pide además medir con **500 choferes actualizando cada 2 segundos**: queda para la tarjeta «E4 · Simulador, carga y mediciones».
- **Una sola máquina, dentro de Docker en WSL2.** Los valores absolutos dependen del entorno. La comparación entre mecanismos es válida porque los dos corrieron en las mismas condiciones.
- **El medidor de demanda de las cotizaciones todavía filtra en JavaScript** (mecanismo D). Según esta medición, con 5000 choferes cuesta ~13 veces más que PostGIS por cada cotización. Se recomienda migrarlo a una consulta con `ST_Covers` y el mismo patrón de subconsulta escalar.
