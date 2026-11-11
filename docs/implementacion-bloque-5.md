# Implementación del Bloque 5 — Viajes, concurrencia e idempotencia

Este documento describe los cambios implementados para el Bloque 5 del backend de
viajes. El objetivo del bloque es permitir que un pasajero cree un pedido de viaje
de forma segura e idempotente, que un chofer lo acepte sin que dos personas se
queden con el mismo viaje y que una cancelación libere correctamente al chofer.

El trabajo se apoya sobre la arquitectura hexagonal y la infraestructura
incorporadas en los bloques anteriores:

- Dominio aislado de Express, PostgreSQL y librerías de infraestructura.
- Puertos de entrada y salida con adaptadores reales y falsos.
- Composición centralizada en `src/composition-root.js`.
- Variables de entorno validadas con Zod.
- Autenticación con JWT, autorización por recurso y rate limit en login.
- Logs JSON con correlation ID y cierre ordenado del proceso.

---

## 1. Resumen funcional

### Flujo principal

1. Un pasajero se registra o inicia sesión y obtiene un token JWT.
2. El pasajero crea un viaje con `POST /viajes` e incluye una cabecera
   `Idempotency-Key`.
3. El servidor calcula la distancia y el precio. El cliente nunca envía importes.
4. Un chofer habilitado y disponible consulta `GET /viajes/disponibles`.
5. El chofer acepta con `POST /viajes/:id/aceptar`.
6. Si dos choferes aceptan a la vez, exactamente uno gana.
7. El pasajero puede cancelar con `POST /viajes/:id/cancelar`. Si el viaje ya
   tenía chofer, se libera en la misma transacción.

### Decisiones de alcance

- La aceptación es directa por parte del chofer: `POST /viajes/:id/aceptar`.
  El flujo de ofertas con vencimiento queda para una etapa posterior.
- El precio se calcula siempre en el servidor con una tarifa fija provisional.
  La tarifa dinámica por demanda se incorporará más adelante.
- Un chofer recién registrado nace inhabilitado y no disponible. Un
  administrador debe habilitarlo antes de que pueda aceptar viajes.
- El perfil operativo del chofer se crea en la misma transacción que el usuario
  con rol `CHOFER`.

---

## 2. Dominio

### 2.1 `PuntoGeografico`

Archivo: `src/domain/value-objects/punto-geografico.js`

Value object inmutable que valida latitud y longitud y calcula la distancia
entre dos puntos con la fórmula de Haversine.

- Latitud entre `-90` y `90`.
- Longitud entre `-180` y `180`.
- Solo acepta números finitos.
- `distanciaA(otro)` devuelve metros.
- `aJSON()` devuelve `{ lat, lng }` para persistencia y respuestas HTTP.

### 2.2 `Viaje`

Archivo: `src/domain/entities/viaje.js`

Entidad inmutable: cada transición devuelve una copia con el nuevo estado.

Estados principales:

- `SOLICITADO`
- `ASIGNADO`
- `CANCELADO_POR_PASAJERO`
- `CANCELADO_POR_CHOFER`
- `CANCELADO_POR_SOPORTE`
- `SIN_CHOFERES_DISPONIBLES`
- `FINALIZADO`

Reglas implementadas:

- Un viaje `SOLICITADO` no tiene chofer.
- Un viaje `ASIGNADO` sí tiene chofer.
- `asignar(choferId, ahora)` solo funciona desde `SOLICITADO`; si ya fue
  asignado lanza `VIAJE_NO_DISPONIBLE`.
- `cancelarPorPasajero(ahora, motivo)` solo funciona desde estados no
  terminales; si el viaje ya terminó lanza `TRANSICION_INVALIDA`.
- La cancelación exige un motivo no vacío y registra `cerradoEn`.
- `esParticipante(usuarioId)` autoriza al pasajero y al chofer asignado.
- `aVistaPublica()` devuelve fechas ISO y puntos serializables.

### 2.3 `Chofer`

Archivo: `src/domain/entities/chofer.js`

Perfil operativo de un usuario con rol `CHOFER`.

Atributos:

- `usuarioId`: clave primaria y referencia al usuario.
- `habilitado`: lo decide un administrador.
- `disponible`: lo declara el propio chofer.
- `viajeActivoId`: única fuente de verdad sobre si está ocupado.

Estados derivados:

- `INHABILITADO`: no fue habilitado por un administrador.
- `NO_DISPONIBLE`: está habilitado pero no acepta viajes.
- `DISPONIBLE`: habilitado, disponible y libre.
- `OCUPADO`: tiene un `viajeActivoId`.

Reglas implementadas:

- Un chofer no habilitado no puede declararse disponible.
- `estaElegible()` exige habilitado, disponible y sin viaje activo.
- `ocupar(viajeId)` falla con `CHOFER_OCUPADO` si ya tiene un viaje activo.
- `liberar(viajeId)` solo libera si el viaje activo coincide.
- `conHabilitacion(false)` fuerza `disponible = false` y conserva el viaje
  activo si lo hubiera.

### 2.4 Precio base

Archivo: `src/domain/services/precio-base.js`

Calcula el precio en centavos:

```text
precio = base + (distanciaKm × precioPorKm)
```

Luego aplica el mínimo y el máximo configurados. Siempre devuelve un entero no
negativo. El cliente no puede enviar `precioFijadoCentavos`: el esquema HTTP es
estricto y rechaza campos no declarados.

---

## 3. Aplicación

### 3.1 Servicio de idempotencia

Archivo: `src/application/services/idempotencia.js`

- `canonicalizar(valor)` ordena las claves de los objetos de forma recursiva.
- `huellaContenido(valor)` calcula SHA-256 del JSON canónico.

Gracias a la canonicalización, dos cuerpos equivalentes producen la misma
huella aunque el cliente cambie el orden de las propiedades.

### 3.2 Crear viaje

Archivo: `src/application/use-cases/viajes/crear-viaje.js`

Alcance de la clave:

```text
viaje:crear:<pasajeroId>
```

Esto aísla las claves por pasajero: dos pasajeros pueden usar la misma
`Idempotency-Key` sin colisionar.

Flujo:

1. Exige `Idempotency-Key` no vacía.
2. Valida origen y destino.
3. Calcula distancia y precio en el servidor.
4. Dentro de una transacción:
   - Busca la clave en el repositorio de idempotencia.
   - Si existe y no venció, compara la huella:
     - misma huella → devuelve la respuesta original con `reutilizada = true`;
     - otra huella → `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`.
   - Si existe pero venció, la elimina y continúa.
   - Crea el viaje.
   - Registra la clave con la huella y la respuesta original.
   - Si otra transacción ganó la carrera por la clave, revierte todo y
     devuelve la respuesta ganadora.

Resultado HTTP:

- Creación original: `201`.
- Reintento idéntico: `200` con `Idempotency-Replayed: true`.
- Misma clave con otro contenido: `409`.

### 3.3 Aceptar viaje

Archivo: `src/application/use-cases/viajes/aceptar-viaje.js`

Orden global de bloqueo: **Viaje → Chofer**.

Dentro de una transacción:

1. Bloquea el viaje.
2. Verifica que exista y siga en `SOLICITADO`.
3. Bloquea al chofer.
4. Verifica que exista, esté habilitado, disponible y sin viaje activo.
5. Asigna el viaje.
6. Marca al chofer como ocupado.
7. Persiste ambas entidades.

Errores:

- `VIAJE_NO_DISPONIBLE`: el viaje ya no está `SOLICITADO`.
- `CHOFER_NO_ELEGIBLE`: no existe el perfil o no está habilitado/disponible.
- `CHOFER_OCUPADO`: el chofer ya tiene otro viaje activo.

### 3.4 Cancelar viaje

Archivo: `src/application/use-cases/viajes/cancelar-viaje.js`

Dentro de una transacción:

1. Bloquea el viaje.
2. Verifica que exista.
3. Verifica que el solicitante sea el pasajero dueño.
4. Cancela el viaje.
5. Si había chofer asignado, bloquea su perfil y lo libera.
6. Persiste el viaje y el chofer en la misma transacción.

Si la cancelación compite con una aceptación, el viaje termina cancelado y
ningún chofer queda ocupado. Si la aceptación llega después, recibe
`VIAJE_NO_DISPONIBLE`.

### 3.5 Otros casos de uso

- `obtener-viaje.js`: autoriza al pasajero, al chofer asignado, a un
  administrador o a un operador de soporte.
- `listar-viajes-disponibles.js`: solo responde a choferes habilitados,
  disponibles y libres.
- `obtener-perfil-chofer.js`: el chofer ve su perfil; un administrador puede
  ver el de cualquier chofer.
- `actualizar-disponibilidad-chofer.js`: solo el propio chofer puede cambiar su
  disponibilidad.
- `habilitar-chofer.js`: solo un administrador puede habilitar o inhabilitar.
- `auth/registrar-usuario.js`: crea usuario y perfil de chofer en la misma
  transacción cuando el rol es `CHOFER`.

---

## 4. Persistencia y transacciones

### 4.1 Puertos

- `src/application/ports/out/repositorio-usuarios.js`
- `src/application/ports/out/repositorio-choferes.js`
- `src/application/ports/out/repositorio-viajes.js`
- `src/application/ports/out/repositorio-claves-idempotencia.js`
- `src/application/ports/out/unidad-de-trabajo.js`

Todos los métodos de escritura y lectura transaccional aceptan un `ejecutor`
opcional. Es un contexto opaco que la unidad de trabajo pasa a los repositorios
para que participen de la misma transacción.

### 4.2 PostgreSQL

Adaptadores:

- `postgres-user-repository.js`
- `postgres-chofer-repository.js`
- `postgres-viaje-repository.js`
- `postgres-idempotency-repository.js`
- `postgres-unit-of-work.js`

Puntos clave:

- `buscarPorIdParaActualizar` y `buscarPorUsuarioIdParaActualizar` usan
  `SELECT ... FOR UPDATE`.
- La aceptación bloquea primero el viaje y después el chofer.
- La cancelación respeta el mismo orden.
- `PostgresDatabase.transaccion()` ejecuta `BEGIN`, `COMMIT` y `ROLLBACK`,
  libera la conexión y reintenta errores de serialización (`40001`) o
  interbloqueo (`40P01`) hasta dos veces.

### 4.3 Memoria

Adaptadores:

- `in-memory-user-repository.js`
- `in-memory-chofer-repository.js`
- `in-memory-viaje-repository.js`
- `in-memory-idempotency-repository.js`
- `in-memory-unit-of-work.js`

`InMemoryUnitOfWork`:

- Serializa las operaciones con una cola.
- Toma una instantánea de los repositorios participantes antes de ejecutar.
- Si la operación falla, restaura la instantánea completa.

Así los tests de concurrencia reproducen la misma garantía de atomicidad sin
necesitar PostgreSQL.

### 4.4 Restricciones en la base

Migración: `db/migrations/002_viajes.sql`

- Tabla `viajes` con checks de coordenadas, distancia, precio, estado y
  coherencia entre estado y presencia de chofer.
- Índice único parcial `viajes_chofer_activo_idx` para impedir dos viajes
  activos por chofer.
- Tabla `choferes` con `habilitado`, `disponible`, `viaje_activo_id` y check
  `NOT disponible OR habilitado`.
- Tabla `claves_idempotencia` con clave primaria compuesta
  `(alcance, clave)`.

---

## 5. Capa HTTP

### 5.1 Endpoints

| Método | Ruta | Autorización | Descripción |
|---|---|---|---|
| `POST` | `/viajes` | `PASAJERO` con `Idempotency-Key` | Crear un viaje. |
| `GET` | `/viajes/disponibles` | `CHOFER` habilitado y disponible | Listar viajes solicitados. |
| `GET` | `/viajes/:id` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` | Consultar un viaje. |
| `POST` | `/viajes/:id/aceptar` | `CHOFER` habilitado y disponible | Aceptar un viaje. |
| `POST` | `/viajes/:id/cancelar` | `PASAJERO` dueño | Cancelar un viaje. |
| `GET` | `/choferes/yo` | `CHOFER` | Ver el perfil operativo propio. |
| `PATCH` | `/choferes/yo` | `CHOFER` | Cambiar disponibilidad. |
| `PATCH` | `/choferes/:usuarioId/habilitacion` | `ADMINISTRADOR` | Habilitar o inhabilitar. |

### 5.2 Validación

Archivos:

- `src/infrastructure/adapters/in/http/schemas/viajes.schemas.js`
- `src/infrastructure/adapters/in/http/validation.js`

Los esquemas son estrictos:

- Rechazan campos no declarados.
- Rechazan importes enviados por el cliente.
- Validan coordenadas y motivos de cancelación.

### 5.3 Idempotencia en HTTP

`POST /viajes` lee la cabecera `Idempotency-Key` y la pasa al caso de uso.

- Primera creación: `201`.
- Replay: `200` y cabecera `Idempotency-Replayed: true`.
- Conflicto de contenido: `409`.

### 5.4 Errores nuevos

| Código | HTTP | Situación |
|---|---|---|
| `CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | `400` | Falta la cabecera. |
| `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | `409` | Misma clave, otro cuerpo. |
| `VIAJE_NO_DISPONIBLE` | `409` | El viaje ya no está disponible. |
| `CHOFER_NO_ELEGIBLE` | `409` | Chofer inexistente, inhabilitado o no disponible. |
| `CHOFER_OCUPADO` | `409` | El chofer ya tiene un viaje activo. |
| `TRANSICION_INVALIDA` | `409` | Transición de estado no permitida. |

---

## 6. Configuración

Archivo: `src/infrastructure/config/env.js`

Variables nuevas:

| Variable | Default | Descripción |
|---|---:|---|
| `TARIFA_BASE_CENTAVOS` | `100000` | Base del precio. |
| `TARIFA_POR_KM_CENTAVOS` | `50000` | Importe por kilómetro. |
| `TARIFA_MINIMO_CENTAVOS` | `150000` | Precio mínimo. |
| `TARIFA_MAXIMO_CENTAVOS` | `1000000` | Precio máximo. |
| `IDEMPOTENCIA_TTL_MS` | `86400000` | Vigencia de la clave (24 h). |

Validaciones:

- La tarifa mínima no puede superar a la máxima.
- El TTL debe estar entre 1 minuto y 7 días.
- En modo real siguen siendo obligatorias `DATABASE_URL` y `JWT_SECRET`.

También se actualizó `.env.example` y el `README.md` con los endpoints y las
garantías de concurrencia.

---

## 7. Composición

Archivo: `src/composition-root.js`

Es el único lugar que decide entre adaptadores reales y falsos según
`ADAPTERS_MODE`.

Cablea:

- Repositorios de usuarios, choferes, viajes e idempotencia.
- Unidad de trabajo real o en memoria.
- Casos de uso de viajes, choferes y autenticación.
- Chequeos de readiness de usuarios, choferes, viajes e idempotencia.
- Tarifas y TTL desde el entorno.

---

## 8. Pruebas

### 8.1 Tests de dominio

- `tests/unit/domain/viaje.test.js`
- `tests/unit/domain/chofer.test.js`
- `tests/unit/domain/precio-base.test.js`
- `tests/unit/domain/punto-geografico.test.js`

### 8.2 Tests de aplicación

- `tests/unit/application/idempotencia.test.js`
- `tests/unit/application/viajes/crear-viaje.test.js`
- `tests/unit/application/viajes/aceptar-viaje.test.js`
- `tests/unit/application/viajes/cancelar-viaje.test.js`
- `tests/unit/application/choferes/choferes.test.js`
- `tests/unit/application/auth/registrar-usuario.test.js`

Casos destacados:

- 50 aceptaciones simultáneas del mismo viaje dejan exactamente un ganador.
- Un chofer no puede aceptar dos viajes a la vez.
- Aceptación y cancelación simultáneas dejan el viaje cancelado y al chofer
  libre.
- Dos creaciones simultáneas con la misma clave generan un solo viaje.
- La misma clave con otro contenido se rechaza.
- Una clave vencida permite crear un viaje nuevo.
- El perfil de chofer se crea inhabilitado junto con el usuario.

### 8.3 Tests HTTP

- `tests/integration/viajes.test.js`
- `tests/helpers/viajes-kit.js`

Cubren el flujo completo por HTTP y la concurrencia con adaptadores en memoria.

### 8.4 Resultado

```text
pnpm test
132 tests
132 pass
0 fail
```

También pasan:

```text
pnpm lint
pnpm format:check
```

---

## 9. Verificación contra PostgreSQL real

Se ejecutó un script de extremo a extremo contra el contenedor
`prog4-puljiz-db`:

1. `/ready` con todos los chequeos en verde.
2. Registro y login de pasajero, dos choferes y administrador.
3. Perfil de chofer, habilitación por administrador y disponibilidad.
4. Creación idempotente, replay y conflicto de contenido.
5. Dos creaciones simultáneas con la misma clave → un solo viaje.
6. Dos aceptaciones simultáneas → exactamente un ganador.
7. Un chofer aceptando dos viajes a la vez → uno rechazado.
8. Cancelación liberando al chofer.

Además se verificó el cierre ordenado con `SIGTERM`: el servidor dejó de aceptar
conexiones y cerró los recursos sin errores.

---

## 10. Archivos principales

### Dominio

- `src/domain/entities/viaje.js`
- `src/domain/entities/chofer.js`
- `src/domain/value-objects/punto-geografico.js`
- `src/domain/services/precio-base.js`

### Aplicación

- `src/application/services/idempotencia.js`
- `src/application/use-cases/viajes/crear-viaje.js`
- `src/application/use-cases/viajes/aceptar-viaje.js`
- `src/application/use-cases/viajes/cancelar-viaje.js`
- `src/application/use-cases/viajes/obtener-viaje.js`
- `src/application/use-cases/viajes/listar-viajes-disponibles.js`
- `src/application/use-cases/choferes/obtener-perfil-chofer.js`
- `src/application/use-cases/choferes/actualizar-disponibilidad-chofer.js`
- `src/application/use-cases/choferes/habilitar-chofer.js`
- `src/application/use-cases/auth/registrar-usuario.js`

### Persistencia

- `src/infrastructure/adapters/out/persistence/postgres-user-repository.js`
- `src/infrastructure/adapters/out/persistence/postgres-chofer-repository.js`
- `src/infrastructure/adapters/out/persistence/postgres-viaje-repository.js`
- `src/infrastructure/adapters/out/persistence/postgres-idempotency-repository.js`
- `src/infrastructure/adapters/out/persistence/postgres-unit-of-work.js`
- `src/infrastructure/adapters/out/persistence/postgres-database.js`
- `src/infrastructure/adapters/out/persistence/in-memory-unit-of-work.js`
- `src/infrastructure/adapters/out/persistence/in-memory-chofer-repository.js`
- `src/infrastructure/adapters/out/persistence/in-memory-viaje-repository.js`
- `src/infrastructure/adapters/out/persistence/in-memory-idempotency-repository.js`

### HTTP

- `src/infrastructure/adapters/in/http/app.js`
- `src/infrastructure/adapters/in/http/routes/viajes.routes.js`
- `src/infrastructure/adapters/in/http/routes/choferes.routes.js`
- `src/infrastructure/adapters/in/http/schemas/viajes.schemas.js`
- `src/infrastructure/adapters/in/http/middlewares/authorization.js`
- `src/infrastructure/adapters/in/http/error-mapping.js`

### Configuración y composición

- `src/composition-root.js`
- `src/infrastructure/config/env.js`
- `.env.example`
- `db/migrations/002_viajes.sql`
- `README.md`

---

## 11. Trabajo pendiente

- Flujo de ofertas con vencimiento y aceptación exclusiva.
- Tarifa dinámica por demanda y cotizaciones.
- Seguimiento del viaje en tiempo real.
- Finalización del viaje y cobro simulado.
- Compose de test con PostgreSQL dedicado y tests de integración contra
  contenedores.
