import type { MotivoRechazoVerificacion, TipoVerificacion } from "@fixeo/shared";

export const ETIQUETAS_TIPO_VERIFICACION: Record<TipoVerificacion, string> = {
  identidad: "Identidad",
  matricula: "Matrícula",
};

export const ETIQUETAS_MOTIVO_RECHAZO: Record<MotivoRechazoVerificacion, string> = {
  foto_ilegible: "Foto ilegible: pedile una foto más nítida",
  documento_vencido: "Documento vencido: pedile uno vigente",
  datos_no_coinciden: "Los datos no coinciden con el documento",
  matricula_no_valida: "La matrícula no es válida",
  otro: "Otro motivo",
};
