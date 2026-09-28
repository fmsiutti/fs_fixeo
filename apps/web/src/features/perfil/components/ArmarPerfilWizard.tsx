import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CategoriaVista,
  ExigenciaMatricula,
  PerfilProfesionalVistaPropia,
} from "@fixeo/shared";
import { categoriasQueryKey, obtenerCategorias } from "../../pedidos/api";
import { perfilProfesionalQueryKey } from "../api";
import { BarraProgresoPerfil } from "./BarraProgresoPerfil";
import { PasoDatos } from "./PasoDatos";
import { PasoOficios } from "./PasoOficios";
import { PasoZona } from "./PasoZona";
import { PasoIdentidad } from "./PasoIdentidad";
import { PasoMatricula, type OficioConExigencia } from "./PasoMatricula";

type PasoId = "datos" | "oficios" | "zona" | "identidad" | "matricula";

interface PasoConfig {
  id: PasoId;
  etiqueta: string;
}

const PASOS_BASE: PasoConfig[] = [
  { id: "datos", etiqueta: "Datos" },
  { id: "oficios", etiqueta: "Oficios" },
  { id: "zona", etiqueta: "Zona" },
  { id: "identidad", etiqueta: "Identidad" },
];

/**
 * `OficioVista.categoria` no trae `requiereMatricula` (docs/dominio.md D9):
 * hay que cruzarlo con GET /categorias, que ademas ya se precarga en el paso
 * "Oficios" bajo la misma query key (`staleTime: Infinity`, sin costo extra
 * de red en el flujo normal).
 */
function mapaExigenciaPorCategoria(
  categorias: CategoriaVista[] | undefined,
): Map<string, ExigenciaMatricula> {
  if (!categorias) return new Map();
  return new Map(categorias.map((categoria) => [categoria.id, categoria.requiereMatricula]));
}

function oficiosConMatricula(
  perfil: PerfilProfesionalVistaPropia | undefined,
  exigenciaPorCategoria: Map<string, ExigenciaMatricula>,
): OficioConExigencia[] {
  if (!perfil) return [];
  const resultado: OficioConExigencia[] = [];
  for (const oficio of perfil.oficios) {
    const exigencia = exigenciaPorCategoria.get(oficio.categoria.id) ?? "no_exigida";
    if (exigencia !== "no_exigida") resultado.push({ oficio, exigencia });
  }
  return resultado;
}

function calcularPasos(
  perfil: PerfilProfesionalVistaPropia | undefined,
  exigenciaPorCategoria: Map<string, ExigenciaMatricula>,
): PasoConfig[] {
  if (oficiosConMatricula(perfil, exigenciaPorCategoria).length === 0) return PASOS_BASE;
  return [...PASOS_BASE, { id: "matricula", etiqueta: "Matrícula" }];
}

/**
 * Hasta donde se puede saltar sin re-rellenar nada: el perfil tiene que
 * existir para pasar de "datos", y tener al menos un oficio cargado para
 * pasar de "oficios". Zona, identidad y matricula no tienen un prerequisito
 * real entre si (son documentos independientes), asi que quedan todas
 * alcanzables juntas apenas hay oficios guardados.
 */
function calcularMaxPasoIndex(
  perfil: PerfilProfesionalVistaPropia | undefined,
  totalPasos: number,
): number {
  if (!perfil) return 0;
  if (perfil.oficios.length === 0) return 1;
  return totalPasos - 1;
}

interface ArmarPerfilWizardProps {
  perfilInicial: PerfilProfesionalVistaPropia | undefined;
}

/** PR-01 · Armado del perfil. Un solo mount: se llama recien cuando GET /perfil-profesional ya resolvio (200 o 404). */
export function ArmarPerfilWizard({ perfilInicial }: ArmarPerfilWizardProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState(perfilInicial);

  // Misma query key que PasoOficios (staleTime: Infinity): en el flujo
  // normal ya esta en cache y esto no dispara un fetch adicional.
  const categoriasQuery = useQuery({
    queryKey: categoriasQueryKey,
    queryFn: obtenerCategorias,
    staleTime: Infinity,
  });
  const exigenciaPorCategoria = mapaExigenciaPorCategoria(categoriasQuery.data);

  const pasos = calcularPasos(perfil, exigenciaPorCategoria);
  const maxPasoIndex = calcularMaxPasoIndex(perfil, pasos.length);
  const [pasoId, setPasoId] = useState<PasoId>(
    () => pasos[calcularMaxPasoIndex(perfilInicial, pasos.length)]?.id ?? "datos",
  );

  function actualizarPerfil(nuevo: PerfilProfesionalVistaPropia) {
    setPerfil(nuevo);
    queryClient.setQueryData(perfilProfesionalQueryKey, nuevo);
  }

  function irAPaso(id: string) {
    const indice = pasos.findIndex((paso) => paso.id === id);
    if (indice === -1 || indice > maxPasoIndex) return;
    setPasoId(id as PasoId);
  }

  function avanzar(nuevo?: PerfilProfesionalVistaPropia) {
    if (nuevo) actualizarPerfil(nuevo);
    const indiceActual = pasos.findIndex((paso) => paso.id === pasoId);
    const siguiente = pasos[indiceActual + 1];
    if (siguiente) {
      setPasoId(siguiente.id);
    } else {
      navigate("/perfil");
    }
  }

  const indiceActual = pasos.findIndex((paso) => paso.id === pasoId);
  const pasoAnterior = indiceActual > 0 ? pasos[indiceActual - 1] : undefined;

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <BarraProgresoPerfil
        pasos={pasos}
        pasoActualId={pasoId}
        maxPasoIndex={maxPasoIndex}
        onIrAPaso={irAPaso}
      />

      {pasoAnterior && (
        <button
          type="button"
          className="min-h-11 self-start text-sm font-semibold text-teal-800 underline"
          onClick={() => setPasoId(pasoAnterior.id)}
        >
          Volver al paso anterior
        </button>
      )}

      {pasoId === "datos" && <PasoDatos perfil={perfil} onExito={avanzar} />}
      {pasoId === "oficios" && perfil && <PasoOficios perfil={perfil} onExito={avanzar} />}
      {pasoId === "zona" && perfil && <PasoZona perfil={perfil} onExito={avanzar} />}
      {pasoId === "identidad" && perfil && (
        <PasoIdentidad perfil={perfil} onContinuar={() => avanzar()} />
      )}
      {pasoId === "matricula" && perfil && (
        <PasoMatricula
          oficios={oficiosConMatricula(perfil, exigenciaPorCategoria)}
          verificaciones={perfil.verificaciones}
          onContinuar={() => avanzar()}
        />
      )}
    </main>
  );
}
