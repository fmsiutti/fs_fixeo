import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  confirmarOtpSchema,
  solicitarOtpSchema,
  type CanalOtp,
  type ConfirmarOtp,
  type SolicitarOtp,
} from "@fixeo/shared";
import { confirmarOtp, solicitarOtp } from "../../auth/api";
import { useContadorReenvio } from "../../auth/hooks/useContadorReenvio";
import { useSesion } from "../../auth/useSesion";
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

/**
 * CL-06: paso de verificacion embebido en el asistente (sin cuenta previa la
 * ficha pide "verificacion de telefono si no hay cuenta"). Misma UX que
 * CO-02 pero sin navegar afuera, para no perder el borrador en memoria.
 */
export function VerificacionTelefonoInline() {
  const [paso, setPaso] = useState<Paso>("telefono");
  const [telefono, setTelefono] = useState("");
  const [canal, setCanal] = useState<CanalOtp>("sms");
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorConfirmacion, setErrorConfirmacion] = useState<string | null>(null);

  const { confirmarSesion } = useSesion();
  const contador = useContadorReenvio();

  const formTelefono = useForm<SolicitarOtp>({
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
    onError: (error) => setErrorEnvio(textoErrorEnvio(error)),
  });

  const mutacionConfirmar = useMutation({
    mutationFn: confirmarOtp,
    onSuccess: ({ accessToken, usuario }) => {
      setErrorConfirmacion(null);
      confirmarSesion(usuario, accessToken);
    },
    onError: (error) => setErrorConfirmacion(textoErrorConfirmacion(error)),
  });

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4">
      <div>
        <h2 className="font-semibold text-slate-900">Confirmá tu teléfono</h2>
        <p className="text-sm text-slate-600">
          {paso === "telefono"
            ? "Lo necesitamos para publicar tu pedido y avisarte cuando lleguen postulaciones."
            : "Ingresá el código que te mandamos."}
        </p>
      </div>

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

          <div className="flex flex-col items-center gap-2 pt-1 text-sm">
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
    </div>
  );
}
