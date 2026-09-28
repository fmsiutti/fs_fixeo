# Plan de construcción

Orden sugerido de slices verticales. Cada slice incluye base de datos, API, pantalla, tests y los eventos de analítica de sus acciones. Un slice se da por terminado cuando cumple la definición de hecho del `CLAUDE.md`.

| #   | Slice                             | Incluye                                                                                                                                                                                                            |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | Bootstrap                         | Monorepo pnpm, tsconfig base, ESLint + Prettier, `packages/shared`, esqueleto de api y web, `docker-compose` (PostGIS + Redis), `.env.example`, CI mínima (lint, typecheck, test), endpoint de salud. `/bootstrap` |
| 1   | Auth y cuentas                    | OTP con Twilio Verify (driver `log` en dev), JWT + refresh, `usuario`, `rol_activo`, guards, CO-01 a CO-03, CO-06.                                                                                                 |
| 2   | Catálogo y parámetros             | `categoria`, `barrio`, `parametro_negocio` con seed, `ParametrosService`, lectura pública del catálogo.                                                                                                            |
| 3   | Publicar pedido                   | Asistente CL-02 a CL-06, `direccion`, fotos (sharp + S3/R2), controles automáticos, máquina de estados del pedido, `borrador`/`en_revision`/`publicado`, CL-01, CL-07.                                             |
| 4   | Perfil profesional y verificación | PR-01, PR-07, oficios, zona (barrios y radio), subida de documentos, AD-01, aviso de resultado.                                                                                                                    |
| 5   | Feed y matching                   | Consulta geoespacial, orden y filtros, aviso inicial a 30 profesionales (BullMQ), cuota de rotación, PR-02, PR-03.                                                                                                 |
| 6   | Postulaciones                     | PR-04, PR-05, límites (cupo por pedido, límite diario) con lock, CL-08, CL-09, plantillas de mensaje, aviso al cliente.                                                                                            |
| 7   | Selección y contacto              | Selección de 1 a 3 con el ciclo de vida de las no elegidas (D2, D3), `contacto`, vistas con datos revelados, CL-10, PR-06, WhatsApp con plantillas. Test de visibilidad exhaustivo.                                |
| 8   | Cierre, reseñas y jobs            | CL-11 con postergación del desenlace (D4), `resenia`, respuesta del profesional, expiración, avisos día 6 y 12 h, consultas de 48 h y día 7, cierre automático.                                                    |
| 9   | Moderación y métricas             | Denuncias (CO-07), cola de `en_revision` (D1), AD-02 a AD-05, tablero, consultas de las métricas de `docs/dominio.md` §10.                                                                                         |
| 10  | Pulido de PWA y endurecimiento    | Instalación, Web Push, página offline, rate limits, revisión de seguridad y privacidad, accesibilidad.                                                                                                             |

## Antes de arrancar cada slice

1. Releé las fichas y reglas involucradas.
2. Revisá `docs/dominio.md` §12: las decisiones D1 a D16 son de implementación obligatoria y varias atraviesan estos slices. Preguntá solo si aparece un caso que ninguna cubre.
3. Orden de trabajo: `db-migrations` → `backend-nest` → `frontend-react` → `test-writer` → `code-reviewer`. `/nueva-feature` lo orquesta.
