import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificacionesPush } from "./useNotificacionesPush";
import * as api from "../../notificaciones/api";

/**
 * useNotificacionesPush tiene lógica de decisión propia (no es solo un
 * wrapper delgado sobre useQuery/useMutation, apps/web/CLAUDE.md "Tests"):
 * distingue permiso denegado de "no concedido", valida la forma de la
 * suscripción que devuelve el navegador antes de mandarla a la api, y
 * `desactivar` no llama a la api si no había suscripción activa.
 */

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function definirServiceWorker(registro: unknown) {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve(registro) },
    configurable: true,
  });
}

function definirSoportePush() {
  Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
}

describe("useNotificacionesPush", () => {
  beforeEach(() => {
    definirSoportePush();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- limpieza de los globals que cada test define
    delete navigator.serviceWorker;
    // @ts-expect-error -- idem
    delete window.PushManager;
    // @ts-expect-error -- idem
    delete window.Notification;
  });

  it("activar rechaza con un mensaje especifico cuando el permiso queda denegado", async () => {
    Object.defineProperty(window, "Notification", {
      value: { requestPermission: vi.fn().mockResolvedValue("denied") },
      configurable: true,
    });
    definirServiceWorker({ pushManager: { subscribe: vi.fn() } });
    const suscribir = vi.spyOn(api, "suscribirPush");

    const { result } = renderHook(() => useNotificacionesPush(), { wrapper });

    await act(async () => {
      await expect(result.current.activar.mutateAsync()).rejects.toThrow(/bloqueaste/i);
    });
    expect(suscribir).not.toHaveBeenCalled();
  });

  it("activar rechaza con un mensaje generico cuando el permiso no se concede (ni denegado ni granted)", async () => {
    Object.defineProperty(window, "Notification", {
      value: { requestPermission: vi.fn().mockResolvedValue("default") },
      configurable: true,
    });
    definirServiceWorker({ pushManager: { subscribe: vi.fn() } });

    const { result } = renderHook(() => useNotificacionesPush(), { wrapper });

    await act(async () => {
      await expect(result.current.activar.mutateAsync()).rejects.toThrow(
        /no se concedió el permiso/i,
      );
    });
  });

  it("activar rechaza si el navegador no devuelve endpoint/keys validos en la suscripcion", async () => {
    Object.defineProperty(window, "Notification", {
      value: { requestPermission: vi.fn().mockResolvedValue("granted") },
      configurable: true,
    });
    vi.spyOn(api, "obtenerVapidClavePublica").mockResolvedValue({ clavePublica: "QUJD" });
    definirServiceWorker({
      pushManager: {
        subscribe: vi.fn().mockResolvedValue({ toJSON: () => ({ endpoint: undefined }) }),
      },
    });
    const suscribir = vi.spyOn(api, "suscribirPush");

    const { result } = renderHook(() => useNotificacionesPush(), { wrapper });

    await act(async () => {
      await expect(result.current.activar.mutateAsync()).rejects.toThrow(
        /no devolvió una suscripción válida/i,
      );
    });
    expect(suscribir).not.toHaveBeenCalled();
  });

  it("activar suscribe con endpoint y keys cuando el permiso y la suscripcion son validos", async () => {
    Object.defineProperty(window, "Notification", {
      value: { requestPermission: vi.fn().mockResolvedValue("granted") },
      configurable: true,
    });
    vi.spyOn(api, "obtenerVapidClavePublica").mockResolvedValue({ clavePublica: "QUJD" });
    definirServiceWorker({
      pushManager: {
        subscribe: vi.fn().mockResolvedValue({
          toJSON: () => ({
            endpoint: "https://push.example/1",
            keys: { p256dh: "p256dh-1", auth: "auth-1" },
          }),
        }),
      },
    });
    const suscribir = vi.spyOn(api, "suscribirPush").mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotificacionesPush(), { wrapper });

    await act(async () => {
      await result.current.activar.mutateAsync();
    });

    expect(suscribir).toHaveBeenCalledWith({
      endpoint: "https://push.example/1",
      keys: { p256dh: "p256dh-1", auth: "auth-1" },
    });
  });

  it("desactivar no llama a la api si el navegador no tiene una suscripcion activa", async () => {
    Object.defineProperty(window, "Notification", { value: {}, configurable: true });
    definirServiceWorker({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } });
    const desuscribir = vi.spyOn(api, "desuscribirPush");

    const { result } = renderHook(() => useNotificacionesPush(), { wrapper });

    await act(async () => {
      await result.current.desactivar.mutateAsync();
    });

    expect(desuscribir).not.toHaveBeenCalled();
  });

  it("desactivar desuscribe en el navegador y avisa a la api cuando hay una suscripcion activa", async () => {
    Object.defineProperty(window, "Notification", { value: {}, configurable: true });
    const unsubscribe = vi.fn().mockResolvedValue(true);
    definirServiceWorker({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({
          endpoint: "https://push.example/1",
          unsubscribe,
        }),
      },
    });
    const desuscribir = vi.spyOn(api, "desuscribirPush").mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotificacionesPush(), { wrapper });

    await act(async () => {
      await result.current.desactivar.mutateAsync();
    });

    expect(unsubscribe).toHaveBeenCalled();
    expect(desuscribir).toHaveBeenCalledWith({ endpoint: "https://push.example/1" });
  });

  it("el estado inicial reporta soportado:false si el navegador no tiene Push API", async () => {
    // @ts-expect-error -- a proposito: sin PushManager, sin soporte.
    delete window.PushManager;

    const { result } = renderHook(() => useNotificacionesPush(), { wrapper });

    await waitFor(() => expect(result.current.estadoQuery.isSuccess).toBe(true));
    expect(result.current.estadoQuery.data).toEqual({ soportado: false, suscripto: false });
  });
});
