import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSesion } from "../../auth/useSesion";
import {
  barriosQueryKey,
  categoriasQueryKey,
  crearPedido,
  obtenerBarrios,
  obtenerCategorias,
} from "../api";
import { useBorradorPedido } from "../borrador";
import { AsistenteHeader } from "../components/AsistenteHeader";
import { VerificacionTelefonoInline } from "../components/VerificacionTelefonoInline";
import { ETIQUETAS_FRANJA, ETIQUETAS_URGENCIA } from "../etiquetas";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

function textoErrorPublicar(error: unknown): string {
  if (error instanceof ErrorApiHttp) {
    if (error.codigo === "limite_excedido") return error.mensaje;
    if (error.codigo === "validacion") {
      return "Revisá los datos del pedido: algo no está completo o es inválido.";
    }
  }
  return "No pudimos publicar tu pedido. Probá de nuevo.";
}

/** CL-06 · Publicar 5: revisar. Verificacion de telefono embebida si no hay sesion. */
export function RevisarPage() {
  const navigate = useNavigate();
  const { estaAutenticado } = useSesion();
  const { borrador, limpiar } = useBorradorPedido();
  const [terminosAceptados, setTerminosAceptados] = useState(false);
  const [errorPublicar, setErrorPublicar] = useState<string | null>(null);

  const categoriasQuery = useQuery({
    queryKey: categoriasQueryKey,
    queryFn: obtenerCategorias,
    staleTime: Infinity,
  });
  const barriosQuery = useQuery({
    queryKey: barriosQueryKey,
    queryFn: obtenerBarrios,
    staleTime: Infinity,
  });

  const mutacionCrear = useMutation({
    mutationFn: crearPedido,
    onSuccess: (pedido) => {
      limpiar();
      navigate(`/pedidos/${pedido.id}`, { replace: true });
    },
    onError: (error) => setErrorPublicar(textoErrorPublicar(error)),
  });

  if (!borrador.categoriaId) return <Navigate to="/publicar/que" replace />;
  if (!borrador.direccion) return <Navigate to="/publicar/donde" replace />;
  if (!borrador.urgencia || borrador.franjas.length === 0) {
    return <Navigate to="/publicar/cuando" replace />;
  }

  const direccion = borrador.direccion;
  const urgencia = borrador.urgencia;
  const categoria = categoriasQuery.data?.find((item) => item.id === borrador.categoriaId);
  const barrio = barriosQuery.data?.find((item) => item.id === direccion.barrioId);

  function publicar() {
    if (!borrador.categoriaId || !borrador.direccion || !borrador.urgencia) return;
    setErrorPublicar(null);
    // Insurance ademas del reset en QueNecesitasPage: si por lo que sea el
    // borrador quedo con respuestas de una categoria anterior, se filtran acá
    // en vez de mandarlas y que el service las rechace sin que el cliente
    // pueda corregirlas desde esta pantalla. Si la categoria todavia no
    // cargo, no se filtra nada (mejor mandarlas tal cual que borrar
    // respuestas validas por una carrera con la query).
    const respuestasGuiaValidas = categoria
      ? Object.fromEntries(
          Object.entries(borrador.respuestasGuia).filter(([pregunta]) =>
            categoria.preguntasGuia.includes(pregunta),
          ),
        )
      : borrador.respuestasGuia;
    mutacionCrear.mutate({
      categoriaId: borrador.categoriaId,
      // El schema trimea antes de medir el largo: si no se trimea acá
      // tambien, un texto de 20 caracteres con espacios al borde pasa la
      // validacion del paso 2 (ProblemaPage) pero vuelve 400 desde la api.
      descripcion: borrador.descripcion.trim(),
      respuestasGuia:
        Object.keys(respuestasGuiaValidas).length > 0 ? respuestasGuiaValidas : undefined,
      urgencia: borrador.urgencia,
      franjas: borrador.franjas,
      direccion: borrador.direccion,
      borradorId: borrador.borradorId,
      // El contrato solo lleva `id`: la url la recalcula el backend a partir
      // del borradorId (ver packages/shared/src/pedidos.ts).
      fotos: borrador.fotos.map((foto) => ({ id: foto.id })),
    });
  }

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <AsistenteHeader paso={5} titulo="Revisá tu pedido" volverA="/publicar/cuando" />

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {categoriasQuery.isPending && "Cargando categoría…"}
          {categoriasQuery.isError && "No pudimos cargar el nombre de la categoría"}
          {categoriasQuery.isSuccess && (categoria?.nombre ?? "Categoría")}
        </p>

        <p className="text-sm text-slate-800">
          {borrador.descripcion || "Sin descripción todavía."}
        </p>

        {borrador.fotos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {borrador.fotos.map((foto) => (
              <img
                key={foto.id}
                src={urlCompletaApi(foto.url)}
                alt="Foto del pedido"
                className="aspect-square w-full rounded-xl object-cover"
              />
            ))}
          </div>
        )}

        <dl className="flex flex-col gap-1 text-sm text-slate-600">
          <div className="flex justify-between">
            <dt>Barrio</dt>
            <dd className="font-medium text-slate-900">
              {barriosQuery.isPending && "…"}
              {barriosQuery.isError && "No pudimos cargar el nombre"}
              {barriosQuery.isSuccess && (barrio?.nombre ?? "Sin definir")}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Urgencia</dt>
            <dd className="font-medium text-slate-900">{ETIQUETAS_URGENCIA[urgencia]}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Franjas</dt>
            <dd className="font-medium text-slate-900">
              {borrador.franjas.map((franja) => ETIQUETAS_FRANJA[franja] ?? franja).join(", ")}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-slate-500">
          La dirección exacta y el piso o depto nunca se publican: solo se comparten con el
          profesional que elijas.
        </p>
      </section>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5"
          checked={terminosAceptados}
          onChange={(evento) => setTerminosAceptados(evento.target.checked)}
        />
        <span>
          Entiendo que Fixeo pone en contacto y no presta, supervisa ni fija precios del servicio.
        </span>
      </label>

      {!estaAutenticado && <VerificacionTelefonoInline />}

      {errorPublicar && (
        <p role="alert" className="text-sm text-red-600">
          {errorPublicar}
        </p>
      )}

      {estaAutenticado && (
        <Button
          type="button"
          onClick={publicar}
          disabled={!terminosAceptados}
          cargando={mutacionCrear.isPending}
        >
          Publicar pedido
        </Button>
      )}
    </main>
  );
}
