import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { desuscribirPush, obtenerVapidClavePublica, suscribirPush } from "../../notificaciones/api";
import { convertirClaveVapidAUint8Array } from "../../../lib/push";

export interface EstadoPush {
  soportado: boolean;
  suscripto: boolean;
}

const estadoPushQueryKey = ["push", "estado"] as const;

function navegadorSoportaPush(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function leerEstadoPush(): Promise<EstadoPush> {
  if (!navegadorSoportaPush()) return { soportado: false, suscripto: false };

  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  return { soportado: true, suscripto: Boolean(suscripcion) };
}

/**
 * CO-06 · toggle de avisos push. El navegador es la unica fuente de verdad
 * (sin localStorage): al montar se consulta `serviceWorker.ready` +
 * `getSubscription()`, no hay nada que persistir del lado del cliente.
 */
export function useNotificacionesPush() {
  const queryClient = useQueryClient();

  const estadoQuery = useQuery({ queryKey: estadoPushQueryKey, queryFn: leerEstadoPush });

  const activar = useMutation({
    mutationFn: async () => {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        throw new Error(
          permiso === "denied"
            ? "Bloqueaste las notificaciones en el navegador. Activalas desde la configuración del sitio si querés recibir avisos."
            : "No se concedió el permiso de notificaciones.",
        );
      }

      const { clavePublica } = await obtenerVapidClavePublica();
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertirClaveVapidAUint8Array(clavePublica),
      });

      const datos = suscripcion.toJSON();
      if (!datos.endpoint || !datos.keys?.p256dh || !datos.keys.auth) {
        throw new Error("El navegador no devolvió una suscripción válida.");
      }
      await suscribirPush({
        endpoint: datos.endpoint,
        keys: { p256dh: datos.keys.p256dh, auth: datos.keys.auth },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: estadoPushQueryKey });
    },
  });

  const desactivar = useMutation({
    mutationFn: async () => {
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      if (!suscripcion) return;
      const endpoint = suscripcion.endpoint;
      await suscripcion.unsubscribe();
      await desuscribirPush({ endpoint });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: estadoPushQueryKey });
    },
  });

  return { estadoQuery, activar, desactivar };
}
