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
