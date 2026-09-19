---
description: Revisa los cambios actuales con el agente code-reviewer
argument-hint: [opcional: rama, archivos o foco, ej. "visibilidad de datos"]
---

Delegá en el agente `code-reviewer` la revisión de los cambios actuales. Alcance o foco pedido: $ARGUMENTS

Si no se indicó alcance, la revisión cubre `git diff` contra la rama base más los archivos sin seguimiento. En el pedido al agente incluí el alcance exacto, qué se intentó lograr con el cambio y cualquier decisión de diseño que convenga conocer, porque el agente no ve esta conversación.

Cuando responda, mostrale al usuario el veredicto y los hallazgos tal cual, ordenados por severidad. No corrijas nada hasta que el usuario lo confirme, salvo que haya pedido explícitamente revisar y corregir.
