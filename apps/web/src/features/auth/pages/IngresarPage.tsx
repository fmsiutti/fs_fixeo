import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  confirmarOtpSchema,
  solicitarOtpSchema,
  type CanalOtp,
  type ConfirmarOtp,
  type SolicitarOtp,
} from "@fixeo/shared";
import { confirmarOtp, solicitarOtp } from "../api";
import { useContadorReenvio } from "../hooks/useContadorReenvio";
import { useSesion } from "../useSesion";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { ErrorApiHttp } from "../../../lib/http";

type Paso = "telefono" | "codigo";
type DatosCodigo = Pick<ConfirmarOtp, "codigo">;

function textoErrorEnvio(error: unknown): string {
  if (error instanceof ErrorApiHttp) {
    if (error.codigo === "limite_excedido") return error.mensaje;
    if (error.codigo === "telefono_invalido" || error.codigo === "validacion") {
      return "Revisá el número de teléfono e intentá de nuevo.";
    }
  }
  return "No pudimos enviar el código. Probá de nuevo en un momento.";
}

function textoErrorConfirmacion(error: unknown): string {
  if (error instanceof ErrorApiHttp) {
    if (error.codigo === "otp_invalido" || error.codigo === "otp_expirado") {
      return "El código es incorrecto o venció, pedí uno nuevo";
    }
    if (error.codigo === "limite_excedido") return error.mensaje;
    if (error.codigo === "cuenta_suspendida") {
      return "Esta cuenta no puede ingresar. Escribinos si creés que es un error.";
    }
  }
  return "No pudimos confirmar el código. Probá de nuevo.";
}

/** CO-02 · Ingreso con telefono. Dos pasos en una sola ruta, sin sub-rutas. */
export function IngresarPage() {
  const [paso, setPaso] = useState<Paso>("telefono");
  const [telefono, setTelefono] = useState("");
  const [canal, setCanal] = useState<CanalOtp>("sms");
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorConfirmacion, setErrorConfirmacion] = useState<string | null>(null);

  const navigate = useNavigate();
  const { confirmarSesion } = useSesion();
  const contador = useContadorReenvio();

  const formTelefono = useForm<SolicitarOtp>({
    // El resolver infiere el tipo de entrada de zod (canal opcional por el .default());
    // como siempre mandamos "canal" en defaultValues, el resultado ya cumple SolicitarOtp.
    resolver: zodResolver(solicitarOtpSchema) as Resolver<SolicitarOtp>,
    defaultValues: { telefono: "", canal: "sms" },
  });

  const formCodigo = useForm<DatosCodigo>({
    resolver: zodResolver(confirmarOtpSchema.pick({ codigo: true })),
    defaultValues: { codigo: "" },
  });

  const mutacionSolicitar = useMutation({
    mutationFn: solicitarOtp,
    onSuccess: (_datos, variables) => {
      setErrorEnvio(null);
      setTelefono(variables.telefono);
      setCanal(variables.canal);
      formCodigo.reset({ codigo: "" });
      setPaso("codigo");
      contador.reiniciar();
    },
    onError: (error) => {
      setErrorEnvio(textoErrorEnvio(error));
    },
  });

  const mutacionConfirmar = useMutation({
    mutationFn: confirmarOtp,
    onSuccess: ({ accessToken, usuario }) => {
      setErrorConfirmacion(null);
      confirmarSesion(usuario, accessToken);
      navigate(usuario.rolActivo ? "/" : "/rol", { replace: true });
    },
    onError: (error) => {
      setErrorConfirmacion(textoErrorConfirmacion(error));
    },
  });

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-teal-800">Ingresar</h1>
        <p className="text-sm text-slate-600">
          {paso === "telefono"
            ? "Ingresá tu teléfono y te mandamos un código para entrar."
            : "Ingresá el código que te mandamos."}
        </p>
      </header>

      {paso === "telefono" && (
        <form
          noValidate
          onSubmit={formTelefono.handleSubmit((datos) => mutacionSolicitar.mutate(datos))}
          className="flex flex-col gap-4"
        >
          <Field
            label="Tu teléfono"
            type="tel"
            autoComplete="tel"
            placeholder="+54 9 11 2233-4455"
            error={formTelefono.formState.errors.telefono?.message}
            {...formTelefono.register("telefono")}
          />
          <p className="text-xs text-slate-500">
            Incluí el código de país y de área, por ejemplo +54 9 11 2233-4455.
          </p>

          {errorEnvio && (
            <p role="alert" className="text-sm text-red-600">
              {errorEnvio}
            </p>
          )}

          <Button type="submit" cargando={mutacionSolicitar.isPending}>
            Enviar código
          </Button>
        </form>
      )}

      {paso === "codigo" && (
        <form
          noValidate
          onSubmit={formCodigo.handleSubmit((datos) =>
            mutacionConfirmar.mutate({ telefono, codigo: datos.codigo }),
          )}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-slate-600">
            Te mandamos un código {canal === "llamada" ? "por llamada" : "por SMS"} al{" "}
            <strong>{telefono}</strong>.
          </p>

          <Field
            label="Código de 6 dígitos"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            error={formCodigo.formState.errors.codigo?.message}
            {...formCodigo.register("codigo")}
          />

          {errorConfirmacion && (
            <p role="alert" className="text-sm text-red-600">
              {errorConfirmacion}
            </p>
          )}

          <Button type="submit" cargando={mutacionConfirmar.isPending}>
            Confirmar
          </Button>

          <div className="flex flex-col items-center gap-3 pt-2 text-sm">
            <button
              type="button"
              className="min-h-11 font-medium text-teal-700 underline disabled:text-slate-400 disabled:no-underline"
              disabled={!contador.puedeReenviar || mutacionSolicitar.isPending}
              onClick={() => mutacionSolicitar.mutate({ telefono, canal: "sms" })}
            >
              {contador.puedeReenviar
                ? "Reenviar código"
                : `Reenviar código en ${contador.segundosRestantes}s`}
            </button>

            <button
              type="button"
              className="min-h-11 text-slate-600 underline"
              disabled={mutacionSolicitar.isPending}
              onClick={() => mutacionSolicitar.mutate({ telefono, canal: "llamada" })}
            >
              Prefiero que me llamen
            </button>

            <button
              type="button"
              className="min-h-11 text-slate-500 underline"
              onClick={() => {
                setErrorConfirmacion(null);
                setPaso("telefono");
              }}
            >
              Cambiar número
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
