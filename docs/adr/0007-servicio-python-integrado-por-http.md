# ADR-0007: Reportes en un servicio Python separado, integrado por HTTP

- **Estado:** Aceptado
- **Fecha:** 2026-11-11
- **Participantes:** Lucas Gimenez, Guido Ayala, Enzo Vernet
- **Tarjeta:** Parte Python (ver `docs/python.md`)

## Contexto

La cátedra pide que una parte del proyecto esté hecha en Python. El backend
principal es Node.js con Express (ADR-0001) y es la fuente oficial de viajes,
cotizaciones, zonas y precios. Hay que decidir cómo se suma Python sin romper esa
regla, sin que el flujo principal de viajes dependa de él y sin compartir
responsabilidades confusas entre los dos lenguajes.

El alcance de Python está en `docs/python.md`: un reporte operativo de precio
dinámico por zona.

## Alternativas consideradas

| Alternativa                                                                        | Ventajas                                                                                                                                                                                                                     | Desventajas                                                                                                                         |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **A. Servicio Python separado que se comunica con Node por HTTP + JSON** (elegida) | Cada servicio tiene su base y su ciclo de vida; el contrato entre ambos es explícito y se puede probar con respuestas simuladas; si Python se cae, Node sigue funcionando; se levanta con Docker Compose igual que el resto. | Dos servicios para desplegar; hay que manejar tiempos de espera, errores de red y una credencial de servicio.                       |
| B. Python lee directamente la base PostgreSQL de Node                              | Menos código: sin endpoints de integración.                                                                                                                                                                                  | Acopla Python al esquema interno (cualquier migración lo rompe); salta la autorización de la API; dos dueños para los mismos datos. |
| C. Node ejecuta scripts Python como procesos hijos                                 | Un solo servicio que desplegar.                                                                                                                                                                                              | Mezcla los dos lenguajes en el mismo proceso de despliegue; un script lento afecta a Node; difícil de probar y de explicar.         |
| D. Comunicación por cola de mensajes                                               | Desacople total y reintentos.                                                                                                                                                                                                | Agrega un broker (RabbitMQ, Redis) que el TP no necesita para un reporte.                                                           |

## Decisión

Usamos un **servicio Python independiente** (alternativa A):

- Python tiene **su propia base SQLite** y nunca accede a la base de Node.
- Python **pide datos a Node** por HTTP: un endpoint de integración de Node devuelve
  los viajes finalizados de una zona en un rango de fechas, sin datos personales.
- Node **consulta el reporte** a Python por HTTP. Esa consulta lee el último
  reporte guardado y **no vuelve a llamar a Node**, para evitar una cadena circular.
- Ambos lados se autentican con una **credencial de servicio** distinta del JWT de
  usuarios, configurada por variable de entorno en cada servicio.
- Cada llamada tiene **tiempo máximo de espera**. Si Python no responde, Node
  devuelve un error claro en el endpoint del reporte y **el resto de la API sigue
  funcionando**.
- Los nombres definitivos de endpoints y campos se acuerdan en `docs/api.md` antes
  de programar cualquiera de los dos lados.

## Consecuencias

- Node necesita un endpoint de integración nuevo y un adaptador HTTP de salida para
  Python (un puerto más en `src/application/ports/out/`, con su doble de prueba).
- Python necesita su propio README, archivo `.env.example`, tests y servicio en
  `compose.yaml`.
- El reporte depende de datos que todavía no existen en Node (zona, multiplicador
  fijado, inicio y fin del viaje): no se puede integrar hasta que estén RF-16 a
  RF-18 y la finalización del viaje.
- La credencial de servicio es un secreto más: va en `.env`, nunca en el código, y se
  documenta en los dos `.env.example`.
- Para el ataque cruzado (E6), los endpoints de integración también son superficie
  de ataque: tienen que rechazar llamadas sin la credencial de servicio.

## Condición de revisión

Reabrir si la cátedra exige que Python cumpla un requisito funcional del flujo
principal (y no solo un reporte), si el reporte necesita datos en tiempo real, o si
mantener dos servicios en el entorno de ataque resulta inviable.
