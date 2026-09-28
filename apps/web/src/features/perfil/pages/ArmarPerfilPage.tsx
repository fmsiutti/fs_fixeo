import { useQuery } from "@tanstack/react-query";
import { obtenerPerfilProfesional, perfilProfesionalQueryKey } from "../api";
import { ArmarPerfilWizard } from "../components/ArmarPerfilWizard";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";

/**
 * PR-01 · Armado del perfil. Un 404 de GET /perfil-profesional significa
 * "todavia no armo nada" (arranca el wizard vacio), no un error real.
 */
export function ArmarPerfilPage() {
  const perfilQuery = useQuery({
    queryKey: perfilProfesionalQueryKey,
    queryFn: obtenerPerfilProfesional,
    // El 404 es un estado esperado para un profesional nuevo, no un fallo
    // transitorio: reintentarlo solo demoraria mostrar el paso 1 vacio.
    retry: false,
  });

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

  if (perfilQuery.isError && !esPerfilNoArmado) {
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

  return <ArmarPerfilWizard perfilInicial={esPerfilNoArmado ? undefined : perfilQuery.data} />;
}
