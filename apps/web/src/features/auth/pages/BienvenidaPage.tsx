import { Link } from "react-router-dom";
import { clasesBoton } from "../../../components/ui/clasesBoton";

const PASOS = [
  {
    titulo: "Contá qué necesitás",
    descripcion: "Describí el problema, sacale una foto y decinos dónde y cuándo te viene bien.",
  },
  {
    titulo: "Profesionales verificados se postulan",
    descripcion: "Recibís postulaciones con una estimación orientativa, vos comparás con calma.",
  },
  {
    titulo: "Elegís y te contactás directo",
    descripcion:
      "Habilitás el contacto con hasta 3 profesionales y coordinás por WhatsApp o llamada.",
  },
] as const;

/** CO-01 · Bienvenida. Contenido estatico: sin datos remotos, sin estados de carga/error. */
export function BienvenidaPage() {
  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col justify-between gap-8 bg-white px-6 py-10">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-bold text-teal-800">Fixeo</h1>
          <p className="text-base text-slate-600">
            Encontrá al profesional que necesitás, cerca tuyo.
          </p>
        </header>

        <ol className="flex flex-col gap-4">
          {PASOS.map((paso, indice) => (
            <li
              key={paso.titulo}
              className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white"
              >
                {indice + 1}
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-slate-900">{paso.titulo}</p>
                <p className="text-sm text-slate-600">{paso.descripcion}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-3">
        <Link to="/ingresar" className={clasesBoton("primario")}>
          Ingresar
        </Link>

        <div className="flex flex-col items-center gap-1">
          <button type="button" disabled className={clasesBoton("secundario")}>
            Publicar sin cuenta
          </button>
          <p className="text-center text-xs text-slate-500">
            Muy pronto. Por ahora, ingresá para publicar tu pedido.
          </p>
        </div>
      </div>
    </main>
  );
}
