# Prueba manual de los requerimientos

Esta guía permite verificar a mano el entregable consolidado del backend:
autenticación, viajes, **cobros simulados idempotentes**, autorización por
recurso, **rate limiting**, defensa contra **prototype pollution**, trazabilidad,
límites de seguridad, apagado ordenado y auditoría de dependencias.

Cada caso indica el resultado esperado. Al final hay una matriz de trazabilidad
entre requerimiento, prueba manual y test automatizado.

> **Importante:** no ejecutes estas pruebas contra una base productiva. Usá la
> base local de desarrollo o una base descartable.

---

## 1. Preparación

### 1.1 Requisitos

- Docker y Docker Compose.
- Node.js 22 y pnpm (para ejecutar la app sin contenedor y los tests).
- `curl` y `jq`.

Verificación rápida:

```bash
node --version   # v22.x
pnpm --version   # >= 9
docker --version
jq --version
```

### 1.2 Opción A: todo con Docker

```bash
cd /home/guido/Documentos/Programacion/Prog_4/TrabajoFinal/Prog4-Puljiz

# Crear el .env solo si no existe (no sobrescribe uno existente)
cp -n .env.example .env

docker compose up -d --build
docker compose ps

# Cargar las cuentas de prueba dentro del contenedor
docker compose exec app pnpm db:seed
```

La API queda en `http://localhost:3000` y PostgreSQL en `localhost:5432`.

### 1.3 Opción B: app local y PostgreSQL en Docker

```bash
cd /home/guido/Documentos/Programacion/Prog_4/TrabajoFinal/Prog4-Puljiz

cp -n .env.example .env
pnpm install
pnpm db:prepare   # levanta PostgreSQL y aplica migraciones
pnpm db:seed
pnpm dev          # deja este proceso en primer plano
```

En otra terminal se ejecutan los `curl` de esta guía.

### 1.4 Base limpia (recomendado para repetir la prueba)

Si ya hiciste pruebas y querés partir de cero:

```bash
# Desde el repositorio. Borra el volumen de PostgreSQL.
docker compose down -v
docker compose up -d --build
docker compose exec app pnpm db:seed
```

Si usás la opción local, reemplazá los dos últimos comandos por:

```bash
pnpm db:prepare
pnpm db:seed
pnpm dev
```

El seed es idempotente: crea las cuentas solo si no existen y no pisa datos.

### 1.5 Variables y tokens de trabajo

Ejecutá estos comandos en la misma terminal. La función `login` devuelve el
token o una cadena vacía si el login falla.

```bash
BASE=http://localhost:3000

login() {
  curl -s -X POST "$BASE/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"contrasena\":\"$2\"}" \
  | jq -r '.token // empty'
}

TOKEN_PASAJERO=$(login 'pasajero@prog4.test' 'Pasajero1234!')
TOKEN_CHOFER1=$(login 'chofer1@prog4.test' 'Chofer1234!')
TOKEN_CHOFER2=$(login 'chofer2@prog4.test' 'Chofer1234!')
TOKEN_ADMIN=$(login 'admin@prog4.test' 'Admin1234!')
TOKEN_SOPORTE=$(login 'soporte@prog4.test' 'Soporte1234!')
```

Comprobación:

```bash
for nombre in PASAJERO CHOFER1 CHOFER2 ADMIN SOPORTE; do
  eval "valor=\$TOKEN_$nombre"
  if [ -z "$valor" ]; then
    echo "ERROR: no se obtuvo token para $nombre"
  else
    echo "$nombre: ${valor:0:20}..."
  fi
done
```

Obtené los identificadores que se usan en las pruebas:

```bash
PASAJERO_ID=$(curl -s "$BASE/auth/yo" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq -r '.usuario.id')

CHOFER1_ID=$(curl -s "$BASE/auth/yo" \
  -H "authorization: Bearer $TOKEN_CHOFER1" | jq -r '.usuario.id')

CHOFER2_ID=$(curl -s "$BASE/auth/yo" \
  -H "authorization: Bearer $TOKEN_CHOFER2" | jq -r '.usuario.id')

echo "Pasajero: $PASAJERO_ID"
echo "Chofer 1: $CHOFER1_ID"
echo "Chofer 2: $CHOFER2_ID"
```

Registrá un pasajero ajeno para las pruebas de autorización:

```bash
EMAIL_AJENO="ajeno-$(date +%s)-$RANDOM@prog4.test"

curl -s -X POST "$BASE/auth/registro" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL_AJENO\",\"nombre\":\"Pasajero Ajeno\",\"contrasena\":\"Segura123\",\"rol\":\"PASAJERO\"}" \
  | jq

TOKEN_AJENO=$(login "$EMAIL_AJENO" 'Segura123')
test -n "$TOKEN_AJENO" && echo "Token ajeno OK"
```

> Si el registro devuelve `429 DEMASIADAS_SOLICITUDES`, esperá el tiempo de
> `Retry-After` o reiniciá la app para limpiar los contadores en memoria.

### 1.6 Verificación previa

```bash
curl -s "$BASE/health" | jq
curl -s "$BASE/ready" | jq
```

Esperado:

- `/health`: `200` con `estado: "ok"`.
- `/ready`: `200` con `estado: "listo"` y `chequeos.baseDeDatos`,
  `chequeos.usuarios`, `chequeos.choferes`, `chequeos.viajes`,
  `chequeos.cobros`, `chequeos.idempotencia` y `chequeos.reloj` en `ok: true`.

---

## 2. Casos de prueba

### PM-01. Salud y readiness

**Objetivo:** confirmar que el proceso responde y que readiness revisa las
dependencias reales, incluidos los cobros y la idempotencia.

```bash
curl -s -o /tmp/health.json -w 'health: %{http_code}\n' "$BASE/health"
jq . /tmp/health.json

curl -s -o /tmp/ready.json -w 'ready: %{http_code}\n' "$BASE/ready"
jq '{estado, chequeos}' /tmp/ready.json
```

**Esperado:** `health: 200`, `ready: 200`, `estado: "listo"` y todos los
chequeos en `ok: true`.

**Opcional: readiness con la base caída**

```bash
docker compose stop db
curl -s -o /tmp/ready-caido.json -w 'ready sin db: %{http_code}\n' "$BASE/ready"
jq '{estado, chequeos}' /tmp/ready-caido.json

# Restaurar la base y esperar a que vuelva
docker compose start db
sleep 3
curl -s -o /tmp/ready-recuperado.json -w 'ready recuperado: %{http_code}\n' "$BASE/ready"
jq '.estado' /tmp/ready-recuperado.json
```

**Esperado:** `503` con `estado: "no_listo"` y `baseDeDatos.ok: false`; después
de levantar la base, `200` y `estado: "listo"`.

---

### PM-02. Registro, login y perfil

**Objetivo:** verificar las validaciones de entrada, el conflicto de email y la
autenticación Bearer.

```bash
# Email duplicado: 409
curl -s -o /tmp/dup.json -w 'duplicado: %{http_code}\n' \
  -X POST "$BASE/auth/registro" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL_AJENO\",\"nombre\":\"Otro Nombre\",\"contrasena\":\"Segura123\",\"rol\":\"PASAJERO\"}"
jq . /tmp/dup.json

# Contraseña inválida: 400
curl -s -o /tmp/pass-invalida.json -w 'password inválida: %{http_code}\n' \
  -X POST "$BASE/auth/registro" \
  -H 'content-type: application/json' \
  -d '{"email":"corto@prog4.test","nombre":"Corto","contrasena":"corta","rol":"PASAJERO"}'
jq . /tmp/pass-invalida.json

# Login incorrecto: 401
curl -s -o /tmp/login-malo.json -w 'login incorrecto: %{http_code}\n' \
  -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"pasajero@prog4.test","contrasena":"Incorrecta123"}'
jq . /tmp/login-malo.json

# Perfil sin token: 401
curl -s -o /tmp/yo-sin-token.json -w 'perfil sin token: %{http_code}\n' "$BASE/auth/yo"
jq . /tmp/yo-sin-token.json

# Perfil con token: 200
curl -s "$BASE/auth/yo" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq
```

**Esperado:**

| Caso | HTTP | Código |
|---|---|---|
| Email duplicado | `409` | `EMAIL_YA_REGISTRADO` |
| Contraseña inválida | `400` | `DATOS_INVALIDOS` |
| Login incorrecto | `401` | `CREDENCIALES_INVALIDAS` |
| Perfil sin token | `401` | `NO_AUTENTICADO` |
| Perfil con token | `200` | — |

---

### PM-03. Creación idempotente de viaje

**Objetivo:** verificar el contrato de `POST /viajes` con `Idempotency-Key`:
primer alta, replay, conflicto de contenido y clave faltante.

```bash
CLAVE_VIAJE="manual-viaje-$(date +%s)-$RANDOM"

VIAJE_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_VIAJE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')

echo "$VIAJE_JSON" | jq
VIAJE_ID=$(echo "$VIAJE_JSON" | jq -r '.viaje.id')
PRECIO=$(echo "$VIAJE_JSON" | jq -r '.viaje.precioFijadoCentavos')

test -n "$VIAJE_ID" && test "$VIAJE_ID" != "null" || {
  echo 'ERROR: no se creó el viaje'
  echo "$VIAJE_JSON" | jq
}
echo "Viaje: $VIAJE_ID"
echo "Precio: $PRECIO centavos"
```

**Esperado:** `201` con `viaje.estado: "SOLICITADO"`,
`viaje.precioFijadoCentavos` numérico y `choferId: null`.

**Replay con la misma clave y el mismo cuerpo:**

```bash
curl -s -D /tmp/create-replay.headers -o /tmp/create-replay.json \
  -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_VIAJE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}'

head -n 1 /tmp/create-replay.headers
grep -i '^idempotency-replayed: true' /tmp/create-replay.headers
jq -e --arg id "$VIAJE_ID" '.viaje.id == $id' /tmp/create-replay.json
```

**Esperado:** `HTTP/1.1 200`, cabecera `Idempotency-Replayed: true` y el mismo
`viaje.id`.

**Misma clave con otro contenido:**

```bash
curl -s -o /tmp/create-conflicto.json -w 'conflicto: %{http_code}\n' \
  -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_VIAJE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.61,"lng":-58.37}}'

jq -e '.error.codigo == "CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO"' /tmp/create-conflicto.json
```

**Esperado:** `409` y `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`.

**Sin `Idempotency-Key`:**

```bash
curl -s -o /tmp/create-sin-clave.json -w 'sin clave: %{http_code}\n' \
  -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}'

jq -e '.error.codigo == "CLAVE_DE_IDEMPOTENCIA_REQUERIDA"' /tmp/create-sin-clave.json
```

**Esperado:** `400` y `CLAVE_DE_IDEMPOTENCIA_REQUERIDA`.

**Opcional: vencimiento de la clave (1 minuto)**

Levantá una instancia auxiliar con TTL mínimo y límites altos:

```bash
PORT=3103 \
RATE_LIMIT_MAX=1000 \
VIAJES_RATE_LIMIT_MAX=100 \
IDEMPOTENCIA_TTL_MS=60000 \
node src/main.js > /tmp/prog4-ttl.log 2>&1 &
TTL_PID=$!

BASE_TTL=http://localhost:3103
for i in $(seq 1 30); do
  curl -sf "$BASE_TTL/ready" >/dev/null && break
  sleep 0.5
done
TOKEN_TTL=$(curl -s -X POST "$BASE_TTL/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"pasajero@prog4.test","contrasena":"Pasajero1234!"}' | jq -r '.token')

CLAVE_TTL="ttl-$(date +%s)-$RANDOM"
PRIMERO=$(curl -s -X POST "$BASE_TTL/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_TTL" \
  -H "Idempotency-Key: $CLAVE_TTL" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')
ID_TTL_1=$(echo "$PRIMERO" | jq -r '.viaje.id')

echo "Esperando 61 segundos para que venza la clave..."
sleep 61

SEGUNDO=$(curl -s -X POST "$BASE_TTL/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_TTL" \
  -H "Idempotency-Key: $CLAVE_TTL" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')
ID_TTL_2=$(echo "$SEGUNDO" | jq -r '.viaje.id')

echo "Primero: $ID_TTL_1"
echo "Segundo: $ID_TTL_2"
test "$ID_TTL_1" != "$ID_TTL_2" && echo "TTL OK: se creó un viaje nuevo"

kill -TERM "$TTL_PID"
wait "$TTL_PID" 2>/dev/null || true
```

**Esperado:** después de vencer la clave, el mismo `Idempotency-Key` se trata
como una operación nueva y genera otro `viaje.id`.

---

### PM-04. Aceptación del viaje y estado del chofer

**Objetivo:** verificar que un chofer habilitado y disponible acepta el viaje y
queda ocupado.

```bash
# El viaje debe aparecer en la lista del chofer
curl -s "$BASE/viajes/disponibles" \
  -H "authorization: Bearer $TOKEN_CHOFER1" | jq

# Aceptar
curl -s -X POST "$BASE/viajes/$VIAJE_ID/aceptar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" | jq

# Estado del chofer
curl -s "$BASE/choferes/yo" \
  -H "authorization: Bearer $TOKEN_CHOFER1" | jq
```

**Esperado:**

- `aceptar`: `200`, `viaje.estado: "ASIGNADO"` y
  `viaje.choferId` igual a `$CHOFER1_ID`.
- `choferes/yo`: `estado: "OCUPADO"`, `viajeActivoId: "$VIAJE_ID"`,
  `disponible: true`.
- El viaje ya no aparece en `/viajes/disponibles`.

> Si `aceptar` devuelve `409 CHOFER_OCUPADO`, el chofer tiene otro viaje activo.
> Cancelá ese viaje con su pasajero, reiniciá la base o usá `chofer2`.

---

### PM-05. Autorización por recurso

**Objetivo:** comprobar que no alcanza con tener un rol válido: hay que ser
dueño o participante del recurso. Se prueban los cuatro roles.

#### 5.1 Viaje

```bash
for caso in \
  "PASAJERO|$TOKEN_PASAJERO|200" \
  "CHOFER_ASIGNADO|$TOKEN_CHOFER1|200" \
  "PASAJERO_AJENO|$TOKEN_AJENO|403" \
  "CHOFER_AJENO|$TOKEN_CHOFER2|403" \
  "ADMIN|$TOKEN_ADMIN|200" \
  "SOPORTE|$TOKEN_SOPORTE|200"
do
  nombre=${caso%%|*}
  resto=${caso#*|}
  token=${resto%%|*}
  esperado=${resto##*|}
  codigo=$(curl -s -o /tmp/autorizacion-viaje.json -w '%{http_code}' \
    "$BASE/viajes/$VIAJE_ID" -H "authorization: Bearer $token")
  printf '%-16s esperado=%s obtenido=%s\n' "$nombre" "$esperado" "$codigo"
done
```

**Esperado:** dueño, chofer asignado, administrador y soporte `200`; pasajero
ajeno y chofer ajeno `403`.

#### 5.2 Aceptar y finalizar

```bash
# Roles que no pueden aceptar
for token in "$TOKEN_PASAJERO" "$TOKEN_ADMIN" "$TOKEN_SOPORTE"; do
  curl -s -o /tmp/aceptar-prohibido.json -w 'aceptar: %{http_code}\n' \
    -X POST "$BASE/viajes/$VIAJE_ID/aceptar" \
    -H "authorization: Bearer $token"
  jq -r '.error.codigo' /tmp/aceptar-prohibido.json
done

# Otro chofer: el rol está permitido, pero el viaje ya no está disponible
curl -s -o /tmp/aceptar-ajeno.json -w 'otro chofer: %{http_code}\n' \
  -X POST "$BASE/viajes/$VIAJE_ID/aceptar" \
  -H "authorization: Bearer $TOKEN_CHOFER2"
jq -r '.error.codigo' /tmp/aceptar-ajeno.json

# Finalizar: solo el chofer asignado
curl -s -o /tmp/finalizar-ajeno.json -w 'finalizar otro chofer: %{http_code}\n' \
  -X POST "$BASE/viajes/$VIAJE_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER2" \
  -H "Idempotency-Key: intento-ajeno-$(date +%s)"
jq -r '.error.codigo' /tmp/finalizar-ajeno.json
```

**Esperado:**

- Pasajero, administrador y soporte: `403 NO_AUTORIZADO`.
- Chofer ajeno al aceptar: `409 VIAJE_NO_DISPONIBLE`.
- Chofer ajeno al finalizar: `403 NO_AUTORIZADO`.

#### 5.3 Cancelación: solo el pasajero dueño

Crear un viaje descartable:

```bash
CLAVE_CANCELAR="manual-cancelar-$(date +%s)-$RANDOM"
CANCELAR_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_CANCELAR" \
  -d '{"origen":{"lat":-34.60,"lng":-58.38},"destino":{"lat":-34.61,"lng":-58.37}}')
CANCELAR_ID=$(echo "$CANCELAR_JSON" | jq -r '.viaje.id')
echo "Viaje a cancelar: $CANCELAR_ID"
```

Intentos prohibidos:

```bash
for caso in \
  "PASAJERO_AJENO|$TOKEN_AJENO" \
  "CHOFER|$TOKEN_CHOFER1" \
  "ADMIN|$TOKEN_ADMIN" \
  "SOPORTE|$TOKEN_SOPORTE"
do
  nombre=${caso%%|*}
  token=${caso##*|}
  curl -s -o /tmp/cancelar-prohibido.json -w "$nombre: %{http_code}\n" \
    -X POST "$BASE/viajes/$CANCELAR_ID/cancelar" \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $token" \
    -d '{"motivo":"Intento sin permiso"}'
  jq -r '.error.codigo' /tmp/cancelar-prohibido.json
done
```

**Esperado:** `403 NO_AUTORIZADO` en los cuatro casos.

Cancelación del dueño:

```bash
curl -s -X POST "$BASE/viajes/$CANCELAR_ID/cancelar" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -d '{"motivo":"Prueba manual de cancelación"}' \
  | jq -e '.viaje.estado == "CANCELADO_POR_PASAJERO"'
```

**Esperado:** `200` y estado `CANCELADO_POR_PASAJERO`.

#### 5.4 Usuarios y perfiles de chofer

```bash
# Ver el usuario del pasajero
for caso in \
  "DUEÑO|$TOKEN_PASAJERO|200" \
  "PASAJERO_AJENO|$TOKEN_AJENO|403" \
  "CHOFER|$TOKEN_CHOFER1|403" \
  "ADMIN|$TOKEN_ADMIN|200" \
  "SOPORTE|$TOKEN_SOPORTE|403"
do
  nombre=${caso%%|*}
  resto=${caso#*|}
  token=${resto%%|*}
  esperado=${resto##*|}
  codigo=$(curl -s -o /tmp/usuario.json -w '%{http_code}' \
    "$BASE/usuarios/$PASAJERO_ID" -H "authorization: Bearer $token")
  printf 'GET usuario %-16s esperado=%s obtenido=%s\n' "$nombre" "$esperado" "$codigo"
done

# Editar el nombre: solo el dueño
curl -s -X PATCH "$BASE/usuarios/$PASAJERO_ID" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -d '{"nombre":"Pasajero Manual"}' | jq

curl -s -o /tmp/patch-ajeno.json -w 'PATCH ajeno: %{http_code}\n' \
  -X PATCH "$BASE/usuarios/$PASAJERO_ID" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_ADMIN" \
  -d '{"nombre":"No permitido"}'
jq -r '.error.codigo' /tmp/patch-ajeno.json
```

**Esperado:** `GET` dueño y administrador `200`; los demás `403`. `PATCH` dueño
`200`; administrador `403 NO_AUTORIZADO`.

Perfil operativo del chofer:

```bash
for caso in \
  "CHOFER1|$TOKEN_CHOFER1|200" \
  "CHOFER2|$TOKEN_CHOFER2|200" \
  "PASAJERO|$TOKEN_PASAJERO|403" \
  "ADMIN|$TOKEN_ADMIN|403" \
  "SOPORTE|$TOKEN_SOPORTE|403"
do
  nombre=${caso%%|*}
  resto=${caso#*|}
  token=${resto%%|*}
  esperado=${resto##*|}
  codigo=$(curl -s -o /tmp/chofer-yo.json -w '%{http_code}' \
    "$BASE/choferes/yo" -H "authorization: Bearer $token")
  printf 'GET choferes/yo %-10s esperado=%s obtenido=%s\n' "$nombre" "$esperado" "$codigo"
done
```

Habilitación: solo administrador.

```bash
# Intento de un chofer: 403
curl -s -o /tmp/habilitar-ajeno.json -w 'habilitar como chofer: %{http_code}\n' \
  -X PATCH "$BASE/choferes/$CHOFER2_ID/habilitacion" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_CHOFER1" \
  -d '{"habilitado":true}'
jq -r '.error.codigo' /tmp/habilitar-ajeno.json

# Administrador: 200
curl -s -X PATCH "$BASE/choferes/$CHOFER2_ID/habilitacion" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_ADMIN" \
  -d '{"habilitado":true}' | jq
```

**Esperado:** chofer `403 NO_AUTORIZADO`; administrador `200` con el perfil
actualizado.

---

### PM-06. Finalizar y cobrar

**Objetivo:** verificar la operación atómica que finaliza el viaje, libera al
chofer y registra un cobro simulado.

```bash
CLAVE_FINAL="manual-final-$(date +%s)-$RANDOM"

curl -s -D /tmp/final.headers -o /tmp/final.json \
  -X POST "$BASE/viajes/$VIAJE_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" \
  -H "Idempotency-Key: $CLAVE_FINAL"

head -n 1 /tmp/final.headers
# En la primera ejecución NO debe aparecer Idempotency-Replayed
grep -i '^idempotency-replayed' /tmp/final.headers || echo 'sin cabecera de replay (correcto)'
jq . /tmp/final.json
```

Validación automática de la respuesta:

```bash
jq -e --arg id "$VIAJE_ID" --arg ref "SIM-$VIAJE_ID" --argjson monto "$PRECIO" '
  .viaje.id == $id and
  .viaje.estado == "FINALIZADO" and
  .viaje.cerradoEn != null and
  .cobro.viajeId == $id and
  .cobro.estado == "COBRADO" and
  .cobro.montoCentavos == $monto and
  .cobro.referencia == $ref and
  .cobro.creadoEn != null and
  .cobro.cobradoEn != null
' /tmp/final.json

COBRO_ID=$(jq -r '.cobro.id' /tmp/final.json)
echo "Cobro: $COBRO_ID"
```

**Esperado:** `200`; viaje `FINALIZADO`; cobro `COBRADO`; monto igual al precio
fijado; referencia determinista `SIM-<viajeId>`; fechas no nulas.

Verificar el viaje y la liberación del chofer:

```bash
curl -s "$BASE/viajes/$VIAJE_ID" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq

curl -s "$BASE/choferes/yo" \
  -H "authorization: Bearer $TOKEN_CHOFER1" | jq
```

**Esperado:** viaje `FINALIZADO`; chofer `viajeActivoId: null` y
`estado: "DISPONIBLE"`.

Consultar el cobro:

```bash
curl -s "$BASE/viajes/$VIAJE_ID/cobro" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq
```

**Esperado:** `200` con el mismo `cobro.id` y `referencia: "SIM-<viajeId>"`.

---

### PM-07. Replay de la finalización

**Objetivo:** confirmar que reintentar con la misma clave devuelve la respuesta
original y no ejecuta un segundo cobro.

```bash
curl -s -D /tmp/final-replay.headers -o /tmp/final-replay.json \
  -X POST "$BASE/viajes/$VIAJE_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" \
  -H "Idempotency-Key: $CLAVE_FINAL"

head -n 1 /tmp/final-replay.headers
grep -i '^idempotency-replayed: true' /tmp/final-replay.headers
jq -e --arg cobro "$COBRO_ID" '
  .cobro.id == $cobro and
  .viaje.estado == "FINALIZADO" and
  .cobro.estado == "COBRADO"
' /tmp/final-replay.json
```

**Esperado:** `200`, `Idempotency-Replayed: true`, mismo `cobro.id` y mismo
viaje. No se crea otro cobro (se confirma en PM-10).

---

### PM-08. Conflictos y unicidad del cobro

**Objetivo:** verificar las dos defensas contra el doble cobro: la clave de
idempotencia y la clave natural `viaje_id UNIQUE`.

#### 8.1 Misma finalización con otra clave

```bash
CLAVE_OTRA="manual-otra-$(date +%s)-$RANDOM"

curl -s -o /tmp/final-otra.json -w 'otra clave: %{http_code}\n' \
  -X POST "$BASE/viajes/$VIAJE_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" \
  -H "Idempotency-Key: $CLAVE_OTRA"

jq -e '.error.codigo == "TRANSICION_INVALIDA"' /tmp/final-otra.json
```

**Esperado:** `409 TRANSICION_INVALIDA`; el viaje ya estaba finalizado y no se
crea otro cobro.

#### 8.2 Misma clave, otro viaje

Crear un segundo viaje y asignarlo al mismo chofer:

```bash
CLAVE_VIAJE2="manual-viaje2-$(date +%s)-$RANDOM"

VIAJE2_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_VIAJE2" \
  -d '{"origen":{"lat":-34.60,"lng":-58.38},"destino":{"lat":-34.61,"lng":-58.37}}')

VIAJE2_ID=$(echo "$VIAJE2_JSON" | jq -r '.viaje.id')
echo "Viaje 2: $VIAJE2_ID"

curl -s -X POST "$BASE/viajes/$VIAJE2_ID/aceptar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" | jq -e '.viaje.estado == "ASIGNADO"'

# Todavía no tiene cobro
curl -s -o /tmp/cobro-antes.json -w 'cobro antes de finalizar: %{http_code}\n' \
  "$BASE/viajes/$VIAJE2_ID/cobro" \
  -H "authorization: Bearer $TOKEN_PASAJERO"
jq -r '.error.codigo' /tmp/cobro-antes.json
```

**Esperado:** `404 NO_ENCONTRADO`.

Reutilizar la clave del primer viaje:

```bash
curl -s -o /tmp/final-clave-reutilizada.json -w 'clave de otro viaje: %{http_code}\n' \
  -X POST "$BASE/viajes/$VIAJE2_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" \
  -H "Idempotency-Key: $CLAVE_FINAL"

jq -e '.error.codigo == "CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO"' \
  /tmp/final-clave-reutilizada.json
```

**Esperado:** `409 CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`; el segundo viaje sigue
`ASIGNADO` y sin cobro.

```bash
curl -s "$BASE/viajes/$VIAJE2_ID" \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  | jq -e '.viaje.estado == "ASIGNADO"'

curl -s -o /tmp/cobro-sigue-404.json -w 'cobro tras conflicto: %{http_code}\n' \
  "$BASE/viajes/$VIAJE2_ID/cobro" \
  -H "authorization: Bearer $TOKEN_PASAJERO"
jq -r '.error.codigo' /tmp/cobro-sigue-404.json
```

Finalizar con una clave nueva para liberar al chofer:

```bash
CLAVE_FINAL2="manual-final2-$(date +%s)-$RANDOM"

curl -s -o /tmp/final2.json -w 'finalizar viaje 2: %{http_code}\n' \
  -X POST "$BASE/viajes/$VIAJE2_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" \
  -H "Idempotency-Key: $CLAVE_FINAL2"

jq -e --arg id "$VIAJE2_ID" --arg ref "SIM-$VIAJE2_ID" '
  .viaje.id == $id and
  .viaje.estado == "FINALIZADO" and
  .cobro.estado == "COBRADO" and
  .cobro.referencia == $ref
' /tmp/final2.json

COBRO2_ID=$(jq -r '.cobro.id' /tmp/final2.json)
echo "Cobro 2: $COBRO2_ID"
```

**Esperado:** `200`, segundo viaje `FINALIZADO` con su propio cobro.

#### 8.3 Opcional: dos finalizaciones simultáneas con la misma clave

```bash
CLAVE_VIAJE3="manual-viaje3-$(date +%s)-$RANDOM"
VIAJE3_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_VIAJE3" \
  -d '{"origen":{"lat":-34.60,"lng":-58.38},"destino":{"lat":-34.61,"lng":-58.37}}')
VIAJE3_ID=$(echo "$VIAJE3_JSON" | jq -r '.viaje.id')

curl -s -X POST "$BASE/viajes/$VIAJE3_ID/aceptar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" >/dev/null

CLAVE_CONC="manual-conc-$(date +%s)-$RANDOM"

curl -s -D /tmp/conc-a.headers -o /tmp/conc-a.json \
  -X POST "$BASE/viajes/$VIAJE3_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" \
  -H "Idempotency-Key: $CLAVE_CONC" &

curl -s -D /tmp/conc-b.headers -o /tmp/conc-b.json \
  -X POST "$BASE/viajes/$VIAJE3_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER1" \
  -H "Idempotency-Key: $CLAVE_CONC" &

wait

echo '--- A ---'
head -n 1 /tmp/conc-a.headers
grep -i '^idempotency-replayed' /tmp/conc-a.headers || true
echo '--- B ---'
head -n 1 /tmp/conc-b.headers
grep -i '^idempotency-replayed' /tmp/conc-b.headers || true

jq -r '.cobro.id' /tmp/conc-a.json
jq -r '.cobro.id' /tmp/conc-b.json
```

**Esperado:** ambas respuestas `200`; un solo `Idempotency-Replayed: true`
(entre A y B); el mismo `cobro.id` en las dos. La base debe tener un solo cobro
para `$VIAJE3_ID`.

---

### PM-09. Autorización del cobro

**Objetivo:** verificar que solo los participantes y los roles de consulta
pueden ver el cobro.

```bash
for caso in \
  "PASAJERO|$TOKEN_PASAJERO|200" \
  "CHOFER_ASIGNADO|$TOKEN_CHOFER1|200" \
  "ADMIN|$TOKEN_ADMIN|200" \
  "SOPORTE|$TOKEN_SOPORTE|200" \
  "PASAJERO_AJENO|$TOKEN_AJENO|403" \
  "CHOFER_AJENO|$TOKEN_CHOFER2|403"
do
  nombre=${caso%%|*}
  resto=${caso#*|}
  token=${resto%%|*}
  esperado=${resto##*|}
  codigo=$(curl -s -o /tmp/cobro-autorizacion.json -w '%{http_code}' \
    "$BASE/viajes/$VIAJE_ID/cobro" -H "authorization: Bearer $token")
  printf 'cobro %-16s esperado=%s obtenido=%s\n' "$nombre" "$esperado" "$codigo"
done

# Sin token
curl -s -o /tmp/cobro-sin-token.json -w 'sin token: %{http_code}\n' \
  "$BASE/viajes/$VIAJE_ID/cobro"
jq -r '.error.codigo' /tmp/cobro-sin-token.json

# Viaje inexistente (UUID válido)
curl -s -o /tmp/cobro-inexistente.json -w 'viaje inexistente: %{http_code}\n' \
  "$BASE/viajes/00000000-0000-4000-8000-000000000000/cobro" \
  -H "authorization: Bearer $TOKEN_PASAJERO"
jq -r '.error.codigo' /tmp/cobro-inexistente.json
```

**Esperado:** `200` para pasajero dueño, chofer asignado, administrador y
soporte; `403 NO_AUTORIZADO` para pasajero y chofer ajenos; `401 NO_AUTENTICADO`
sin token; `404 NO_ENCONTRADO` para un viaje inexistente.

---

### PM-10. Invariantes en PostgreSQL

**Objetivo:** comprobar en la base que el cobro es único, coherente y que la
idempotencia y la liberación del chofer quedaron persistidas.

> Si no usás Docker para PostgreSQL, reemplazá
> `docker compose exec -T db psql -U admin -d proy_db` por
> `psql "$DATABASE_URL"`.

Cobros de los viajes de la prueba:

```bash
docker compose exec -T db psql -U admin -d proy_db -c "
SELECT viaje_id, monto_centavos, estado, referencia,
       cobrado_en IS NOT NULL AS tiene_fecha_cobro
FROM cobros_simulados
WHERE viaje_id IN ('$VIAJE_ID', '$VIAJE2_ID')
ORDER BY creado_en;
"
```

**Esperado:** una fila por viaje, `estado = COBRADO`, `referencia =
SIM-<viajeId>` y `tiene_fecha_cobro = t`.

Conteo exacto por viaje:

```bash
docker compose exec -T db psql -U admin -d proy_db -c "
SELECT viaje_id, COUNT(*) AS cobros
FROM cobros_simulados
WHERE viaje_id IN ('$VIAJE_ID', '$VIAJE2_ID')
GROUP BY viaje_id
ORDER BY viaje_id;
"
```

**Esperado:** `cobros = 1` para cada viaje.

Restricción única natural:

```bash
docker compose exec -T db psql -U admin -d proy_db -c "
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'cobros_simulados'::regclass
ORDER BY conname;
"
```

**Esperado:** debe aparecer `cobros_simulados_viaje_id_key` con `contype = u`.

Índices de la tabla:

```bash
docker compose exec -T db psql -U admin -d proy_db -c "
SELECT indexname
FROM pg_indexes
WHERE tablename = 'cobros_simulados'
ORDER BY indexname;
"
```

**Esperado:** `cobros_simulados_pkey`, `cobros_simulados_viaje_id_key` y
`cobros_simulados_estado_idx`.

Estado del viaje y del chofer:

```bash
docker compose exec -T db psql -U admin -d proy_db -c "
SELECT id, estado, cerrado_en IS NOT NULL AS cerrado
FROM viajes
WHERE id IN ('$VIAJE_ID', '$VIAJE2_ID')
ORDER BY id;

SELECT usuario_id, habilitado, disponible, viaje_activo_id
FROM choferes
WHERE usuario_id = '$CHOFER1_ID';
"
```

**Esperado:** viajes `FINALIZADO` con `cerrado = t`; chofer con
`viaje_activo_id` nulo, `habilitado = t` y `disponible = t`.

Registros de idempotencia de la finalización:

```bash
docker compose exec -T db psql -U admin -d proy_db -c "
SELECT clave, left(hash_contenido, 12) AS hash, vence_en > now() AS vigente
FROM claves_idempotencia
WHERE alcance = 'viaje:finalizar:$CHOFER1_ID'
ORDER BY creada_en;
"
```

**Esperado:** los registros de las claves que finalizaron correctamente (por
ejemplo, `$CLAVE_FINAL` y `$CLAVE_FINAL2`; si ejecutaste PM-08 8.3, también
`$CLAVE_CONC`). La clave conflictiva reutilizada **no** debe aparecer con un
nuevo efecto.

Verificar que no hay cobros huérfanos:

```bash
docker compose exec -T db psql -U admin -d proy_db -c "
SELECT COUNT(*) AS huerfanos
FROM cobros_simulados c
LEFT JOIN viajes v ON v.id = c.viaje_id
WHERE v.id IS NULL;
"
```

**Esperado:** `huerfanos = 0`.

---

### PM-11. Rate limit de registro

**Objetivo:** verificar el límite propio de `POST /auth/registro`, los headers
`RateLimit-*` y `Retry-After` en `429`.

Levantá una instancia auxiliar con límites bajos. Usa el puerto `3100` para no
interferir con la app principal. La base debe estar levantada y migrada.

```bash
PORT=3100 \
RATE_LIMIT_MAX=1000 \
REGISTRO_RATE_LIMIT_MAX=1 \
REGISTRO_RATE_LIMIT_WINDOW_MS=60000 \
VIAJES_RATE_LIMIT_MAX=1 \
LOGIN_RATE_LIMIT_MAX=1 \
LOGIN_RATE_LIMIT_WINDOW_MS=60000 \
node src/main.js > /tmp/prog4-rate.log 2>&1 &
RATE_PID=$!

BASE_RATE=http://localhost:3100
for i in $(seq 1 30); do
  curl -sf "$BASE_RATE/ready" >/dev/null && break
  sleep 0.5
done
curl -s "$BASE_RATE/ready" | jq -r '.estado'
```

Primer registro (debe pasar):

```bash
EMAIL_R1="rate-a-$(date +%s)-$RANDOM@prog4.test"

curl -s -D /tmp/rate-reg-1.headers -o /tmp/rate-reg-1.json \
  -X POST "$BASE_RATE/auth/registro" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL_R1\",\"nombre\":\"Rate A\",\"contrasena\":\"Segura123\",\"rol\":\"PASAJERO\"}"

head -n 1 /tmp/rate-reg-1.headers
grep -i '^ratelimit-' /tmp/rate-reg-1.headers
jq . /tmp/rate-reg-1.json
```

Segundo registro desde la misma IP (debe fallar):

```bash
EMAIL_R2="rate-b-$(date +%s)-$RANDOM@prog4.test"

curl -s -D /tmp/rate-reg-2.headers -o /tmp/rate-reg-2.json \
  -X POST "$BASE_RATE/auth/registro" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL_R2\",\"nombre\":\"Rate B\",\"contrasena\":\"Segura123\",\"rol\":\"PASAJERO\"}"

head -n 1 /tmp/rate-reg-2.headers
grep -iE '^(ratelimit-|retry-after)' /tmp/rate-reg-2.headers
jq -e '.error.codigo == "DEMASIADAS_SOLICITUDES"' /tmp/rate-reg-2.json
```

**Esperado:**

- Primero: `201` con `RateLimit-Limit: 1`, `RateLimit-Remaining: 0` y
  `RateLimit-Reset` mayor que cero.
- Segundo: `429`, `Retry-After` mayor que cero y
  `DEMASIADAS_SOLICITUDES`.

---

### PM-12. Rate limit de viajes

**Objetivo:** verificar el límite compartido por `POST /viajes`, `/aceptar`,
`/finalizar` y `/cancelar`.

En la misma instancia auxiliar (`VIAJES_RATE_LIMIT_MAX=1`):

```bash
TOKEN_RATE=$(curl -s -X POST "$BASE_RATE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"pasajero@prog4.test","contrasena":"Pasajero1234!"}' | jq -r '.token')

test -n "$TOKEN_RATE" && echo "Login rate OK"

CLAVE_RATE_1="rate-trip-1-$(date +%s)-$RANDOM"
CLAVE_RATE_2="rate-trip-2-$(date +%s)-$RANDOM"

curl -s -D /tmp/rate-trip-1.headers -o /tmp/rate-trip-1.json \
  -X POST "$BASE_RATE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_RATE" \
  -H "Idempotency-Key: $CLAVE_RATE_1" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}'

curl -s -D /tmp/rate-trip-2.headers -o /tmp/rate-trip-2.json \
  -X POST "$BASE_RATE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_RATE" \
  -H "Idempotency-Key: $CLAVE_RATE_2" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}'

echo '--- primer viaje ---'
head -n 1 /tmp/rate-trip-1.headers
grep -i '^ratelimit-' /tmp/rate-trip-1.headers

echo '--- segundo viaje ---'
head -n 1 /tmp/rate-trip-2.headers
grep -iE '^(ratelimit-|retry-after)' /tmp/rate-trip-2.headers
jq -e '.error.codigo == "DEMASIADAS_SOLICITUDES"' /tmp/rate-trip-2.json
```

**Esperado:** primer viaje `201` con `RateLimit-Limit: 1` y
`RateLimit-Remaining: 0`; segundo `429` con `Retry-After` y
`DEMASIADAS_SOLICITUDES`.

> El límite se comparte entre crear, aceptar, finalizar y cancelar. Si ya hiciste
> una de esas operaciones en esta instancia, el primer `POST /viajes` puede dar
> `429`; reiniciá la instancia para limpiar el contador.

---

### PM-13. Rate limit de login

**Objetivo:** verificar que el límite de login cuenta los intentos fallidos y
publica los mismos headers.

En la misma instancia auxiliar (`LOGIN_RATE_LIMIT_MAX=1`):

```bash
curl -s -D /tmp/rate-login-1.headers -o /tmp/rate-login-1.json \
  -X POST "$BASE_RATE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"pasajero@prog4.test","contrasena":"Incorrecta123"}'

curl -s -D /tmp/rate-login-2.headers -o /tmp/rate-login-2.json \
  -X POST "$BASE_RATE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"pasajero@prog4.test","contrasena":"Incorrecta123"}'

head -n 1 /tmp/rate-login-1.headers
jq -r '.error.codigo' /tmp/rate-login-1.json

head -n 1 /tmp/rate-login-2.headers
grep -iE '^(ratelimit-|retry-after)' /tmp/rate-login-2.headers
jq -e '.error.codigo == "DEMASIADAS_SOLICITUDES"' /tmp/rate-login-2.json
```

**Esperado:** primer intento `401 CREDENCIALES_INVALIDAS`; segundo `429` con
`Retry-After` y `DEMASIADAS_SOLICITUDES`.

Detener la instancia auxiliar:

```bash
kill -TERM "$RATE_PID"
wait "$RATE_PID" 2>/dev/null; echo "exit rate=$?"
grep -E 'Cierre ordenado' /tmp/prog4-rate.log
```

**Esperado:** `exit rate=0` y las líneas de cierre ordenado.

---

### PM-14. Prototype pollution

**Objetivo:** verificar que los esquemas estrictos rechazan `__proto__` y
`constructor.prototype` sin contaminar `Object.prototype`, y que la aplicación
sigue funcionando después del intento.

> Es importante usar `--data-binary` con el JSON crudo. `JSON.stringify` no crea
> una propiedad propia para `__proto__`.

Intento en la raíz del cuerpo de registro:

```bash
curl -s -o /tmp/proto-registro.json -w 'proto registro: %{http_code}\n' \
  -X POST "$BASE/auth/registro" \
  -H 'content-type: application/json' \
  --data-binary '{
    "email": "proto-manual@prog4.test",
    "nombre": "Proto",
    "contrasena": "Segura123",
    "rol": "PASAJERO",
    "__proto__": { "contaminado": "x" }
  }'

jq -e '.error.codigo == "DATOS_INVALIDOS"' /tmp/proto-registro.json
```

Intento anidado en un viaje:

```bash
curl -s -o /tmp/proto-viaje.json -w 'proto viaje: %{http_code}\n' \
  -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: proto-$(date +%s)-$RANDOM" \
  --data-binary '{
    "origen": { "lat": -34.6037, "lng": -58.3816, "__proto__": { "contaminado": "x" } },
    "destino": { "lat": -34.6083, "lng": -58.3712 }
  }'

jq -e '.error.codigo == "DATOS_INVALIDOS"' /tmp/proto-viaje.json
```

**Esperado:** `400 DATOS_INVALIDOS` en ambos casos.

La aplicación debe seguir funcionando:

```bash
curl -s -o /tmp/post-proto-health.json -w 'health: %{http_code}\n' "$BASE/health"
jq -e '.estado == "ok"' /tmp/post-proto-health.json

curl -s -o /tmp/post-proto-viaje.json -w 'viaje normal: %{http_code}\n' \
  -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: post-proto-$(date +%s)-$RANDOM" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}'
jq -e '.viaje.estado == "SOLICITADO"' /tmp/post-proto-viaje.json
```

**Esperado:** `health: 200` y `viaje normal: 201`.

La comprobación definitiva de que `Object.prototype` quedó intacto está en el
test automatizado, porque no se puede inspeccionar la memoria de otro proceso
por HTTP:

```bash
node --test --test-concurrency=1 tests/integration/prototype-pollution.test.js
```

**Esperado:** 4 tests pasan, incluidos los que verifican
`Object.hasOwn(Object.prototype, "contaminado") === false` y que un objeto común
no hereda la propiedad.

---

### PM-15. Trazabilidad, headers y límites de cuerpo

**Objetivo:** verificar `requestId`, headers de seguridad, límite de body y
errores HTTP conocidos.

#### 15.1 Request ID de extremo a extremo

```bash
curl -s -D /tmp/request-id.headers -o /tmp/request-id.json \
  "$BASE/no-existe" \
  -H 'x-request-id: manual-123'

grep -i '^x-request-id: manual-123' /tmp/request-id.headers
jq -e '.requestId == "manual-123"' /tmp/request-id.json
jq -e '.error.codigo == "RECURSO_NO_ENCONTRADO"' /tmp/request-id.json
```

**Esperado:** header y body con `requestId: "manual-123"`, HTTP `404` y
`RECURSO_NO_ENCONTRADO`.

Buscá el mismo ID en los logs:

```bash
# Docker
docker compose logs --tail=100 app | grep 'manual-123'

# O si la app corre en primer plano, mirá la terminal donde ejecutaste pnpm dev
```

**Esperado:** una línea de log con `requestId: "manual-123"`.

#### 15.2 Headers de seguridad

```bash
curl -s -D /tmp/security.headers -o /dev/null "$BASE/health"
grep -iE 'content-security-policy|x-content-type-options|x-frame-options|x-powered-by' \
  /tmp/security.headers
```

**Esperado:** `Content-Security-Policy`, `X-Content-Type-Options: nosniff` y
`X-Frame-Options`. **No** debe aparecer `X-Powered-By`.

#### 15.3 Cuerpo demasiado grande

```bash
node -e "process.stdout.write(JSON.stringify({email:'a'.repeat(120000)+'@x.test',nombre:'X',contrasena:'Segura123',rol:'PASAJERO'}))" \
  > /tmp/body-grande.json

wc -c /tmp/body-grande.json

curl -s -o /tmp/body-grande-resp.json -w 'body grande: %{http_code}\n' \
  -X POST "$BASE/auth/registro" \
  -H 'content-type: application/json' \
  --data-binary @/tmp/body-grande.json

jq -e '.error.codigo == "CUERPO_DEMASIADO_GRANDE"' /tmp/body-grande-resp.json
```

**Esperado:** `413` y `CUERPO_DEMASIADO_GRANDE`.

#### 15.4 JSON malformado

```bash
curl -s -o /tmp/json-malo.json -w 'json malformado: %{http_code}\n' \
  -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  --data-binary '{"email":'

jq -e '.error.codigo == "CUERPO_INVALIDO"' /tmp/json-malo.json
```

**Esperado:** `400` y `CUERPO_INVALIDO`.

#### 15.5 CORS (opcional)

```bash
curl -s -D - -o /dev/null "$BASE/health" \
  -H 'Origin: http://example.com' \
  | grep -i '^access-control-allow-origin'
```

**Esperado:** con `CORS_ORIGIN=*`, `Access-Control-Allow-Origin: *`.

---

### PM-16. Apagado ordenado con conexión keep-alive

**Objetivo:** verificar que `SIGTERM` cierra el servidor, espera pedidos en curso
y no queda colgado por una conexión keep-alive inactiva.

Usamos el puerto `3101` para no interferir con la app principal. La base debe
estar levantada.

```bash
PORT=3101 node src/main.js > /tmp/prog4-shutdown.log 2>&1 &
APP_PID=$!

BASE_SHUTDOWN=http://127.0.0.1:3101
for i in $(seq 1 30); do
  curl -sf "$BASE_SHUTDOWN/ready" >/dev/null && break
  sleep 0.5
done
curl -s -o /dev/null -w 'ready: %{http_code}\n' "$BASE_SHUTDOWN/ready"
```

Abrir una conexión keep-alive y dejarla inactiva:

```bash
timeout 30s node --input-type=module -e '
import http from "node:http";
const agente = new http.Agent({ keepAlive: true });
await new Promise((resolve, reject) => {
  http.get(
    { host: "127.0.0.1", port: 3101, path: "/health", agent: agente },
    (res) => {
      res.resume();
      res.on("end", resolve);
    },
  ).on("error", reject);
});
console.log("keep-alive abierto");
setInterval(() => {}, 1000);
' > /tmp/prog4-keepalive.log 2>&1 &
KEEPALIVE_PID=$!

sleep 1
cat /tmp/prog4-keepalive.log
```

Enviar `SIGTERM` y medir:

```bash
INICIO=$(date +%s%3N)
kill -TERM "$APP_PID"
wait "$APP_PID"
CODIGO=$?
FIN=$(date +%s%3N)

echo "exit=$CODIGO duracion_ms=$((FIN - INICIO))"
grep -E 'Cierre ordenado' /tmp/prog4-shutdown.log

kill "$KEEPALIVE_PID" 2>/dev/null || true
```

**Esperado:**

- `exit=0`.
- `duracion_ms` menor que `SHUTDOWN_TIMEOUT_MS` (10 000 ms por defecto); en la
  práctica, menos de 2 segundos.
- Logs con `"msg":"Cierre ordenado iniciado"` y
  `"msg":"Cierre ordenado completado"`.
- El proceso no espera a que el cliente cierre la conexión keep-alive.

**Opción Docker:**

```bash
# Abrí el keep-alive contra localhost:3000 en otra terminal (mismo script,
# cambiando el puerto a 3000), y después:
time docker compose stop -t 15 app
docker compose logs --tail=30 app | grep -E 'Cierre ordenado'
docker compose ps
```

**Esperado:** `docker compose stop` termina en pocos segundos, los logs muestran
el cierre ordenado y `app` no aparece corriendo.

**Test automatizado complementario:**

```bash
node --test --test-concurrency=1 tests/integration/lifecycle.test.js
```

**Esperado:** 3 tests pasan. Incluye el pedido lento en curso y el cierre
idempotente ante dos `SIGTERM`.

---

### PM-17. Auditoría de dependencias

**Objetivo:** verificar que no hay vulnerabilidades altas o críticas en
producción y dejar documentado el único advisory moderado de desarrollo.

```bash
pnpm audit:prod
echo "exit prod=$?"

pnpm audit:all
echo "exit all=$?"
```

**Esperado:**

- `pnpm audit:prod`: `No known vulnerabilities found`, exit `0`.
- `pnpm audit:all`: 1 advisory **moderado y solo de desarrollo**
  (`minimatch@10.2.6` vía ESLint, `GHSA-g3hv-75wg-m249`), sin hallazgos altos ni
  críticos. Por eso el comando puede salir con código `1`.

El análisis y la justificación están en `docs/auditoria-dependencias.md`.

> Se usa `pnpm audit` porque el proyecto tiene `pnpm-lock.yaml`. `npm audit` no
> aplica a este repositorio.

---

### PM-18. Suite automatizada completa

**Objetivo:** confirmar que las pruebas automatizadas acompañan a cada
requerimiento.

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm test:integration:db
```

**Esperado (al momento de escribir esta guía):**

| Comando | Resultado |
|---|---|
| `pnpm lint` | Sin errores |
| `pnpm format:check` | Sin diferencias |
| `pnpm test` | 157 tests OK; los de PostgreSQL real quedan omitidos |
| `pnpm test:integration:db` | Tests de PostgreSQL real OK; levanta y baja la base efímera |

Para correr la suite completa contra PostgreSQL real:

```bash
pnpm test:db:up

TEST_DATABASE_URL=postgresql://admin:password@127.0.0.1:5433/proy_db_test \
  pnpm test

pnpm test:db:down
```

**Esperado:** 171 tests OK.

También podés ejecutar solo los tests de los requerimientos de esta guía:

```bash
node --test --test-concurrency=1 \
  tests/unit/domain/cobro-simulado.test.js \
  tests/unit/application/viajes/crear-viaje.test.js \
  tests/unit/application/viajes/finalizar-viaje.test.js \
  tests/integration/cobros.test.js \
  tests/integration/authorization.test.js \
  tests/integration/rate-limit.test.js \
  tests/integration/prototype-pollution.test.js \
  tests/integration/lifecycle.test.js
```

**Esperado:** todos pasan.

---

## 3. Matriz de trazabilidad

| Requerimiento | Caso manual | Test automatizado principal |
|---|---|---|
| Registro, login y perfil | PM-02 | `tests/integration/auth.test.js`, `tests/unit/application/auth/` |
| Errores y trazabilidad | PM-15 | `tests/integration/error-handling.test.js`, `tests/unit/http/error-mapping.test.js`, `tests/unit/logging/error-serializer.test.js` |
| Health, readiness y apagado | PM-01, PM-16 | `tests/integration/http-health.test.js`, `tests/integration/lifecycle.test.js`, `tests/unit/health/readiness-check.test.js` |
| Creación idempotente de viaje | PM-03 | `tests/unit/application/viajes/crear-viaje.test.js`, `tests/integration/viajes.test.js` |
| Aceptación y transiciones | PM-04 | `tests/unit/application/viajes/aceptar-viaje.test.js`, `tests/unit/domain/viaje.test.js` |
| Finalización y cobro idempotente | PM-06, PM-07 | `tests/unit/application/viajes/finalizar-viaje.test.js`, `tests/integration/cobros.test.js` |
| Entidad de cobro | PM-06 | `tests/unit/domain/cobro-simulado.test.js` |
| Unicidad y concurrencia en PostgreSQL | PM-08, PM-10 | `tests/integration/postgres/postgres.test.js`, `tests/integration/cobros.test.js` |
| Autorización por recurso | PM-05, PM-09 | `tests/integration/authorization.test.js`, `tests/integration/cobros.test.js` |
| Rate limiting | PM-11, PM-12, PM-13 | `tests/integration/rate-limit.test.js` |
| Prototype pollution | PM-14 | `tests/integration/prototype-pollution.test.js` |
| Seguridad HTTP y body limit | PM-15 | `tests/integration/error-handling.test.js` |
| Arquitectura hexagonal | PM-18 | `tests/architecture/boundaries.test.js` |
| Auditoría de dependencias | PM-17 | `docs/auditoria-dependencias.md` y `pnpm audit:prod` |

---

## 4. Limpieza

Detener las instancias auxiliares si quedaron abiertas:

```bash
# Procesos locales de las pruebas
pkill -f 'node src/main.js' 2>/dev/null || true
pkill -f 'prog4-keepalive' 2>/dev/null || true

# Docker
docker compose stop app
docker compose down          # conserva datos
# docker compose down -v     # borra también el volumen de PostgreSQL
```

Para volver a empezar de cero:

```bash
docker compose down -v
docker compose up -d --build
docker compose exec app pnpm db:seed
```

Si cambiaste el nombre del pasajero en PM-05, el seed no lo restaura porque es
idempotente. Reiniciá la base con `down -v` si necesitás los datos originales.

---

## 5. Diagnóstico rápido

| Síntoma | Causa probable | Solución |
|---|---|---|
| `401 NO_AUTENTICADO` | Token vencido o ausente | Volver a ejecutar `login` y exportar el token |
| `403 NO_AUTORIZADO` | El rol existe pero no es dueño/participante | Usar la cuenta correcta; revisar PM-05 y PM-09 |
| `409 CHOFER_OCUPADO` | El chofer tiene un viaje activo | Cancelar ese viaje, reiniciar la base o usar otro chofer |
| `409 VIAJE_NO_DISPONIBLE` | Otro chofer ya aceptó el viaje | Crear un viaje nuevo |
| `409 TRANSICION_INVALIDA` | El viaje ya no está `ASIGNADO` | Verificar el estado con `GET /viajes/:id` |
| `409 CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | Misma clave para otro viaje | Usar una clave nueva para la nueva operación |
| `429 DEMASIADAS_SOLICITUDES` | Se superó un límite | Esperar `Retry-After` o reiniciar la instancia |
| `400 CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | Falta `Idempotency-Key` | Agregar la cabecera |
| `404 NO_ENCONTRADO` en `/cobro` | El viaje todavía no se finalizó | Finalizar primero con el chofer asignado |
| `jq` muestra `null` | La respuesta fue un error | Repetir con `curl -i` o revisar el body con `jq .` |
| No aparece el log del `requestId` | La app corre en Docker o en otra terminal | Usar `docker compose logs` o mirar la terminal de `pnpm dev` |
| `pnpm db:seed` falla | Falta `ADAPTERS_MODE=real` o `DATABASE_URL` | Revisar `.env` y ejecutar `pnpm db:prepare` |
| El chofer no puede aceptar | No está habilitado, no está disponible o está ocupado | Habilitar con admin, poner `disponible: true` y liberar el viaje activo |

---

## 6. Checklist final

Marcá cada caso al terminar:

- [ ] PM-01 Salud y readiness
- [ ] PM-02 Registro, login y perfil
- [ ] PM-03 Creación idempotente de viaje
- [ ] PM-04 Aceptación y estado del chofer
- [ ] PM-05 Autorización por recurso
- [ ] PM-06 Finalización y cobro
- [ ] PM-07 Replay de finalización
- [ ] PM-08 Conflictos y unicidad del cobro
- [ ] PM-09 Autorización del cobro
- [ ] PM-10 Invariantes en PostgreSQL
- [ ] PM-11 Rate limit de registro
- [ ] PM-12 Rate limit de viajes
- [ ] PM-13 Rate limit de login
- [ ] PM-14 Prototype pollution
- [ ] PM-15 Trazabilidad, headers y límites
- [ ] PM-16 Apagado ordenado
- [ ] PM-17 Auditoría de dependencias
- [ ] PM-18 Suite automatizada

Si todos los casos dan el resultado esperado, el requerimiento queda verificado
de punta a punta.
