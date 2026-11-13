#!/bin/bash

BASE=http://localhost:3000

echo "=== 1. AUTENTICACIÓN Y TOKENS ==="
TOKEN_PASAJERO=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"pasajero@prog4.test","contrasena":"Pasajero1234!"}' | jq -r '.token')

TOKEN_CHOFER=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"chofer1@prog4.test","contrasena":"Chofer1234!"}' | jq -r '.token')

TOKEN_ADMIN=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@prog4.test","contrasena":"Admin1234!"}' | jq -r '.token')

echo "Pasajero Token: ${TOKEN_PASAJERO:0:20}..."
echo "Chofer Token:   ${TOKEN_CHOFER:0:20}..."

echo -e "\n=== 2. CREAR VIAJE Y PROBAR IDEMPOTENCIA ==="
CLAVE="demo-$(date +%s)"

VIAJE_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')

echo "$VIAJE_JSON" | jq
VIAJE_ID=$(echo "$VIAJE_JSON" | jq -r '.viaje.id')

echo -e "\n--- Replay Idempotente (debe devolver 200 y replayed: true) ---"
curl -s -i -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}' | head -n 12

echo -e "\n=== 3. ACEPTO Y CANCELO VIAJE ==="
curl -s -X POST "$BASE/viajes/$VIAJE_ID/aceptar" -H "authorization: Bearer $TOKEN_CHOFER" | jq
curl -s -X POST "$BASE/viajes/$VIAJE_ID/cancelar" -H 'content-type: application/json' -H "authorization: Bearer $TOKEN_PASAJERO" -d '{"motivo":"Prueba"}' | jq

echo -e "\n=== 4. PRUEBA IDOR DE SEGURIDAD (debe dar 403) ==="
PASAJERO_ID=$(curl -s "$BASE/auth/yo" -H "authorization: Bearer $TOKEN_PASAJERO" | jq -r '.usuario.id')
curl -s -o /dev/null -w 'Resultado IDOR (Chofer leyendo Pasajero): %{http_code}\n' "$BASE/usuarios/$PASAJERO_ID" -H "authorization: Bearer $TOKEN_CHOFER"
