import type { EstadoMatricula, EstadoVerificacion, ExigenciaMatricula } from "@fixeo/shared";
import type { TonoBadge } from "../../components/ui/Badge";

export const ETIQUETAS_ESTADO_VERIFICACION: Record<EstadoVerificacion, string> = {
  pendiente: "Pendiente de revisión",
  aprobada: "Verificada",
  rechazada: "Rechazada",
};

export const ETIQUETAS_ESTADO_MATRICULA: Record<EstadoMatricula, string> = {
  no_requerida: "No requiere matrícula",
  pendiente: "Matrícula pendiente de revisión",
  validada: "Matrícula validada",
  rechazada: "Matrícula rechazada",
  vencida: "Matrícula vencida",
};

// Usados en PR-07 (perfil propio) y CL-09 (perfil publico): mismo criterio de
// color para el mismo significado en las dos pantallas.
export const TONOS_ESTADO_VERIFICACION: Record<EstadoVerificacion, TonoBadge> = {
  pendiente: "advertencia",
  aprobada: "exito",
  rechazada: "error",
};

export const TONOS_ESTADO_MATRICULA: Record<EstadoMatricula, TonoBadge> = {
  no_requerida: "neutro",
  pendiente: "advertencia",
  validada: "exito",
  rechazada: "error",
  vencida: "error",
};

// D9 (docs/dominio.md §12): "obligatoria" bloquea postularse en esa
// categoria sin matricula validada; "recomendada" solo mejora el perfil.
export const ETIQUETAS_EXIGENCIA_MATRICULA: Record<
  Exclude<ExigenciaMatricula, "no_exigida">,
  string
> = {
  obligatoria: "Matrícula obligatoria",
  recomendada: "Matrícula recomendada",
};
