import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  categoriasQueryKey,
  obtenerCategorias,
  obtenerBarrios,
  barriosQueryKey,
} from "../../pedidos/api";
import {
  type FiltrosMetricasTablero,
  metricasTableroQueryKey,
  obtenerMetricasTablero,
} from "../api";
import { AdminNav } from "../components/AdminNav";
import { TarjetaMetrica } from "../components/TarjetaMetrica";
import { Spinner } from "../../../components/ui/Spinner";

function formatearPorcentaje(valor: number): string {
  return `${valor.toFixed(1)}%`;
}

function formatearMinutos(valor: number): string {
  return `${Math.round(valor)} min`;
}

function celda(valor: number | null, formatear: (valor: number) => string): string {
  return valor === null ? "Sin datos" : formatear(valor);
}

/** AD-05 · Tablero: metricas agregadas del embudo (docs/dominio.md §10), con filtros de fecha/categoria/barrio. */
export function TableroPage() {
  const [filtros, setFiltros] = useState<FiltrosMetricasTablero>({});

  const categoriasQuery = useQuery({ queryKey: categoriasQueryKey, queryFn: obtenerCategorias });
  const barriosQuery = useQuery({ queryKey: barriosQueryKey, queryFn: obtenerBarrios });

  const metricasQuery = useQuery({
    queryKey: metricasTableroQueryKey(filtros),
    queryFn: () => obtenerMetricasTablero(filtros),
  });

  const metricas = metricasQuery.data;

  return (
    <main id="contenido-principal" className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-white px-6 py-8">
      <AdminNav />

      <header>
        <h1 className="text-2xl font-bold text-teal-800">Tablero</h1>
        <p className="text-sm text-slate-600">
          Métricas del embudo de pedidos. Sin filtro: últimos 30 días.
        </p>
      </header>

      <form className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="tablero-desde" className="text-sm font-medium text-slate-700">
              Desde
            </label>
            <input
              id="tablero-desde"
              type="date"
              value={filtros.desde ?? ""}
              onChange={(evento) =>
                setFiltros((f) => ({ ...f, desde: evento.target.value || undefined }))
              }
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="tablero-hasta" className="text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input
              id="tablero-hasta"
              type="date"
              value={filtros.hasta ?? ""}
              onChange={(evento) =>
                setFiltros((f) => ({ ...f, hasta: evento.target.value || undefined }))
              }
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tablero-categoria" className="text-sm font-medium text-slate-700">
            Categoría
          </label>
          <select
            id="tablero-categoria"
            value={filtros.categoriaId ?? ""}
            onChange={(evento) =>
              setFiltros((f) => ({ ...f, categoriaId: evento.target.value || undefined }))
            }
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
          >
            <option value="">Todas las categorías</option>
            {categoriasQuery.data?.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tablero-barrio" className="text-sm font-medium text-slate-700">
            Barrio
          </label>
          <select
            id="tablero-barrio"
            value={filtros.barrioId ?? ""}
            onChange={(evento) =>
              setFiltros((f) => ({ ...f, barrioId: evento.target.value || undefined }))
            }
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
          >
            <option value="">Todos los barrios</option>
            {barriosQuery.data?.map((barrio) => (
              <option key={barrio.id} value={barrio.id}>
                {barrio.nombre}
              </option>
            ))}
          </select>
        </div>
      </form>

      {metricasQuery.isPending && <Spinner etiqueta="Cargando métricas" />}

      {metricasQuery.isError && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos cargar las métricas.</p>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => metricasQuery.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}

      {metricas && (
        <>
          <p className="text-xs text-slate-500">
            Rango: {new Date(metricas.rango.desde).toLocaleDateString("es-AR")} al{" "}
            {new Date(metricas.rango.hasta).toLocaleDateString("es-AR")}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TarjetaMetrica etiqueta="Pedidos publicados" valor={metricas.totalPedidosPublicados} />
            <TarjetaMetrica
              etiqueta="Cobertura en 6 h"
              valor={metricas.coberturaSeisHorasPorcentaje}
              formatear={formatearPorcentaje}
              objetivo="mayor a 70%"
            />
            <TarjetaMetrica
              etiqueta="Mediana a la primera postulación"
              valor={metricas.medianaMinutosPrimeraPostulacion}
              formatear={formatearMinutos}
              objetivo="menor a 45 min"
            />
            <TarjetaMetrica
              etiqueta="Tasa de contacto"
              valor={metricas.tasaContactoPorcentaje}
              formatear={formatearPorcentaje}
              objetivo="mayor a 50%"
            />
            <TarjetaMetrica
              etiqueta="Trabajo declarado"
              valor={metricas.tasaTrabajoDeclaradoPorcentaje}
              formatear={formatearPorcentaje}
              objetivo="mayor a 40%"
            />
            <TarjetaMetrica
              etiqueta="Finalización del asistente"
              valor={metricas.finalizacionAsistentePorcentaje}
              formatear={formatearPorcentaje}
              objetivo="mayor a 65%"
            />
            <TarjetaMetrica
              etiqueta="Tasa de selección mediana"
              valor={metricas.tasaSeleccionMedianaPorcentaje}
              formatear={formatearPorcentaje}
              objetivo="mayor a 15%"
            />
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-slate-900">Por categoría</h2>

            {metricas.porCategoria.length === 0 ? (
              <p className="text-sm text-slate-500">Sin datos por categoría en este rango.</p>
            ) : (
              <div className="-mx-6 overflow-x-auto px-6">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Categoría
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Publicados
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Cobertura 6 h
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Mediana 1ª postulación
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Contacto
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Trabajo declarado
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Selección mediana
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricas.porCategoria.map((fila) => (
                      <tr key={fila.categoria.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-900">
                          {fila.categoria.nombre}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{fila.totalPedidosPublicados}</td>
                        <td className="py-2 pr-3 text-slate-700">
                          {celda(fila.coberturaSeisHorasPorcentaje, formatearPorcentaje)}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {celda(fila.medianaMinutosPrimeraPostulacion, formatearMinutos)}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {celda(fila.tasaContactoPorcentaje, formatearPorcentaje)}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {celda(fila.tasaTrabajoDeclaradoPorcentaje, formatearPorcentaje)}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {celda(fila.tasaSeleccionMedianaPorcentaje, formatearPorcentaje)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
