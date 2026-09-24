import type { EstadoPostulacion, GrupoEstadoPostulacion } from "@fixeo/shared";

export const ETIQUETAS_ESTADO_POSTULACION: Record<EstadoPostulacion, string> = {
  enviada: "Enviada",
  vista: "Vista",
  seleccionada: "Elegida",
  descartada: "Descartada",
  retirada: "Retirada",
  caducada: "Caducada",
};

// PR-05: "Pestañas enviadas, seleccionadas, cerradas".
export const ETIQUETAS_GRUPO_POSTULACION: Record<GrupoEstadoPostulacion, string> = {
  enviadas: "Enviadas",
  seleccionadas: "Seleccionadas",
  cerradas: "Cerradas",
};
