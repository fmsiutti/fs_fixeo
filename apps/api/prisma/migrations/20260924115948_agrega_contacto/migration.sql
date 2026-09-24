-- CreateTable
CREATE TABLE "contacto" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "postulacion_id" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "habilitado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abierto_whatsapp_en" TIMESTAMP(3),
    "confirmado_por_cliente" BOOLEAN,

    CONSTRAINT "contacto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contacto_postulacion_id_key" ON "contacto"("postulacion_id");

-- CreateIndex
CREATE INDEX "contacto_pedido_id_idx" ON "contacto"("pedido_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacto_pedido_id_orden_key" ON "contacto"("pedido_id", "orden");

-- AddForeignKey
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
