# Auditoría de dependencias

- **Fecha:** 12 de noviembre de 2026.
- **Proyecto:** `Prog4-Puljiz`.
- **Gestor de paquetes:** pnpm 12.16.1, con `pnpm-lock.yaml` versionado.
- **Alcance:** dependencias de producción y de desarrollo.

## 1. Comandos ejecutados

El proyecto usa pnpm. Por eso `npm audit` no es aplicable: no existe
`package-lock.json` y npm responde `ENOLOCK`. El comando equivalente es:

```bash
pnpm audit --prod   # dependencias que se despliegan
pnpm audit          # incluye devDependencies (ESLint, Prettier, etc.)
```

## 2. Resultado de producción

```text
$ pnpm audit --prod
No known vulnerabilities found
```

No hay vulnerabilidades conocidas en las dependencias que se instalan en
producción.

## 3. Resultado completo

```text
$ pnpm audit
1 vulnerabilities found
Severity: 1 moderate
```

| Severidad | Paquete | Versión | Aviso | Ruta |
|---|---|---|---|---|
| Moderada | `minimatch` | 10.2.6 | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | `eslint -> minimatch` |

La versión vulnerable es `>=7.0.0 <11.0.1`; la corregida es `>=11.0.1`.

## 4. Justificación

El único hallazgo es **moderado y exclusivamente de desarrollo**:

- `minimatch` entra por `eslint`, una `devDependency` que no se copia a la
  imagen de producción (`pnpm install --prod` no la incluye).
- El aviso describe una denegación de servicio al procesar patrones glob
  manipulados. En este proyecto los patrones provienen de la configuración de
  lint versionada, no de entrada de usuarios ni de la API.
- No hay una ruta de ejecución desde HTTP hacia `minimatch`.
- No existen hallazgos **altos** ni **críticos**, ni en producción ni en
  desarrollo.

Por lo tanto, el hallazgo no bloquea la entrega y queda registrado como deuda
técnica de desarrollo. Se debe actualizar ESLint o forzar `minimatch >=11.0.1`
cuando la versión de ESLint utilizada sea compatible, y volver a ejecutar
`pnpm audit`.

## 5. Revisión de código complementaria

Además del análisis automático se revisó:

- que las consultas SQL usen parámetros (`$1`, `$2`, …) y no interpolación de
  valores;
- que las contraseñas se guarden con bcrypt y nunca en texto plano;
- que los errores 500 no expongan stack traces ni mensajes internos;
- que los cuerpos HTTP se validen con esquemas Zod estrictos;
- que las claves de idempotencia y los cobros tengan restricciones únicas en la
  base de datos.

## 6. Conclusión

**No hay vulnerabilidades altas ni críticas sin justificar.** El único aviso es
moderado, de desarrollo y sin exposición en producción. El resultado de
producción es limpio (`No known vulnerabilities found`).
