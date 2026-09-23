import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FotoUploader } from "./FotoUploader";
import * as api from "../api";

function archivoDeImagen(nombre = "foto.jpg"): File {
  return new File(["contenido"], nombre, { type: "image/jpeg" });
}

describe("FotoUploader", () => {
  beforeEach(() => {
    // jsdom no implementa blob URLs sobre los File sinteticos que arma este
    // test; el preview en si no es lo que estas pruebas verifican.
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("al subir una foto ok, notifica onChange con [{id, url}]", async () => {
    vi.spyOn(api, "subirFotoBorrador").mockResolvedValue({
      id: "foto-1",
      url: "/uploads-dev/borradores/borrador-1/foto-1.jpg",
    });
    const onChange = vi.fn();
    const usuario = userEvent.setup();

    render(<FotoUploader borradorId="borrador-1" fotos={[]} onChange={onChange} />);

    await usuario.upload(screen.getByLabelText(/agregar/i), archivoDeImagen());

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        { id: "foto-1", url: "/uploads-dev/borradores/borrador-1/foto-1.jpg" },
      ]),
    );
    // El preview local (blob:) se reemplaza por la url ya subida: sin este
    // revoke, cada foto subida deja un blob vivo en memoria.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  // Motivo del `itemsRef` en FotoUploader: sin el, la segunda subida en
  // resolver pisaria el resultado de la primera en vez de acumularse.
  it("con dos subidas concurrentes, el onChange final tiene las dos fotos", async () => {
    vi.spyOn(api, "subirFotoBorrador").mockImplementation(async ({ archivo }) => {
      if (archivo.name === "una.jpg") {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { id: "foto-una", url: "/uploads-dev/borradores/borrador-1/foto-una.jpg" };
      }
      return { id: "foto-dos", url: "/uploads-dev/borradores/borrador-1/foto-dos.jpg" };
    });
    const onChange = vi.fn();
    const usuario = userEvent.setup();

    render(<FotoUploader borradorId="borrador-1" fotos={[]} onChange={onChange} />);

    await usuario.upload(screen.getByLabelText(/agregar/i), [
      archivoDeImagen("una.jpg"),
      archivoDeImagen("dos.jpg"),
    ]);

    await waitFor(() => {
      const ultimaLlamada = onChange.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada).toHaveLength(2);
      expect(ultimaLlamada).toEqual(
        expect.arrayContaining([
          { id: "foto-una", url: "/uploads-dev/borradores/borrador-1/foto-una.jpg" },
          { id: "foto-dos", url: "/uploads-dev/borradores/borrador-1/foto-dos.jpg" },
        ]),
      );
    });
  });

  it("rechaza un archivo que no es una imagen aceptada, avisa y no llama a onChange", async () => {
    const subirFotoBorrador = vi
      .spyOn(api, "subirFotoBorrador")
      .mockResolvedValue({ id: "no-deberia-usarse", url: "/no-deberia-usarse" });
    const onChange = vi.fn();

    render(<FotoUploader borradorId="borrador-1" fotos={[]} onChange={onChange} />);

    const archivoInvalido = new File(["no es una imagen"], "documento.txt", {
      type: "text/plain",
    });
    // `userEvent.upload` filtra por el `accept` del input antes de disparar el
    // evento; para probar el rechazo del lado del componente hace falta
    // saltear ese filtro y disparar el `change` directo, como si el usuario
    // hubiera forzado la seleccion (p. ej. arrastrando el archivo).
    const input = screen.getByLabelText(/agregar/i);
    Object.defineProperty(input, "files", { value: [archivoInvalido] });
    fireEvent.change(input);

    expect(await screen.findByRole("alert")).toHaveTextContent(/formato/i);
    expect(subirFotoBorrador).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
