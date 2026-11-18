# Verificación del estado actual y auditoría de los bloques 1 a 8

- **Fecha de verificación:** 11 de noviembre de 2026.
- **Rama:** `preparacion-de-entorno`.
- **Commit base:** `aed5e19` (`feat: dockerizar el arranque y documentar los bloques 1 y 3`).
- **Alcance de esta pasada:** verificar el funcionamiento del sistema y auditar el
  estado de los ocho bloques. **No se modificó código ni se hizo commit.**
- **Entorno:** Docker Compose, Node.js 22.23.4, pnpm 12.16.1, PostgreSQL 15.19.

---

## 1. Resumen ejecutivo

El sistema levanta, responde y pasa las suites automatizadas. Los bloques 1 a 4
están cumplidos. Los bloques 5, 6 y 8 tienen brechas puntuales. El **bloque 7
está ausente por completo**: no existe la versión ingenua de una tarea pesada,
no existe la versión optimizada, no hay mediciones y `docs/mediciones.md` está
vacío.

| Bloque | Estado | Resumen |
|---|---|---|
| 1. Proyecto y arranque | Cumplido | Docker, lockfile, scripts, arranque desde cero. |
| 2. Arquitectura hexagonal | Cumplido | Dominio aislado, puertos/adaptadores y composition root único. |
| 3. Configuración y ciclo de vida | Cumplido | Zod + exit code 1, `/health`, `/ready`, `SIGTERM`. |
| 4. Errores y observabilidad | Cumplido | Error handler único, logs JSON, `requestId`, sin stack en la respuesta. |
| 5. Seguridad | Parcial | Falta test de prototype pollution e inyección SQL; CORS queda en `*`. |
| 6. Concurrencia e idempotencia | Parcial | Falta el ADR de la carrera; 50 concurrentes solo en memoria, 20 en PostgreSQL real. |
| 7. Event loop y tareas pesadas | Ausente | No hay tarea pesada, ni versiones, ni mediciones, ni ADR. |
| 8. Tests | Parcial | 142 pruebas pasan, pero faltan dos tests de seguridad y un comando único por defecto. |

Además, los artefactos de proceso obligatorios están incompletos:

- `docs/adr/` está vacío: hay **0 de 6 ADR**.
- `docs/mediciones.md` está vacío (0 bytes).
- `docs/api.md` está vacío (0 bytes).
- `docs/ataque.md` está vacío (0 bytes).

---

## 2. Verificación automatizada

### 2.1 Comandos y resultados

| Comando | Resultado |
|---|---|
| `pnpm test` | **132 pass, 0 fail**. La suite de PostgreSQL real se marca `SKIP`. |
| `TEST_DATABASE_URL=postgresql://admin:password@127.0.0.1:5433/proy_db_test pnpm test` | **142 pass, 0 fail**. Corre todo, incluida la suite real. |
| `pnpm test:integration:db` | **10 pass, 0 fail**. Levanta PostgreSQL efímero, migra, prueba y lo baja. |
| `pnpm test:integration` | **29 pass, 0 fail**. PostgreSQL real `SKIP`. |
| `pnpm lint` | OK, sin errores. |
| `pnpm format:check` | OK, todo el código cumple Prettier. |
| `pnpm audit --prod` | `No known vulnerabilities found`. |
| `docker compose build` | OK, imagen multi-stage construida. |
| `docker compose up -d` | `app` y `db` en estado `healthy`. |
| `docker compose config --quiet` | OK. |

### 2.2 Lectura de los resultados

- Las 132 pruebas por defecto incluyen dominio, aplicación, integración con
  adaptadores falsos, arquitectura, configuración, salud, logging y seguridad.
- Las 10 pruebas de PostgreSQL real se ejecutan aparte con
  `pnpm test:integration:db`, o dentro de `pnpm test` si se define
  `TEST_DATABASE_URL`.
- El comando único exigido por el bloque 8 existe en la práctica, pero **no es
  el comando por defecto**: hay que exportar `TEST_DATABASE_URL` o ejecutar el
  runner específico. Esto se puede cerrar con un script `test:all` o haciendo
  que `test` levante la base efímera.
- La suite de PostgreSQL recrea el esquema antes de la corrida y limpia las
  tablas antes de cada test (`beforeEach` → `kit.limpiar()`), por lo que cada
  prueba parte de un estado conocido.

---

## 3. Verificación funcional contra los contenedores

Las pruebas se ejecutaron contra `prog4-puljiz-app` y `prog4-puljiz-db`, ambos
`healthy`, con la aplicación publicada en `http://localhost:3000`.

### 3.1 Salud y disponibilidad

```text
GET /health → 200
{"estado":"ok","tipo":"liveness","fecha":"..."}

GET /ready → 200
{"estado":"listo","tipo":"readiness","chequeos":{
  "baseDeDatos":{"ok":true},
  "usuarios":{"ok":true},
  "choferes":{"ok":true},
  "viajes":{"ok":true},
  "idempotencia":{"ok":true},
  "reloj":{"ok":true}
},"fecha":"..."}
```

### 3.2 Seed

El seed se ejecutó sobre una base ya cargada y fue idempotente:

```text
[seed] admin@prog4.test ya existía (ADMINISTRADOR); no se modificó.
[seed] soporte@prog4.test ya existía (OPERADOR_SOPORTE); no se modificó.
[seed] pasajero@prog4.test ya existía (PASAJERO); no se modificó.
[seed] chofer1@prog4.test ya existía (CHOFER); no se modificó.
[seed] chofer2@prog4.test ya existía (CHOFER); no se modificó.
```

Las cinco cuentas quedaron disponibles con las credenciales documentadas en el
README.

### 3.3 Autenticación y perfiles

| Prueba | Resultado |
|---|---|
| Login `pasajero@prog4.test` | 200, token válido. |
| `GET /auth/yo` como pasajero | 200, rol `PASAJERO`. |
| Login `chofer1@prog4.test` | 200, token válido. |
| `GET /choferes/yo` como chofer | 200, `habilitado=true`, `disponible=true`, estado `DISPONIBLE`. |
| Login `admin@prog4.test` | 200, token válido. |
| `GET /auth/yo` como administrador | 200, rol `ADMINISTRADOR`. |

### 3.4 Idempotencia de viajes

Se creó un viaje con la misma `Idempotency-Key` dos veces:

```text
Intento 1 → HTTP 201
Intento 2 → HTTP 200
Mismo id: true
Id: e4e347ba-ecee-4f6c-9001-1d6d0ed1dc72
```

El segundo intento devolvió el mismo viaje, sin crear un duplicado.

### 3.5 Autorización por recurso

Sobre un viaje real del pasajero:

| Sujeto | Resultado |
|---|---|
| Chofer ajeno al viaje | `403 NO_AUTORIZADO`. |
| Pasajero dueño | `200`. |
| Sin token | `401 NO_AUTENTICADO`. |

### 3.6 Validación de entrada

```text
POST /viajes con "campoExtra": true
→ 400 DATOS_INVALIDOS
→ "Datos inválidos: campos no permitidos: campoExtra"
```

La validación estricta con Zod rechaza campos no declarados.

### 3.7 Manejo de errores y correlación

Se envió un JSON inválido con `x-request-id: 11111111-2222-4333-8444-555555555555`:

```text
HTTP 400
x-request-id: 11111111-2222-4333-8444-555555555555
{"error":{"codigo":"CUERPO_INVALIDO","mensaje":"El cuerpo de la solicitud no es JSON válido."},
 "requestId":"11111111-2222-4333-8444-555555555555"}
```

El mismo identificador aparece en el log JSON de la solicitud y del error. La
respuesta no incluye stack trace ni detalles internos.

Una ruta inexistente devuelve:

```text
HTTP 404
{"error":{"codigo":"RECURSO_NO_ENCONTRADO","mensaje":"El recurso solicitado no existe."},
 "requestId":"..."}
```

### 3.8 Validación de entorno

```text
Configuración de entorno inválida: DATABASE_URL: Es obligatoria cuando
ADAPTERS_MODE=real; JWT_SECRET: Es obligatorio cuando ADAPTERS_MODE=real
exit_code=1
```

El mensaje nombra exactamente las variables faltantes y el proceso termina con
código distinto de cero.

### 3.9 Cierre ordenado

```text
docker compose stop app
{"level":30,...,"senal":"SIGTERM","msg":"Cierre ordenado iniciado"}
{"level":30,...,"senal":"SIGTERM","msg":"Cierre ordenado completado"}
```

Después se volvió a levantar el contenedor y quedó `healthy` en pocos segundos.

### 3.10 Pruebas manuales de seguridad

| Prueba | Resultado |
|---|---|
| `__proto__` en el cuerpo de registro | `400`, campo no permitido `__proto__`. |
| `constructor.prototype` anidado | `400`, campo no permitido `constructor`. |
| Email de login con `' OR 1=1 --` | `400`, email inválido. |
| ID de viaje con `' OR 1=1 --` | `400`, identificador inválido. |

El comportamiento manual es correcto. La brecha es que **no existen tests
automatizados que congelen estos casos** (ver bloque 5).

### 3.11 CORS

```text
GET /health con Origin: http://evil.example
→ Access-Control-Allow-Origin: *
```

`.env`, `.env.example` y el valor por defecto de `env.js` usan `CORS_ORIGIN=*`.
Esto contradice el requisito de restringir CORS a orígenes concretos.

### 3.12 Runtime de los contenedores

```text
Node.js v22.23.4
pnpm 12.16.1
uid=1000(node)
PostgreSQL 15.19
```

La aplicación corre como usuario `node`, no como root.

---

## 4. Auditoría por bloque

### Bloque 1 — Proyecto, dependencias y arranque: cumplido

- `Dockerfile` multi-stage sobre `node:22-alpine`.
- `pnpm-lock.yaml` versionado.
- `compose.yaml` con `app` y `db`, healthchecks y `depends_on: service_healthy`.
- Migraciones automáticas al arrancar el contenedor.
- Scripts de desarrollo, producción, base, seed, tests, lint y formato.
- Arranque desde una base vacía verificado en una pasada anterior.
- Seed idempotente verificado en esta pasada.

### Bloque 2 — Arquitectura hexagonal: cumplido

- `tests/architecture/boundaries.test.js` verifica que el dominio no importa
  Express, PostgreSQL ni capas externas, y que solo el composition root importa
  adaptadores de salida.
- Los adaptadores activos tienen versión real y falsa:
  - reloj: `SystemClock` / `FixedClock`;
  - IDs: `CryptoIdGenerator` / `InMemoryIdGenerator`;
  - persistencia: PostgreSQL / memoria;
  - hash: bcrypt / memoria;
  - tokens: JWT / memoria.
- `src/composition-root.js` es el único punto que decide entre `real` y `fake`.

Observación: existen puertos para funcionalidades todavía no implementadas
(`notificador`, `buscador-de-choferes-cercanos`, `estimador-de-recorrido`,
`simulador-de-cobro`, `zonas`, `almacenamiento-de-archivos`) que aún no tienen
adaptadores porque no hay dependencia externa activa. Al implementar esas
funcionalidades habrá que sumar el adaptador real y el falso correspondiente.

### Bloque 3 — Configuración y ciclo de vida: cumplido

- Validación con Zod en `src/infrastructure/config/env.js`.
- Error exacto y `exit_code=1` verificados.
- `/health` y `/ready` separados y con responsabilidades distintas.
- `/ready` comprueba base, tablas de migraciones y reloj.
- `SIGTERM` cierra ordenadamente y se registra en logs JSON.

### Bloque 4 — Errores y observabilidad: cumplido

- Un único `createErrorHandler` al final de la cadena.
- `async-handler.js` envuelve los handlers asincrónicos.
- Los errores de dominio se traducen a HTTP en `error-mapping.js`.
- Formato único de error con `codigo`, `mensaje` y `requestId`.
- Logs JSON con `pino` y propagación de contexto con `AsyncLocalStorage`.
- La respuesta nunca incluye stack trace ni mensaje crudo de PostgreSQL.
- Verificado con JSON inválido, 404, 401, 403 y validación estricta.

### Bloque 5 — Seguridad: parcial

Cumplido:

- JWT HS256 y contraseñas con bcrypt, costo 12.
- Cuatro roles (`ADMINISTRADOR`, `OPERADOR_SOPORTE`, `PASAJERO`, `CHOFER`) con
  permisos distintos y tabla de endpoints en el README.
- Autorización por recurso con tests de IDOR (403/404) y verificación manual.
- Validación estricta de cuerpo, ruta y query con Zod.
- Rate limit específico para login y rate limit global.
- Helmet configurado.
- `pnpm audit --prod` sin vulnerabilidades conocidas.
- Las consultas SQL están parametrizadas; no se encontraron interpolaciones de
  valores en las consultas.

Brechas:

1. **CORS abierto:** `CORS_ORIGIN=*` por defecto y en `.env.example`. El
   requisito pide orígenes concretos. Es un cambio de configuración pequeño,
   pero impacta la seguridad y debe corregirse antes de la entrega.
2. **Falta test de prototype pollution:** el comportamiento manual es correcto
   (400 y rechazo de `__proto__` / `constructor`), pero no hay un test
   automatizado que envíe esas cargas en distintas posiciones y verifique que el
   objeto global no se contamina.
3. **Falta test de inyección SQL:** no hay un test que envíe una carga típica en
   un campo de búsqueda. El proyecto no tiene endpoint de búsqueda; se puede
   agregar el test sobre login o sobre el identificador de viaje, o crear un
   endpoint de búsqueda si el alcance lo requiere.
4. **Rate limit en endpoints costosos:** el bloque 7 agregará una operación
   costosa; habrá que aplicarle un límite específico y demostrarlo.

### Bloque 6 — Concurrencia, consistencia e idempotencia: parcial

Cumplido:

- La carrera principal está resuelta con transacción y `SELECT ... FOR UPDATE`.
- Orden global de bloqueo Viaje → Chofer.
- Reintentos acotados ante serialización o interbloqueo.
- Test de 50 aceptaciones simultáneas en memoria: exactamente un ganador.
- Test de 20 aceptaciones concurrentes contra PostgreSQL real: exactamente un
  ganador.
- Test de un chofer aceptando dos viajes a la vez.
- Test de aceptación y cancelación simultáneas.
- Idempotencia de creación de viajes con test en memoria, integración HTTP y
  PostgreSQL real.

Brechas:

1. **Falta el ADR de la condición de carrera.** El README y los documentos
   explican el mecanismo, pero no existe el ADR obligatorio con alternativas
   descartadas y consecuencias.
2. **La prueba de 50 concurrentes contra PostgreSQL real no existe.** Hay 50 en
   memoria y 20 contra PostgreSQL. El requisito pide al menos 50 pedidos
   simultáneos; conviene llevar la prueba real a 50 para que sea indiscutible.

### Bloque 7 — Event loop y tareas pesadas: ausente

No se encontró ninguna implementación de:

- versión ingenua que bloquee el event loop;
- versión optimizada con chunking, streams, worker threads o cola;
- endpoint o job de tarea pesada;
- generador de carga (autocannon, k6 o equivalente);
- medición de `monitorEventLoopDelay`;
- medición de memoria;
- hipótesis, tabla de resultados y conclusión;
- ADR de la solución de la tarea pesada.

`docs/mediciones.md` está vacío y no hay dependencia de carga en
`package.json`. El bloque 7 es el requisito faltante más importante.

### Bloque 8 — Tests: parcial

Cumplido:

- Tests de dominio sin HTTP ni base de datos.
- Tests de aplicación con adaptadores en memoria.
- Tests de integración HTTP.
- Tests contra PostgreSQL real con esquema recreado y limpieza por test.
- Tests de autorización por recurso, rate limit, carrera e idempotencia.
- 142 pruebas pasan cuando se define `TEST_DATABASE_URL`.

Brechas:

1. **Comando único por defecto:** `pnpm test` omite las 10 pruebas de
   PostgreSQL. `pnpm test:integration:db` corre solo esas 10. Para cumplir
   estrictamente el "único comando que los corre todos", conviene un
   `pnpm test:all` que levante la base efímera, o hacer que `pnpm test` lo haga.
2. **Faltan tests de prototype pollution e inyección SQL** (ver bloque 5).
3. **Faltan los artefactos de documentación** asociados a los tests y a la
   entrega (ADR, mediciones, API, ataque).

---

## 5. Artefactos de proceso

| Artefacto | Estado | Observación |
|---|---|---|
| `README.md` | Cumplido | Comandos, roles, credenciales, índice de documentación. |
| `docs/modelo.md` | Cumplido | Modelo de dominio completo (85 KB). |
| `docs/adr/` | Vacío | 0 de 6 ADR obligatorios. |
| `docs/mediciones.md` | Vacío | 0 bytes. Requerido para el bloque 7 y la carrera. |
| `docs/api.md` | Vacío | 0 bytes. Requerido para documentar endpoints. |
| `docs/ataque.md` | Vacío | 0 bytes. Requerido para la fase de ataque cruzado. |
| `docs/implementacion-*.md` | Cumplido | Documentos internos de los bloques 1, 3, 5 y 6. |

Los ADR mínimos que faltan son:

1. Sistema de módulos (ESM).
2. Persistencia y acceso a datos (PostgreSQL y SQL directo).
3. Autenticación y autorización (JWT y autorización por recurso).
4. Resolución de la condición de carrera principal.
5. Solución de la tarea pesada (bloque 7).
6. Un ADR adicional a elección (por ejemplo, idempotencia o composición).

---

## 6. Bloque 7: propuesta de implementación (sin implementar)

> Esta sección es una propuesta. No se escribió código en esta pasada.

### 6.1 Aclaración sobre la tarea pesada obligatoria

El documento de requisitos disponible (`Requisitos del Proyecto Final de
Programación 4 [Extraído].docx`) contiene los requisitos comunes de la sección
4, pero **no incluye las secciones 5 y 6**, donde se define la tarea pesada
obligatoria de cada proyecto. El README del repositorio indica que este trabajo
corresponde a la sección 6, variante precio dinámico.

Antes de implementar hay que confirmar la tarea pesada exacta del enunciado. Si
no está disponible, se proponen alternativas alineadas con el dominio.

### 6.2 Opciones de tarea pesada

| Opción | Descripción | Ventaja | Costo |
|---|---|---|---|
| A. Recálculo de demanda por zona | Contar solicitudes y choferes por zona en una ventana y recalcular multiplicadores. | Es el corazón del precio dinámico y ya está en `docs/modelo.md`. | Requiere zonas, reglas y mediciones, que aún no están implementadas. |
| B. Reporte agregado de viajes | Recorrer un lote grande de viajes y calcular totales por estado, chofer y fecha. | Usa las tablas y el dominio actuales; es CPU-bound y fácil de medir. | Menos alineado con la tarea pesada específica del enunciado. |
| C. Cálculo masivo de tarifas | Calcular la tarifa final de un lote de viajes con `calcularPrecioBase`. | Reutiliza una función pura existente y es simple de testear. | Puede resultar artificial si no hay un caso de uso real. |

Recomendación: si el enunciado no impone otra cosa, empezar por la **opción B**
para cerrar el bloque 7 sin arrastrar toda la funcionalidad de precio dinámico.
Si la sección 6 exige el recálculo de demanda, implementar la **opción A** y
considerar que también avanza el precio dinámico.

### 6.3 Estrategia recomendada

Para la primera implementación se recomienda **chunking con `setImmediate`**:

- La tarea se parte en lotes pequeños.
- Entre lote y lote se devuelve el control al event loop.
- `/health` y `/ready` siguen respondiendo durante el procesamiento.
- No agrega infraestructura nueva (Redis, workers, colas).

Costo: no hay paralelismo real; el CPU total sigue en el hilo principal y el
throughput puede bajar. Si la medición muestra que el throughput cae demasiado,
la alternativa es **worker threads**, que sí mueve el CPU fuera del hilo
principal a cambio de serialización y gestión de ciclo de vida.

Las otras dos estrategias se descartan para este caso:

- **Streams:** útiles para I/O o para no cargar datos en memoria, pero no
  resuelven por sí solos una tarea CPU-bound.
- **Cola con worker separado:** es la solución más robusta para producción,
  pero agrega Redis o una tabla de trabajos y un proceso adicional; es
  desproporcionada para el alcance actual.

### 6.4 Diseño propuesto

1. **Puerto de aplicación** `EjecutorDeTareaPesada` con dos adaptadores:
   - `EjecutorBloqueante` (versión ingenua, solo para medición).
   - `EjecutorPorLotes` (versión optimizada con chunking).
2. **Caso de uso** `recalcularDemanda` o `generarReporteDeViajes`, según la
   opción elegida.
3. **Endpoint administrativo** protegido con rol `ADMINISTRADOR`:
   - `POST /admin/tareas-pesadas` con `{ "tipo": "...", "estrategia": "bloqueante|por-lotes" }`.
   - La estrategia `bloqueante` solo se habilita en desarrollo o con una
     variable de entorno explícita.
   - Respuesta `202` con `jobId` para la versión por lotes; `200` para la
     versión bloqueante.
   - `GET /admin/tareas-pesadas/:jobId` para consultar estado y progreso.
4. **Rate limit específico** para el endpoint costoso.
5. **Métricas** `GET /admin/metricas` o log periódico con:
   - `monitorEventLoopDelay` (máximo y p99);
   - `process.memoryUsage()` (RSS y heap usado);
   - estado del job.
6. **Script de medición** `scripts/medir-tarea-pesada.js`:
   - lanza carga con autocannon durante 30 segundos;
   - dispara la tarea pesada;
   - muestrea latencia de `/health`, RPS, lag y memoria;
   - imprime una tabla y permite repetir la corrida 3 veces.
7. **Documentación:** `docs/mediciones.md` con hipótesis previa, entorno,
   comandos exactos, tabla de resultados y conclusión; ADR de la estrategia.

### 6.5 Métricas exigidas

| Métrica | Cómo se obtiene |
|---|---|
| p50, p95 y p99 de `/health` | Autocannon. |
| Pedidos por segundo | Autocannon. |
| Lag del event loop (máximo y p99) | `monitorEventLoopDelay` en el proceso. |
| Memoria usada | `process.memoryUsage()` (RSS y heap). |

### 6.6 Hipótesis propuestas (a congelar antes de medir)

- **H1:** con la versión bloqueante, el p99 de `/health` superará los 1000 ms y
  el lag máximo del event loop superará los 500 ms mientras corre la tarea.
- **H2:** con la versión por lotes, el p99 de `/health` se mantendrá por debajo
  de los 200 ms y el RPS no caerá más del 30 % respecto de la línea base.
- **H3:** la memoria de la versión por lotes no crecerá más de 100 MB respecto
  de la línea base.

Estos números son una propuesta. Deben escribirse antes de la primera medición
y no ajustarse después de ver los resultados.

### 6.7 Criterios de aceptación del bloque 7

- Existe una versión ingenua que bloquea y se midió.
- Existe una versión optimizada que no degrada `/health` de forma intolerable.
- La estrategia está justificada en un ADR con alternativas.
- Hay al menos tres corridas de 30 segundos por versión.
- `docs/mediciones.md` contiene hipótesis, entorno, comandos, tabla y conclusión.
- La comparación incluye p50, p95, p99, RPS, lag y memoria.
- El endpoint costoso tiene rate limit y autorización de administrador.

---

## 7. Brechas y prioridad sugerida

| Prioridad | Brecha | Impacto |
|---|---|---|
| 1 | Implementar el bloque 7 completo | Es el único bloque ausente; sin él la nota grupal queda limitada. |
| 2 | Crear los 6 ADR | Artefacto obligatorio; 30 % de la nota de procesos. |
| 3 | Corregir CORS y agregar tests de prototype pollution e inyección | Bloque 5 y 8; seguridad evaluada y atacada. |
| 4 | Llevar la prueba de concurrencia real a 50 pedidos y agregar el ADR de carrera | Bloque 6; requisito explícito. |
| 5 | Unificar el comando de tests | Bloque 8; reproducibilidad. |
| 6 | Completar `docs/api.md` y `docs/mediciones.md` | Documentación mínima y reproducibilidad. |
| 7 | Completar `docs/ataque.md` cuando se haga la fase de ataque | Artefacto obligatorio de la sección 8. |

---

## 8. Conclusión

El sistema **funciona**: levanta con Docker Compose, pasa 142 pruebas cuando se
incluye PostgreSQL real, responde `/health` y `/ready`, aplica autorización por
recurso, valida entradas, es idempotente y cierra ordenadamente con `SIGTERM`.

No está completo para la entrega final. El bloque 7 no existe, los artefactos
de proceso están vacíos y hay brechas concretas en los bloques 5, 6 y 8. La
prioridad es implementar la tarea pesada con sus dos versiones y mediciones, y
luego cerrar los ADR y los tests de seguridad faltantes.

**Esta pasada no modificó código ni creó commits.** El único archivo nuevo es
este documento de verificación.
