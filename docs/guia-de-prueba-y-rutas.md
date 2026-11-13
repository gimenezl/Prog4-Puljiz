# Guía de prueba de la aplicación y rutas implementadas

Esta guía reúne los comandos para levantar el backend y probar las
funcionalidades ya implementadas desde una terminal, junto con el listado de
rutas disponibles y ejemplos de `curl`.

- **Proyecto:** `Prog4-Puljiz`
- **Ruta:** `/home/guido/Documentos/Programacion/Prog_4/TrabajoFinal/Prog4-Puljiz`
- **Base URL:** `http://localhost:3000`
- **Requisitos:** Docker, Docker Compose, Node.js 22 y pnpm (para los tests).
- **Herramientas de los ejemplos:** `curl` y `jq`.

> Las rutas de tarea pesada del Bloque 7 todavía no existen. Esta guía cubre
> únicamente las funcionalidades implementadas.

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

# Suite principal (157 tests; PostgreSQL real queda SKIP)
pnpm test

# Tests de integración y arquitectura
pnpm test:integration

# PostgreSQL real efímero: levanta, migra, prueba y baja solo
pnpm test:integration:db

# Suite completa: 171 tests incluyendo PostgreSQL real
pnpm test:db:up
TEST_DATABASE_URL=postgresql://admin:password@127.0.0.1:5433/proy_db_test pnpm test
pnpm test:db:down

# Calidad
pnpm lint
pnpm format:check
pnpm audit --prod
```

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
| `POST` | `/viajes` | `PASAJERO` | `{ origen:{lat,lng}, destino:{lat,lng} }` + header `Idempotency-Key`. |
| `GET` | `/viajes/disponibles` | `CHOFER` habilitado y disponible | Lista viajes `SOLICITADO`. |
| `GET` | `/viajes/:id` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` | Detalle del viaje. |
| `POST` | `/viajes/:id/aceptar` | `CHOFER` habilitado y disponible | Sin cuerpo. |
| `POST` | `/viajes/:id/finalizar` | Chofer asignado | Sin cuerpo + header `Idempotency-Key`. |
| `GET` | `/viajes/:id/cobro` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` | Cobro simulado del viaje. |
| `POST` | `/viajes/:id/cancelar` | `PASAJERO` dueño | `{ motivo }`. |

El registro y las operaciones costosas de viajes tienen rate limit propio. Las
respuestas incluyen `RateLimit-Limit`, `RateLimit-Remaining` y
`RateLimit-Reset`; al superar el límite, `429` agrega `Retry-After`.

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

echo "Pasajero: ${TOKEN_PASAJERO:0:20}..."
echo "Chofer:   ${TOKEN_CHOFER:0:20}..."
echo "Admin:    ${TOKEN_ADMIN:0:20}..."
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

### 6.3 Crear un viaje y probar idempotencia

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

---

## 7. Códigos de respuesta esperados

| Caso | Código |
|---|---|
| Login correcto | `200` |
| Registro correcto | `201` |
| Crear viaje nuevo | `201` |
| Replay idempotente | `200` + `Idempotency-Replayed: true` |
| Aceptar viaje | `200` |
| Finalizar y cobrar | `200` |
| Consultar cobro | `200`; `404` si todavía no existe |
| Cancelar viaje | `200` |
| Sin token | `401` |
| Recurso ajeno | `403` |
| Recurso inexistente | `404` |
| Validación inválida | `400` |
| Conflicto de estado o clave reutilizada | `409` |
| Rate limit superado | `429` |
| `/ready` con dependencia caída | `503` |

---

## 8. Nota sobre el Bloque 7

Las rutas de tarea pesada **no existen todavía**. El Bloque 7 está pendiente:
no hay endpoints de recálculo, reportes, jobs ni métricas de event loop. Todo
lo listado en esta guía corresponde a las funcionalidades ya implementadas y
verificadas.
