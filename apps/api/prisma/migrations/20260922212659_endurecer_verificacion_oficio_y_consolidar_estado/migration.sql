-- DropForeignKey
ALTER TABLE "verificacion" DROP CONSTRAINT "verificacion_oficio_id_fkey";

-- AlterTable
-- Se consolida "estado_verificacion_solicitud" en "estado_verificacion" (mismos
-- valores exactos: pendiente | aprobada | rechazada). En vez del DROP
-- COLUMN/ADD COLUMN que genera Prisma por defecto (que resetearia toda fila
-- existente a 'pendiente'), se convierte la columna con un cast via texto
-- para preservar el estado real de cada verificacion ya enviada/revisada.
ALTER TABLE "verificacion" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "verificacion" ALTER COLUMN "estado" TYPE "estado_verificacion" USING ("estado"::text::"estado_verificacion");
ALTER TABLE "verificacion" ALTER COLUMN "estado" SET DEFAULT 'pendiente';

-- DropEnum
DROP TYPE "estado_verificacion_solicitud";

-- El indice "verificacion_estado_idx" ya existe desde
-- 20260922203259_agregar_perfil_profesional_y_verificacion: el ALTER COLUMN
-- TYPE de arriba preserva la columna (no la dropea), asi que el indice sigue
-- vigente y no hace falta recrearlo.

-- AddForeignKey
ALTER TABLE "verificacion" ADD CONSTRAINT "verificacion_oficio_id_fkey" FOREIGN KEY ("oficio_id") REFERENCES "oficio_profesional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
