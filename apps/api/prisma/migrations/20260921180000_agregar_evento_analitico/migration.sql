-- CreateTable
CREATE TABLE "evento_analitico" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT,
    "zona" TEXT,
    "rol" TEXT,
    "usuario_id" TEXT,
    "pedido_id" TEXT,
    "metadata" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_analitico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_analitico_tipo_idx" ON "evento_analitico"("tipo");
