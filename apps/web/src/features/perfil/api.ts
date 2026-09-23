import type {
  ArmarPerfil,
  GuardarOficios,
  PerfilProfesionalVistaPropia,
  SubirDocumentoVerificacion,
  VerificacionVista,
  ZonaCoberturaInput,
} from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

export const perfilProfesionalQueryKey = ["perfil-profesional"] as const;

export function obtenerPerfilProfesional(): Promise<PerfilProfesionalVistaPropia> {
  return fetchJson<PerfilProfesionalVistaPropia>("/perfil-profesional");
}

export function armarPerfil(input: ArmarPerfil): Promise<PerfilProfesionalVistaPropia> {
  return fetchJson<PerfilProfesionalVistaPropia>("/perfil-profesional", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function guardarOficios(input: GuardarOficios): Promise<PerfilProfesionalVistaPropia> {
  return fetchJson<PerfilProfesionalVistaPropia>("/perfil-profesional/oficios", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function guardarZona(input: ZonaCoberturaInput): Promise<PerfilProfesionalVistaPropia> {
  return fetchJson<PerfilProfesionalVistaPropia>("/perfil-profesional/zona", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function pausarPerfil(): Promise<PerfilProfesionalVistaPropia> {
  return fetchJson<PerfilProfesionalVistaPropia>("/perfil-profesional/pausar", {
    method: "PATCH",
  });
}

export interface SubirDocumentoVerificacionParams {
  archivo: File;
  datos: SubirDocumentoVerificacion;
}

export function subirDocumentoVerificacion(
  params: SubirDocumentoVerificacionParams,
): Promise<VerificacionVista> {
  const formData = new FormData();
  formData.append("documento", params.archivo);
  formData.append("tipo", params.datos.tipo);
  if (params.datos.oficioId) formData.append("oficioId", params.datos.oficioId);
  if (params.datos.matriculaNumero)
    formData.append("matriculaNumero", params.datos.matriculaNumero);
  if (params.datos.matriculaEnte) formData.append("matriculaEnte", params.datos.matriculaEnte);
  if (params.datos.matriculaVenceEn) {
    formData.append("matriculaVenceEn", params.datos.matriculaVenceEn.toISOString());
  }
  return fetchJson<VerificacionVista>("/verificaciones/documentos", {
    method: "POST",
    body: formData,
  });
}
