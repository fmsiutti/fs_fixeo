import { z } from "zod";
import { estadoUsuarioSchema, rolUsuarioSchema } from "./estados.js";

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
