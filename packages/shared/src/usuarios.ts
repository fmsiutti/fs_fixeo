import { z } from "zod";
import {
  estadoPedidoSchema,
  estadoUsuarioSchema,
  estadoVerificacionSchema,
  rolUsuarioSchema,
} from "./estados.js";

// Los inputs de un formulario mandan "" al borrar un campo opcional. Lo
// tratamos como "borralo" (null, la columna es nullable), no como "no lo
// mandes" (undefined, "dejalo como esta"): esa era la distincion que faltaba
// -- con undefined, Prisma ignora la clave y el campo nunca se borraba de
// verdad aunque la respuesta pareciera exitosa. Ausente del body (undefined)
// sigue sin tocar el campo; "" pasa a null; un valor real se valida normal.
const campoOpcionalDeTexto = (schema: z.ZodString) =>
  z.preprocess((valor) => (valor === "" ? null : valor), schema.nullable().optional());

export const actualizarUsuarioSchema = z.object({
  nombre: campoOpcionalDeTexto(
    z.string().trim().min(1, "El nombre no puede estar vacio").max(80, "El nombre es muy largo"),
  ),
  apellido: campoOpcionalDeTexto(
    z
      .string()
      .trim()
      .min(1, "El apellido no puede estar vacio")
      .max(80, "El apellido es muy largo"),
  ),
  email: campoOpcionalDeTexto(z.string().trim().email("El email no es valido")),
});

export type ActualizarUsuario = z.infer<typeof actualizarUsuarioSchema>;

// A proposito no reusa rolUsuarioSchema completo: este toggle (CO-03/CO-06)
// nunca debe permitir auto-asignarse moderador ni soporte.
export const ROLES_ELEGIBLES_USUARIO = ["cliente", "profesional"] as const;

export const cambiarRolSchema = z.object({
  rol: z.enum(ROLES_ELEGIBLES_USUARIO),
});

export type CambiarRol = z.infer<typeof cambiarRolSchema>;

export const usuarioVistaSchema = z.object({
  id: z.string().uuid(),
  telefono: z.string(),
  nombre: z.string().nullable(),
  apellido: z.string().nullable(),
  email: z.string().nullable(),
  fotoUrl: z.string().nullable(),
  rolActivo: rolUsuarioSchema.nullable(),
  estado: estadoUsuarioSchema,
  creadoEn: z.string(),
});

export type UsuarioVista = z.infer<typeof usuarioVistaSchema>;

// --- AD-03: gestion de usuarios desde el back office ---

// Query de busqueda (GET /admin/usuarios?buscar=&cursor=): sin `buscar`, lista general.
export const usuarioBusquedaQuerySchema = z.object({
  buscar: z.string().trim().min(1).optional(),
  cursor: z.string().uuid().optional(),
});

export type UsuarioBusquedaQuery = z.infer<typeof usuarioBusquedaQuerySchema>;

// Motivo en texto libre: a diferencia de los bloqueos de pedido o
// verificacion, suspender un usuario no dispara ninguna logica programatica
// segun el motivo, asi que no hace falta tipificarlo.
export const suspenderUsuarioSchema = z.object({
  motivo: z.string().trim().min(1).max(300),
});

export type SuspenderUsuario = z.infer<typeof suspenderUsuarioSchema>;

export const crearNotaInternaSchema = z.object({
  texto: z.string().trim().min(1).max(1000),
});

export type CrearNotaInterna = z.infer<typeof crearNotaInternaSchema>;

export const notaInternaVistaSchema = z.object({
  id: z.string().uuid(),
  texto: z.string(),
  autor: z.object({
    nombre: z.string().nullable(),
    apellido: z.string().nullable(),
  }),
  creadaEn: z.string(),
});

export type NotaInternaVista = z.infer<typeof notaInternaVistaSchema>;

// Version liviana para la lista de resultados de busqueda (AD-03).
export const usuarioBusquedaItemVistaSchema = z.object({
  id: z.string().uuid(),
  telefono: z.string(),
  nombre: z.string().nullable(),
  apellido: z.string().nullable(),
  rolActivo: rolUsuarioSchema.nullable(),
  estado: estadoUsuarioSchema,
  creadoEn: z.string(),
});

export type UsuarioBusquedaItemVista = z.infer<typeof usuarioBusquedaItemVistaSchema>;

export const usuarioBusquedaPaginaSchema = z.object({
  items: z.array(usuarioBusquedaItemVistaSchema),
  cursor: z.string().uuid().nullable(),
});

export type UsuarioBusquedaPagina = z.infer<typeof usuarioBusquedaPaginaSchema>;

// Detalle completo para el moderador/soporte: historial de pedidos, perfil
// profesional (si tiene) y contadores de denuncias, mas las notas internas.
export const usuarioDetalleAdminVistaSchema = usuarioVistaSchema.extend({
  notas: z.array(notaInternaVistaSchema),
  pedidos: z
    .array(
      z.object({
        id: z.string().uuid(),
        descripcion: z.string(),
        estado: estadoPedidoSchema,
        creadoEn: z.string(),
      }),
    )
    .max(20),
  perfilProfesional: z
    .object({
      id: z.string().uuid(),
      estadoVerificacion: estadoVerificacionSchema,
      pausado: z.boolean(),
      cantidadResenias: z.number(),
      promedioResenias: z.number().nullable(),
      trabajosCerrados: z.number(),
    })
    .nullable(),
  denunciasHechas: z.number(),
  denunciasRecibidas: z.number(),
});

export type UsuarioDetalleAdminVista = z.infer<typeof usuarioDetalleAdminVistaSchema>;
