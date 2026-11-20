# Guía de prueba de la aplicación y rutas implementadas

Esta guía reúne los comandos para levantar el backend y probar las
funcionalidades ya implementadas desde una terminal, junto con el listado de
rutas disponibles y ejemplos de `curl`.

- **Proyecto:** `Prog4-Puljiz`
- **Ruta:** `/home/guido/Documentos/Programacion/Prog_4/TrabajoFinal/Prog4-Puljiz`
- **Base URL:** `http://localhost:3000`
- **Requisitos:** Docker, Docker Compose, Node.js 22 y pnpm (para los tests).
- **Herramientas de los ejemplos:** `curl` y `jq`.

> Esta guía cubre las funcionalidades implementadas, incluidas la configuración
> administrativa y el flujo cotizar → confirmar (rama E2). Las rutas de tarea
> pesada del Bloque 7 todavía no existen. `POST /viajes` se conserva como ruta
> legacy/provisional: para precio dinámico usá `/cotizaciones`.

---

## 1. Ubicación del proyecto

```bash
cd /home/guido/Documentos/Programacion/Prog_4/TrabajoFinal/Prog4-Puljiz
```

---

## 2. Arrancar todo con Docker

```bash
# Opcional: crear el .env local
cp .env.example .env

# Construir y levantar app + PostgreSQL
docker compose up -d --build

# Ver estado y healthchecks
docker compose ps

# Ver logs JSON de la aplicación
docker compose logs -f app
```

La aplicación queda disponible en `http://localhost:3000` y PostgreSQL en
`localhost:5432`.

### 2.1 Cargar datos de prueba

```bash
docker compose exec app pnpm db:seed
```

El seed es idempotente: si las cuentas ya existen, no las duplica ni modifica.
Además de las cuentas, publica la configuración inicial necesaria para cotizar:

- zona `Centro`: polígono en `lat -34.62…-34.59`, `lng -58.40…-58.36`;
- tarifa versión 1: `base 100000`, `porKm 50000`, `porMinuto 10000`,
  `precioMaximo 1000000` centavos;
- regla versión 1: umbrales `0.5` y `3`, multiplicador entre `1` y `2`, escala 2.

Los importes están en centavos y los decimales viajan como texto. Si la
configuración ya existe, el seed no la duplica.

### 2.2 Detener y bajar

```bash
# Detener la app con SIGTERM (cierre ordenado)
docker compose stop app

# Volver a levantarla
docker compose up -d app

# Bajar todo sin borrar datos
docker compose down

# Bajar todo y borrar el volumen de PostgreSQL
docker compose down -v
```

### 2.3 Ejecución local sin el contenedor de la app

```bash
cp .env.example .env
pnpm install
pnpm db:prepare
pnpm db:seed
pnpm dev
```

---

## 3. Credenciales de prueba

| Rol | Email | Contraseña |
|---|---|---|
| `ADMINISTRADOR` | `admin@prog4.test` | `Admin1234!` |
| `OPERADOR_SOPORTE` | `soporte@prog4.test` | `Soporte1234!` |
| `PASAJERO` | `pasajero@prog4.test` | `Pasajero1234!` |
| `CHOFER` | `chofer1@prog4.test` | `Chofer1234!` |
| `CHOFER` | `chofer2@prog4.test` | `Chofer1234!` |

---

## 4. Comandos de tests y calidad

Se ejecutan en el host, no dentro del contenedor:

```bash
pnpm install

# Suite principal: 207 tests, con 3 suites PostgreSQL omitidas sin TEST_DATABASE_URL
pnpm test

# Tests de integración y arquitectura (adaptadores falsos)
pnpm test:integration

# PostgreSQL real efímero: levanta, migra, prueba y baja solo (25 tests)
pnpm test:integration:db

# Verificación local de requerimientos: 15 OK, 0 fallas, 3 omitidos
pnpm verificar

# Calidad
pnpm lint
pnpm format:check
pnpm audit --prod
```

Si querés conservar la base efífera para inspeccionarla:
`KEEP_TEST_DB=1 pnpm test:integration:db`. Para usarla manualmente,
`pnpm test:db:up`, definí `TEST_DATABASE_URL` y corré `pnpm test`, y después
`pnpm test:db:down`.

---

## 5. Rutas implementadas

| Método | Ruta | Acceso | Cuerpo / notas |
|---|---|---|---|
| `GET` | `/health` | Público | Liveness. No consulta la base. |
| `GET` | `/ready` | Público | Readiness. Consulta base, tablas y reloj. |
| `POST` | `/auth/registro` | Público | `{ email, nombre, contrasena, rol }` — `rol`: `PASAJERO` o `CHOFER`. |
| `POST` | `/auth/login` | Público | `{ email, contrasena }`. Devuelve `token`. Tiene rate limit. |
| `GET` | `/auth/yo` | Bearer | Perfil del usuario autenticado. |
| `GET` | `/usuarios/:id` | Dueño o `ADMINISTRADOR` | Perfil de usuario. |
| `PATCH` | `/usuarios/:id` | Solo dueño | `{ nombre }`. |
| `GET` | `/choferes/yo` | `CHOFER` | Perfil operativo del chofer. |
| `PATCH` | `/choferes/yo` | `CHOFER` | `{ disponible: true/false }`. |
| `PATCH` | `/choferes/:usuarioId/habilitacion` | `ADMINISTRADOR` | `{ habilitado: true/false }`. Usa el ID de usuario, no el ID del perfil. |
| `POST` | `/viajes` | `PASAJERO` | `{ origen:{lat,lng}, destino:{lat,lng} }` + header `Idempotency-Key`. Ruta **legacy**: tarifa provisional, sin cotización ni multiplicador. |
| `GET` | `/viajes/disponibles` | `CHOFER` habilitado y disponible | Lista viajes `SOLICITADO`. |
| `GET` | `/viajes/:id` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` | Detalle del viaje. |
| `POST` | `/viajes/:id/aceptar` | `CHOFER` habilitado y disponible | Sin cuerpo. |
| `POST` | `/viajes/:id/finalizar` | Chofer asignado | Sin cuerpo + header `Idempotency-Key`. |
| `GET` | `/viajes/:id/cobro` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` | Cobro simulado del viaje. |
| `POST` | `/viajes/:id/cancelar` | `PASAJERO` dueño | `{ motivo }`. |
| `POST` | `/cotizaciones` | `PASAJERO` | `{ origen:{lat,lng}, destino:{lat,lng} }`. Calcula precio, multiplicador y trazabilidad. |
| `GET` | `/cotizaciones` | `PASAJERO` | Lista solo las cotizaciones propias, con estado efectivo. |
| `GET` | `/cotizaciones/:id` | Dueño, `OPERADOR_SOPORTE` o `ADMINISTRADOR` | Detalle de la cotización; `VENCIDA` si pasó `venceEn`. |
| `POST` | `/cotizaciones/:id/confirmar` | `PASAJERO` dueño | Sin cuerpo + header `Idempotency-Key`. Crea el viaje copiando precio y multiplicador. |
| `GET` | `/admin/configuracion/zonas` | `ADMINISTRADOR` | Lista zonas. |
| `POST` | `/admin/configuracion/zonas` | `ADMINISTRADOR` | `{ nombre, criterio:{tipo:"POLIGONO",puntos:[{lat,lng},…]}, activa? }`. |
| `PATCH` | `/admin/configuracion/zonas/:id` | `ADMINISTRADOR` | Al menos uno de `nombre`, `criterio`, `activa`. |
| `GET` | `/admin/configuracion/tarifas` | `ADMINISTRADOR` | Lista borradores y versiones publicadas. |
| `POST` | `/admin/configuracion/tarifas` | `ADMINISTRADOR` | `{ baseCentavos, porKmCentavos, porMinutoCentavos, precioMaximoCentavos }`. |
| `PATCH` | `/admin/configuracion/tarifas/:id` | `ADMINISTRADOR` | Edita solo borradores. |
| `POST` | `/admin/configuracion/tarifas/:id/publicar` | `ADMINISTRADOR` | Sin cuerpo; fija versión y fechas en el servidor. |
| `GET` | `/admin/configuracion/reglas` | `ADMINISTRADOR` | Lista reglas. |
| `POST` | `/admin/configuracion/reglas` | `ADMINISTRADOR` | `{ umbralInferior, umbralSuperior, multiplicadorMinimo, multiplicadorMaximo, escalaMultiplicador }`. |
| `PATCH` | `/admin/configuracion/reglas/:id` | `ADMINISTRADOR` | Edita solo borradores. |
| `POST` | `/admin/configuracion/reglas/:id/publicar` | `ADMINISTRADOR` | Cuerpo opcional `{ motivo }`. |

El `GET /ready` informa los chequeos `zonas`, `tarifas`, `reglas` y
`cotizaciones` además de la base y el reloj. Configuración y cotizaciones son de
acceso exclusivo del administrador y del pasajero respectivamente; el
`OPERADOR_SOPORTE` **no** puede leer `/admin/configuracion/**`.

El registro y las operaciones costosas tienen rate limit propio. El contador
«de viajes» es compartido por `POST /viajes`, aceptar, finalizar, cancelar,
`POST /cotizaciones`, confirmar y las escrituras de configuración. Las respuestas
incluyen `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`; al superar
el límite, `429` agrega `Retry-After`.

---

## 6. Flujo completo con `curl`

Los ejemplos requieren `jq`, que ya está instalado en la máquina.

### 6.1 Variables base y login

```bash
BASE=http://localhost:3000

TOKEN_PASAJERO=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"pasajero@prog4.test","contrasena":"Pasajero1234!"}' | jq -r '.token')

TOKEN_CHOFER=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"chofer1@prog4.test","contrasena":"Chofer1234!"}' | jq -r '.token')

TOKEN_ADMIN=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@prog4.test","contrasena":"Admin1234!"}' | jq -r '.token')

TOKEN_SOPORTE=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"soporte@prog4.test","contrasena":"Soporte1234!"}' | jq -r '.token')

echo "Pasajero: ${TOKEN_PASAJERO:0:20}..."
echo "Chofer:   ${TOKEN_CHOFER:0:20}..."
echo "Admin:    ${TOKEN_ADMIN:0:20}..."
echo "Soporte:  ${TOKEN_SOPORTE:0:20}..."
```

La respuesta del login tiene esta forma:

```json
{
  "tipo": "Bearer",
  "token": "eyJ...",
  "expiraEn": "2026-11-11T16:00:00.000Z",
  "usuario": {
    "id": "...",
    "email": "pasajero@prog4.test",
    "nombre": "Pasajero de prueba",
    "rol": "PASAJERO",
    "creadoEn": "2026-11-11T14:47:58.691Z"
  }
}
```

### 6.2 Salud y perfiles

```bash
curl -s "$BASE/health" | jq
curl -s "$BASE/ready" | jq

curl -s "$BASE/auth/yo" -H "authorization: Bearer $TOKEN_PASAJERO" | jq
curl -s "$BASE/choferes/yo" -H "authorization: Bearer $TOKEN_CHOFER" | jq
curl -s "$BASE/auth/yo" -H "authorization: Bearer $TOKEN_ADMIN" | jq
```

### 6.3 Crear un viaje con la ruta legacy y probar idempotencia

Esta ruta usa la tarifa provisional por distancia, sin cotización ni
multiplicador. El flujo con precio dinámico está en §6.9.

```bash
CLAVE="demo-$(date +%s)"

VIAJE_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')

echo "$VIAJE_JSON" | jq
VIAJE_ID=$(echo "$VIAJE_JSON" | jq -r '.viaje.id')
echo "Viaje: $VIAJE_ID"
```

Ejemplo de respuesta:

```json
{
  "viaje": {
    "id": "e4e347ba-ecee-4f6c-9001-1d6d0ed1dc72",
    "pasajeroId": "...",
    "origen": { "lat": -34.6037, "lng": -58.3816 },
    "destino": { "lat": -34.6083, "lng": -58.3712 },
    "distanciaEstimadaM": 1081,
    "precioFijadoCentavos": 154050,
    "cotizacionId": null,
    "multiplicadorFijado": "1.0000",
    "choferId": null,
    "estado": "SOLICITADO",
    "solicitadoEn": "2026-11-11T14:48:11.155Z",
    "asignadoEn": null,
    "cerradoEn": null,
    "canceladoPorId": null,
    "motivoCancelacion": null
  }
}
```

Repetir exactamente la misma petición para ver el replay idempotente:

```bash
curl -s -i -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}' \
  | sed -n '1,15p'
```

Esperado: `HTTP/1.1 200`, cabecera `Idempotency-Replayed: true` y el mismo
`id`.

### 6.4 Listar, aceptar, consultar y cancelar

```bash
# Chofer ve los viajes disponibles
curl -s "$BASE/viajes/disponibles" \
  -H "authorization: Bearer $TOKEN_CHOFER" | jq

# Chofer acepta el viaje
curl -s -X POST "$BASE/viajes/$VIAJE_ID/aceptar" \
  -H "authorization: Bearer $TOKEN_CHOFER" | jq

# Pasajero consulta el viaje
curl -s "$BASE/viajes/$VIAJE_ID" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq

# Pasajero cancela el viaje (libera al chofer)
curl -s -X POST "$BASE/viajes/$VIAJE_ID/cancelar" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -d '{"motivo":"Demo desde terminal"}' | jq

# Verificar que el chofer quedó libre
curl -s "$BASE/choferes/yo" \
  -H "authorization: Bearer $TOKEN_CHOFER" | jq
```

> Si el chofer ya tiene un viaje activo, `aceptar` devuelve `409 CHOFER_OCUPADO`.
> En ese caso usá `chofer2@prog4.test` o cancelá el viaje activo del chofer.

### 6.5 Finalizar un viaje y consultar el cobro

Se crea un viaje nuevo, se acepta y se finaliza. La finalización exige una
`Idempotency-Key`; el replay devuelve la misma respuesta y no cobra dos veces.

```bash
CLAVE_VIAJE="demo-cobro-$(date +%s)"

VIAJE_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_VIAJE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')

VIAJE_ID=$(echo "$VIAJE_JSON" | jq -r '.viaje.id')

curl -s -X POST "$BASE/viajes/$VIAJE_ID/aceptar" \
  -H "authorization: Bearer $TOKEN_CHOFER" | jq

CLAVE_FINAL="final-$(date +%s)"

# Finalizar y cobrar
curl -s -i -X POST "$BASE/viajes/$VIAJE_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER" \
  -H "Idempotency-Key: $CLAVE_FINAL" | sed -n '1,20p'

# Replay: mismo 200, cabecera Idempotency-Replayed: true y mismo cobro
curl -s -i -X POST "$BASE/viajes/$VIAJE_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER" \
  -H "Idempotency-Key: $CLAVE_FINAL" | sed -n '1,20p'

# El pasajero consulta el cobro
curl -s "$BASE/viajes/$VIAJE_ID/cobro" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq
```

Esperado: el viaje queda `FINALIZADO`, el cobro queda `COBRADO` con referencia
`SIM-<viajeId>`, el chofer vuelve a `DISPONIBLE` y el reintento devuelve
`Idempotency-Replayed: true`.

### 6.6 Usuarios y autorización por recurso

```bash
PASAJERO_ID=$(curl -s "$BASE/auth/yo" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq -r '.usuario.id')

# El dueño puede verse
curl -s "$BASE/usuarios/$PASAJERO_ID" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq

# El dueño puede editar solo su nombre
curl -s -X PATCH "$BASE/usuarios/$PASAJERO_ID" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -d '{"nombre":"Pasajero Demo"}' | jq

# Un chofer no puede ver el usuario del pasajero: debe dar 403
curl -s -o /dev/null -w 'IDOR chofer: %{http_code}\n' \
  "$BASE/usuarios/$PASAJERO_ID" \
  -H "authorization: Bearer $TOKEN_CHOFER"

# El administrador sí puede verlo
curl -s "$BASE/usuarios/$PASAJERO_ID" \
  -H "authorization: Bearer $TOKEN_ADMIN" | jq
```

### 6.7 Registrar un chofer y habilitarlo

```bash
EMAIL="chofer-nuevo-$(date +%s)@prog4.test"

REGISTRO=$(curl -s -X POST "$BASE/auth/registro" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"nombre\":\"Chofer Nuevo\",\"contrasena\":\"Segura123\",\"rol\":\"CHOFER\"}")

echo "$REGISTRO" | jq
NUEVO_ID=$(echo "$REGISTRO" | jq -r '.usuario.id')

# Login del chofer nuevo
TOKEN_NUEVO=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"contrasena\":\"Segura123\"}" | jq -r '.token')

# Al crearse queda habilitado=false y disponible=false
curl -s "$BASE/choferes/yo" -H "authorization: Bearer $TOKEN_NUEVO" | jq

# El administrador lo habilita
curl -s -X PATCH "$BASE/choferes/$NUEVO_ID/habilitacion" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_ADMIN" \
  -d '{"habilitado":true}' | jq

# El chofer se declara disponible
curl -s -X PATCH "$BASE/choferes/yo" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_NUEVO" \
  -d '{"disponible":true}' | jq
```

### 6.8 Configuración administrativa

```bash
# El seed ya publicó zona, tarifa y regla
curl -s "$BASE/admin/configuracion/zonas" \
  -H "authorization: Bearer $TOKEN_ADMIN" | jq
curl -s "$BASE/admin/configuracion/tarifas" \
  -H "authorization: Bearer $TOKEN_ADMIN" | jq
curl -s "$BASE/admin/configuracion/reglas" \
  -H "authorization: Bearer $TOKEN_ADMIN" | jq

# La configuración es exclusiva del administrador: debe dar 403
curl -s -o /dev/null -w 'config soporte: %{http_code}\n' \
  "$BASE/admin/configuracion/zonas" \
  -H "authorization: Bearer $TOKEN_SOPORTE"
```

Si querés probar el ciclo completo, creá un borrador de tarifa y publicalo. La
versión la asigna la base de datos, no el cliente:

```bash
NUEVA_TARIFA=$(curl -s -X POST "$BASE/admin/configuracion/tarifas" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_ADMIN" \
  -d '{"baseCentavos":120000,"porKmCentavos":50000,"porMinutoCentavos":10000,"precioMaximoCentavos":1200000}')

echo "$NUEVA_TARIFA" | jq
TARIFA_ID=$(echo "$NUEVA_TARIFA" | jq -r '.tarifa.id')

curl -s -X POST "$BASE/admin/configuracion/tarifas/$TARIFA_ID/publicar" \
  -H "authorization: Bearer $TOKEN_ADMIN" | jq

# Editar una versión publicada debe dar 409 VERSION_YA_PUBLICADA
curl -s -o /dev/null -w 'editar publicada: %{http_code}\n' \
  -X PATCH "$BASE/admin/configuracion/tarifas/$TARIFA_ID" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_ADMIN" \
  -d '{"baseCentavos":999999}'
```

> Publicar otra tarifa cambia el precio de las cotizaciones **nuevas**. Los
> viajes ya confirmados conservan el precio que tenían.

Zonas y reglas siguen el mismo ciclo. Un alta de zona superpuesta devuelve
`409 ZONAS_SUPERPUESTAS`; las zonas se desactivan con
`"activa": false`, no se eliminan.

### 6.9 Cotizar y confirmar (flujo con precio dinámico)

El origen debe caer dentro de una zona activa (la del seed es `Centro`). El
servidor calcula distancia, tiempo, demanda, multiplicador y precio; el cuerpo
no acepta importes.

```bash
COTIZACION_JSON=$(curl -s -X POST "$BASE/cotizaciones" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')

echo "$COTIZACION_JSON" | jq
COTIZACION_ID=$(echo "$COTIZACION_JSON" | jq -r '.cotizacion.id')
```

La respuesta incluye, además del precio, la trazabilidad del cálculo:

```json
{
  "cotizacion": {
    "id": "f3a4b5c6-d7e8-4f9a-8b0c-1d2e3f4a5b30",
    "pasajeroId": "...",
    "origen": { "lat": -34.6037, "lng": -58.3816 },
    "destino": { "lat": -34.6083, "lng": -58.3712 },
    "distanciaEstimadaM": 1081,
    "tiempoEstimadoS": 216,
    "zonaId": "...",
    "solicitudesUsadas": 0,
    "choferesDisponiblesUsados": 0,
    "reglaVersion": 1,
    "tarifaVersion": 1,
    "multiplicador": "1.0000",
    "precioCentavos": 100000,
    "calculadaEn": "2026-11-20T18:30:00.000Z",
    "venceEn": "2026-11-20T18:35:00.000Z",
    "estado": "VIGENTE"
  }
}
```

Ahora se confirma con una `Idempotency-Key`. El viaje recibe el **mismo**
`precioCentavos` y `multiplicador` de la cotización:

```bash
CLAVE_CONFIRMAR="conf-$(date +%s)"

VIAJE_JSON=$(curl -s -X POST "$BASE/cotizaciones/$COTIZACION_ID/confirmar" \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_CONFIRMAR")

echo "$VIAJE_JSON" | jq
```

```json
{
  "viaje": {
    "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "pasajeroId": "...",
    "cotizacionId": "f3a4b5c6-d7e8-4f9a-8b0c-1d2e3f4a5b30",
    "precioFijadoCentavos": 100000,
    "multiplicadorFijado": "1.0000",
    "choferId": null,
    "estado": "SOLICITADO",
    "solicitadoEn": "2026-11-20T18:31:10.000Z"
  }
}
```

El reintento con la misma clave devuelve `200`, la cabecera
`Idempotency-Replayed: true` y el mismo viaje, aunque la demanda haya cambiado:

```bash
curl -s -i -X POST "$BASE/cotizaciones/$COTIZACION_ID/confirmar" \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_CONFIRMAR" | sed -n '1,15p'
```

Confirmar la misma cotización con otra clave da `409 COTIZACION_YA_CONFIRMADA`;
después de `venceEn` da `410 COTIZACION_VENCIDA` (5 minutos por defecto,
configurable con `COTIZACION_VIGENCIA_MS`). Podés inspeccionar la foto con:

```bash
curl -s "$BASE/cotizaciones/$COTIZACION_ID" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq
curl -s "$BASE/cotizaciones" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq
```

---

## 7. Códigos de respuesta esperados

| Caso | Código |
|---|---|
| Login correcto | `200` |
| Registro correcto | `201` |
| Crear viaje nuevo (`POST /viajes`) | `201` |
| Cotizar | `201`; `422 FUERA_DE_COBERTURA` si el origen no está en una zona activa |
| Confirmar cotización | `201`; `200` + `Idempotency-Replayed: true` en el replay |
| Aceptar viaje | `200` |
| Finalizar y cobrar | `200` |
| Consultar cobro | `200`; `404` si todavía no existe |
| Cancelar viaje | `200` |
| Sin token | `401` |
| Recurso ajeno o configuración sin rol administrador | `403` |
| Recurso inexistente | `404` |
| Validación inválida | `400` |
| Conflicto de estado o clave reutilizada | `409` (`VERSION_YA_PUBLICADA`, `ZONAS_SUPERPUESTAS`, `NOMBRE_YA_REGISTRADO`, `COTIZACION_YA_CONFIRMADA`, …) |
| Cotización vencida o oferta vencida | `410` |
| Configuración incompleta para cotizar | `503` |
| Rate limit superado | `429` |
| `/ready` con dependencia caída | `503` |

---

## 8. Nota sobre el Bloque 7

Las rutas de tarea pesada **no existen todavía**. El Bloque 7 está pendiente:
no hay endpoints de recálculo, reportes, jobs ni métricas de event loop. Todo
lo listado en esta guía corresponde a las funcionalidades ya implementadas y
verificadas.
