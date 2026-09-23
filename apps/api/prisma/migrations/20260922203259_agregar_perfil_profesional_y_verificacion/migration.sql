-- CreateEnum
CREATE TYPE "estado_verificacion" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- CreateEnum
CREATE TYPE "estado_matricula" AS ENUM ('no_requerida', 'pendiente', 'validada', 'rechazada', 'vencida');

-- CreateEnum
CREATE TYPE "tipo_zona_cobertura" AS ENUM ('barrios', 'radio');

-- CreateEnum
CREATE TYPE "tipo_verificacion" AS ENUM ('identidad', 'matricula');

-- CreateEnum
CREATE TYPE "estado_verificacion_solicitud" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- CreateTable
CREATE TABLE "perfil_profesional" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "presentacion" TEXT,
    "anios_experiencia" INTEGER,
    "estado_verificacion" "estado_verificacion" NOT NULL DEFAULT 'pendiente',
    "verificado_en" TIMESTAMP(3),
    "pausado" BOOLEAN NOT NULL DEFAULT false,
    "tasa_respuesta" DOUBLE PRECISION,
    "promedio_resenias" DOUBLE PRECISION,
    "cantidad_resenias" INTEGER NOT NULL DEFAULT 0,
    "trabajos_cerrados" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_profesional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oficio_profesional" (
    "id" TEXT NOT NULL,
    "perfil_id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "subcategorias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matricula_numero" TEXT,
    "matricula_ente" TEXT,
    "matricula_estado" "estado_matricula" NOT NULL DEFAULT 'no_requerida',
    "matricula_vence_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oficio_profesional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zona_cobertura" (
    "id" TEXT NOT NULL,
    "perfil_id" TEXT NOT NULL,
    "tipo" "tipo_zona_cobertura" NOT NULL,
    "barrio_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "centro_lat" DOUBLE PRECISION,
    "centro_lng" DOUBLE PRECISION,
    "radio_km" DOUBLE PRECISION,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zona_cobertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificacion" (
    "id" TEXT NOT NULL,
    "perfil_id" TEXT NOT NULL,
    "tipo" "tipo_verificacion" NOT NULL,
    "oficio_id" TEXT,
    "documentos" TEXT[],
    "estado" "estado_verificacion_solicitud" NOT NULL DEFAULT 'pendiente',
    "revisada_por" TEXT,
    "motivo_rechazo" TEXT,
    "enviada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisada_en" TIMESTAMP(3),

    CONSTRAINT "verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceso_documento" (
    "id" TEXT NOT NULL,
    "verificacion_id" TEXT NOT NULL,
    "moderador_id" TEXT NOT NULL,
    "accedido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceso_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "objeto_id" TEXT,
    "leida_en" TIMESTAMP(3),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfil_profesional_usuario_id_key" ON "perfil_profesional"("usuario_id");

-- CreateIndex
CREATE INDEX "oficio_profesional_perfil_id_idx" ON "oficio_profesional"("perfil_id");

-- CreateIndex
CREATE UNIQUE INDEX "oficio_profesional_perfil_id_categoria_id_key" ON "oficio_profesional"("perfil_id", "categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "zona_cobertura_perfil_id_key" ON "zona_cobertura"("perfil_id");

-- CreateIndex
CREATE INDEX "verificacion_perfil_id_idx" ON "verificacion"("perfil_id");

-- CreateIndex
CREATE INDEX "verificacion_estado_idx" ON "verificacion"("estado");

-- CreateIndex
CREATE INDEX "acceso_documento_verificacion_id_idx" ON "acceso_documento"("verificacion_id");

-- CreateIndex
CREATE INDEX "notificacion_usuario_id_idx" ON "notificacion"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_usuario_id_tipo_objeto_id_key" ON "notificacion"("usuario_id", "tipo", "objeto_id");

-- AddForeignKey
ALTER TABLE "perfil_profesional" ADD CONSTRAINT "perfil_profesional_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oficio_profesional" ADD CONSTRAINT "oficio_profesional_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_profesional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oficio_profesional" ADD CONSTRAINT "oficio_profesional_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zona_cobertura" ADD CONSTRAINT "zona_cobertura_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_profesional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacion" ADD CONSTRAINT "verificacion_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_profesional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacion" ADD CONSTRAINT "verificacion_oficio_id_fkey" FOREIGN KEY ("oficio_id") REFERENCES "oficio_profesional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_documento" ADD CONSTRAINT "acceso_documento_verificacion_id_fkey" FOREIGN KEY ("verificacion_id") REFERENCES "verificacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_documento" ADD CONSTRAINT "acceso_documento_moderador_id_fkey" FOREIGN KEY ("moderador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
