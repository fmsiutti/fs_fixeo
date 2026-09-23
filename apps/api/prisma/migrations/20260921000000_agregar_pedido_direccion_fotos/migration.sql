-- CreateEnum
CREATE TYPE "tipo_propiedad" AS ENUM ('casa', 'departamento', 'otro');

-- CreateEnum
CREATE TYPE "estado_pedido" AS ENUM ('borrador', 'en_revision', 'publicado', 'con_postulaciones', 'contacto_habilitado', 'cerrado', 'expirado', 'cancelado', 'bloqueado');

-- CreateEnum
CREATE TYPE "urgencia" AS ENUM ('emergencia', 'esta_semana', 'sin_apuro');

-- CreateTable
CREATE TABLE "direccion" (
    "id" TEXT NOT NULL,
    "calle" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "piso" TEXT,
    "depto" TEXT,
    "tipo_propiedad" "tipo_propiedad" NOT NULL,
    "barrio_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "subcategoria" TEXT,
    "descripcion" TEXT NOT NULL,
    "respuestas_guia" JSONB,
    "urgencia" "urgencia" NOT NULL,
    "franjas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "direccion_id" TEXT NOT NULL,
    "barrio_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "estado" "estado_pedido" NOT NULL DEFAULT 'borrador',
    "publicado_en" TIMESTAMP(3),
    "expira_en" TIMESTAMP(3),
    "cierre_automatico_en" TIMESTAMP(3),
    "desenlace_postergado" BOOLEAN NOT NULL DEFAULT false,
    "desenlace" TEXT,
    "motivo_moderacion" TEXT,
    "vistas" INTEGER NOT NULL DEFAULT 0,
    "cantidad_postulaciones" INTEGER NOT NULL DEFAULT 0,
    "cantidad_contactos" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foto_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "subida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foto_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direccion_barrio_id_idx" ON "direccion"("barrio_id");

-- CreateIndex
CREATE INDEX "pedido_cliente_id_idx" ON "pedido"("cliente_id");

-- CreateIndex
CREATE INDEX "pedido_estado_idx" ON "pedido"("estado");

-- CreateIndex
CREATE INDEX "pedido_cliente_id_estado_idx" ON "pedido"("cliente_id", "estado");

-- CreateIndex
CREATE INDEX "foto_pedido_pedido_id_idx" ON "foto_pedido"("pedido_id");

-- AddForeignKey
ALTER TABLE "direccion" ADD CONSTRAINT "direccion_barrio_id_fkey" FOREIGN KEY ("barrio_id") REFERENCES "barrio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_direccion_id_fkey" FOREIGN KEY ("direccion_id") REFERENCES "direccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_barrio_id_fkey" FOREIGN KEY ("barrio_id") REFERENCES "barrio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_pedido" ADD CONSTRAINT "foto_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
