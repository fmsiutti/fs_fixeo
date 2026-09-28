/// <reference lib="webworker" />

// Service worker fuente (estrategia `injectManifest` de vite-plugin-pwa,
// ver apps/web/vite.config.ts): precache + push + una pagina offline simple.
// apps/web/CLAUDE.md: "Service worker minimo: assets, push y una pagina
// offline simple. Sin sincronizacion offline compleja."
//
// Este archivo se type-checkea con su propio tsconfig (tsconfig.sw.json,
// lib "WebWorker") para no mezclar el lib "DOM" del resto de la app con
// "WebWorker" en el mismo programa de TypeScript (conflictos de tipos
// globales bien conocidos si se mezclan).

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// `registerType: "autoUpdate"` (vite.config.ts) espera que el SW propio
// escuche este mensaje para saltar la espera cuando hay una version nueva;
// sin esto, "autoUpdate" no actualiza el SW en segundo plano.
self.addEventListener("message", (event) => {
  if (event.data && (event.data as { type?: string }).type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Pagina offline: solo interviene en navegaciones (F5, abrir un link) sin
// red y sin nada en cache. El resto de la app es una SPA online-first, sin
// estrategia de cache agresiva para las rutas ni sincronizacion offline.
const responderOffline = createHandlerBoundToURL("/offline.html");
registerRoute(
  new NavigationRoute(async (params) => {
    try {
      return await fetch(params.request);
    } catch {
      return responderOffline(params);
    }
  }),
);

interface PayloadNotificacionPush {
  titulo: string;
  cuerpo: string;
  ruta: string;
}

const NOTIFICACION_GENERICA: PayloadNotificacionPush = {
  titulo: "Fixeo",
  cuerpo: "Tenés una notificación nueva",
  ruta: "/notificaciones",
};

function leerPayload(datos: PushMessageData | null): PayloadNotificacionPush {
  if (!datos) return NOTIFICACION_GENERICA;
  try {
    const payload = datos.json() as Partial<PayloadNotificacionPush>;
    return {
      titulo: payload.titulo ?? NOTIFICACION_GENERICA.titulo,
      cuerpo: payload.cuerpo ?? NOTIFICACION_GENERICA.cuerpo,
      ruta: payload.ruta ?? NOTIFICACION_GENERICA.ruta,
    };
  } catch {
    return NOTIFICACION_GENERICA;
  }
}

self.addEventListener("push", (event) => {
  const payload = leerPayload(event.data ?? null);
  event.waitUntil(
    self.registration.showNotification(payload.titulo, {
      body: payload.cuerpo,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { ruta: payload.ruta },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ruta = (event.notification.data as { ruta?: string } | undefined)?.ruta ?? "/";

  event.waitUntil(
    (async () => {
      // `matchAll` puede devolver clientes de otro origen (raro, pero
      // posible con `includeUncontrolled`) o un WindowClient cuyo
      // `.navigate()` no es confiable en todos los navegadores/estados: si
      // tira, no dejamos la excepcion sin manejar, caemos a `openWindow`.
      const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const clienteAbierto = clientes.find((cliente) =>
        cliente.url.startsWith(self.location.origin),
      );
      if (clienteAbierto) {
        try {
          await clienteAbierto.navigate(ruta);
          await clienteAbierto.focus();
          return;
        } catch {
          // cae al openWindow de abajo
        }
      }
      await self.clients.openWindow(ruta);
    })(),
  );
});
