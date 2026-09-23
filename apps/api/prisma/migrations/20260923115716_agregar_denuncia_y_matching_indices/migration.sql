-- CreateEnum
CREATE TYPE "tipo_objeto_denuncia" AS ENUM ('pedido', 'postulacion', 'perfil', 'resenia');

-- CreateEnum
CREATE TYPE "estado_denuncia" AS ENUM ('pendiente', 'resuelta', 'descartada');

-- CreateTable
CREATE TABLE "denuncia" (
    "id" TEXT NOT NULL,
    "reportante_id" TEXT NOT NULL,
    "tipo_objeto" "tipo_objeto_denuncia" NOT NULL,
    "objeto_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalle" TEXT,
    "estado" "estado_denuncia" NOT NULL DEFAULT 'pendiente',
    "resuelta_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "denuncia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "denuncia_tipo_objeto_objeto_id_idx" ON "denuncia"("tipo_objeto", "objeto_id");

-- CreateIndex
CREATE INDEX "denuncia_estado_idx" ON "denuncia"("estado");

-- CreateIndex
CREATE INDEX "oficio_profesional_categoria_id_idx" ON "oficio_profesional"("categoria_id");

-- CreateIndex
CREATE INDEX "perfil_profesional_estado_verificacion_pausado_idx" ON "perfil_profesional"("estado_verificacion", "pausado");

-- AddForeignKey
ALTER TABLE "denuncia" ADD CONSTRAINT "denuncia_reportante_id_fkey" FOREIGN KEY ("reportante_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
