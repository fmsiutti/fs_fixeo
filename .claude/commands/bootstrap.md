---
description: Arma el esqueleto del monorepo de Fixeo (slice 0) según el CLAUDE.md
argument-hint: [opcional: notas o restricciones]
---

Ejecutá el **slice 0** de `docs/plan-de-construccion.md`: dejar el monorepo listo para desarrollar. Notas del usuario: $ARGUMENTS

Antes de empezar, verificá el estado del repo. Si no está vacío, listá lo que hay y preguntá cómo seguir; no pises nada.

Construí solo lo siguiente, con las versiones estables vigentes y sin dependencias extra:

1. **Workspace pnpm**: `pnpm-workspace.yaml`, `package.json` raíz con los scripts de `CLAUDE.md` (`dev`, `lint`, `typecheck`, `test`), `tsconfig.base.json` con `strict`, ESLint y Prettier compartidos, `.gitignore`, `.editorconfig`, `.nvmrc`.
2. **`packages/shared`**: paquete TS con zod, un primer enum de estados de pedido y postulación, y el tipo de códigos de error. Sin lógica.
3. **`apps/api`**: NestJS con `PrismaService`, módulo `parametros` vacío, `ConfigModule` con validación zod de variables de entorno, endpoint `GET /salud`, Jest configurado. Prisma con PostgreSQL y la migración inicial que habilita PostGIS.
4. **`apps/web`**: Vite + React + TypeScript, React Router, TanStack Query, Tailwind, `vite-plugin-pwa` con manifest básico, Vitest + Testing Library, una pantalla de inicio que consulta `/salud`.
5. **`docker-compose.yml`** con `postgis/postgis` y `redis`, y `.env.example` con todas las variables (sin valores reales).
6. **CI** mínima de GitHub Actions: instalar, lint, typecheck, test.

Al terminar, verificá que `docker compose up -d`, `pnpm dev`, `pnpm lint`, `pnpm typecheck` y `pnpm test` funcionen, y mostrá el resultado. Hacé un commit por bloque lógico. Cerrá con lo que quedó pendiente y con cualquier decisión que hayas tenido que tomar.
