import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hayBorradorEnProgreso, useBorradorPedido } from "./borrador";

const CLAVE_STORAGE = "fixeo:borrador-pedido";

describe("useBorradorPedido", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("crea un borrador vacio con un borradorId nuevo cuando no hay nada guardado", () => {
    const { result } = renderHook(() => useBorradorPedido());

    expect(result.current.borrador.borradorId).toEqual(expect.any(String));
    expect(result.current.borrador.borradorId.length).toBeGreaterThan(0);
    expect(result.current.borrador.categoriaId).toBeNull();
    expect(result.current.borrador.fotos).toEqual([]);
  });

  it("persiste los cambios y los recupera en un remount (dos instancias del hook)", () => {
    const primeraInstancia = renderHook(() => useBorradorPedido());

    act(() => {
      primeraInstancia.result.current.actualizar({
        categoriaId: "categoria-1",
        descripcion: "Se rompió la canilla de la cocina",
      });
    });
    const borradorIdOriginal = primeraInstancia.result.current.borrador.borradorId;

    // Simula un remount real (cerrar y volver a abrir la app): una instancia
    // nueva del hook, sin nada en memoria, solo lo que quedo en localStorage.
    const segundaInstancia = renderHook(() => useBorradorPedido());

    expect(segundaInstancia.result.current.borrador.borradorId).toBe(borradorIdOriginal);
    expect(segundaInstancia.result.current.borrador.categoriaId).toBe("categoria-1");
    expect(segundaInstancia.result.current.borrador.descripcion).toBe(
      "Se rompió la canilla de la cocina",
    );
  });

  it("hayBorradorEnProgreso es true recien cuando el borrador guardado tiene categoria elegida", () => {
    expect(hayBorradorEnProgreso()).toBe(false);

    const { result } = renderHook(() => useBorradorPedido());
    act(() => {
      result.current.actualizar({ categoriaId: "categoria-1" });
    });

    expect(hayBorradorEnProgreso()).toBe(true);
  });

  it("limpiar borra el storage y vuelve a un borrador vacio con un borradorId distinto", () => {
    const { result } = renderHook(() => useBorradorPedido());
    act(() => {
      result.current.actualizar({ categoriaId: "categoria-1" });
    });
    const borradorIdConDatos = result.current.borrador.borradorId;

    act(() => {
      result.current.limpiar();
    });

    expect(result.current.borrador.categoriaId).toBeNull();
    expect(result.current.borrador.borradorId).not.toBe(borradorIdConDatos);
    expect(window.localStorage.getItem(CLAVE_STORAGE)).toBeNull();
  });

  it("no explota si localStorage.setItem tira (modo privado / storage lleno): el asistente sigue andando en memoria", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = renderHook(() => useBorradorPedido());

    expect(() => {
      act(() => {
        result.current.actualizar({ categoriaId: "categoria-1" });
      });
    }).not.toThrow();

    // El estado en memoria del hook sigue reflejando el cambio, aunque no
    // haya podido persistirse.
    expect(result.current.borrador.categoriaId).toBe("categoria-1");
  });
});
