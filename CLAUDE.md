# Fixeo

Marketplace de oficios para el AMBA (piloto). El cliente publica un **pedido**, los profesionales verificados se **postulan**, el cliente **elige** y se habilita el contacto directo por WhatsApp o teléfono. La v1 termina en el contacto: no hay pagos, chat interno ni presupuestos estructurados.

> Estado: proyecto nuevo. Si el repo está vacío, arrancá con `/bootstrap` y seguí `docs/plan-de-construccion.md`.

## Fuentes de verdad

- `docs/dominio.md`: **la fuente de verdad del negocio**. Estados, reglas, visibilidad de datos, modelo de datos, notificaciones, eventos y las decisiones que cerraron los huecos del documento (§12).
- `docs/pantallas.md`: índice de pantallas (CL, PR, CO, AD) con ruta y reglas clave.
- "Fixeo — Documento funcional v1": origen de los dos anteriores. `docs/dominio.md` §12 lista las decisiones (D1 a D16) donde se aparta del documento a propósito. Fuera de esas, si el código y el documento se contradicen, gana el documento; avisá antes de desviarte.
- Reglas por app: `apps/api/CLAUDE.md` y `apps/web/CLAUDE.md`.
- `docs/design-base.html`: Base del diseño de toda la aplicación. Usar como referencia visual para todas las pantallas. Si se contradice con algo del dominio o reglas de negocio, respeta el dominio y adapta el diseño.

## Stack

- Monorepo **pnpm workspaces**, Node LTS (>= 22), TypeScript `strict` en todo.
- `apps/api`: **NestJS + Prisma + PostgreSQL 16 con PostGIS**. Redis + BullMQ para jobs.
- `apps/web`: **React + Vite + React Router + TanStack Query + react-hook-form**. PWA mobile-first. El back office vive en `/admin` (misma app, guard por rol).
- `packages/shared`: schemas **zod**, enums de estados, códigos de error y tipos inferidos. Es el único lugar donde se define un contrato entre web y api.
- Servicios externos (no agregar otros sin preguntar): Twilio Verify (OTP), S3-compatible (S3 o R2), Web Push, WhatsApp Cloud API.
- Tests: Jest (api), Vitest + Testing Library (web), Playwright (2 o 3 flujos críticos).
- Tooling: ESLint + Prettier, Conventional Commits, Docker Compose para Postgres y Redis locales.

```
apps/api/          NestJS
apps/web/          React PWA + /admin
packages/shared/   zod, tipos, enums
docs/              dominio, pantallas, plan
.claude/           agentes, comandos, settings
docker-compose.yml postgres (postgis) + redis
```

## Comandos

Crearlos con estos nombres durante el bootstrap:

```
docker compose up -d                      # postgres + redis
pnpm dev                                  # api + web en paralelo
pnpm lint && pnpm typecheck && pnpm test  # verificación completa
pnpm -F api test:e2e                      # e2e contra Postgres real
pnpm -F api exec prisma migrate dev       # migraciones (ver reglas abajo)
pnpm -F web e2e                           # Playwright
```

## Idioma y nombres

- **Dominio en español, sin tildes ni ñ**: `Pedido`, `Postulacion`, `contacto_habilitado`, `resenia`, `anios_experiencia`. Usá el vocabulario exacto de `docs/dominio.md` §1, siempre igual en UI, API, código y eventos.
- **Todo lo técnico en inglés**: `Service`, `Controller`, `create`, `findMany`, `useQuery`.
- JSON de la API y código TS en `camelCase`; tablas y columnas en `snake_case` (vía `@map`); enums y eventos en `snake_case`; URLs en español, plural, kebab-case (`/pedidos`, `/postulaciones`).
- UI en español rioplatense con voseo («Publicá», «Elegí»). Se dice _estimación_ (nunca «presupuesto») y _elegir_ o _seleccionar_ (nunca «contratar»).
- Commits en español con prefijo convencional (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`). Comentarios solo para explicar el porqué.

## Anti-sobreingeniería (reglas duras)

1. Monolito modular. Sin microservicios, CQRS, event sourcing, arquitectura hexagonal ni DDD táctico.
2. Sin capa de repositorios: los services usan `PrismaService` directo.
3. No abstraer hasta el segundo uso real. Nada de interfaces con una sola implementación, salvo el borde con proveedores externos, que tiene un driver `log`/fake para desarrollo y tests.
4. No agregar dependencias sin preguntar. Preferí lo que ya está (zod, TanStack Query, Prisma).
5. Sin estado global salvo sesión y rol activo. El estado del servidor vive en TanStack Query.
6. Sin i18n, feature flags, caché, websockets ni GraphQL: no están en el alcance de la v1.
7. Construí lo que la ficha o la regla pide, no más. Lo que el documento marca como «No entra» (documento §2.2) ni se construye ni se deja «preparado».
8. Funciones cortas, early returns, nombres claros. Un service que pasa de ~400 líneas se divide por caso de uso, no por capa técnica.

## Reglas de negocio no negociables

Detalle en `docs/dominio.md`.

1. **Máquina de estados**: todo cambio de estado de `Pedido` y `Postulacion` pasa por la función de transición de su módulo. Nunca un `update({ estado })` suelto.
2. **Visibilidad de datos** (documento §11.3): teléfono, dirección exacta y apellido del cliente solo tras la selección y solo para el elegido; el teléfono del profesional solo para el cliente que lo eligió. Nunca se devuelve una entidad Prisma cruda: siempre se mapea a una vista. Cada vista tiene test.
3. **Parámetros, no constantes** (documento §11.1): límites y tiempos salen de `ParametrosService` (tabla `parametro_negocio`).
4. **Cupos con concurrencia segura**: cupo por pedido, límite diario, máximo de seleccionados y pedidos activos se validan dentro de una transacción con lock.
5. **Postular exige identidad verificada**; en gas y electricidad exige además matrícula validada y vigente.
6. **Datos de contacto en texto libre** (teléfonos, emails, usuarios de redes) se detectan en descripción de pedido y mensaje de postulación. Se comunica como protección al cliente, no como anti-desintermediación.
7. **Reseñas**: solo del cliente con contacto habilitado, una por contacto, no se borran a pedido del profesional, se anonimizan al eliminar la cuenta.
8. **Eventos de analítica** (documento §14.2): se registran en el mismo cambio que la acción, siempre con categoría, zona y rol.
9. **Privacidad**: fotos sin metadatos de ubicación; documentos de verificación cifrados, en bucket privado y con acceso auditado; logs sin teléfonos, direcciones ni documentos.

## Cómo trabajar

- Antes de codear leé la ficha o regla en `docs/`. Si tocás más de 3 archivos, escribí un plan de 5 a 8 líneas y avanzá.
- Los huecos del documento ya están decididos en `docs/dominio.md` §12 (D1 a D16): implementalos tal cual, sin volver a preguntar. Si aparece un caso que ninguna decisión cubre, **preguntá**; no inventes reglas de negocio.
- Trabajá en **slices verticales** (DB → API → pantalla → tests), en el orden de `docs/plan-de-construccion.md`.
- Delegá en los agentes de `.claude/agents/`:
  - `db-migrations`: schema Prisma, migraciones, PostGIS, seed.
  - `backend-nest`: módulos, reglas, jobs, integraciones.
  - `frontend-react`: pantallas y flujos de la PWA y del back office.
  - `test-writer`: tests de reglas de negocio, e2e y flujos críticos.
  - `code-reviewer`: revisión de solo lectura antes de dar algo por terminado.
- Git: una rama por slice (`feat/<slice>`), commits chicos. Nunca `push`, `--force` ni commit de `.env` sin pedido explícito.
- Migraciones: nunca editar una ya aplicada (se crea otra); nunca `migrate reset`, `db push` ni `deploy` sin confirmación.

## Definición de hecho

- `pnpm lint && pnpm typecheck && pnpm test` en verde.
- Toda regla de negocio tocada tiene test.
- Pantallas con estados vacío, carga y error, y usables a 360 px de ancho.
- Sin `any`, `console.log`, secretos ni TODO sin contexto.
- Cierre corto: qué cambió, qué no pudiste verificar, qué decisión queda abierta.

## Decisiones

- **Técnicas**: PWA (no app nativa), monorepo pnpm, PostgreSQL + PostGIS + Prisma, dominio en español y técnico en inglés, back office en `/admin` de la misma app, Twilio Verify, S3/R2, BullMQ, Web Push + WhatsApp Cloud API.
- **De producto** (documento §18): las 8 categorías del piloto, sin chat interno, hasta 3 profesionales elegibles, estimación opcional, trato de vos.
- **De dominio**: las de `docs/dominio.md` §12. Las dos que más cambian el código: el pedido entra **una sola vez** a `contacto_habilitado` y las postulaciones no elegidas siguen vivas mientras quede cupo de elegibles (D2, D3); y el video del pedido queda fuera de la v1 (D8).
- Todo esto está cerrado. No hay decisiones de negocio pendientes que bloqueen construir.
