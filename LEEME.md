# Fixeo — configuración de Claude Code

Este paquete deja el repo de Fixeo listo para desarrollarlo con Claude Code (React + NestJS, ambos en TypeScript).

## Cómo usarlo

1. Descomprimí el zip **en la raíz del repo** (la carpeta `.claude/` tiene que quedar al lado de `CLAUDE.md`). Es un archivo oculto: activá «mostrar archivos ocultos» si no lo ves.
2. Abrí Claude Code en esa carpeta y ejecutá `/bootstrap` para armar el monorepo. Durante el bootstrap va a pedir aprobación para cada `pnpm add` (es a propósito: ninguna dependencia entra sin que la veas).
3. Seguí con `/nueva-feature slice 1`, y así con el resto de `docs/plan-de-construccion.md`.

## Qué hay adentro

```
CLAUDE.md                      Reglas globales: stack, convenciones, anti-sobreingeniería, reglas de negocio
apps/api/CLAUDE.md             Reglas de NestJS, Prisma, jobs, auth e integraciones
apps/web/CLAUDE.md             Reglas de React PWA, pantallas, estados y accesibilidad
docs/dominio.md                Estados, parámetros, visibilidad, modelo de datos y las 11 decisiones de dominio
docs/pantallas.md              Índice de pantallas con ruta y reglas clave
docs/plan-de-construccion.md   Slices verticales en orden
.claude/agents/                backend-nest · frontend-react · db-migrations · test-writer · code-reviewer
.claude/commands/              /bootstrap · /nueva-feature · /revisar · /migracion
.claude/settings.json          Permisos y hook de formateo
.claude/hooks/format.mjs       Corre Prettier sobre cada archivo que Claude edita
```

## Cómo se usan los agentes

Claude los invoca solos según su descripción, y también podés pedirlos por nombre («usá db-migrations para…»). Los cinco están pensados para el flujo `db-migrations → backend-nest → frontend-react → test-writer → code-reviewer`, que `/nueva-feature` orquesta. `code-reviewer` es de solo lectura y corre con Opus; el resto con Sonnet. Podés cambiar el modelo en el encabezado (`model:`) de cada archivo.

## Qué conviene revisar y ajustar

- **`docs/dominio.md` §12**: once decisiones (D1 a D11) que cierran los huecos y contradicciones del documento funcional, para que nada bloquee el desarrollo. Están tomadas, no propuestas: los agentes las implementan sin preguntar. Si querés cambiar alguna, editá esa sección y el resto del paquete la sigue. Las que más cambian el producto son D2 y D3 (las postulaciones no elegidas siguen vivas mientras quede cupo, en vez de morir con la primera selección) y D8 (el video del pedido queda fuera de la v1).
- **Estilos**: asumí Tailwind. Si querés usar un sistema de diseño propio, cambiá esa línea en `apps/web/CLAUDE.md`.
- **Permisos** (`.claude/settings.json`): se aprueban `pnpm`, `docker compose` y `git` local; piden confirmación `pnpm add`, `git push` y `prisma migrate deploy`; se bloquean `.env`, `migrate reset`, `db push`, `git reset --hard`, force push y `rm -rf`.
- **Hook de formateo**: no hace nada hasta que exista Prettier en el proyecto, y nunca bloquea una edición.
- Los comandos de `CLAUDE.md` (`pnpm dev`, `pnpm test`, etc.) son los nombres que `/bootstrap` va a crear.
- Después de las primeras semanas, revisá el `CLAUDE.md` y sacá lo que Claude ya hace bien solo. Un archivo corto se respeta más que uno largo.
