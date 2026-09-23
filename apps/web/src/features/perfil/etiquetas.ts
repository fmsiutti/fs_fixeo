import type { EstadoMatricula, EstadoVerificacion, ExigenciaMatricula } from "@fixeo/shared";

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

// D9 (docs/dominio.md §12): "obligatoria" bloquea postularse en esa
// categoria sin matricula validada; "recomendada" solo mejora el perfil.
export const ETIQUETAS_EXIGENCIA_MATRICULA: Record<
  Exclude<ExigenciaMatricula, "no_exigida">,
  string
> = {
  obligatoria: "Matrícula obligatoria",
  recomendada: "Matrícula recomendada",
};
