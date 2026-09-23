-- CreateEnum
CREATE TYPE "exigencia_matricula" AS ENUM ('obligatoria', 'recomendada', 'no_exigida');

-- CreateTable
CREATE TABLE "categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subcategorias" TEXT[],
    "preguntas_guia" JSONB NOT NULL,
    "requiere_matricula" "exigencia_matricula" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barrio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "barrio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametro_negocio" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,

    CONSTRAINT "parametro_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categoria_slug_key" ON "categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "barrio_nombre_key" ON "barrio"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "parametro_negocio_clave_key" ON "parametro_negocio"("clave");
