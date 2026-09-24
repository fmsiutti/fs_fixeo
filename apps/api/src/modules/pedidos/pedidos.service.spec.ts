import { describe, expect, it, jest } from "@jest/globals";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";
import type { CrearPedido, EditarPedido } from "@fixeo/shared";
import type { EventosService } from "../eventos/eventos.service.js";
import type { ParametrosService } from "../parametros/parametros.service.js";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { ProveedorAlmacenamiento } from "../../infra/almacenamiento/proveedor-almacenamiento.js";
import type { AvisoMatchingJobData } from "../../infra/queue/colas.constants.js";
import { Prisma } from "../../generated/prisma/client.js";
import { PedidosService } from "./pedidos.service.js";

type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

function crearDatosPedido(overrides: Partial<CrearPedido> = {}): CrearPedido {
  return {
    categoriaId: "categoria-1",
    subcategoria: undefined,
    descripcion: "Se rompio la canilla de la cocina y pierde agua todo el dia",
    respuestasGuia: undefined,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    direccion: {
      calle: "Av. Siempreviva",
      numero: "742",
      tipoPropiedad: "casa",
      barrioId: "barrio-1",
      lat: -34.6,
      lng: -58.4,
    },
    borradorId: "11111111-1111-1111-1111-111111111111",
    fotos: [],
    ...overrides,
  } as CrearPedido;
}

function crearCategoria(
  overrides: Partial<{
    id: string;
    slug: string;
    activa: boolean;
    subcategorias: string[];
    preguntasGuia: string[];
  }> = {},
) {
  return {
    id: "categoria-1",
    nombre: "Plomería",
    slug: "plomeria",
    subcategorias: [],
    preguntasGuia: [],
    requiereMatricula: "no_exigida",
    activa: true,
    ...overrides,
  };
}

function crearBarrio(overrides: Partial<{ id: string }> = {}) {
  return { id: "barrio-1", nombre: "Palermo", activo: true, ...overrides };
}

// Solo los campos que mapearPedidoAVista realmente lee (pedidos.vistas.spec.ts
// ya prueba el mapeo completo con un fixture mas fiel a Prisma).
function crearPedidoCreado(overrides: Record<string, unknown> = {}) {
  return {
    id: "pedido-creado-1",
    categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
    subcategoria: null,
    descripcion: "Se rompio la canilla de la cocina y pierde agua todo el dia",
    respuestasGuia: null,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    direccion: {
      calle: "Av. Siempreviva",
      numero: "742",
      piso: null,
      depto: null,
      tipoPropiedad: "casa",
      lat: -34.6,
      lng: -58.4,
    },
    barrio: { id: "barrio-1", nombre: "Palermo" },
    estado: "publicado",
    publicadoEn: new Date("2026-01-01T00:00:00.000Z"),
    expiraEn: new Date("2026-01-08T00:00:00.000Z"),
    fotos: [],
    vistas: 0,
    cantidadPostulaciones: 0,
    cantidadContactos: 0,
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function crearParametrosMock(overrides: Partial<Record<string, number>> = {}): ParametrosService {
  const valores: Record<string, number> = {
    pedidos_activos_max_por_cliente: 3,
    pedido_vigencia_dias: 7,
    descripcion_min: 20,
    descripcion_max: 1000,
    fotos_max: 6,
    seleccionables_max_por_pedido: 3,
    postulaciones_max_por_pedido: 8,
    ...overrides,
  };
  return {
    getNumero: jest.fn((clave: string) => Promise.resolve(valores[clave])),
    getTexto: jest.fn(),
  } as unknown as ParametrosService;
}

/** Por default, cualquier foto "existe" en el storage (fotoIds al azar sirven en la mayoria de los tests). */
function crearAlmacenamientoMock(
  overrides: Partial<{ existe: (key: string) => Promise<boolean> }> = {},
): ProveedorAlmacenamiento {
  return {
    guardar: jest.fn(),
    eliminar: jest.fn(),
    existe: jest.fn(overrides.existe ?? (() => Promise.resolve(true))),
    urlPara: jest.fn((key: string) => `/uploads-dev/${key}`),
    contar: jest.fn(),
  } as unknown as ProveedorAlmacenamiento;
}

type CategoriaMock = ReturnType<typeof crearCategoria>;
type BarrioMock = ReturnType<typeof crearBarrio>;
type PedidoCreadoMock = ReturnType<typeof crearPedidoCreado>;

function crearService(
  options: {
    categoria?: CategoriaMock;
    barrio?: BarrioMock;
    activos?: { descripcion: string }[];
    parametros?: Partial<Record<string, number>>;
    pedidoCreado?: PedidoCreadoMock;
    almacenamiento?: ProveedorAlmacenamiento;
    fotosYaTomadas?: { id: string }[];
    pedidoExistente?: Record<string, unknown> | null;
    pedidoEditado?: PedidoCreadoMock;
    updateManyCount?: number;
  } = {},
) {
  const tx = {
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    pedido: {
      findMany: jest.fn<(args: unknown) => Promise<{ descripcion: string }[]>>(),
      create: jest.fn<(args: unknown) => Promise<PedidoCreadoMock>>(),
    },
    direccion: {
      create: jest.fn<(args: unknown) => Promise<{ id: string }>>(),
    },
  };
  tx.$queryRaw.mockResolvedValue(undefined);
  tx.pedido.findMany.mockResolvedValue(options.activos ?? []);
  tx.pedido.create.mockResolvedValue(options.pedidoCreado ?? crearPedidoCreado());
  tx.direccion.create.mockResolvedValue({ id: "direccion-creada-1" });

  const prisma = {
    categoria: { findUnique: jest.fn<(args: unknown) => Promise<CategoriaMock | null>>() },
    barrio: { findUnique: jest.fn<(args: unknown) => Promise<BarrioMock | null>>() },
    fotoPedido: { findMany: jest.fn<(args: unknown) => Promise<{ id: string }[]>>() },
    pedido: {
      findUnique: jest.fn<(args: unknown) => Promise<Record<string, unknown> | null>>(),
      updateMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
      findUniqueOrThrow: jest.fn<(args: unknown) => Promise<PedidoCreadoMock>>(),
    },
    $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
  };
  prisma.categoria.findUnique.mockResolvedValue(options.categoria ?? crearCategoria());
  prisma.barrio.findUnique.mockResolvedValue(options.barrio ?? crearBarrio());
  prisma.fotoPedido.findMany.mockResolvedValue(options.fotosYaTomadas ?? []);
  prisma.pedido.findUnique.mockResolvedValue(
    options.pedidoExistente === undefined
      ? {
          id: "pedido-1",
          clienteId: "cliente-1",
          estado: "publicado",
          cantidadPostulaciones: 0,
          categoria: options.categoria ?? crearCategoria(),
        }
      : options.pedidoExistente,
  );
  prisma.pedido.updateMany.mockResolvedValue({ count: options.updateManyCount ?? 1 });
  prisma.pedido.findUniqueOrThrow.mockResolvedValue(options.pedidoEditado ?? crearPedidoCreado());
  prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

  const parametros = crearParametrosMock(options.parametros);
  const almacenamiento = options.almacenamiento ?? crearAlmacenamientoMock();
  const eventos = {
    registrar: jest.fn<(datos: unknown) => Promise<void>>(),
  } as unknown as EventosService;
  const colaAvisoMatching = {
    add: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined),
  } as unknown as Queue<AvisoMatchingJobData>;
  const service = new PedidosService(
    prisma as unknown as PrismaService,
    parametros,
    almacenamiento,
    eventos,
    colaAvisoMatching,
  );
  return { service, prisma, tx, parametros, almacenamiento, eventos, colaAvisoMatching };
}

/** Ejecuta una promesa que se espera rechazada y devuelve el error para inspeccionarlo. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa rechazara, pero se resolvio.");
}

describe("PedidosService.crear", () => {
  it("publica directo (fija publicadoEn y expiraEn) cuando la categoria no es 'otro' y la descripcion esta limpia", async () => {
    const { service, tx, eventos, colaAvisoMatching } = crearService();

    const vista = await service.crear("cliente-1", crearDatosPedido());

    expect(tx.pedido.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: "publicado",
          publicadoEn: expect.any(Date),
          expiraEn: expect.any(Date),
        }),
      }),
    );
    expect(vista.estado).toBe("publicado");
    expect(vista.publicadoEn).not.toBeNull();
    expect(vista.expiraEn).not.toBeNull();
    // docs/dominio.md §3/§10: el evento se registra en el mismo cambio que la accion.
    expect(eventos.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "pedido_publicado", usuarioId: "cliente-1" }),
    );
    // docs/dominio.md §6: al publicar se encola el calculo de coincidentes.
    expect(colaAvisoMatching.add).toHaveBeenCalledWith(
      "aviso-matching",
      expect.objectContaining({ pedidoId: crearPedidoCreado().id }),
    );
  });

  it("no encola el aviso de matching cuando el pedido queda en_revision", async () => {
    const { service, colaAvisoMatching } = crearService({
      pedidoCreado: crearPedidoCreado({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
    });

    await service.crear(
      "cliente-1",
      crearDatosPedido({ descripcion: "Comuniquense al 11 4444 5555 para coordinar, gracias" }),
    );

    expect(colaAvisoMatching.add).not.toHaveBeenCalled();
  });

  // Mismo criterio que el evento de analitica: el pedido ya se creo, un fallo
  // al encolar el aviso no puede convertirse en un 500.
  it("no rompe la publicacion si falla el encolado del aviso de matching", async () => {
    const { service, colaAvisoMatching } = crearService();
    (
      colaAvisoMatching.add as jest.Mock<(...args: unknown[]) => Promise<unknown>>
    ).mockRejectedValue(new Error("redis caido"));

    const vista = await service.crear("cliente-1", crearDatosPedido());

    expect(vista.estado).toBe("publicado");
  });

  // Bug real encontrado en revisión: un pedido ya creado con exito no puede
  // convertirse en un 500 solo porque fallo el insert de analitica.
  it("no rompe la publicacion si falla el registro del evento pedido_publicado", async () => {
    const { service, eventos } = crearService();
    const registrarMock = eventos.registrar as unknown as jest.Mock<
      (datos: unknown) => Promise<void>
    >;
    registrarMock.mockRejectedValue(new Error("insert fallido"));

    const vista = await service.crear("cliente-1", crearDatosPedido());

    expect(vista.estado).toBe("publicado");
  });

  it("no registra pedido_publicado cuando el pedido queda en_revision (todavia no es una publicacion real)", async () => {
    const { service, eventos } = crearService({
      pedidoCreado: crearPedidoCreado({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
    });

    await service.crear(
      "cliente-1",
      crearDatosPedido({ descripcion: "Comuniquense al 11 4444 5555 para coordinar, gracias" }),
    );

    expect(eventos.registrar).not.toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "pedido_publicado" }),
    );
  });

  it("manda el pedido a en_revision, sin publicadoEn ni expiraEn, cuando la categoria es 'otro' (D1)", async () => {
    const { service, tx } = crearService({
      categoria: crearCategoria({ slug: "otro" }),
      pedidoCreado: crearPedidoCreado({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
    });

    const vista = await service.crear("cliente-1", crearDatosPedido());

    expect(tx.pedido.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
      }),
    );
    expect(vista.estado).toBe("en_revision");
    expect(vista.publicadoEn).toBeNull();
    expect(vista.expiraEn).toBeNull();
  });

  it("manda el pedido a en_revision cuando la descripcion tiene un telefono", async () => {
    const { service, tx } = crearService({
      pedidoCreado: crearPedidoCreado({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
    });

    await service.crear(
      "cliente-1",
      crearDatosPedido({
        descripcion: "Comuniquense al 11 4444 5555 para coordinar la visita, gracias",
      }),
    );

    expect(tx.pedido.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "en_revision" }) }),
    );
  });

  it("manda el pedido a en_revision cuando la descripcion tiene un email", async () => {
    const { service, tx } = crearService({
      pedidoCreado: crearPedidoCreado({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
    });

    await service.crear(
      "cliente-1",
      crearDatosPedido({
        descripcion: "Para coordinar escribime a contacto@ejemplo.com que te paso los datos",
      }),
    );

    expect(tx.pedido.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "en_revision" }) }),
    );
  });

  it("manda el pedido a en_revision cuando la subcategoria tiene un telefono", async () => {
    const { service, tx } = crearService({
      categoria: crearCategoria({ subcategorias: ["Llamar al 11 4444 5555"] }),
      pedidoCreado: crearPedidoCreado({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
    });

    await service.crear("cliente-1", crearDatosPedido({ subcategoria: "Llamar al 11 4444 5555" }));

    expect(tx.pedido.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "en_revision" }) }),
    );
  });

  it("manda el pedido a en_revision cuando una respuesta guia tiene un email", async () => {
    const { service, tx } = crearService({
      categoria: crearCategoria({ preguntasGuia: ["¿Que tipo de artefacto?"] }),
      pedidoCreado: crearPedidoCreado({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
    });

    await service.crear(
      "cliente-1",
      crearDatosPedido({
        respuestasGuia: { "¿Que tipo de artefacto?": "escribime a alguien@ejemplo.com" },
      }),
    );

    expect(tx.pedido.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "en_revision" }) }),
    );
  });

  it("rechaza una subcategoria que no pertenece a la categoria elegida", async () => {
    const { service, tx } = crearService({
      categoria: crearCategoria({ subcategorias: ["Canillas"] }),
    });

    const error = await capturarError(
      service.crear("cliente-1", crearDatosPedido({ subcategoria: "Inventada" })),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("rechaza una respuesta guia que no corresponde a ninguna pregunta de la categoria", async () => {
    const { service, tx } = crearService({
      categoria: crearCategoria({ preguntasGuia: ["¿Que tipo de artefacto?"] }),
    });

    const error = await capturarError(
      service.crear(
        "cliente-1",
        crearDatosPedido({ respuestasGuia: { "Pregunta inventada": "una respuesta" } }),
      ),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("traduce una violacion de PK de foto_pedido (dos POST concurrentes con el mismo id) a un 400, no a un error interno", async () => {
    const { service, tx } = crearService();
    tx.pedido.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const error = await capturarError(service.crear("cliente-1", crearDatosPedido()));

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it("manda el pedido a en_revision cuando es un duplicado exacto de otro pedido activo del mismo cliente", async () => {
    const descripcion = "Se rompio la canilla de la cocina y pierde agua todo el dia";
    const { service, tx } = crearService({
      // normalizarDescripcion hace trim() + colapsa espacios repetidos: sigue
      // siendo "el mismo" duplicado aunque tenga espacios de mas.
      activos: [{ descripcion: `  ${descripcion}   ` }],
      pedidoCreado: crearPedidoCreado({ estado: "en_revision", publicadoEn: null, expiraEn: null }),
    });

    await service.crear("cliente-1", crearDatosPedido({ descripcion }));

    expect(tx.pedido.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "en_revision" }) }),
    );
  });

  it("solo compara duplicados y cupo contra pedidos activos: la consulta nunca incluye cerrado, cancelado, expirado ni bloqueado", async () => {
    const { service, tx } = crearService();

    await service.crear("cliente-1", crearDatosPedido());

    expect(tx.pedido.findMany).toHaveBeenCalledWith({
      where: {
        clienteId: "cliente-1",
        estado: { in: ["en_revision", "publicado", "con_postulaciones", "contacto_habilitado"] },
      },
      select: { descripcion: true },
    });
  });

  it("rechaza con limite_excedido cuando ya alcanzo el cupo de pedidos activos, sin crear direccion ni pedido", async () => {
    const { service, tx, eventos } = crearService({
      activos: [{ descripcion: "uno" }, { descripcion: "dos" }, { descripcion: "tres" }],
    });

    const error = await capturarError(service.crear("cliente-1", crearDatosPedido()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      codigo: "limite_excedido",
    });
    expect(tx.direccion.create).not.toHaveBeenCalled();
    expect(tx.pedido.create).not.toHaveBeenCalled();
    // docs/dominio.md §10: "limite_alcanzado" es justo el evento para esto.
    // Se registra fuera de la transaccion que fallo (si no, se revertiria).
    expect(eventos.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "limite_alcanzado", usuarioId: "cliente-1" }),
    );
  });

  it("rechaza si manda mas fotos que el maximo del parametro de negocio fotos_max", async () => {
    const { service, tx } = crearService({ parametros: { fotos_max: 1 } });

    const error = await capturarError(
      service.crear("cliente-1", crearDatosPedido({ fotos: [{ id: "foto-1" }, { id: "foto-2" }] })),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("rechaza si alguna foto no existe de verdad en el storage (no se puede colar una foto ajena o inventada)", async () => {
    const almacenamiento = crearAlmacenamientoMock({ existe: () => Promise.resolve(false) });
    const { service, tx } = crearService({ almacenamiento });

    const error = await capturarError(
      service.crear("cliente-1", crearDatosPedido({ fotos: [{ id: "foto-inexistente" }] })),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(tx.pedido.create).not.toHaveBeenCalled();
  });

  it("rechaza si el id de una foto ya pertenece a un pedido publicado (evita romper la PK de foto_pedido)", async () => {
    const { service, tx, prisma } = crearService({ fotosYaTomadas: [{ id: "foto-1" }] });

    const error = await capturarError(
      service.crear("cliente-1", crearDatosPedido({ fotos: [{ id: "foto-1" }] })),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(tx.pedido.create).not.toHaveBeenCalled();
    expect(prisma.fotoPedido.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["foto-1"] } } }),
    );
  });

  it("crea las fotos con la url que calcula el storage a partir del id, nunca con datos que mande el cliente", async () => {
    const borradorId = "22222222-2222-2222-2222-222222222222";
    const { service, tx, almacenamiento } = crearService();

    await service.crear("cliente-1", crearDatosPedido({ borradorId, fotos: [{ id: "foto-1" }] }));

    expect(almacenamiento.existe).toHaveBeenCalledWith(`borradores/${borradorId}/foto-1.jpg`);
    expect(tx.pedido.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fotos: {
            create: [
              {
                id: "foto-1",
                url: `/uploads-dev/borradores/${borradorId}/foto-1.jpg`,
                orden: 0,
              },
            ],
          },
        }),
      }),
    );
  });
});

function crearDatosEditar(overrides: Partial<EditarPedido> = {}): EditarPedido {
  return {
    subcategoria: undefined,
    descripcion: "Descripcion editada, con el largo suficiente para pasar el minimo",
    respuestasGuia: undefined,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    ...overrides,
  } as EditarPedido;
}

describe("PedidosService.editar", () => {
  it("edita un pedido publicado sin postulaciones todavia", async () => {
    const { service, prisma } = crearService();

    const vista = await service.editar("cliente-1", "pedido-1", crearDatosEditar());

    expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
      where: { id: "pedido-1", estado: "publicado", cantidadPostulaciones: 0 },
      data: expect.objectContaining({ descripcion: crearDatosEditar().descripcion }),
    });
    expect(vista.id).toBe(crearPedidoCreado().id);
  });

  // Bug real encontrado en revisión: en un update, `undefined` le dice a
  // Prisma "no toques esta columna" (a diferencia de create, donde omitir el
  // campo ya deja NULL). Si se borran todas las respuestas guia, hay que
  // escribir NULL de verdad con Prisma.JsonNull, no dejar `undefined`.
  it("borra las respuestas guia de verdad (Prisma.JsonNull) cuando se editan a vacio", async () => {
    const { service, prisma } = crearService();

    await service.editar("cliente-1", "pedido-1", crearDatosEditar({ respuestasGuia: undefined }));

    expect(prisma.pedido.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ respuestasGuia: Prisma.JsonNull }),
      }),
    );
  });

  it("rechaza con no_encontrado si el pedido no existe o no es del cliente", async () => {
    const { service, prisma } = crearService({ pedidoExistente: null });

    const error = await capturarError(service.editar("cliente-1", "pedido-1", crearDatosEditar()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
  });

  it("rechaza con no_encontrado si el pedido es de otro cliente (no revela que existe)", async () => {
    const { service } = crearService({
      pedidoExistente: {
        id: "pedido-1",
        clienteId: "otro-cliente",
        estado: "publicado",
        cantidadPostulaciones: 0,
        categoria: crearCategoria(),
      },
    });

    const error = await capturarError(service.editar("cliente-1", "pedido-1", crearDatosEditar()));

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("rechaza con conflicto si el pedido ya tiene postulaciones (docs/dominio.md §3: se edita hasta la primera)", async () => {
    const { service, prisma } = crearService({ updateManyCount: 0 });

    const error = await capturarError(service.editar("cliente-1", "pedido-1", crearDatosEditar()));

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.pedido.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("rechaza una subcategoria que no pertenece a la categoria del pedido", async () => {
    const { service, prisma } = crearService({
      pedidoExistente: {
        id: "pedido-1",
        clienteId: "cliente-1",
        estado: "publicado",
        cantidadPostulaciones: 0,
        categoria: crearCategoria({ subcategorias: ["Canillas"] }),
      },
    });

    const error = await capturarError(
      service.editar("cliente-1", "pedido-1", crearDatosEditar({ subcategoria: "Inventada" })),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
  });

  it("rechaza (no manda a en_revision) si la descripcion editada tiene un telefono: el cliente puede corregirla al toque", async () => {
    const { service, prisma } = crearService();

    const error = await capturarError(
      service.editar(
        "cliente-1",
        "pedido-1",
        crearDatosEditar({ descripcion: "Llamame al 11 4444 5555 para coordinar, gracias" }),
      ),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.pedido.updateMany).not.toHaveBeenCalled();
  });
});

// CL-08 (revision de codigo del slice 6, hallazgos 5 y 6): estos 3 campos
// tienen que salir siempre de ParametrosService, nunca de un numero adivinado
// en el front. pedidos.vistas.spec.ts ya prueba que mapearPedidoAVista
// traslada lo que le llega calculado; esto prueba que PedidosService calcula
// bien esos valores antes de mapear.
describe("PedidosService.obtenerPropio (cupo de CL-08)", () => {
  it("calcula postulacionesCupoLleno, cantidadContactos y seleccionablesLibres a partir de los parametros de negocio", async () => {
    const { service } = crearService({
      pedidoExistente: crearPedidoCreado({
        clienteId: "cliente-1",
        estado: "contacto_habilitado",
        cantidadPostulaciones: 8,
        cantidadContactos: 2,
      }),
      parametros: { seleccionables_max_por_pedido: 3, postulaciones_max_por_pedido: 8 },
    });

    const vista = await service.obtenerPropio("cliente-1", "pedido-1");

    expect(vista.postulacionesCupoLleno).toBe(true);
    expect(vista.cantidadContactos).toBe(2);
    expect(vista.seleccionablesLibres).toBe(1);
  });

  it("deja postulacionesCupoLleno en false y seleccionablesLibres al maximo cuando el pedido recien se publico", async () => {
    const { service } = crearService({
      pedidoExistente: crearPedidoCreado({
        clienteId: "cliente-1",
        estado: "publicado",
        cantidadPostulaciones: 0,
        cantidadContactos: 0,
      }),
      parametros: { seleccionables_max_por_pedido: 3, postulaciones_max_por_pedido: 8 },
    });

    const vista = await service.obtenerPropio("cliente-1", "pedido-1");

    expect(vista.postulacionesCupoLleno).toBe(false);
    expect(vista.seleccionablesLibres).toBe(3);
  });
});
