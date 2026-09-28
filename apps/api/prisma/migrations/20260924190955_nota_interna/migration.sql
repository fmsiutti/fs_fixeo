-- CreateTable
CREATE TABLE "nota_interna" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_interna_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nota_interna_usuario_id_idx" ON "nota_interna"("usuario_id");

-- AddForeignKey
ALTER TABLE "nota_interna" ADD CONSTRAINT "nota_interna_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_interna" ADD CONSTRAINT "nota_interna_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
