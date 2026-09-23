import { z } from "zod";

export const ESTADOS_PEDIDO = [
  "borrador",
  "en_revision",
  "publicado",
  "con_postulaciones",
  "contacto_habilitado",
  "cerrado",
  "expirado",
  "cancelado",
  "bloqueado",
] as const;

export const estadoPedidoSchema = z.enum(ESTADOS_PEDIDO);

export type EstadoPedido = z.infer<typeof estadoPedidoSchema>;

export const ESTADOS_POSTULACION = [
  "enviada",
  "vista",
  "seleccionada",
  "descartada",
  "retirada",
  "caducada",
] as const;

export const estadoPostulacionSchema = z.enum(ESTADOS_POSTULACION);

export type EstadoPostulacion = z.infer<typeof estadoPostulacionSchema>;

export const ROLES_USUARIO = ["cliente", "profesional", "moderador", "soporte"] as const;

export const rolUsuarioSchema = z.enum(ROLES_USUARIO);

export type RolUsuario = z.infer<typeof rolUsuarioSchema>;

export const ESTADOS_USUARIO = ["activo", "suspendido", "eliminado"] as const;

export const estadoUsuarioSchema = z.enum(ESTADOS_USUARIO);

export type EstadoUsuario = z.infer<typeof estadoUsuarioSchema>;

export const EXIGENCIAS_MATRICULA = ["obligatoria", "recomendada", "no_exigida"] as const;

export const exigenciaMatriculaSchema = z.enum(EXIGENCIAS_MATRICULA);

export type ExigenciaMatricula = z.infer<typeof exigenciaMatriculaSchema>;

export const URGENCIAS = ["emergencia", "esta_semana", "sin_apuro"] as const;

export const urgenciaSchema = z.enum(URGENCIAS);

export type Urgencia = z.infer<typeof urgenciaSchema>;

export const TIPOS_PROPIEDAD = ["casa", "departamento", "otro"] as const;

export const tipoPropiedadSchema = z.enum(TIPOS_PROPIEDAD);

export type TipoPropiedad = z.infer<typeof tipoPropiedadSchema>;

// El documento no detalla mas granularidad de franja horaria que estas tres.
export const FRANJAS = ["manana", "tarde", "noche"] as const;

export const franjaSchema = z.enum(FRANJAS);

export type Franja = z.infer<typeof franjaSchema>;

// Estado de identidad del perfil profesional (perfil_profesional.estado_verificacion)
// y, con los mismos tres valores, el estado de una Verificacion puntual
// (documento subido + revision: identidad o una matricula de un oficio). Son
// maquinas de estados distintas (perfil completo vs. una solicitud puntual;
// un perfil puede tener varias verificaciones a lo largo del tiempo) que
// comparten el mismo enum de Prisma (EstadoVerificacion), asi que comparten
// tambien este schema.
export const ESTADOS_VERIFICACION = ["pendiente", "aprobada", "rechazada"] as const;

export const estadoVerificacionSchema = z.enum(ESTADOS_VERIFICACION);

export type EstadoVerificacion = z.infer<typeof estadoVerificacionSchema>;

// Estado de la matricula de un oficio (oficio_profesional.matricula_estado).
// no_requerida: la categoria no exige matricula. vencida queda fuera de
// alcance de este slice (job futuro de docs/dominio.md D9).
export const ESTADOS_MATRICULA = [
  "no_requerida",
  "pendiente",
  "validada",
  "rechazada",
  "vencida",
] as const;

export const estadoMatriculaSchema = z.enum(ESTADOS_MATRICULA);

export type EstadoMatricula = z.infer<typeof estadoMatriculaSchema>;

export const TIPOS_ZONA_COBERTURA = ["barrios", "radio"] as const;

export const tipoZonaCoberturaSchema = z.enum(TIPOS_ZONA_COBERTURA);

export type TipoZonaCobertura = z.infer<typeof tipoZonaCoberturaSchema>;

export const TIPOS_VERIFICACION = ["identidad", "matricula"] as const;

export const tipoVerificacionSchema = z.enum(TIPOS_VERIFICACION);

export type TipoVerificacion = z.infer<typeof tipoVerificacionSchema>;
