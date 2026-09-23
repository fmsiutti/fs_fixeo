-- preguntas_guia pasa de Json a lista de strings (docs/dominio.md §11 la
-- modela igual que subcategorias, no como estructura abierta). Los datos
-- actuales son uniformemente [] (sembrados en este mismo slice, sin contenido
-- real todavia), asi que no hay conversion de contenido que preservar.
ALTER TABLE "categoria" DROP COLUMN "preguntas_guia";
ALTER TABLE "categoria" ADD COLUMN "preguntas_guia" TEXT[] NOT NULL DEFAULT '{}';
