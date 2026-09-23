import type { VerificacionColaVista, VerificacionVista } from "@fixeo/shared";
import type {
  Categoria,
  OficioProfesional,
  PerfilProfesional,
  Usuario,
  Verificacion,
} from "../../generated/prisma/client.js";

export type VerificacionConRelaciones = Verificacion & {
  perfil: PerfilProfesional & { usuario: Usuario };
  oficio: (OficioProfesional & { categoria: Categoria }) | null;
};

/** Respuesta de subir un documento o resolver una verificacion: nunca expone `documentos` (keys de storage). */
export function mapearVerificacionAVista(verificacion: Verificacion): VerificacionVista {
  return {
    id: verificacion.id,
    tipo: verificacion.tipo,
    estado: verificacion.estado,
    motivoRechazo: verificacion.motivoRechazo,
    enviadaEn: verificacion.enviadaEn.toISOString(),
    revisadaEn: verificacion.revisadaEn ? verificacion.revisadaEn.toISOString() : null,
  };
}

/**
 * AD-01: item de la cola de verificaciones pendientes. `documentosFirmados`
 * ya son URLs firmadas de vida corta (resueltas en el service, que es quien
 * conoce el proveedor de almacenamiento); esta funcion solo arma la forma.
 */
export function mapearVerificacionAColaVista(
  verificacion: VerificacionConRelaciones,
  documentosFirmados: string[],
): VerificacionColaVista {
  return {
    id: verificacion.id,
    tipo: verificacion.tipo,
    enviadaEn: verificacion.enviadaEn.toISOString(),
    documentos: documentosFirmados,
    perfil: {
      id: verificacion.perfil.id,
      usuarioId: verificacion.perfil.usuarioId,
      nombre: verificacion.perfil.usuario.nombre,
      apellido: verificacion.perfil.usuario.apellido,
    },
    oficio: verificacion.oficio
      ? {
          categoria: {
            id: verificacion.oficio.categoria.id,
            nombre: verificacion.oficio.categoria.nombre,
            slug: verificacion.oficio.categoria.slug,
          },
          matriculaNumero: verificacion.oficio.matriculaNumero,
          matriculaEnte: verificacion.oficio.matriculaEnte,
          matriculaVenceEn: verificacion.oficio.matriculaVenceEn
            ? verificacion.oficio.matriculaVenceEn.toISOString()
            : null,
        }
      : null,
  };
}
