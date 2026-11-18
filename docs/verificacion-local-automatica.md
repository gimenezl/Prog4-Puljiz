# Verificación local automática

Este documento explica `scripts/verificar-requerimientos.js`, un verificador
que levanta la aplicación real en un puerto efímero y recorre por HTTP los
requerimientos del trabajo final. A diferencia de `pnpm test`, que prueba cada
módulo de forma aislada, este script ejercita la API completa tal como la usaría
un cliente: autenticación, viajes, cobros, idempotencia, autorización, rate
limits, hardening y apagado ordenado.

La guía manual equivalente es
[`prueba-manual-requerimientos.md`](./prueba-manual-requerimientos.md). Los
casos automáticos usan los mismos identificadores `PM-01` a `PM-16` para que
sea fácil comparar ambos recorridos.

## 1. Requisitos

- Node.js 22 LTS.
- pnpm y las dependencias instaladas (`pnpm install`).
- Para el modo PostgreSQL: Docker (recomendado) o una base PostgreSQL
  descartable accesible por URL.

El modo por defecto **no necesita base de datos**: usa los adaptadores en
memoria (`ADAPTERS_MODE=fake`) en una instancia aislada.

### Estructura del verificador

- `scripts/verificar-requerimientos.js`: punto de entrada, ejecución de casos,
  resumen, códigos de salida y reporte.
- `scripts/verificacion/argumentos.js`: parseo estricto de opciones.
- `scripts/verificacion/contexto.js`: composición de la app, siembra de
  usuarios, puerto efímero y limpieza de PostgreSQL.
- `scripts/verificacion/utilidades.js`: cliente HTTP y aserciones.
- `scripts/verificacion/flujos.js`: helpers para crear, aceptar, finalizar y
  cancelar viajes.
- `scripts/verificacion/casos-*.js`: implementación de los casos `PM-01` a
  `PM-18`.

Los módulos son internos del script: para ejecutarlo alcanza con el punto de
entrada o con `pnpm verificar`.

## 2. Ejecución rápida

```bash
pnpm verificar
```

El script:

1. Compone la aplicación con adaptadores en memoria.
2. La escucha en `127.0.0.1` con un puerto libre elegido por el sistema.
3. Siembra usuarios de prueba directamente en los repositorios.
4. Ejecuta los casos `PM-01` a `PM-16` por HTTP.
5. Muestra un resultado por caso y un resumen.
6. Cierra el servidor y libera los recursos.

No usa el puerto `3000`, no lee el `.env` y no requiere que la app esté
levantada en otra terminal. Los usuarios se crean con emails del tipo
`verif-<sufijo>-pasajero@prog4.test`, donde el sufijo es distinto en cada
ejecución.

Salida esperada (abreviada):

```text
Verificación local de requerimientos
Modo: fake (adaptadores en memoria)
Casos: PM-01, ..., PM-18

[OK]      PM-01 Salud y readiness (38 ms)
[OK]      PM-02 Registro, login, perfil y autorización por recurso (36 ms)
...
[OMITIDO] PM-10 Invariantes del cobro y de la idempotencia en PostgreSQL - requiere --postgres
...
Resumen: 15 OK, 0 falla(s), 3 omitido(s) en 234 ms.
```

Los tres omitidos por defecto son `PM-10` (necesita PostgreSQL), `PM-17`
(necesita `--auditoria`) y `PM-18` (necesita `--suite`).

## 3. Modo PostgreSQL real

El modo real comprueba además que el cobro, la idempotencia y la liberación
del chofer quedan persistidos correctamente en la base.

```bash
pnpm test:db:up
pnpm verificar:postgres
pnpm test:db:down
```

La URL por defecto es la base de pruebas del proyecto:

```text
postgresql://admin:password@127.0.0.1:5433/proy_db_test
```

Se puede indicar otra base descartable con `TEST_DATABASE_URL`:

```bash
TEST_DATABASE_URL=postgresql://usuario:clave@127.0.0.1:5432/mi_base_de_prueba \
  pnpm verificar:postgres
```

En este modo el script aplica las migraciones con la misma lógica que
`pnpm db:migrate` (de forma idempotente) y usa los adaptadores reales. Al
finalizar elimina **solamente** los usuarios creados por esta ejecución y sus
viajes, choferes, cobros y claves de idempotencia asociadas. No borra datos
preexistentes.

Salida esperada (abreviada):

```text
Modo: PostgreSQL real
Base: 127.0.0.1:5433/proy_db_test

[OK]      PM-10 Invariantes del cobro y de la idempotencia en PostgreSQL (16 ms)
...
Datos de la ejecución eliminados de PostgreSQL (7 usuarios).

Resumen: 16 OK, 0 falla(s), 2 omitido(s) en 439 ms.
```

Si querés inspeccionar los datos después de la corrida, usá
`--conservar-datos`. El script muestra el sufijo de la ejecución en los
identificadores de los usuarios (`verif-<sufijo>-...`).

## 4. Opciones

| Opción | Efecto |
|---|---|
| `--postgres` | Usa PostgreSQL real y habilita `PM-10`. |
| `--auditoria` | Ejecuta `pnpm audit --prod` como `PM-17`. Requiere red. |
| `--suite` | Ejecuta `pnpm test` como `PM-18`. |
| `--solo=PM-01,PM-06` | Ejecuta únicamente los casos indicados. |
| `--detallado` | Muestra la evidencia de todos los casos, no solo de las fallas. |
| `--reporte=ruta.json` | Guarda el resultado completo en JSON. |
| `--conservar-datos` | No elimina los datos creados en PostgreSQL. |
| `--ayuda`, `-h` | Muestra la ayuda en la terminal. |

Ejemplos:

```bash
# Ver un caso puntual con toda su evidencia
pnpm verificar --solo=PM-08 --detallado

# PostgreSQL y reporte para adjuntar a la entrega
pnpm verificar --postgres --detallado --reporte=/tmp/verificacion.json

# Auditoría y suite, sin levantar la API
pnpm verificar --auditoria --suite --solo=PM-17,PM-18
```

## 5. Casos verificados

| Caso | Qué comprueba |
|---|---|
| `PM-01` | `GET /health` y `GET /ready`, con todos los chequeos de readiness en verde. |
| `PM-02` | Registro, email duplicado, contraseña inválida, login correcto/incorrecto, Bearer y perfil con autorización por recurso. |
| `PM-03` | Creación idempotente de viaje: primer `201`, replay `200`, conflicto por contenido, clave obligatoria y dos creaciones concurrentes con un solo viaje. |
| `PM-04` | Aceptación de viaje, estado `ASIGNADO`, chofer `OCUPADO`, lista de disponibles y liberación al cancelar. |
| `PM-05` | Matriz de autorización por rol y por recurso sobre viajes, usuarios y perfiles de chofer. |
| `PM-06` | Finalización atómica: viaje `FINALIZADO`, cobro `COBRADO`, monto, referencia `SIM-<viajeId>` y chofer libre. |
| `PM-07` | Replay de la finalización: mismo cobro, cabecera `Idempotency-Replayed` y sin segundo cobro. |
| `PM-08` | Conflicto por otra clave, reutilización de clave con otro viaje, cobro antes de finalizar, concurrencia y unicidad por viaje. |
| `PM-09` | Autorización del cobro: participantes y staff `200`; ajenos `403`; sin token `401`; inexistente `404`. |
| `PM-10` | Invariantes en PostgreSQL: una fila por viaje, `UNIQUE (viaje_id)`, índices, viaje finalizado, chofer liberado, clave vigente y cero huérfanos. Requiere `--postgres`. |
| `PM-11` | Rate limit de registro, `RateLimit-*` en respuestas exitosas y `Retry-After` en `429`. |
| `PM-12` | El límite de operaciones de viajes se comparte entre creación y aceptación. |
| `PM-13` | Rate limit de intentos fallidos de login. |
| `PM-14` | Payloads con `__proto__` y `constructor.prototype` se rechazan sin contaminar `Object.prototype`. |
| `PM-15` | `x-request-id` de extremo a extremo, Helmet, CORS, `413` por cuerpo grande y `400` por JSON malformado. |
| `PM-16` | Cierre ordenado con una conexión keep-alive inactiva, cierre idempotente y liberación de recursos. |
| `PM-17` | `pnpm audit --prod` sin vulnerabilidades altas ni críticas. Requiere `--auditoria`. |
| `PM-18` | `pnpm test` completo. Requiere `--suite`. |

La matriz de trazabilidad con los requerimientos del enunciado está en
[`prueba-manual-requerimientos.md`](./prueba-manual-requerimientos.md), sección
3. Los casos automáticos cubren los mismos escenarios, pero sin pasos manuales
de `curl`.

## 6. Reporte JSON

Con `--reporte` se genera un archivo con esta forma:

```json
{
  "generadoEn": "2026-11-13T12:00:00.000Z",
  "modo": "PostgreSQL real",
  "baseDeDatos": "127.0.0.1:5433/proy_db_test",
  "resumen": { "ok": 16, "fallas": 0, "omitidos": 2, "duracionMs": 439 },
  "resultados": [
    {
      "id": "PM-06",
      "titulo": "Finalizar viaje, cobrar y liberar al chofer",
      "estado": "OK",
      "duracionMs": 15,
      "evidencia": ["POST /viajes -> 201, viaje ...", "..."]
    }
  ],
  "advertencias": []
}
```

El reporte incluye la evidencia de todos los casos aunque no se haya usado
`--detallado`. Es útil para adjuntar a la entrega o para comparar dos
ejecuciones.

## 7. Códigos de salida

| Código | Significado |
|---|---|
| `0` | Todos los casos ejecutados pasaron. Puede haber casos omitidos. |
| `1` | Al menos un caso falló. |
| `2` | No se pudo iniciar la aplicación, la configuración es inválida o los argumentos son incorrectos. |

Un caso omitido no se considera una falla. Si se ejecuta con `--postgres`,
`--auditoria` o `--suite`, el caso correspondiente deja de omitirse.

## 8. Limpieza y seguridad de los datos

- En modo fake no se escribe nada fuera del proceso.
- En modo PostgreSQL cada usuario creado lleva el prefijo `verif-<sufijo>-`.
  La limpieza usa exactamente ese prefijo, más las claves de idempotencia
  `verif-<sufijo>-...`.
- La limpieza respeta el orden de dependencias: cobros, viajes, choferes,
  usuarios y claves de idempotencia.
- `--conservar-datos` omite el borrado y deja los datos para inspección.
- Aunque la base se llame `proy_db_test`, conviene usar una base descartable:
  las migraciones son idempotentes, pero el script no debe apuntarse a
  producción.

## 9. Diagnóstico rápido

### `No se pudo iniciar el entorno de verificación`

En modo fake suele indicar un error de composición o una dependencia faltante.
Ejecutá `pnpm install` y después `node scripts/verificar-requerimientos.js
--solo=PM-01 --detallado`.

En modo PostgreSQL revisá que la base esté levantada:

```bash
pnpm test:db:up
pg_isready -h 127.0.0.1 -p 5433
```

También podés probar la conexión con la URL que esté usando el script:

```bash
TEST_DATABASE_URL=postgresql://admin:password@127.0.0.1:5433/proy_db_test \
  pnpm verificar:postgres --solo=PM-01
```

### Un `429` inesperado

El flujo principal usa límites altos para no interferir con los casos. Los
casos de rate limit (`PM-11` a `PM-13`) usan una instancia auxiliar aparte con
límites bajos, así que no consumen el cupo del flujo principal. Si aparece un
`429` en otro caso, revisá que no haya otra instancia del script compartiendo
la misma IP y ventana de tiempo.

### `PM-17` falla por red

`pnpm audit --prod` consulta el registro de paquetes. Si no hay red, el caso
falla con un mensaje que lo indica. Ejecutá la verificación sin `--auditoria`
o repetí cuando la conexión esté disponible.

### `PM-18` falla

El caso devuelve el final de la salida de `pnpm test`. Para ver el detalle
completo ejecutá directamente:

```bash
pnpm test
```

Si la suite con PostgreSQL también debe correr, levantá la base y definí
`TEST_DATABASE_URL` antes de `pnpm test` o de `pnpm verificar --suite`.

### Quiero ver los datos que creó el script

```bash
pnpm verificar:postgres --conservar-datos --detallado
```

Después, en `psql`:

```sql
SELECT id, email, rol FROM usuarios WHERE email LIKE 'verif-%';
SELECT id, estado, pasajero_id, chofer_id FROM viajes ORDER BY solicitado_en DESC LIMIT 10;
SELECT viaje_id, monto_centavos, estado, referencia FROM cobros_simulados ORDER BY creado_en DESC LIMIT 10;
```

Para eliminarlos, usá el sufijo que muestra la salida o volvé a ejecutar sin
`--conservar-datos` con una corrida nueva. No borres datos que no tengan el
prefijo `verif-`.

## 10. Relación con las otras verificaciones

| Herramienta | Alcance | Cuándo usarla |
|---|---|---|
| `pnpm verificar` | API completa en memoria, PM-01 a PM-16. | Antes de entregar o después de un cambio. |
| `pnpm verificar:postgres` | API completa contra PostgreSQL, incluido PM-10. | Para validar persistencia, concurrencia y transacciones. |
| `pnpm test` | Suite unitaria, de integración y de arquitectura. | En cada cambio y en CI. |
| `docs/prueba-manual-requerimientos.md` | Recorrido manual con `curl` y consultas SQL. | Para defender el trabajo o diagnosticar un caso puntual. |
| `pnpm audit:prod` | Auditoría de dependencias de producción. | Antes de entregar. |

El verificador no reemplaza a la suite: la complementa con una prueba de caja
negra sobre la aplicación compuesta. Tampoco reemplaza la guía manual: usa los
mismos casos para que puedas comparar el resultado automático con el recorrido
paso a paso.
