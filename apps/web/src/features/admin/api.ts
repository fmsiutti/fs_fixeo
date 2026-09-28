import type {
  BarrioAdminVista,
  CategoriaAdminVista,
  CrearCategoria,
  CrearNotaInterna,
  DenunciaModeracionPagina,
  DenunciaModeracionVista,
  EditarBarrio,
  EditarCategoria,
  MetricasTableroVista,
  NotaInternaVista,
  PedidoModeracionPagina,
  PedidoModeracionVista,
  ResolverDenunciaModeracion,
  ResolverEnRevision,
  ResolverPedidoDenunciado,
  ResolverVerificacion,
  SuspenderUsuario,
  UsuarioBusquedaPagina,
  UsuarioDetalleAdminVista,
  UsuarioVista,
  VerificacionColaPagina,
  VerificacionVista,
} from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

export const colaVerificacionesQueryKey = ["admin", "verificaciones"] as const;

export function obtenerColaVerificaciones(cursor?: string): Promise<VerificacionColaPagina> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchJson<VerificacionColaPagina>(`/admin/verificaciones${query}`);
}

export interface ResolverVerificacionParams {
  id: string;
  datos: ResolverVerificacion;
}

export function resolverVerificacion(
  params: ResolverVerificacionParams,
): Promise<VerificacionVista> {
  return fetchJson<VerificacionVista>(`/admin/verificaciones/${params.id}/resolver`, {
    method: "PATCH",
    body: JSON.stringify(params.datos),
  });
}

// --- AD-02: moderacion de pedidos ---

export const pedidosEnRevisionQueryKey = ["admin", "pedidos", "en-revision"] as const;

export function obtenerPedidosEnRevision(cursor?: string): Promise<PedidoModeracionPagina> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchJson<PedidoModeracionPagina>(`/admin/pedidos/en-revision${query}`);
}

export const pedidosDenunciadosQueryKey = ["admin", "pedidos", "denunciados"] as const;

export function obtenerPedidosDenunciados(cursor?: string): Promise<PedidoModeracionPagina> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchJson<PedidoModeracionPagina>(`/admin/pedidos/denunciados${query}`);
}

export interface ResolverEnRevisionParams {
  id: string;
  datos: ResolverEnRevision;
}

export function resolverEnRevision(
  params: ResolverEnRevisionParams,
): Promise<PedidoModeracionVista> {
  return fetchJson<PedidoModeracionVista>(`/admin/pedidos/${params.id}/resolver-revision`, {
    method: "PATCH",
    body: JSON.stringify(params.datos),
  });
}

export interface ResolverDenunciaPedidoParams {
  id: string;
  datos: ResolverPedidoDenunciado;
}

export function resolverDenunciaPedido(
  params: ResolverDenunciaPedidoParams,
): Promise<PedidoModeracionVista> {
  return fetchJson<PedidoModeracionVista>(`/admin/pedidos/${params.id}/resolver-denuncia`, {
    method: "PATCH",
    body: JSON.stringify(params.datos),
  });
}

// --- AD-02, tercera cola (D14): denuncias de perfil/postulacion/resenia ---

export const denunciasModeracionQueryKey = ["admin", "denuncias"] as const;

export function obtenerDenunciasModeracion(cursor?: string): Promise<DenunciaModeracionPagina> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchJson<DenunciaModeracionPagina>(`/admin/denuncias${query}`);
}

export interface ResolverDenunciaModeracionParams {
  id: string;
  datos: ResolverDenunciaModeracion;
}

export function resolverDenunciaModeracion(
  params: ResolverDenunciaModeracionParams,
): Promise<DenunciaModeracionVista> {
  return fetchJson<DenunciaModeracionVista>(`/admin/denuncias/${params.id}/resolver`, {
    method: "PATCH",
    body: JSON.stringify(params.datos),
  });
}

// --- AD-03: usuarios desde el back office ---

export function usuariosBusquedaQueryKey(
  buscar: string,
): readonly [string, string, string, string] {
  return ["admin", "usuarios", "busqueda", buscar] as const;
}

export function buscarUsuarios(buscar: string, cursor?: string): Promise<UsuarioBusquedaPagina> {
  const params = new URLSearchParams();
  if (buscar) params.set("buscar", buscar);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return fetchJson<UsuarioBusquedaPagina>(`/admin/usuarios${query ? `?${query}` : ""}`);
}

export function usuarioAdminDetalleQueryKey(id: string): readonly [string, string, string] {
  return ["admin", "usuarios", id] as const;
}

export function obtenerUsuarioAdminDetalle(id: string): Promise<UsuarioDetalleAdminVista> {
  return fetchJson<UsuarioDetalleAdminVista>(`/admin/usuarios/${id}`);
}

export interface SuspenderUsuarioParams {
  id: string;
  datos: SuspenderUsuario;
}

export function suspenderUsuario(params: SuspenderUsuarioParams): Promise<UsuarioVista> {
  return fetchJson<UsuarioVista>(`/admin/usuarios/${params.id}/suspender`, {
    method: "PATCH",
    body: JSON.stringify(params.datos),
  });
}

export function reactivarUsuario(id: string): Promise<UsuarioVista> {
  return fetchJson<UsuarioVista>(`/admin/usuarios/${id}/reactivar`, { method: "PATCH" });
}

export interface CrearNotaInternaParams {
  id: string;
  datos: CrearNotaInterna;
}

export function crearNotaInterna(params: CrearNotaInternaParams): Promise<NotaInternaVista> {
  return fetchJson<NotaInternaVista>(`/admin/usuarios/${params.id}/notas`, {
    method: "POST",
    body: JSON.stringify(params.datos),
  });
}

// --- AD-04: catalogo desde el back office ---

export const categoriasAdminQueryKey = ["admin", "catalogo", "categorias"] as const;

export function obtenerCategoriasAdmin(): Promise<CategoriaAdminVista[]> {
  return fetchJson<CategoriaAdminVista[]>("/admin/catalogo/categorias");
}

export function crearCategoriaAdmin(datos: CrearCategoria): Promise<CategoriaAdminVista> {
  return fetchJson<CategoriaAdminVista>("/admin/catalogo/categorias", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export interface EditarCategoriaParams {
  id: string;
  datos: EditarCategoria;
}

export function editarCategoriaAdmin(params: EditarCategoriaParams): Promise<CategoriaAdminVista> {
  return fetchJson<CategoriaAdminVista>(`/admin/catalogo/categorias/${params.id}`, {
    method: "PATCH",
    body: JSON.stringify(params.datos),
  });
}

export const barriosAdminQueryKey = ["admin", "catalogo", "barrios"] as const;

export function obtenerBarriosAdmin(): Promise<BarrioAdminVista[]> {
  return fetchJson<BarrioAdminVista[]>("/admin/catalogo/barrios");
}

export interface EditarBarrioParams {
  id: string;
  datos: EditarBarrio;
}

export function editarBarrioAdmin(params: EditarBarrioParams): Promise<BarrioAdminVista> {
  return fetchJson<BarrioAdminVista>(`/admin/catalogo/barrios/${params.id}`, {
    method: "PATCH",
    body: JSON.stringify(params.datos),
  });
}

// --- AD-05: tablero de metricas ---

// Filtros en formato de input (strings de <input type="date"> / ids de
// select), no `MetricasQuery` de packages/shared: ese schema coerciona a
// `Date` para el DTO del backend, pero aca solo arma una query string.
export interface FiltrosMetricasTablero {
  desde?: string;
  hasta?: string;
  categoriaId?: string;
  barrioId?: string;
}

export function metricasTableroQueryKey(
  filtros: FiltrosMetricasTablero,
): readonly [string, string, FiltrosMetricasTablero] {
  return ["admin", "metricas", filtros] as const;
}

export function obtenerMetricasTablero(
  filtros: FiltrosMetricasTablero,
): Promise<MetricasTableroVista> {
  const params = new URLSearchParams();
  if (filtros.desde) params.set("desde", filtros.desde);
  // El input manda solo la fecha ("YYYY-MM-DD"): sin hora, el backend la
  // coerciona a las 00:00 UTC de ese dia (21:00 del dia anterior en Buenos
  // Aires), asi que "hasta hoy" quedaba afuera de todo lo de hoy. Se manda
  // el fin del dia LOCAL (sin sufijo de zona: el parser de Date lo toma como
  // hora local, no UTC) para que el rango incluya el dia elegido completo.
  if (filtros.hasta) params.set("hasta", `${filtros.hasta}T23:59:59.999`);
  if (filtros.categoriaId) params.set("categoriaId", filtros.categoriaId);
  if (filtros.barrioId) params.set("barrioId", filtros.barrioId);
  const query = params.toString();
  return fetchJson<MetricasTableroVista>(`/admin/metricas${query ? `?${query}` : ""}`);
}
