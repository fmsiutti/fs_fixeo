import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { CrearPedido } from "@fixeo/shared";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";

// BUG PRE-EXISTENTE (no introducido por este archivo, no lo arreglamos aca
// por instruccion explicita de no tocar codigo de produccion desde un test):
// `apps/api/src/jobs/jobs.module.ts` (commit ae732b2, slice 8) agrego
// `BarridosPedidosProcessor` a `providers` sin importar `EventosModule`, pero
// el processor pide `EventosService` en el constructor. Nest no puede
// resolver la dependencia y `AppModule` no bootea, asi que TODO el e2e suite
// (este archivo y los preexistentes: denuncias.e2e-spec.ts, pedidos.e2e-spec.ts,
// etc.) falla en `Test.createTestingModule({ imports: [AppModule] }).compile()`
// con "Nest can't resolve dependencies of the BarridosPedidosProcessor
// (..., ?). ... argument EventosService at index [3] is not available in the
// JobsModule module.". El fix es agregar `EventosModule` a los `imports` de
// `JobsModule`, pero eso es codigo de produccion: queda para quien revise
// este PR, no para este archivo de tests.

const PREFIJO_TELEFONO = "+549110100";
const TEL_CLIENTE = `${PREFIJO_TELEFONO}001`;
const TEL_PROFESIONAL = `${PREFIJO_TELEFONO}002`;
const TEL_MODERADOR = `${PREFIJO_TELEFONO}003`;
const TEL_SOPORTE = `${PREFIJO_TELEFONO}004`;

interface DriverConMapaInterno {
  codigos: Map<string, { codigo: string; expiraEn: number }>;
}

function leerCodigoOtp(driver: TwilioLogDriver, telefono: string): string {
  const interno = driver as unknown as DriverConMapaInterno;
  const guardado = interno.codigos.get(telefono);
  if (!guardado) {
    throw new Error(`No se genero un codigo otp para ${telefono}.`);
  }
  return guardado.codigo;
}

interface Sesion {
  accessToken: string;
  usuarioId: string;
}

/**
 * AD-02 (moderacion de pedidos y denuncias), D14 (ocultamiento de reseñas) y
 * D15 (cascada de suspender un usuario), docs/dominio.md §3/§7/§8/§12. Solo
 * 4 logins en todo el archivo (moderador, soporte, cliente, profesional):
 * el limite de /auth/otp/solicitar es 5 por IP por minuto (mismo criterio
 * que contactos.e2e-spec.ts/verificaciones.e2e-spec.ts), y el resto del
 * armado de datos (postulacion, contacto, resenia) se hace directo por
 * Prisma, igual que contactos.e2e-spec.ts hace con `crearPedidoDirecto`:
 * lo que este archivo ejercita es la moderacion, no como se llega a esos
 * estados intermedios.
 */
describe("Back office: moderacion de pedidos, denuncias y suspension de usuarios (AD-02/D14/D15, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  let categoriaPlomeriaId: string;
  let barrioPalermoId: string;

  let cliente: Sesion;
  let profesional: Sesion;
  let moderador: Sesion;
  let soporte: Sesion;
  let perfilProfesionalId: string;

  const pedidoIdsCreados: string[] = [];
  const direccionIdsCreados: string[] = [];
  const contactoIdsCreados: string[] = [];
  const reseniaIdsCreados: string[] = [];

  async function loginBase(telefono: string): Promise<Sesion> {
    await request(app.getHttpServer())
      .post("/auth/otp/solicitar")
      .send({ telefono, canal: "sms" })
      .expect(204);
    const codigo = leerCodigoOtp(driverOtp, telefono);
    const respuesta = await request(app.getHttpServer())
      .post("/auth/otp/confirmar")
      .send({ telefono, codigo })
      .expect(200);
    return {
      accessToken: respuesta.body.accessToken as string,
      usuarioId: respuesta.body.usuario.id as string,
    };
  }

  async function loginComoCliente(telefono: string): Promise<Sesion> {
    const sesion = await loginBase(telefono);
    await request(app.getHttpServer())
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ rol: "cliente" })
      .expect(200);
    return sesion;
  }

  async function loginComoProfesional(telefono: string): Promise<Sesion> {
    const sesion = await loginBase(telefono);
    await request(app.getHttpServer())
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ rol: "profesional" })
      .expect(200);
    // Crea la fila perfil_profesional (armarPerfil hace upsert), necesaria
    // para las postulaciones/contacto/resenia que este archivo arma directo
    // por Prisma mas abajo.
    await request(app.getHttpServer())
      .patch("/perfil-profesional")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ presentacion: "Plomero de prueba" })
      .expect(200);
    return sesion;
  }

  /** Mismo truco que verificaciones.e2e-spec.ts: moderador/soporte se arman pisando rolActivo. */
  async function loginComoRolDeSistema(
    telefono: string,
    rol: "moderador" | "soporte",
  ): Promise<Sesion> {
    const sesion = await loginBase(telefono);
    await prisma.usuario.update({ where: { id: sesion.usuarioId }, data: { rolActivo: rol } });
    return sesion;
  }

  function direccionPayload(overrides: Partial<CrearPedido["direccion"]> = {}) {
    return {
      calle: "Av. de Prueba Moderacion",
      numero: "123",
      tipoPropiedad: "casa" as const,
      barrioId: barrioPalermoId,
      lat: -34.6,
      lng: -58.45,
      ...overrides,
    };
  }

  function pedidoPayload(overrides: Partial<CrearPedido> = {}): CrearPedido {
    return {
      categoriaId: categoriaPlomeriaId,
      descripcion: "Se me rompió la bacha de la cocina y pierde agua todo el día",
      urgencia: "sin_apuro",
      franjas: ["manana"],
      direccion: direccionPayload(),
      borradorId: randomUUID(),
      fotos: [],
      ...overrides,
    } as CrearPedido;
  }

  async function crearPedidoViaApi(
    sesion: Sesion,
    overrides: Partial<CrearPedido> = {},
  ): Promise<{ id: string; estado: string }> {
    const respuesta = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send(pedidoPayload(overrides))
      .expect(201);
    pedidoIdsCreados.push(respuesta.body.id as string);
    const registro = await prisma.pedido.findUniqueOrThrow({
      where: { id: respuesta.body.id as string },
      select: { direccionId: true },
    });
    direccionIdsCreados.push(registro.direccionId);
    return { id: respuesta.body.id as string, estado: respuesta.body.estado as string };
  }

  /** Arma pedido (publicado) + postulacion (seleccionada) + contacto + resenia directo por Prisma, para el flujo D14. */
  async function crearReseniaDirecta(): Promise<string> {
    const direccion = await prisma.direccion.create({
      data: {
        calle: "Direccion de prueba de resenia",
        numero: "1",
        tipoPropiedad: "casa",
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
      },
    });
    direccionIdsCreados.push(direccion.id);

    const pedido = await prisma.pedido.create({
      data: {
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        descripcion: `Pedido de prueba para resenia ${randomUUID()}`,
        urgencia: "sin_apuro",
        franjas: ["manana"],
        direccionId: direccion.id,
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
        estado: "contacto_habilitado",
        publicadoEn: new Date(),
        expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cierreAutomaticoEn: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        cantidadContactos: 1,
        cantidadPostulaciones: 1,
      },
    });
    pedidoIdsCreados.push(pedido.id);

    const postulacion = await prisma.postulacion.create({
      data: {
        pedidoId: pedido.id,
        profesionalId: perfilProfesionalId,
        mensaje: "Puedo pasar mañana a la tarde",
        estimacionADefinir: true,
        estado: "seleccionada",
      },
    });

    const contacto = await prisma.contacto.create({
      data: { pedidoId: pedido.id, postulacionId: postulacion.id, orden: 1 },
    });
    contactoIdsCreados.push(contacto.id);

    const resenia = await prisma.resenia.create({
      data: {
        pedidoId: pedido.id,
        contactoId: contacto.id,
        profesionalId: perfilProfesionalId,
        clienteId: cliente.usuarioId,
        puntaje: 1,
        atributos: [],
        comentario: "Mi telefono es 11 4444 5555, no lo public",
      },
    });
    reseniaIdsCreados.push(resenia.id);
    return resenia.id;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);

    const categoriaPlomeria = await prisma.categoria.findUniqueOrThrow({
      where: { slug: "plomeria" },
    });
    categoriaPlomeriaId = categoriaPlomeria.id;
    const barrio = await prisma.barrio.findUniqueOrThrow({ where: { nombre: "Palermo" } });
    barrioPalermoId = barrio.id;

    // 4 logins en total en este archivo (limite: 5 por IP por minuto).
    cliente = await loginComoCliente(TEL_CLIENTE);
    profesional = await loginComoProfesional(TEL_PROFESIONAL);
    moderador = await loginComoRolDeSistema(TEL_MODERADOR, "moderador");
    soporte = await loginComoRolDeSistema(TEL_SOPORTE, "soporte");

    const perfil = await prisma.perfilProfesional.findUniqueOrThrow({
      where: { usuarioId: profesional.usuarioId },
      select: { id: true },
    });
    perfilProfesionalId = perfil.id;
  }, 30_000);

  afterAll(async () => {
    const usuariosDePrueba = await prisma.usuario.findMany({
      where: { telefono: { startsWith: PREFIJO_TELEFONO } },
      select: { id: true },
    });
    const idsUsuarios = usuariosDePrueba.map((usuario) => usuario.id);

    await prisma.resenia.deleteMany({ where: { id: { in: reseniaIdsCreados } } });
    await prisma.contacto.deleteMany({ where: { id: { in: contactoIdsCreados } } });
    await prisma.postulacion.deleteMany({ where: { profesionalId: perfilProfesionalId } });
    await prisma.denuncia.deleteMany({ where: { reportanteId: { in: idsUsuarios } } });
    await prisma.notaInterna.deleteMany({ where: { usuarioId: { in: idsUsuarios } } });
    await prisma.notificacion.deleteMany({ where: { usuarioId: { in: idsUsuarios } } });
    await prisma.eventoAnalitico.deleteMany({
      where: {
        OR: [{ pedidoId: { in: pedidoIdsCreados } }, { usuarioId: { in: idsUsuarios } }],
      },
    });
    await prisma.pedido.deleteMany({ where: { id: { in: pedidoIdsCreados } } });
    await prisma.direccion.deleteMany({ where: { id: { in: direccionIdsCreados } } });
    await prisma.usuario.deleteMany({ where: { telefono: { startsWith: PREFIJO_TELEFONO } } });
    await app.close();
  });

  it("cola 1 (en_revision, D1): el moderador aprueba y recien ahi se fijan publicadoEn/expiraEn; soporte solo lee", async () => {
    const pedido = await crearPedidoViaApi(cliente, {
      descripcion: "Comuniquense al 11 4444 5555 para coordinar la visita, gracias",
    });
    expect(pedido.estado).toBe("en_revision");

    // Un profesional no es moderador ni soporte.
    await request(app.getHttpServer())
      .get("/admin/pedidos/en-revision")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .expect(403);

    // Soporte lee la cola...
    const cola = await request(app.getHttpServer())
      .get("/admin/pedidos/en-revision")
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .expect(200);
    expect((cola.body.items as { id: string }[]).some((item) => item.id === pedido.id)).toBe(true);

    // ...pero no puede resolver.
    await request(app.getHttpServer())
      .patch(`/admin/pedidos/${pedido.id}/resolver-revision`)
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .send({ accion: "aprobar" })
      .expect(403);

    const resuelto = await request(app.getHttpServer())
      .patch(`/admin/pedidos/${pedido.id}/resolver-revision`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ accion: "aprobar" })
      .expect(200);
    expect(resuelto.body.estado).toBe("publicado");

    const pedidoEnBase = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(pedidoEnBase.publicadoEn).not.toBeNull();
    expect(pedidoEnBase.expiraEn).not.toBeNull();

    const notificacion = await prisma.notificacion.findFirst({
      where: {
        usuarioId: cliente.usuarioId,
        tipo: "pedido_revision_aprobado",
        objetoId: pedido.id,
      },
    });
    expect(notificacion).not.toBeNull();

    // Ya no esta "en_revision": resolver de nuevo es conflicto.
    const segundaResolucion = await request(app.getHttpServer())
      .patch(`/admin/pedidos/${pedido.id}/resolver-revision`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ accion: "aprobar" })
      .expect(409);
    expect(segundaResolucion.body.codigo).toBe("conflicto");
  });

  it("cola 1 (en_revision): rechazar bloquea el pedido con motivo tipificado, y notifica al cliente", async () => {
    const pedido = await crearPedidoViaApi(cliente, {
      descripcion: "Llamame al 11 5555 4444 antes de venir, gracias",
    });
    expect(pedido.estado).toBe("en_revision");

    const resuelto = await request(app.getHttpServer())
      .patch(`/admin/pedidos/${pedido.id}/resolver-revision`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({
        accion: "rechazar",
        motivo: "datos_de_contacto",
        detalle: "Telefono en la descripcion",
      })
      .expect(200);
    expect(resuelto.body.estado).toBe("bloqueado");
    expect(resuelto.body.motivoModeracion).toBe("datos_de_contacto: Telefono en la descripcion");

    const notificacion = await prisma.notificacion.findFirst({
      where: {
        usuarioId: cliente.usuarioId,
        tipo: "pedido_revision_rechazado",
        objetoId: pedido.id,
      },
    });
    expect(notificacion).not.toBeNull();
  });

  it("cola 2 (denunciados, D5): el moderador bloquea un pedido denunciado y sale de circulacion; soporte solo lee", async () => {
    const pedido = await crearPedidoViaApi(cliente);
    expect(pedido.estado).toBe("publicado");

    await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .send({
        tipoObjeto: "pedido",
        objetoId: pedido.id,
        motivo: "Contenido inadecuado",
      })
      .expect(201);

    const cola = await request(app.getHttpServer())
      .get("/admin/pedidos/denunciados")
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .expect(200);
    expect((cola.body.items as { id: string }[]).some((item) => item.id === pedido.id)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/admin/pedidos/${pedido.id}/resolver-denuncia`)
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .send({ accion: "bloquear", motivo: "contenido_inapropiado" })
      .expect(403);

    const resuelto = await request(app.getHttpServer())
      .patch(`/admin/pedidos/${pedido.id}/resolver-denuncia`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ accion: "bloquear", motivo: "contenido_inapropiado" })
      .expect(200);
    expect(resuelto.body.estado).toBe("bloqueado");

    const pedidoEnBase = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(pedidoEnBase.estado).toBe("bloqueado");

    // Ya no queda en la cola de denunciados (la denuncia quedo resuelta).
    const colaTrasResolver = await request(app.getHttpServer())
      .get("/admin/pedidos/denunciados")
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .expect(200);
    expect(
      (colaTrasResolver.body.items as { id: string }[]).some((item) => item.id === pedido.id),
    ).toBe(false);
  });

  it("cola 2 (denunciados): descartar deja el pedido intacto", async () => {
    const pedido = await crearPedidoViaApi(cliente);

    await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .send({ tipoObjeto: "pedido", objetoId: pedido.id, motivo: "Denuncia sin fundamento" })
      .expect(201);

    const resuelto = await request(app.getHttpServer())
      .patch(`/admin/pedidos/${pedido.id}/resolver-denuncia`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ accion: "descartar" })
      .expect(200);
    expect(resuelto.body.estado).toBe("publicado");

    const pedidoEnBase = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(pedidoEnBase.estado).toBe("publicado");
  });

  it("D14: denunciar una resenia por datos personales la oculta dinamicamente; el moderador la oculta a proposito, y sigue oculta aunque se descarte otra denuncia futura", async () => {
    const reseniaId = await crearReseniaDirecta();

    // Visible antes de cualquier denuncia.
    const listadoAntes = await request(app.getHttpServer())
      .get(`/profesionales/${perfilProfesionalId}/resenias`)
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .expect(200);
    expect(
      (listadoAntes.body.items as { id: string }[]).some((item) => item.id === reseniaId),
    ).toBe(true);

    // El propio profesional se denuncia la reseña (expone su telefono).
    const denuncia1 = await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .send({ tipoObjeto: "resenia", objetoId: reseniaId, motivo: "datos_personales" })
      .expect(201);

    // Ocultamiento dinamico: ya no aparece mientras la denuncia sigue pendiente.
    const listadoOcultoDinamico = await request(app.getHttpServer())
      .get(`/profesionales/${perfilProfesionalId}/resenias`)
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .expect(200);
    expect(
      (listadoOcultoDinamico.body.items as { id: string }[]).some((item) => item.id === reseniaId),
    ).toBe(false);

    // Soporte ve la cola pero no puede resolverla.
    const colaSoporte = await request(app.getHttpServer())
      .get("/admin/denuncias")
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .expect(200);
    expect(
      (colaSoporte.body.items as { id: string; tipoObjeto: string }[]).some(
        (item) => item.id === denuncia1.body.id,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .patch(`/admin/denuncias/${denuncia1.body.id}/resolver`)
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .send({ accion: "resolver" })
      .expect(403);

    // El moderador "resuelve": D14 dice que en resenia eso significa
    // ocultarla definitivamente (no se borra).
    await request(app.getHttpServer())
      .patch(`/admin/denuncias/${denuncia1.body.id}/resolver`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ accion: "resolver" })
      .expect(200);

    const reseniaEnBase = await prisma.resenia.findUniqueOrThrow({ where: { id: reseniaId } });
    expect(reseniaEnBase.ocultaPorModeracionEn).not.toBeNull();

    const perfilTrasOcultar = await prisma.perfilProfesional.findUniqueOrThrow({
      where: { id: perfilProfesionalId },
    });
    // recalcularPromedioResenias excluye las ocultas: sin otras reseñas, cantidad vuelve a 0.
    expect(perfilTrasOcultar.cantidadResenias).toBe(0);

    // Segunda denuncia, de otro reportante, con un motivo que NO oculta
    // dinamicamente. Al descartarla, la reseña sigue oculta: el ocultamiento
    // permanente no depende de esta denuncia.
    const denuncia2 = await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send({ tipoObjeto: "resenia", objetoId: reseniaId, motivo: "contenido_falso" })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/admin/denuncias/${denuncia2.body.id}/resolver`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ accion: "descartar" })
      .expect(200);

    const listadoTrasDescartar = await request(app.getHttpServer())
      .get(`/profesionales/${perfilProfesionalId}/resenias`)
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .expect(200);
    expect(
      (listadoTrasDescartar.body.items as { id: string }[]).some((item) => item.id === reseniaId),
    ).toBe(false);
  });

  it("D15: suspender un cliente bloquea sus pedidos activos; suspender un profesional caduca sus postulaciones abiertas", async () => {
    // Directo por Prisma, no via API: a esta altura del archivo el cliente ya
    // tiene 3 pedidos activos entre los tests anteriores (el cupo de
    // pedidos_activos_max_por_cliente es 3), asi que crearPedidoViaApi
    // rechazaria un cuarto con 409. Esta prueba es sobre la cascada de D15,
    // no sobre ese cupo (que ya tiene su propio test de carrera en
    // pedidos.e2e-spec.ts).
    const direccionPedidoCliente = await prisma.direccion.create({
      data: {
        calle: "Direccion de prueba D15 (pedido del cliente)",
        numero: "1",
        tipoPropiedad: "casa",
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
      },
    });
    direccionIdsCreados.push(direccionPedidoCliente.id);
    const pedidoDelCliente = await prisma.pedido.create({
      data: {
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        descripcion: `Pedido de prueba D15 (cliente) ${randomUUID()}`,
        urgencia: "sin_apuro",
        franjas: ["manana"],
        direccionId: direccionPedidoCliente.id,
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
        estado: "publicado",
        publicadoEn: new Date(),
        expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    pedidoIdsCreados.push(pedidoDelCliente.id);

    const direccion = await prisma.direccion.create({
      data: {
        calle: "Direccion de prueba D15",
        numero: "1",
        tipoPropiedad: "casa",
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
      },
    });
    direccionIdsCreados.push(direccion.id);
    const otroPedido = await prisma.pedido.create({
      data: {
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        descripcion: `Otro pedido de prueba D15 ${randomUUID()}`,
        urgencia: "sin_apuro",
        franjas: ["manana"],
        direccionId: direccion.id,
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
        estado: "publicado",
        publicadoEn: new Date(),
        expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    pedidoIdsCreados.push(otroPedido.id);
    const postulacionAbierta = await prisma.postulacion.create({
      data: {
        pedidoId: otroPedido.id,
        profesionalId: perfilProfesionalId,
        mensaje: "Puedo pasar la semana que viene",
        estimacionADefinir: true,
        estado: "enviada",
      },
    });

    // Pedido de OTRO cliente (no el que se suspende en este test), para
    // aislar la cascada propia del PROFESIONAL (D15: sus propias
    // postulaciones abiertas caducan al suspenderlo) de la cascada del
    // PEDIDO bloqueado de arriba (Fix 1: postulaciones de otros profesionales
    // en un pedido que se bloquea). Directo por Prisma, igual que el resto de
    // este test.
    const otroCliente = await prisma.usuario.create({
      data: { telefono: `${PREFIJO_TELEFONO}005`, rolActivo: "cliente" },
    });
    const direccionOtroCliente = await prisma.direccion.create({
      data: {
        calle: "Direccion de prueba D15 (otro cliente)",
        numero: "1",
        tipoPropiedad: "casa",
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
      },
    });
    direccionIdsCreados.push(direccionOtroCliente.id);
    const pedidoDeOtroCliente = await prisma.pedido.create({
      data: {
        clienteId: otroCliente.id,
        categoriaId: categoriaPlomeriaId,
        descripcion: `Pedido de otro cliente para D15 ${randomUUID()}`,
        urgencia: "sin_apuro",
        franjas: ["manana"],
        direccionId: direccionOtroCliente.id,
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
        estado: "publicado",
        publicadoEn: new Date(),
        expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    pedidoIdsCreados.push(pedidoDeOtroCliente.id);
    const postulacionPropiaDelProfesional = await prisma.postulacion.create({
      data: {
        pedidoId: pedidoDeOtroCliente.id,
        profesionalId: perfilProfesionalId,
        mensaje: "Tengo disponibilidad esta semana",
        estimacionADefinir: true,
        estado: "vista",
      },
    });

    // Soporte no puede suspender (solo lectura en todo el back office).
    await request(app.getHttpServer())
      .patch(`/admin/usuarios/${cliente.usuarioId}/suspender`)
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .send({ motivo: "Prueba D15" })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/admin/usuarios/${cliente.usuarioId}/suspender`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ motivo: "Reiteradas denuncias de otros usuarios" })
      .expect(200);

    const pedidoDelClienteEnBase = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoDelCliente.id },
    });
    expect(pedidoDelClienteEnBase.estado).toBe("bloqueado");
    const otroPedidoEnBase = await prisma.pedido.findUniqueOrThrow({
      where: { id: otroPedido.id },
    });
    expect(otroPedidoEnBase.estado).toBe("bloqueado");

    const notaInterna = await prisma.notaInterna.findFirst({
      where: { usuarioId: cliente.usuarioId, texto: { contains: "Usuario suspendido" } },
    });
    expect(notaInterna).not.toBeNull();

    // El token del cliente ya no sirve: JwtAuthGuard exige estado "activo".
    await request(app.getHttpServer())
      .get("/pedidos")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .expect(401);

    // Fix 1 (docs/dominio.md §4, tabla D2): la postulacion "enviada" del
    // profesional pertenece a `otroPedido`, que se bloqueo mas arriba junto
    // con el resto de los pedidos activos del cliente suspendido; eso ya
    // caduco la postulacion (caducarPostulacionesAbiertas se llama en la
    // misma transaccion que bloquea el pedido), antes de que el profesional
    // sea suspendido.
    const postulacionAntes = await prisma.postulacion.findUniqueOrThrow({
      where: { id: postulacionAbierta.id },
    });
    expect(postulacionAntes.estado).toBe("caducada");

    // La postulacion propia del profesional en el pedido de OTRO cliente no
    // suspendido sigue "vista": la cascada del cliente no la toca (D15: es
    // por PEDIDO, no por PROFESIONAL).
    const postulacionPropiaAntes = await prisma.postulacion.findUniqueOrThrow({
      where: { id: postulacionPropiaDelProfesional.id },
    });
    expect(postulacionPropiaAntes.estado).toBe("vista");

    await request(app.getHttpServer())
      .patch(`/admin/usuarios/${profesional.usuarioId}/suspender`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ motivo: "Reiteradas ausencias" })
      .expect(200);

    // D15: recien ahora, al suspender al PROFESIONAL, caduca esta postulacion
    // propia (cascada distinta de la del pedido bloqueado de arriba).
    const postulacionPropiaDespues = await prisma.postulacion.findUniqueOrThrow({
      where: { id: postulacionPropiaDelProfesional.id },
    });
    expect(postulacionPropiaDespues.estado).toBe("caducada");

    const postulacionDespues = await prisma.postulacion.findUniqueOrThrow({
      where: { id: postulacionAbierta.id },
    });
    expect(postulacionDespues.estado).toBe("caducada");
  });
});
