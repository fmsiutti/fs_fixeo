# apps/api — NestJS

Complementa el `CLAUDE.md` de la raíz. Leé también `docs/dominio.md`.

## Estructura

```
src/
  modules/<modulo>/
    <modulo>.module.ts
    <modulo>.controller.ts     # fino: valida, autoriza, delega
    <modulo>.service.ts        # reglas de negocio + Prisma directo
    <modulo>.estados.ts        # solo pedidos y postulaciones: tabla y función de transición
    <modulo>.vistas.ts         # mapeo entidad -> vista según quién mira
    dto/                       # createZodDto sobre schemas de packages/shared
    *.spec.ts
  common/                      # guards, decorators, filters, pipes
  infra/                       # prisma, queue, storage, twilio, whatsapp, webpush
  jobs/                        # processors BullMQ
prisma/                        # schema.prisma, migrations/, seed.ts
test/                          # e2e (Supertest + Postgres real)
```

Módulos: `auth`, `usuarios`, `catalogo` (categorías, subcategorías, barrios), `profesionales` (perfil, oficios, zona), `verificaciones`, `pedidos`, `postulaciones`, `contactos`, `resenias`, `denuncias`, `notificaciones`, `archivos`, `parametros`, `eventos`, `admin` (solo controllers que delegan). No crear módulos nuevos sin motivo de dominio.

## Reglas de código

- Controller: sin lógica. Service: toda la regla de negocio. Prisma se usa directo en el service; sin repositorios.
- Validación en el borde con zod (`nestjs-zod`), schemas en `packages/shared`. Un schema por contrato; el tipo se infiere, no se escribe a mano.
- **Nunca devolver entidades Prisma**. Cada endpoint devuelve una vista de `*.vistas.ts`. La vista para el profesional antes de la selección no incluye teléfono, dirección exacta ni apellido del cliente.
- Cambios de estado solo vía `transicionar()` del módulo, dentro de `prisma.$transaction`. La transición valida el estado de origen y lanza `ConflictException` con código estable.
- Errores de negocio: excepciones de Nest con `code` estable definido en `packages/shared` (`POSTULACION_CUPO_LLENO`, `PROFESIONAL_SIN_VERIFICAR`, ...). El front decide el texto.
- **Concurrencia**: cupo de 8 postulaciones, límite diario, máximo de elegidos y pedidos activos se chequean dentro de la transacción con `SELECT ... FOR UPDATE` sobre el pedido (o el usuario) vía `$queryRaw`. Cada uno con un test de carrera.
- Parámetros de negocio: `ParametrosService.get('postulaciones_max_por_pedido')`. Cache en memoria de 60 s como máximo.
- Dinero: pesos enteros (`Int`), nunca float. Fechas en UTC; las reglas de «día» (límite diario) usan `America/Argentina/Buenos_Aires`. Teléfonos en E.164.
- Listados paginados por cursor. Nunca devolver colecciones sin límite.
- Logs con el `Logger` de Nest, sin PII. Nada de `console.log`.

## Auth

OTP con Twilio Verify (SMS con alternativa por llamada). Access token JWT corto (Authorization header) + refresh token rotativo en cookie `httpOnly`, `SameSite=Lax`. Rate limit con `@nestjs/throttler` por IP y por teléfono en los endpoints de OTP. Guards: `@Roles('cliente' | 'profesional' | 'moderador' | 'soporte')`. El `rol_activo` alterna entre cliente y profesional; moderador y soporte son roles de sistema aparte (soporte es solo lectura).

## Jobs (BullMQ)

- Preferí **barridos periódicos** que consultan la base (`expira_en < now()`, `sin postulaciones hace 12 h`) en lugar de un job diferido por pedido. La base es la fuente de verdad.
- Todo job es idempotente. La deduplicación de avisos usa una clave única en `notificacion` (`tipo + objeto_id + usuario_id`).
- Jobs previstos: expiración de pedidos, aviso de día 6, aviso sin postulaciones a las 12 h, consulta a las 48 h del contacto, consulta de desenlace (día 7 y, si el cliente postergó, una sola vez más), cierre automático por `cierre_automatico_en`, aviso inicial a los 30 profesionales coincidentes con cuota de rotación, recordatorio de vencimiento de matrícula a 30 días y suspensión del oficio al vencer.
- El cierre automático se maneja por la columna `pedido.cierre_automatico_en`, no por un job programado a 14 días: así postergarlo (D4) es un `update` y no hay que cancelar ni reprogramar nada.

## Integraciones

Cada proveedor (Twilio, WhatsApp Cloud API, Web Push, S3) tiene un wrapper delgado en `infra/` y un driver `log` seleccionable por variable de entorno, para desarrollar y testear sin credenciales. WhatsApp solo para «primera postulación» y «te eligieron», con plantillas aprobadas. Web Push no es confiable en iOS: nunca depender solo de push para los eventos clave.

## Archivos

Fotos de pedido: entran por la API, se re-codifican con `sharp` (quita EXIF y limita tamaño) y se guardan en S3/R2. Documentos de verificación: bucket privado, cifrado en reposo, URLs firmadas de vida corta solo para moderadores y cada acceso se registra en `acceso_documento`.

## Tests

- Jest unitario en los services con reglas: transiciones, límites, cupos, visibilidad, matching.
- e2e con Supertest contra Postgres real (`docker compose`), un `describe` por flujo del documento funcional (§7).
- No testear getters, mapeos triviales ni el framework. Sin snapshots.
