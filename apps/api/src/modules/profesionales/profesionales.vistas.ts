import type {
  OficioVista,
  PerfilProfesionalVistaPropia,
  PerfilProfesionalVistaPublica,
  VerificacionResumenVista,
  ZonaCoberturaVista,
  ZonaCoberturaVistaPublica,
} from "@fixeo/shared";
import type {
  Categoria,
  OficioProfesional,
  PerfilProfesional,
  Usuario,
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

export type PerfilConRelacionesPublicas = PerfilProfesional & {
  usuario: Pick<Usuario, "nombre" | "apellido" | "fotoUrl">;
  oficios: OficioConCategoria[];
  zonaCobertura: ZonaCobertura | null;
};

/**
 * CL-09: vista publica, para el cliente que evalua postulaciones. Sin
 * `usuarioId` ni telefono (docs/dominio.md §7: el telefono del profesional
 * sigue oculto hasta la seleccion), ni verificaciones en curso (eso es solo
 * para el dueno del perfil, PR-07).
 */
export function mapearPerfilAVistaPublica(
  perfil: PerfilConRelacionesPublicas,
): PerfilProfesionalVistaPublica {
  return {
    id: perfil.id,
    nombre: perfil.usuario.nombre,
    apellido: perfil.usuario.apellido,
    fotoUrl: perfil.usuario.fotoUrl,
    presentacion: perfil.presentacion,
    aniosExperiencia: perfil.aniosExperiencia,
    estadoVerificacion: perfil.estadoVerificacion,
    promedioResenias: perfil.promedioResenias,
    cantidadResenias: perfil.cantidadResenias,
    trabajosCerrados: perfil.trabajosCerrados,
    oficios: perfil.oficios.map((oficio) => ({
      categoria: { nombre: oficio.categoria.nombre, slug: oficio.categoria.slug },
      subcategorias: oficio.subcategorias,
      matriculaEstado: oficio.matriculaEstado,
    })),
    zonaCobertura: perfil.zonaCobertura ? mapearZonaAVistaPublica(perfil.zonaCobertura) : null,
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

/**
 * CL-09 (revision de codigo del slice 6): a diferencia de mapearZonaAVista
 * (dueno del perfil, PR-07), esta version nunca expone `centroLat`/`centroLng`.
 * Son el punto de referencia real del profesional (en la practica, su casa o
 * taller): exponerlo a cualquier usuario autenticado que abre un perfil
 * publico es un dato personal de mas que docs/dominio.md §7 no pide.
 */
function mapearZonaAVistaPublica(zona: ZonaCobertura): ZonaCoberturaVistaPublica {
  if (zona.tipo === "barrios") {
    return { tipo: "barrios", barrioIds: zona.barrioIds };
  }
  return {
    tipo: "radio",
    // No nulo en la practica: guardarZona siempre escribe radioKm cuando
    // tipo = "radio" (profesionales.service.ts).
    radioKm: zona.radioKm ?? 0,
  };
}
