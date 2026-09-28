import type {
  EstadoUsuario,
  ExigenciaMatricula,
  MotivoBloqueoPedido,
  MotivoRechazoVerificacion,
  TipoObjetoDenuncia,
  TipoVerificacion,
} from "@fixeo/shared";

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

// AD-02: motivos tipificados para rechazar un pedido en_revision o bloquear
// uno denunciado (docs/dominio.md §12 D1/D5).
export const ETIQUETAS_MOTIVO_BLOQUEO_PEDIDO: Record<MotivoBloqueoPedido, string> = {
  contenido_inapropiado: "Contenido inapropiado u ofensivo",
  datos_de_contacto: "Tiene datos de contacto en el texto",
  fuera_de_catalogo: "No corresponde a ninguna categoría del catálogo",
  duplicado: "Pedido duplicado",
  otro: "Otro motivo",
};

// AD-03: estado de un usuario (activo/suspendido/eliminado).
export const ETIQUETAS_ESTADO_USUARIO: Record<EstadoUsuario, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  eliminado: "Eliminado",
};

// AD-04: exigencia de matricula de una categoria, con "no_exigida" incluido
// (a diferencia de features/perfil/etiquetas.ts, que la excluye porque en ese
// contexto nunca hay nada que mostrar para "no_exigida").
export const ETIQUETAS_EXIGENCIA_MATRICULA: Record<ExigenciaMatricula, string> = {
  obligatoria: "Matrícula obligatoria",
  recomendada: "Matrícula recomendada",
  no_exigida: "No exige matrícula",
};

// D14: badge de tipoObjeto en la cola de denuncias no-pedido de AD-02.
// "pedido" no aparece en esa cola (tiene sus propias dos colas), pero el
// contrato usa el enum completo, asi que se etiqueta igual por si acaso.
export const ETIQUETAS_TIPO_OBJETO_DENUNCIA: Record<TipoObjetoDenuncia, string> = {
  pedido: "Pedido",
  perfil: "Perfil",
  postulacion: "Postulación",
  resenia: "Reseña",
};
