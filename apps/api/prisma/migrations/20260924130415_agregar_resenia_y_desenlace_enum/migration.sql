-- CreateEnum
CREATE TYPE "desenlace" AS ENUM ('lo_hizo_este_profesional', 'lo_hizo_otro', 'ya_no_lo_necesito', 'todavia_no_lo_resolvi');

-- AlterTable
-- `desenlace` ya existia como texto libre (String?) sin datos cargados
-- todavia (nadie llego a esa transicion antes de este slice), pero se
-- convierte con USING en vez de DROP + ADD para no asumir que la tabla
-- esta vacia y no perder filas si algun valor quedo cargado a mano.
ALTER TABLE "pedido" ALTER COLUMN "desenlace" TYPE "desenlace" USING "desenlace"::"desenlace";

-- CreateTable
CREATE TABLE "resenia" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "contacto_id" TEXT NOT NULL,
    "profesional_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "puntaje" INTEGER NOT NULL,
    "atributos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comentario" TEXT,
    "monto_declarado" INTEGER,
    "respuesta_profesional" TEXT,
    "publicada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resenia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resenia_contacto_id_key" ON "resenia"("contacto_id");

-- CreateIndex
CREATE INDEX "resenia_profesional_id_idx" ON "resenia"("profesional_id");

-- CreateIndex
CREATE INDEX "resenia_pedido_id_idx" ON "resenia"("pedido_id");

-- AddForeignKey
ALTER TABLE "resenia" ADD CONSTRAINT "resenia_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenia" ADD CONSTRAINT "resenia_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contacto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenia" ADD CONSTRAINT "resenia_profesional_id_fkey" FOREIGN KEY ("profesional_id") REFERENCES "perfil_profesional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenia" ADD CONSTRAINT "resenia_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
