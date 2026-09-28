import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { actualizarUsuarioSchema, type ActualizarUsuario, type CambiarRol } from "@fixeo/shared";
import { useSesion } from "../../auth/useSesion";
import { cerrarSesionApi } from "../../auth/api";
import { actualizarUsuario as guardarDatos, eliminarCuenta } from "../api";
import { useCambiarRol } from "../hooks/useCambiarRol";
import { useNotificacionesPush } from "../hooks/useNotificacionesPush";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { ErrorApiHttp } from "../../../lib/http";

const TEXTO_CONFIRMACION_ELIMINAR = "ELIMINAR";

function textoErrorPush(error: unknown): string {
  if (error instanceof ErrorApiHttp) return error.mensaje;
  if (error instanceof Error) return error.message;
  return "No pudimos actualizar tus avisos. Probá de nuevo.";
}

const ETIQUETAS_ROL: Record<CambiarRol["rol"], string> = {
  cliente: "cliente",
  profesional: "profesional",
};

/** CO-06 · Mi cuenta. Cubre datos, cambio de rol, cerrar sesion y eliminar cuenta. */
export function CuentaPage() {
  const {
    usuario,
    actualizarUsuario: guardarUsuarioEnContexto,
    cerrarSesion: limpiarSesion,
  } = useSesion();
  const navigate = useNavigate();

  const [errorDatos, setErrorDatos] = useState<string | null>(null);
  const [exitoDatos, setExitoDatos] = useState(false);
  const [errorRol, setErrorRol] = useState<string | null>(null);
  const [mostrarEliminar, setMostrarEliminar] = useState(false);
  const [textoConfirmacion, setTextoConfirmacion] = useState("");
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const formDatos = useForm<ActualizarUsuario>({
    // El schema convierte "" a null antes de validar (borrar un campo opcional
    // no debe fallar, y tiene que borrarlo de verdad en la base), asi que su
    // tipo de entrada es `unknown` en esos campos; el resultado real siempre
    // cumple ActualizarUsuario (mismo patron que IngresarPage con
    // solicitarOtpSchema).
    resolver: zodResolver(actualizarUsuarioSchema) as Resolver<ActualizarUsuario>,
    defaultValues: {
      nombre: usuario?.nombre ?? undefined,
      apellido: usuario?.apellido ?? undefined,
      email: usuario?.email ?? undefined,
    },
  });

  const mutacionDatos = useMutation({
    mutationFn: guardarDatos,
    onSuccess: (usuarioActualizado) => {
      guardarUsuarioEnContexto(usuarioActualizado);
      // Sin esto, un campo que se borro (null en la respuesta) se ve vacio en
      // el form por casualidad (por como quedo el input), no porque el form
      // sepa que se borro: re-sincronizamos contra lo que realmente guardo la
      // api, no lo que se envio.
      formDatos.reset({
        nombre: usuarioActualizado.nombre ?? undefined,
        apellido: usuarioActualizado.apellido ?? undefined,
        email: usuarioActualizado.email ?? undefined,
      });
      setErrorDatos(null);
      setExitoDatos(true);
    },
    onError: (error) => {
      setExitoDatos(false);
      setErrorDatos(
        error instanceof ErrorApiHttp
          ? error.mensaje
          : "No pudimos guardar los cambios. Probá de nuevo.",
      );
    },
  });

  const mutacionRol = useCambiarRol();
  const notificacionesPush = useNotificacionesPush();

  const mutacionLogout = useMutation({
    mutationFn: async () => {
      // Best-effort: en un dispositivo compartido, si no desuscribimos el
      // push antes de cerrar sesion, la cuenta que se va sigue recibiendo
      // sus notificaciones (con contenido propio) en este navegador. Un
      // fallo aca (sin soporte push, sin permiso, red caida) nunca debe
      // impedir cerrar sesion.
      try {
        await notificacionesPush.desactivar.mutateAsync();
      } catch {
        // ignorado a proposito
      }
      await cerrarSesionApi();
    },
    onSettled: () => {
      limpiarSesion();
      navigate("/bienvenida", { replace: true });
    },
  });

  const mutacionEliminar = useMutation({
    mutationFn: eliminarCuenta,
    onSuccess: () => {
      limpiarSesion();
      navigate("/bienvenida", { replace: true });
    },
    onError: (error) => {
      setErrorEliminar(
        error instanceof ErrorApiHttp
          ? error.mensaje
          : "No pudimos eliminar tu cuenta. Probá de nuevo.",
      );
    },
  });

  if (!usuario) {
    return <Navigate to="/ingresar" replace />;
  }

  function elegirRol(rol: CambiarRol["rol"]) {
    setErrorRol(null);
    mutacionRol.mutate(
      { rol },
      {
        onSuccess: (usuarioActualizado) => guardarUsuarioEnContexto(usuarioActualizado),
        onError: (error) => {
          setErrorRol(
            error instanceof ErrorApiHttp
              ? error.mensaje
              : "No pudimos cambiar tu rol. Probá de nuevo.",
          );
        },
      },
    );
  }

  // "moderador"/"soporte" no son elegibles por este toggle (ROLES_ELEGIBLES_USUARIO):
  // se tratan igual que "sin elegir" para esta seccion, que solo alterna cliente/profesional.
  const rolElegible: CambiarRol["rol"] | null =
    usuario.rolActivo === "cliente" || usuario.rolActivo === "profesional"
      ? usuario.rolActivo
      : null;
  const otroRol: CambiarRol["rol"] = rolElegible === "profesional" ? "cliente" : "profesional";

  const estadoPush = notificacionesPush.estadoQuery.data;
  const estaSuscripto = estadoPush?.suscripto ?? false;
  const cargandoPush =
    notificacionesPush.activar.isPending || notificacionesPush.desactivar.isPending;
  const errorMutacionPush = notificacionesPush.activar.error ?? notificacionesPush.desactivar.error;

  function alternarAvisosPush() {
    // Guard en vez de `disabled` en el boton: asi el switch nunca pierde el
    // foco ni deja de ser tabbable para teclado/lector de pantalla mientras
    // la mutacion esta en curso, solo ignora clicks repetidos.
    if (cargandoPush || notificacionesPush.estadoQuery.isPending) return;
    if (estaSuscripto) {
      notificacionesPush.desactivar.mutate();
    } else {
      notificacionesPush.activar.mutate();
    }
  }

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold text-teal-800">Mi cuenta</h1>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">Tus datos</h2>
        <p className="text-sm text-slate-600">
          Teléfono: <span className="font-medium text-slate-900">{usuario.telefono}</span>
        </p>

        <form
          noValidate
          onSubmit={formDatos.handleSubmit((datos) => mutacionDatos.mutate(datos))}
          className="flex flex-col gap-4"
        >
          <Field
            label="Nombre"
            autoComplete="given-name"
            error={formDatos.formState.errors.nombre?.message}
            {...formDatos.register("nombre")}
          />
          <Field
            label="Apellido"
            autoComplete="family-name"
            error={formDatos.formState.errors.apellido?.message}
            {...formDatos.register("apellido")}
          />
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            error={formDatos.formState.errors.email?.message}
            {...formDatos.register("email")}
          />

          {errorDatos && (
            <p role="alert" className="text-sm text-red-600">
              {errorDatos}
            </p>
          )}
          {exitoDatos && !errorDatos && (
            <p role="status" className="text-sm text-teal-700">
              Guardamos tus cambios.
            </p>
          )}

          <Button type="submit" cargando={mutacionDatos.isPending}>
            Guardar cambios
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">Tu rol</h2>

        {rolElegible === null ? (
          <>
            <p className="text-sm text-slate-600">Todavía no elegiste con qué rol usar Fixeo.</p>
            <div className="flex flex-col gap-3">
              <Button
                variante="secundario"
                onClick={() => elegirRol("cliente")}
                cargando={mutacionRol.isPending}
              >
                Necesito un servicio
              </Button>
              <Button
                variante="secundario"
                onClick={() => elegirRol("profesional")}
                cargando={mutacionRol.isPending}
              >
                Trabajo en oficios
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Ahora estás como <strong>{ETIQUETAS_ROL[rolElegible]}</strong>. Podés cambiarlo cuando
              quieras.
            </p>
            <Button
              variante="secundario"
              onClick={() => elegirRol(otroRol)}
              cargando={mutacionRol.isPending}
            >
              Cambiar a {ETIQUETAS_ROL[otroRol]}
            </Button>
          </>
        )}

        {errorRol && (
          <p role="alert" className="text-sm text-red-600">
            {errorRol}
          </p>
        )}
      </section>

      <section className="flex flex-col divide-y divide-slate-200 rounded-2xl border border-slate-200">
        <div className="flex min-h-11 items-center justify-between px-4 py-3 text-sm text-slate-400">
          <span>Direcciones</span>
          <span>Próximamente</span>
        </div>

        {estadoPush?.soportado === false ? (
          <div className="flex min-h-11 flex-col gap-1 px-4 py-3 text-sm">
            <span className="text-slate-700">Avisos</span>
            <span className="text-xs text-slate-400">
              Tu navegador no admite notificaciones push.
            </span>
          </div>
        ) : notificacionesPush.estadoQuery.isError ? (
          <div className="flex min-h-11 flex-col gap-2 px-4 py-3 text-sm">
            <span className="text-slate-700">Avisos</span>
            <p role="alert" className="text-sm text-red-600">
              No pudimos comprobar el estado de tus notificaciones.
            </p>
            <button
              type="button"
              className="min-h-11 self-start font-semibold text-teal-800 underline"
              onClick={() => notificacionesPush.estadoQuery.refetch()}
            >
              Reintentar
            </button>
          </div>
        ) : notificacionesPush.estadoQuery.isPending ? (
          <div className="flex min-h-11 items-center px-4 py-3 text-sm text-slate-500">
            Comprobando el estado de tus avisos…
          </div>
        ) : (
          <div className="flex min-h-11 flex-col gap-2 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="avisos-push" className="text-slate-900">
                Activar notificaciones push
              </label>
              <button
                id="avisos-push"
                type="button"
                role="switch"
                aria-checked={estaSuscripto}
                aria-disabled={cargandoPush}
                onClick={alternarAvisosPush}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 aria-disabled:opacity-50 ${
                  estaSuscripto ? "bg-teal-700" : "bg-slate-300"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    estaSuscripto ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {errorMutacionPush && (
              <p role="alert" className="text-sm text-red-600">
                {textoErrorPush(errorMutacionPush)}
              </p>
            )}
          </div>
        )}

        <Link
          to="/notificaciones"
          className="flex min-h-11 items-center justify-between px-4 py-3 text-sm text-slate-900 underline-offset-2 hover:underline focus-visible:underline"
        >
          <span>Notificaciones</span>
          <span aria-hidden="true">›</span>
        </Link>

        <div className="flex min-h-11 items-center justify-between px-4 py-3 text-sm text-slate-400">
          <span>Ayuda</span>
          <span>Próximamente</span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Button
          variante="secundario"
          onClick={() => mutacionLogout.mutate()}
          cargando={mutacionLogout.isPending}
        >
          Cerrar sesión
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
        <h2 className="font-semibold text-red-800">Eliminar cuenta</h2>
        <p className="text-sm text-red-700">
          Esto borra tu cuenta de Fixeo de forma permanente y no se puede deshacer.
        </p>

        {!mostrarEliminar ? (
          <Button variante="secundario" onClick={() => setMostrarEliminar(true)}>
            Eliminar mi cuenta
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <Field
              name="confirmacionEliminarCuenta"
              label={`Escribí "${TEXTO_CONFIRMACION_ELIMINAR}" para confirmar`}
              value={textoConfirmacion}
              onChange={(evento) => setTextoConfirmacion(evento.target.value)}
            />

            {errorEliminar && (
              <p role="alert" className="text-sm text-red-700">
                {errorEliminar}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                variante="secundario"
                onClick={() => {
                  setMostrarEliminar(false);
                  setTextoConfirmacion("");
                  setErrorEliminar(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variante="peligro"
                disabled={textoConfirmacion !== TEXTO_CONFIRMACION_ELIMINAR}
                cargando={mutacionEliminar.isPending}
                onClick={() => mutacionEliminar.mutate()}
              >
                Eliminar definitivamente
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
