import type {
  OficioVista,
  PerfilProfesionalVistaPropia,
  VerificacionResumenVista,
  ZonaCoberturaVista,
} from "@fixeo/shared";
import type {
  Categoria,
  OficioProfesional,
  PerfilProfesional,
  Verificacion,
  ZonaCobertura,
} from "../../generated/prisma/client.js";

export type OficioConCategoria = OficioProfesional & { categoria: Categoria };

export type PerfilConRelaciones = PerfilProfesional & {
  oficios: OficioConCategoria[];
  zonaCobertura: ZonaCobertura | null;
  verificaciones: Verificacion[];
};

/**
 * Vista completa, solo para el dueno del perfil (PR-07): incluye el estado
 * de cada verificacion en curso. Nunca se expone `usuarioId` (ya lo conoce
 * el dueno via su sesion, no hace falta repetirlo en el body).
 */
export function mapearPerfilAVistaPropia(
  perfil: PerfilConRelaciones,
): PerfilProfesionalVistaPropia {
  return {
    id: perfil.id,
    presentacion: perfil.presentacion,
    aniosExperiencia: perfil.aniosExperiencia,
    estadoVerificacion: perfil.estadoVerificacion,
    verificadoEn: perfil.verificadoEn ? perfil.verificadoEn.toISOString() : null,
    pausado: perfil.pausado,
    tasaRespuesta: perfil.tasaRespuesta,
    promedioResenias: perfil.promedioResenias,
    cantidadResenias: perfil.cantidadResenias,
    trabajosCerrados: perfil.trabajosCerrados,
    oficios: perfil.oficios.map(mapearOficioAVista),
    zonaCobertura: perfil.zonaCobertura ? mapearZonaAVista(perfil.zonaCobertura) : null,
    verificaciones: perfil.verificaciones.map(mapearVerificacionAResumenVista),
    creadoEn: perfil.creadoEn.toISOString(),
  };
}

function mapearVerificacionAResumenVista(verificacion: Verificacion): VerificacionResumenVista {
  return {
    id: verificacion.id,
    tipo: verificacion.tipo,
    oficioId: verificacion.oficioId,
    estado: verificacion.estado,
    motivoRechazo: verificacion.motivoRechazo,
    revisadaEn: verificacion.revisadaEn ? verificacion.revisadaEn.toISOString() : null,
  };
}

function mapearOficioAVista(oficio: OficioConCategoria): OficioVista {
  return {
    id: oficio.id,
    categoria: {
      id: oficio.categoria.id,
      nombre: oficio.categoria.nombre,
      slug: oficio.categoria.slug,
    },
    subcategorias: oficio.subcategorias,
    matriculaNumero: oficio.matriculaNumero,
    matriculaEnte: oficio.matriculaEnte,
    matriculaEstado: oficio.matriculaEstado,
    matriculaVenceEn: oficio.matriculaVenceEn ? oficio.matriculaVenceEn.toISOString() : null,
  };
}

function mapearZonaAVista(zona: ZonaCobertura): ZonaCoberturaVista {
  if (zona.tipo === "barrios") {
    return { tipo: "barrios", barrioIds: zona.barrioIds };
  }
  return {
    tipo: "radio",
    // No nulos en la practica: guardarZona siempre escribe los tres juntos
    // cuando tipo = "radio" (profesionales.service.ts).
    centroLat: zona.centroLat ?? 0,
    centroLng: zona.centroLng ?? 0,
    radioKm: zona.radioKm ?? 0,
  };
}
