-- CreateEnum
CREATE TYPE "estado_postulacion" AS ENUM ('enviada', 'vista', 'seleccionada', 'descartada', 'retirada', 'caducada');

-- CreateTable
CREATE TABLE "postulacion" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "profesional_id" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "estimacion_min" INTEGER,
    "estimacion_max" INTEGER,
    "estimacion_a_definir" BOOLEAN NOT NULL DEFAULT false,
    "disponibilidad" TEXT,
    "estado" "estado_postulacion" NOT NULL DEFAULT 'enviada',
    "enviada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vista_en" TIMESTAMP(3),
    "descartada_en" TIMESTAMP(3),

    CONSTRAINT "postulacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_mensaje" (
    "id" TEXT NOT NULL,
    "perfil_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantilla_mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "postulacion_pedido_id_idx" ON "postulacion"("pedido_id");

-- CreateIndex
CREATE INDEX "postulacion_profesional_id_enviada_en_idx" ON "postulacion"("profesional_id", "enviada_en");

-- CreateIndex
CREATE INDEX "postulacion_estado_idx" ON "postulacion"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "postulacion_pedido_id_profesional_id_key" ON "postulacion"("pedido_id", "profesional_id");

-- CreateIndex
CREATE INDEX "plantilla_mensaje_perfil_id_idx" ON "plantilla_mensaje"("perfil_id");

-- AddForeignKey
ALTER TABLE "postulacion" ADD CONSTRAINT "postulacion_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulacion" ADD CONSTRAINT "postulacion_profesional_id_fkey" FOREIGN KEY ("profesional_id") REFERENCES "perfil_profesional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_mensaje" ADD CONSTRAINT "plantilla_mensaje_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_profesional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
