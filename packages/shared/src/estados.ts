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
