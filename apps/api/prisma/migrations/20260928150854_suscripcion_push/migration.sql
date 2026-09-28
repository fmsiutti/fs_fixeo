-- CreateTable
CREATE TABLE "suscripcion_push" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripcion_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suscripcion_push_endpoint_key" ON "suscripcion_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripcion_push_usuario_id_idx" ON "suscripcion_push"("usuario_id");

-- AddForeignKey
ALTER TABLE "suscripcion_push" ADD CONSTRAINT "suscripcion_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
