import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { PerfilProfesionalVistaPropia } from "@fixeo/shared";
import { obtenerPerfilProfesional, pausarPerfil, perfilProfesionalQueryKey } from "../api";
import { misReseniasQueryKey, obtenerMisResenias } from "../../resenias/api";
import { TarjetaResenia } from "../../resenias/components/TarjetaResenia";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";
import {
  ETIQUETAS_ESTADO_MATRICULA,
  ETIQUETAS_ESTADO_VERIFICACION,
  TONOS_ESTADO_MATRICULA,
  TONOS_ESTADO_VERIFICACION,
} from "../etiquetas";
import { verificacionMatriculaRechazada, verificacionRechazadaMasReciente } from "../utils";

/** PR-07 · Mi perfil y reputacion. No incluye plantillas de mensaje: eso pertenece al slice de Postulaciones. */
export function MiPerfilPage() {
  const queryClient = useQueryClient();

  const perfilQuery = useQuery({
    queryKey: perfilProfesionalQueryKey,
    queryFn: obtenerPerfilProfesional,
    retry: false,
  });

  const mutacionPausa = useMutation({
    mutationFn: pausarPerfil,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: perfilProfesionalQueryKey });
      const anterior =
        queryClient.getQueryData<PerfilProfesionalVistaPropia>(perfilProfesionalQueryKey);
      if (anterior) {
        queryClient.setQueryData(perfilProfesionalQueryKey, {
          ...anterior,
          pausado: !anterior.pausado,
        });
      }
      return { anterior };
    },
    onError: (_error, _variables, contexto) => {
      if (contexto?.anterior) {
        queryClient.setQueryData(perfilProfesionalQueryKey, contexto.anterior);
      }
    },
    onSuccess: (perfilActualizado) => {
      queryClient.setQueryData(perfilProfesionalQueryKey, perfilActualizado);
    },
  });

  // PR-07: reseñas recibidas, con opcion de responder una vez cada una.
  const reseniasQuery = useInfiniteQuery({
    queryKey: misReseniasQueryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => obtenerMisResenias(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
  });
  const resenias = reseniasQuery.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  if (perfilQuery.isPending) {
    return (
      <main id="contenido-principal" className="flex min-h-dvh items-center justify-center bg-white px-6 py-8">
        <Spinner etiqueta="Cargando tu perfil" />
      </main>
    );
  }

  const esPerfilNoArmado =
    perfilQuery.isError &&
    perfilQuery.error instanceof ErrorApiHttp &&
    perfilQuery.error.codigo === "no_encontrado";

  if (esPerfilNoArmado) {
    return (
      <main id="contenido-principal" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6 py-8 text-center">
        <p className="text-slate-700">Todavía no armaste tu perfil profesional.</p>
        <Link to="/perfil/armar" className="min-h-11 font-semibold text-teal-800 underline">
          Armar mi perfil
        </Link>
      </main>
    );
  }

  if (perfilQuery.isError) {
    return (
      <main id="contenido-principal" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6 py-8 text-center">
        <p className="text-sm text-red-600" role="alert">
          No pudimos cargar tu perfil.
        </p>
        <button
          type="button"
          className="min-h-11 font-semibold text-teal-800 underline"
          onClick={() => perfilQuery.refetch()}
        >
          Reintentar
        </button>
      </main>
    );
  }

  const perfil = perfilQuery.data;
  const motivoRechazoIdentidad =
    perfil.estadoVerificacion === "rechazada"
      ? verificacionRechazadaMasReciente(perfil.verificaciones)?.motivoRechazo
      : undefined;

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-teal-800">Mi perfil</h1>
        <Link to="/perfil/armar" className="min-h-11 text-sm font-semibold text-teal-800 underline">
          Editar
        </Link>
      </header>

      <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Identidad:</span>
          <Badge tono={TONOS_ESTADO_VERIFICACION[perfil.estadoVerificacion]}>
            {ETIQUETAS_ESTADO_VERIFICACION[perfil.estadoVerificacion]}
          </Badge>
        </div>
        {motivoRechazoIdentidad && (
          <p className="text-xs text-red-700">Motivo: {motivoRechazoIdentidad}</p>
        )}
        <p className="text-sm text-slate-700">
          {perfil.presentacion ?? "Todavía no contaste nada sobre vos."}
        </p>
        <p className="text-sm text-slate-600">
          {perfil.aniosExperiencia !== null
            ? `${perfil.aniosExperiencia} años de experiencia`
            : "Sin años de experiencia cargados"}
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">Tus oficios</h2>
        {perfil.oficios.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no cargaste ningún oficio.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {perfil.oficios.map((oficio) => {
              const motivoRechazoMatricula =
                oficio.matriculaEstado === "rechazada"
                  ? verificacionMatriculaRechazada(perfil.verificaciones, oficio.id)?.motivoRechazo
                  : undefined;
              return (
                <li key={oficio.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{oficio.categoria.nombre}</span>
                    <Badge tono={TONOS_ESTADO_MATRICULA[oficio.matriculaEstado]}>
                      {ETIQUETAS_ESTADO_MATRICULA[oficio.matriculaEstado]}
                    </Badge>
                  </div>
                  {oficio.subcategorias.length > 0 && (
                    <p className="text-xs text-slate-500">{oficio.subcategorias.join(", ")}</p>
                  )}
                  {oficio.matriculaVenceEn && (
                    <p className="text-xs text-slate-500">
                      Vence: {new Date(oficio.matriculaVenceEn).toLocaleDateString("es-AR")}
                    </p>
                  )}
                  {motivoRechazoMatricula && (
                    <p className="text-xs text-red-700">Motivo: {motivoRechazoMatricula}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">Zona de cobertura</h2>
        {!perfil.zonaCobertura && (
          <p className="text-sm text-slate-500">Todavía no configuraste tu zona.</p>
        )}
        {perfil.zonaCobertura?.tipo === "barrios" && (
          <p className="text-sm text-slate-700">
            {perfil.zonaCobertura.barrioIds.length} barrio(s) seleccionados.
          </p>
        )}
        {perfil.zonaCobertura?.tipo === "radio" && (
          <p className="text-sm text-slate-700">
            Radio de {perfil.zonaCobertura.radioKm} km desde el punto configurado.
          </p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-lg font-bold text-slate-900">
            {perfil.promedioResenias !== null ? perfil.promedioResenias.toFixed(1) : "—"}
          </p>
          <p className="text-xs text-slate-500">
            {perfil.promedioResenias !== null ? "Promedio" : "Nuevo en Fixeo"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-lg font-bold text-slate-900">{perfil.cantidadResenias}</p>
          <p className="text-xs text-slate-500">Reseñas</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-lg font-bold text-slate-900">{perfil.trabajosCerrados}</p>
          <p className="text-xs text-slate-500">Trabajos cerrados</p>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">Reseñas recibidas</h2>

        {perfil.cantidadResenias === 0 ? (
          <p className="text-sm text-slate-500">Todavía no tenés reseñas.</p>
        ) : (
          <>
            {reseniasQuery.isPending && <Spinner etiqueta="Cargando tus reseñas" />}

            {reseniasQuery.isError && (
              <div className="flex flex-col items-start gap-2 text-sm text-red-700">
                <p role="alert">No pudimos cargar tus reseñas.</p>
                <button
                  type="button"
                  className="min-h-11 font-semibold underline"
                  onClick={() => reseniasQuery.refetch()}
                >
                  Reintentar
                </button>
              </div>
            )}

            {resenias.length > 0 && (
              <ul className="flex flex-col gap-3">
                {resenias.map((resenia) => (
                  <TarjetaResenia key={resenia.id} resenia={resenia} puedeResponder />
                ))}
              </ul>
            )}

            {reseniasQuery.hasNextPage && (
              <Button
                type="button"
                variante="secundario"
                cargando={reseniasQuery.isFetchingNextPage}
                onClick={() => reseniasQuery.fetchNextPage()}
              >
                Ver más reseñas
              </Button>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Button
          type="button"
          variante="secundario"
          cargando={mutacionPausa.isPending}
          onClick={() => mutacionPausa.mutate()}
        >
          {perfil.pausado ? "Reanudar mi perfil" : "Pausar mi perfil"}
        </Button>
        {perfil.pausado && (
          <p className="text-sm text-slate-600">
            Tu perfil está pausado: no vas a recibir pedidos nuevos hasta que lo reanudes.
          </p>
        )}
        {mutacionPausa.isError && (
          <p role="alert" className="text-sm text-red-600">
            {mutacionPausa.error instanceof ErrorApiHttp
              ? mutacionPausa.error.mensaje
              : "No pudimos actualizar tu perfil. Probá de nuevo."}
          </p>
        )}
      </section>
    </main>
  );
}
