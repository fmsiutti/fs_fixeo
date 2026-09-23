import { useRef, useState } from "react";
import { FOTOS_MAX } from "@fixeo/shared";
import type { FotoBorrador } from "../borrador";
import { eliminarFotoBorrador, subirFotoBorrador } from "../api";
import { comprimirImagen } from "../lib/comprimir-imagen";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];

interface ItemFoto {
  claveLocal: string;
  archivo?: File;
  previewUrl: string;
  url?: string;
  id?: string;
  estado: "subiendo" | "lista" | "error";
  mensajeError?: string;
}

interface FotoUploaderProps {
  borradorId: string;
  fotos: FotoBorrador[];
  onChange: (fotos: FotoBorrador[]) => void;
}

function textoErrorSubida(error: unknown): string {
  if (error instanceof ErrorApiHttp) {
    if (error.codigo === "limite_excedido") return error.mensaje;
    if (error.codigo === "validacion") return "Ese archivo no es una foto válida.";
  }
  return "No pudimos subir la foto.";
}

function fotosPersistidas(items: ItemFoto[]): FotoBorrador[] {
  return items
    .filter((item): item is ItemFoto & { id: string; url: string } =>
      Boolean(item.estado === "lista" && item.id && item.url),
    )
    .map((item) => ({ id: item.id, url: item.url }));
}

function itemInicial(foto: FotoBorrador): ItemFoto {
  return {
    claveLocal: foto.id,
    id: foto.id,
    url: foto.url,
    previewUrl: urlCompletaApi(foto.url),
    estado: "lista",
  };
}

/** CL-03: hasta 6 fotos, cada una con progreso, error y reintento independientes. */
export function FotoUploader({ borradorId, fotos, onChange }: FotoUploaderProps) {
  const [items, setItems] = useState<ItemFoto[]>(() => fotos.map(itemInicial));
  // Espejo sincronico de `items`, siempre al dia dentro del mismo tick (a
  // diferencia del estado de React, que se actualiza recien en el proximo
  // render). Los handlers lo usan para calcular el siguiente estado y
  // notificar a `onChange` desde el propio handler, nunca desde adentro del
  // updater de `setItems` (que React puede re-ejecutar en StrictMode y no es
  // el lugar para un callback con efectos hacia afuera del componente).
  const itemsRef = useRef(items);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mensajeGlobal, setMensajeGlobal] = useState<string | null>(null);

  /** Actualiza items + su espejo sin notificar: para cambios que no tocan la lista persistida (subiendo/error). */
  function aplicarSinNotificar(siguiente: ItemFoto[]) {
    itemsRef.current = siguiente;
    setItems(siguiente);
  }

  function aplicar(siguiente: ItemFoto[]) {
    aplicarSinNotificar(siguiente);
    onChange(fotosPersistidas(siguiente));
  }

  async function subirUnaFoto(claveLocal: string, archivoOriginal: File) {
    try {
      const archivo = await comprimirImagen(archivoOriginal);
      const resultado = await subirFotoBorrador({ borradorId, archivo });
      const anterior = itemsRef.current.find((item) => item.claveLocal === claveLocal);
      if (anterior?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(anterior.previewUrl);
      }
      aplicar(
        itemsRef.current.map((item) =>
          item.claveLocal === claveLocal
            ? {
                ...item,
                estado: "lista" as const,
                id: resultado.id,
                url: resultado.url,
                previewUrl: urlCompletaApi(resultado.url),
              }
            : item,
        ),
      );
    } catch (error) {
      aplicarSinNotificar(
        itemsRef.current.map((item) =>
          item.claveLocal === claveLocal
            ? { ...item, estado: "error" as const, mensajeError: textoErrorSubida(error) }
            : item,
        ),
      );
    }
  }

  function agregarArchivos(lista: FileList | null) {
    if (!lista) return;
    const candidatos = Array.from(lista);
    const validos = candidatos.filter((archivo) => TIPOS_ACEPTADOS.includes(archivo.type));
    const rechazadosPorTipo = candidatos.length - validos.length;

    const espacio = FOTOS_MAX - itemsRef.current.length;
    const seleccionados = validos.slice(0, espacio);
    const rechazadosPorEspacio = validos.length - seleccionados.length;

    if (rechazadosPorTipo > 0 && rechazadosPorEspacio > 0) {
      setMensajeGlobal(
        "Algunas fotos no se agregaron: el formato no es válido o ya llegaste al máximo.",
      );
    } else if (rechazadosPorTipo > 0) {
      setMensajeGlobal("Solo se aceptan fotos en formato JPG, PNG o WEBP.");
    } else if (rechazadosPorEspacio > 0) {
      setMensajeGlobal(`Ya llegaste al máximo de ${FOTOS_MAX} fotos.`);
    } else {
      setMensajeGlobal(null);
    }

    const seleccionadosConClave = seleccionados.map((archivo) => ({
      claveLocal: crypto.randomUUID(),
      archivo,
    }));
    const nuevosItems: ItemFoto[] = seleccionadosConClave.map(({ claveLocal, archivo }) => ({
      claveLocal,
      archivo,
      previewUrl: URL.createObjectURL(archivo),
      estado: "subiendo",
    }));
    aplicarSinNotificar([...itemsRef.current, ...nuevosItems]);

    for (const { claveLocal, archivo } of seleccionadosConClave) {
      void subirUnaFoto(claveLocal, archivo);
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  function reintentar(item: ItemFoto) {
    if (!item.archivo) return;
    setMensajeGlobal(null);
    aplicarSinNotificar(
      itemsRef.current.map((i) =>
        i.claveLocal === item.claveLocal
          ? { ...i, estado: "subiendo" as const, mensajeError: undefined }
          : i,
      ),
    );
    void subirUnaFoto(item.claveLocal, item.archivo);
  }

  function quitar(item: ItemFoto) {
    setMensajeGlobal(null);
    aplicar(itemsRef.current.filter((i) => i.claveLocal !== item.claveLocal));
    if (item.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
    }
    if (item.estado === "lista" && item.id) {
      // Idempotente en la api: si falla, la foto simplemente queda huerfana
      // en el borrador del servidor, sin efecto en lo que se termina publicando.
      eliminarFotoBorrador({ id: item.id, borradorId }).catch(() => undefined);
    }
  }

  const llegoAlMaximo = items.length >= FOTOS_MAX;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Fotos (opcional)</p>
        <p className="text-xs text-slate-500">
          {items.length}/{FOTOS_MAX}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <div
            key={item.claveLocal}
            className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
          >
            <img
              src={item.previewUrl}
              alt="Foto del pedido"
              className="h-full w-full object-cover"
            />

            {item.estado === "subiendo" && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/40"
                role="status"
                aria-live="polite"
              >
                <span className="sr-only">Subiendo foto</span>
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-white/40 border-t-white" />
              </div>
            )}

            {item.estado === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-900/70 p-1 text-center">
                <p className="text-xs text-white">{item.mensajeError}</p>
                <button
                  type="button"
                  onClick={() => reintentar(item)}
                  className="min-h-11 rounded-full bg-white px-3 text-xs font-semibold text-red-800"
                >
                  Reintentar
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => quitar(item)}
              aria-label="Quitar foto"
              className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white"
            >
              ×
            </button>
          </div>
        ))}

        {!llegoAlMaximo && (
          <label className="flex aspect-square min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-teal-600 hover:text-teal-700">
            <span aria-hidden="true" className="text-2xl">
              +
            </span>
            <span>Agregar</span>
            <input
              ref={inputRef}
              type="file"
              accept={TIPOS_ACEPTADOS.join(",")}
              multiple
              className="sr-only"
              onChange={(evento) => agregarArchivos(evento.target.files)}
            />
          </label>
        )}
      </div>

      {mensajeGlobal && (
        <p role="alert" className="text-xs text-red-700">
          {mensajeGlobal}
        </p>
      )}

      {llegoAlMaximo && (
        <p className="text-xs text-slate-500">Llegaste al máximo de {FOTOS_MAX} fotos.</p>
      )}
    </div>
  );
}
