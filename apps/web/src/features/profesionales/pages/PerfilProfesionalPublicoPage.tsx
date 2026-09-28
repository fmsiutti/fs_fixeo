import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { obtenerPerfilProfesionalPublico, perfilProfesionalPublicoQueryKey } from "../api";
import { barriosQueryKey, obtenerBarrios } from "../../pedidos/api";
import { FormularioDenuncia } from "../../feed/components/FormularioDenuncia";
import { obtenerReseniasDeProfesional, reseniasDeProfesionalQueryKey } from "../../resenias/api";
import { DistribucionPuntajes } from "../../resenias/components/DistribucionPuntajes";
import { TarjetaResenia } from "../../resenias/components/TarjetaResenia";
import { ETIQUETAS_ESTADO_MATRICULA, TONOS_ESTADO_MATRICULA } from "../../perfil/etiquetas";
import { useSesion } from "../../auth/useSesion";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

/** CL-09 · Perfil del profesional (vista publica). */
export function PerfilProfesionalPublicoPage() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useSesion();
  const [mostrarDenuncia, setMostrarDenuncia] = useState(false);
  const [denunciaEnviada, setDenunciaEnviada] = useState(false);

  const perfilQuery = useQuery({
    queryKey: perfilProfesionalPublicoQueryKey(id ?? ""),
    queryFn: () => obtenerPerfilProfesionalPublico(id ?? ""),
    enabled: Boolean(usuario) && Boolean(id),
    retry: false,
  });

  const perfil = perfilQuery.data;
  const zona = perfil?.zonaCobertura ?? null;

  const barriosQuery = useQuery({
    queryKey: barriosQueryKey,
    queryFn: obtenerBarrios,
    enabled: zona?.tipo === "barrios",
    staleTime: Infinity,
  });

  const reseniasQuery = useInfiniteQuery({
    queryKey: reseniasDeProfesionalQueryKey(id ?? ""),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      obtenerReseniasDeProfesional(id ?? "", pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
    enabled: Boolean(usuario) && Boolean(id),
  });
  const resenias = reseniasQuery.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  if (!usuario) {
    return <Navigate to="/ingresar" replace />;
  }
  if (!id) {
    return <Navigate to="/" replace />;
  }

  const error = perfilQuery.error instanceof ErrorApiHttp ? perfilQuery.error : null;
  const esNoEncontrado = error?.codigo === "no_encontrado";

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center gap-2">
        <Link
          to="/trabajos"
          aria-label="Volver"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="text-xl font-bold text-teal-800">Perfil del profesional</h1>
      </header>

      {perfilQuery.isPending && <Spinner etiqueta="Cargando el perfil" />}

      {esNoEncontrado && <p className="text-sm text-slate-700">Este perfil no existe.</p>}

      {perfilQuery.isError && !esNoEncontrado && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos cargar este perfil.</p>
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={() => perfilQuery.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}

      {perfil && (
        <>
          <section className="flex flex-col items-center gap-3 text-center">
            {perfil.fotoUrl ? (
              <img
                src={urlCompletaApi(perfil.fotoUrl)}
                alt=""
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-2xl font-bold text-slate-500"
              >
                {(perfil.nombre ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
            <h2 className="text-lg font-bold text-slate-900">
              {[perfil.nombre, perfil.apellido].filter(Boolean).join(" ") || "Profesional"}
            </h2>

            {/* CL-09 "insignias": identidad verificada + matricula validada por oficio. */}
            <div className="flex flex-wrap justify-center gap-2">
              {perfil.estadoVerificacion === "aprobada" && (
                <Badge tono={TONOS_ESTADO_MATRICULA.validada}>Identidad verificada</Badge>
              )}
              {perfil.oficios
                .filter((oficio) => oficio.matriculaEstado === "validada")
                .map((oficio) => (
                  <Badge key={oficio.categoria.slug} tono="exito">
                    Matrícula validada · {oficio.categoria.nombre}
                  </Badge>
                ))}
            </div>
          </section>

          <section className="flex flex-col items-center gap-1 text-center">
            {/* docs/dominio.md §8: "Sin reseñas se muestra 'Nuevo en Fixeo'... nunca un cero". */}
            {perfil.cantidadResenias === 0 ? (
              <p className="font-semibold text-slate-700">Nuevo en Fixeo</p>
            ) : (
              <p className="font-semibold text-slate-900">
                ★ {perfil.promedioResenias?.toFixed(1) ?? "—"} · {perfil.cantidadResenias} reseñas
              </p>
            )}
            <p className="text-sm text-slate-500">{perfil.trabajosCerrados} trabajos cerrados</p>
          </section>

          {perfil.presentacion && <p className="text-sm text-slate-700">{perfil.presentacion}</p>}
          {perfil.aniosExperiencia !== null && (
            <p className="text-sm text-slate-600">{perfil.aniosExperiencia} años de experiencia</p>
          )}

          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Oficios</h3>
            {perfil.oficios.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no cargó ningún oficio.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {perfil.oficios.map((oficio) => (
                  <li key={oficio.categoria.slug} className="flex flex-col gap-1">
                    <span className="font-medium text-slate-900">{oficio.categoria.nombre}</span>
                    {oficio.subcategorias.length > 0 && (
                      <span className="text-xs text-slate-500">
                        {oficio.subcategorias.join(", ")}
                      </span>
                    )}
                    <span>
                      <Badge tono={TONOS_ESTADO_MATRICULA[oficio.matriculaEstado]}>
                        {ETIQUETAS_ESTADO_MATRICULA[oficio.matriculaEstado]}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Zona de cobertura</h3>
            {!zona && <p className="text-sm text-slate-500">Todavía no configuró su zona.</p>}
            {zona?.tipo === "radio" && (
              <p className="text-sm text-slate-700">
                Cubre un radio de {zona.radioKm} km desde su punto de referencia.
              </p>
            )}
            {zona?.tipo === "barrios" && (
              <>
                {barriosQuery.isPending && <p className="text-sm text-slate-500">Cargando zona…</p>}
                {barriosQuery.isError && (
                  <p className="text-sm text-slate-500">No pudimos cargar los barrios.</p>
                )}
                {barriosQuery.data && (
                  <p className="text-sm text-slate-700">
                    {barriosQuery.data
                      .filter((barrio) => zona.barrioIds.includes(barrio.id))
                      .map((barrio) => barrio.nombre)
                      .join(", ") || "Sin barrios activos configurados"}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Reseñas</h3>

            {perfil.cantidadResenias === 0 ? (
              // "Nuevo en Fixeo" ya se muestra arriba (docs/dominio.md §8): no
              // se repite el mismo texto para no duplicarlo en la pantalla.
              <p className="text-sm text-slate-500">Todavía no tiene reseñas.</p>
            ) : (
              <>
                <DistribucionPuntajes resenias={resenias} />

                {reseniasQuery.isPending && <Spinner etiqueta="Cargando las reseñas" />}

                {reseniasQuery.isError && (
                  <div className="flex flex-col items-start gap-2 text-sm text-red-700">
                    <p role="alert">No pudimos cargar las reseñas.</p>
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
                      <TarjetaResenia key={resenia.id} resenia={resenia} />
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

          <div className="flex flex-col gap-2">
            {!mostrarDenuncia && !denunciaEnviada && (
              <button
                type="button"
                className="min-h-11 self-start text-sm font-semibold text-red-700 underline"
                onClick={() => setMostrarDenuncia(true)}
              >
                Denunciar
              </button>
            )}
            {denunciaEnviada && (
              <p role="status" className="text-sm text-teal-700">
                Recibimos tu denuncia, la vamos a revisar.
              </p>
            )}
          </div>

          {mostrarDenuncia && (
            <FormularioDenuncia
              tipoObjeto="perfil"
              objetoId={perfil.id}
              onExito={() => {
                setMostrarDenuncia(false);
                setDenunciaEnviada(true);
              }}
              onCancelar={() => setMostrarDenuncia(false)}
            />
          )}
        </>
      )}
    </main>
  );
}
