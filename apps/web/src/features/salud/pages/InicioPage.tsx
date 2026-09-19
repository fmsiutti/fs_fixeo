import { useQuery } from "@tanstack/react-query";
import { obtenerSalud, saludQueryKey } from "../api";

export function InicioPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: saludQueryKey,
    queryFn: obtenerSalud,
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-teal-800">Fixeo</h1>

      {isPending && <p className="text-slate-500">Consultando el estado de la api...</p>}

      {isError && (
        <p className="text-red-600" role="alert">
          No pudimos conectar con la api. Revisá que este corriendo en {""}
          <code>pnpm dev</code>.
        </p>
      )}

      {data && (
        <p className="text-slate-700">
          Api conectada: estado <strong>{data.estado}</strong>
        </p>
      )}
    </main>
  );
}
