import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  crearNotaInterna,
  obtenerUsuarioAdminDetalle,
  reactivarUsuario,
  suspenderUsuario,
  usuarioAdminDetalleQueryKey,
} from "../api";
import { AdminNav } from "../components/AdminNav";
import { ETIQUETAS_ESTADO_USUARIO } from "../etiquetas";
import { ETIQUETAS_ESTADO_PEDIDO } from "../../pedidos/etiquetas";
import { ETIQUETAS_ESTADO_VERIFICACION } from "../../perfil/etiquetas";
import { useSesion } from "../../auth/useSesion";
import { Badge, type TonoBadge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";
import type { EstadoUsuario } from "@fixeo/shared";

const TONOS_ESTADO: Record<EstadoUsuario, TonoBadge> = {
  activo: "exito",
  suspendido: "advertencia",
  eliminado: "error",
};

/** AD-03 · Detalle de usuario: historial, perfil profesional, notas internas, suspender/reactivar. */
export function UsuarioDetalleAdminPage() {
  const { id } = useParams<{ id: string }>();
  const { usuario: sesion } = useSesion();
  const puedeEscribir = sesion?.rolActivo === "moderador";
  const queryClient = useQueryClient();

  const [mostrarSuspension, setMostrarSuspension] = useState(false);
  const [motivoSuspension, setMotivoSuspension] = useState("");
  const [errorSuspension, setErrorSuspension] = useState<string | null>(null);
  const [textoNota, setTextoNota] = useState("");

  const detalleQuery = useQuery({
    queryKey: usuarioAdminDetalleQueryKey(id ?? ""),
    queryFn: () => obtenerUsuarioAdminDetalle(id ?? ""),
    enabled: Boolean(id),
    retry: false,
  });

  function invalidar() {
    return queryClient.invalidateQueries({ queryKey: usuarioAdminDetalleQueryKey(id ?? "") });
  }

  const mutacionSuspender = useMutation({
    mutationFn: suspenderUsuario,
    onSuccess: () => {
      setMostrarSuspension(false);
      setMotivoSuspension("");
      void invalidar();
    },
    onError: (err) =>
      setErrorSuspension(
        err instanceof ErrorApiHttp ? err.mensaje : "No pudimos suspender a este usuario.",
      ),
  });

  const mutacionReactivar = useMutation({
    mutationFn: reactivarUsuario,
    onSuccess: () => void invalidar(),
  });

  const mutacionNota = useMutation({
    mutationFn: crearNotaInterna,
    onSuccess: () => {
      setTextoNota("");
      void invalidar();
    },
  });

  function confirmarSuspension() {
    if (!motivoSuspension.trim()) {
      setErrorSuspension("Contá el motivo de la suspensión");
      return;
    }
    setErrorSuspension(null);
    mutacionSuspender.mutate({ id: id ?? "", datos: { motivo: motivoSuspension.trim() } });
  }

  if (!id) {
    return <Navigate to="/admin/usuarios" replace />;
  }

  const detalle = detalleQuery.data;
  const error = detalleQuery.error instanceof ErrorApiHttp ? detalleQuery.error : null;
  const esNoEncontrado = error?.codigo === "no_encontrado";
  const nombreCompleto =
    [detalle?.nombre, detalle?.apellido].filter(Boolean).join(" ") || "Usuario sin nombre";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-white px-6 py-8">
      <AdminNav />

      <header className="flex items-center gap-2">
        <Link
          to="/admin/usuarios"
          aria-label="Volver"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="text-xl font-bold text-teal-800">Detalle de usuario</h1>
      </header>

      {detalleQuery.isPending && <Spinner etiqueta="Cargando el usuario" />}

      {esNoEncontrado && <p className="text-sm text-slate-700">Este usuario no existe.</p>}

      {detalleQuery.isError && !esNoEncontrado && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos cargar este usuario.</p>
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={() => detalleQuery.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}

      {detalle && (
        <>
          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">{nombreCompleto}</h2>
              <Badge tono={TONOS_ESTADO[detalle.estado]}>
                {ETIQUETAS_ESTADO_USUARIO[detalle.estado]}
              </Badge>
            </div>
            <p className="text-sm text-slate-700">{detalle.telefono}</p>
            {detalle.email && <p className="text-sm text-slate-700">{detalle.email}</p>}
            <p className="text-xs text-slate-500">
              {detalle.rolActivo ?? "Sin rol activo"} · alta{" "}
              {new Date(detalle.creadoEn).toLocaleDateString("es-AR")}
            </p>
            <p className="text-xs text-slate-500">
              Denuncias hechas: {detalle.denunciasHechas} · Denuncias recibidas:{" "}
              {detalle.denunciasRecibidas}
            </p>
          </section>

          {puedeEscribir && (
            <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
              {detalle.estado === "activo" && !mostrarSuspension && (
                <Button type="button" variante="peligro" onClick={() => setMostrarSuspension(true)}>
                  Suspender usuario
                </Button>
              )}

              {detalle.estado === "activo" && mostrarSuspension && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="motivo-suspension" className="text-sm font-medium text-slate-700">
                    Motivo de la suspensión
                  </label>
                  <textarea
                    id="motivo-suspension"
                    rows={2}
                    value={motivoSuspension}
                    onChange={(evento) => setMotivoSuspension(evento.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                  />
                  {errorSuspension && (
                    <p role="alert" className="text-sm text-red-600">
                      {errorSuspension}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variante="secundario"
                      onClick={() => setMostrarSuspension(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variante="peligro"
                      cargando={mutacionSuspender.isPending}
                      onClick={confirmarSuspension}
                    >
                      Confirmar suspensión
                    </Button>
                  </div>
                </div>
              )}

              {detalle.estado === "suspendido" && (
                <Button
                  type="button"
                  cargando={mutacionReactivar.isPending}
                  onClick={() => mutacionReactivar.mutate(id)}
                >
                  Reactivar usuario
                </Button>
              )}
              {mutacionReactivar.isError && (
                <p role="alert" className="text-sm text-red-600">
                  {mutacionReactivar.error instanceof ErrorApiHttp
                    ? mutacionReactivar.error.mensaje
                    : "No pudimos reactivar a este usuario."}
                </p>
              )}
            </section>
          )}

          {detalle.perfilProfesional && (
            <section className="flex flex-col gap-1 rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">Perfil profesional</h3>
              <p className="text-sm text-slate-700">
                {ETIQUETAS_ESTADO_VERIFICACION[detalle.perfilProfesional.estadoVerificacion]}
                {detalle.perfilProfesional.pausado ? " · Pausado" : ""}
              </p>
              <p className="text-sm text-slate-700">
                {detalle.perfilProfesional.cantidadResenias === 0
                  ? "Sin reseñas"
                  : `★ ${detalle.perfilProfesional.promedioResenias?.toFixed(1) ?? "—"} · ${
                      detalle.perfilProfesional.cantidadResenias
                    } reseñas`}
              </p>
              <p className="text-sm text-slate-700">
                {detalle.perfilProfesional.trabajosCerrados} trabajos cerrados
              </p>
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Pedidos ({detalle.pedidos.length})</h3>
            {detalle.pedidos.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no publicó ningún pedido.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detalle.pedidos.map((pedido) => (
                  <li key={pedido.id} className="text-sm text-slate-700">
                    <span className="font-medium">{ETIQUETAS_ESTADO_PEDIDO[pedido.estado]}</span> ·{" "}
                    {pedido.descripcion} ·{" "}
                    <span className="text-xs text-slate-500">
                      {new Date(pedido.creadoEn).toLocaleDateString("es-AR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">
              Notas internas ({detalle.notas.length})
            </h3>
            {detalle.notas.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay notas internas.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detalle.notas.map((nota) => (
                  <li key={nota.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    <p>{nota.texto}</p>
                    <p className="text-xs text-slate-500">
                      {[nota.autor.nombre, nota.autor.apellido].filter(Boolean).join(" ") ||
                        "Equipo Fixeo"}{" "}
                      · {new Date(nota.creadaEn).toLocaleString("es-AR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {puedeEscribir && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  if (!textoNota.trim()) return;
                  mutacionNota.mutate({ id, datos: { texto: textoNota.trim() } });
                }}
              >
                <label htmlFor="nueva-nota" className="text-sm font-medium text-slate-700">
                  Agregar una nota
                </label>
                <textarea
                  id="nueva-nota"
                  rows={2}
                  value={textoNota}
                  onChange={(evento) => setTextoNota(evento.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                />
                {mutacionNota.isError && (
                  <p role="alert" className="text-sm text-red-600">
                    {mutacionNota.error instanceof ErrorApiHttp
                      ? mutacionNota.error.mensaje
                      : "No pudimos guardar la nota."}
                  </p>
                )}
                <Button type="submit" variante="secundario" cargando={mutacionNota.isPending}>
                  Guardar nota
                </Button>
              </form>
            )}
          </section>
        </>
      )}
    </main>
  );
}
