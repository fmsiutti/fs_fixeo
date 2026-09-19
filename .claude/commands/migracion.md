---
description: Crea un cambio de esquema y su migración con el agente db-migrations
argument-hint: <qué cambio de datos se necesita, ej. "agregar tabla notificacion con clave de deduplicación">
---

Delegá en el agente `db-migrations` este cambio de datos: $ARGUMENTS

En el pedido al agente incluí: el motivo de negocio, las secciones de `docs/dominio.md` relacionadas, las consultas que van a usar el cambio (para elegir índices) y si hay datos existentes que migrar. El agente no ve esta conversación.

Cuando termine:

1. Mostrale al usuario el SQL generado y el resumen de modelos e índices.
2. Confirmá que la migración se aplicó solo en desarrollo. No se aplica nada en otros entornos.
3. Listá el código de `apps/api` o `apps/web` que hay que ajustar por el nuevo esquema y ofrecé delegarlo en `backend-nest`.
