---
description: Implementa un slice o pantalla de Fixeo de punta a punta orquestando los agentes
argument-hint: <slice del plan o códigos de pantalla, ej. "slice 6" o "CL-08, PR-04">
---

Implementá: $ARGUMENTS

Seguí este proceso y no te saltees pasos.

1. **Entender**. Leé `CLAUDE.md`, la sección correspondiente de `docs/plan-de-construccion.md`, las fichas de `docs/pantallas.md` y las reglas de `docs/dominio.md` involucradas. Revisá el código existente parecido.
2. **Decisiones de dominio**. Revisá `docs/dominio.md` §12: las once decisiones D1 a D11 ya resolvieron los huecos del documento funcional y son de implementación obligatoria. Preguntale al usuario solo si aparece un caso que ninguna cubre.
3. **Plan corto**. Escribí en 5 a 8 líneas qué vas a construir: modelos, endpoints, pantallas, eventos de analítica. Si algo es ambiguo, preguntá; si no, avanzá.
4. **Datos**. Si hay cambios de esquema, delegá en el agente `db-migrations`.
5. **API**. Delegá en `backend-nest` con el contexto necesario: qué modelos existen, qué contrato necesitás y qué reglas aplican. Los subagentes no ven esta conversación, así que el pedido tiene que ser autosuficiente.
6. **Pantallas**. Delegá en `frontend-react` con los endpoints y contratos ya disponibles y las fichas exactas.
7. **Tests**. Delegá en `test-writer` los casos de reglas de negocio, visibilidad, límites y el flujo e2e correspondiente.
8. **Revisión**. Delegá en `code-reviewer`. Corregí los bloqueantes e importantes y volvé a revisar si fueron varios.
9. **Verificación**. Corré `pnpm lint && pnpm typecheck && pnpm test`.
10. **Cierre**. Resumí en pocas líneas qué se construyó, qué quedó sin verificar y qué decisiones siguen abiertas. Si el usuario lo pidió, hacé commits chicos con Conventional Commits en una rama `feat/<slice>`.

Cuando dos partes no dependan entre sí, podés delegarlas en paralelo. Nunca avances con código de la capa siguiente si la anterior no compila.
