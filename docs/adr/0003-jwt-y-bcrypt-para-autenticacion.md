# ADR-0003: JWT firmado y bcrypt para autenticación; permisos por rol y por recurso

- **Estado:** Aceptado
- **Fecha:** 2026-11-11
- **Participantes:** Lucas Gimenez, Guido Ayala, Enzo Vernet
- **Tarjeta:** E0 · ADR de autenticación y permisos

## Contexto

La API tiene cuatro roles (pasajero, chofer, operador de soporte y administrador)
y recursos que pertenecen a una persona: un viaje es de su pasajero y de su chofer
asignado, y la ubicación de un viaje solo la ven sus participantes (RF-21). Hay
que decidir:

1. cómo se identifica a quien llama (sesiones o tokens);
2. cómo se guardan las contraseñas;
3. dónde se verifica cada permiso, para no dejar accesos a recursos ajenos (IDOR).

Restricciones: en la semana de ataque cruzado (E6) otro grupo va a intentar
romper esto; el servidor puede correr en más de una instancia durante las
mediciones; los tests tienen que poder simular el reloj.

## Alternativas consideradas

### Identificación

| Alternativa                         | Ventajas                                                                                                                                             | Desventajas                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **JWT firmado con HS256** (elegida) | Sin estado en el servidor: cualquier instancia valida el token con el mismo secreto. Fácil de usar desde la colección de demo y desde WebSocket/SSE. | No se puede revocar un token antes de que venza; si se filtra el secreto, se pueden fabricar tokens. |
| Sesión en el servidor con cookie    | Revocación inmediata (se borra la sesión).                                                                                                           | Necesita un almacén compartido entre instancias (tabla o Redis) y protección CSRF por usar cookies.  |

### Hash de contraseñas

| Alternativa                                    | Ventajas                                                                                                                     | Desventajas                                                                                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **bcrypt, costo 12** (elegida, con `bcryptjs`) | Estándar probado; el costo se ajusta por configuración; `bcryptjs` es JavaScript puro y no necesita compilar nada en Docker. | Usa poca memoria, así que es menos resistente a ataques con GPU que argon2; trunca contraseñas de más de 72 bytes; la versión JS es más lenta que la nativa. |
| argon2id                                       | Recomendado actualmente por OWASP; resistente a GPU por uso de memoria.                                                      | Requiere un módulo nativo que se compila al instalar; más fricción en Alpine y en las máquinas del equipo.                                                   |

Con costo 12, cada hash tarda del orden de cientos de milisegundos con `bcryptjs`.
Es aceptable porque solo se calcula al registrarse y al iniciar sesión, y el login
tiene límite de intentos.

## Decisión

- **Identificación:** JWT firmado con **HS256** (librería `jose`). El token lleva
  el id del usuario y su rol, más emisor (`prog4-puljiz`), audiencia
  (`prog4-puljiz-api`) y vencimiento. Dura `JWT_EXPIRES_IN_MINUTES` (60 por
  defecto). El secreto `JWT_SECRET` es obligatorio en modo real, tiene al menos 32
  caracteres y solo se configura por variable de entorno.
- **Contraseñas:** bcrypt con costo `PASSWORD_HASH_COST` (12 por defecto, entre 4
  y 15). Nunca se guarda ni se registra la contraseña en texto plano.
- **Registro:** solo se pueden registrar pasajeros y choferes. Las cuentas de
  operador y administrador no se crean desde la API pública (hoy las crea el seed).
- **Login:** límite de 5 intentos cada 15 minutos (`LOGIN_RATE_LIMIT_*`); al
  superarlo responde 429.
- **Permisos, en dos niveles:**
  1. **Por rol**, en la capa HTTP: el middleware `crearAutorizacionPorRol(...)`
     rechaza con 403 a quien no tiene un rol permitido para la ruta.
  2. **Por recurso**, en los casos de uso: cada caso de uso recibe al usuario que
     llama y verifica que el recurso le pertenezca. Por ejemplo, `obtener-viaje.js`
     solo permite al pasajero del viaje, al chofer asignado, al operador de soporte
     y al administrador; `cancelar-viaje.js` exige ser el pasajero del viaje.

  La verificación por recurso vive en la aplicación, no en Express, para que valga
  igual desde HTTP, desde tiempo real o desde un test.

## Consecuencias

- Cualquier instancia valida tokens sin consultar la base.
- Un token robado sirve hasta que vence: por eso la vida es corta (60 minutos).
  No hay refresh token ni lista de revocación; un cambio de rol se nota recién con
  el próximo token.
- Si `JWT_SECRET` se filtra hay que rotarlo, y eso invalida todos los tokens.
- Cada endpoint nuevo tiene que declarar sus roles y, si toca un recurso con dueño,
  verificar la propiedad en su caso de uso. La tabla completa de permisos por
  endpoint va en `docs/api.md` (tarjeta «Contrato de API y permisos»).
- El límite de intentos se guarda en memoria del proceso: con varias instancias,
  cada una cuenta por separado.

## Condición de revisión

Reabrir si hace falta revocar tokens antes de que venzan (por ejemplo, para
inhabilitar a un chofer en el momento), si el ataque cruzado encuentra un abuso del
token, si el login supera un p95 razonable en las mediciones por culpa del costo de
bcrypt, o si pasamos a varias instancias detrás de un balanceador.
