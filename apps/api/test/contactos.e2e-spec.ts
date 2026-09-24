import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";
import { ParametrosService } from "../src/modules/parametros/parametros.service.js";

const PREFIJO_TELEFONO = "+549110099";
const TEL_CLIENTE = `${PREFIJO_TELEFONO}001`;
const TEL_PROFESIONAL_1 = `${PREFIJO_TELEFONO}002`;
const TEL_PROFESIONAL_2 = `${PREFIJO_TELEFONO}003`;
const TEL_PROFESIONAL_3 = `${PREFIJO_TELEFONO}004`;
const TEL_PROFESIONAL_4 = `${PREFIJO_TELEFONO}005`;

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
 * PR-06/CL-08/CL-10 (docs/dominio.md §3, §4, §7, §12 D2/D3). Reglas no
 * negociables tocadas: #1 (transicionar), #2 (visibilidad de datos), #4
 * (cupo de 3 elegibles con lock). 5 logins en total (limite: 5 por IP por
 * minuto en /auth/otp/solicitar, mismo criterio que postulaciones.e2e-spec.ts).
 */
describe("Seleccion y contacto (PR-06/CL-08/CL-10, D2/D3, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  let parametros: ParametrosService;
  let categoriaPlomeriaId: string;
  let barrioPalermoId: string;

  let cliente: Sesion;
  let profesional1: Sesion;
  let profesional2: Sesion;
  let profesional3: Sesion;
  let profesional4: Sesion;

  const pedidoIdsCreados: string[] = [];
  const direccionIdsCreados: string[] = [];

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

  async function loginComoProfesionalVerificado(telefono: string): Promise<Sesion> {
    const sesion = await loginBase(telefono);
    await request(app.getHttpServer())
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ rol: "profesional" })
      .expect(200);
    await request(app.getHttpServer())
      .patch("/perfil-profesional")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ presentacion: "Plomero de prueba" })
      .expect(200);
    await request(app.getHttpServer())
      .put("/perfil-profesional/oficios")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ oficios: [{ categoriaId: categoriaPlomeriaId, subcategorias: [] }] })
      .expect(200);
    await prisma.perfilProfesional.update({
      where: { usuarioId: sesion.usuarioId },
      data: { estadoVerificacion: "aprobada" },
    });
    return sesion;
  }

  async function crearPedidoDirecto(opciones: {
    clienteId: string;
    estado?: "publicado" | "con_postulaciones" | "contacto_habilitado";
    cantidadContactos?: number;
    cantidadPostulaciones?: number;
  }): Promise<string> {
    const direccion = await prisma.direccion.create({
      data: {
        calle: "Direccion de prueba de contacto",
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
        clienteId: opciones.clienteId,
        categoriaId: categoriaPlomeriaId,
        descripcion: `Pedido de prueba de contacto ${randomUUID()}`,
        urgencia: "sin_apuro",
        franjas: ["manana"],
        direccionId: direccion.id,
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
        estado: opciones.estado ?? "publicado",
        publicadoEn: new Date(),
        expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cantidadContactos: opciones.cantidadContactos ?? 0,
        cantidadPostulaciones: opciones.cantidadPostulaciones ?? 0,
      },
    });
    pedidoIdsCreados.push(pedido.id);
    return pedido.id;
  }

  function payloadPostulacion(pedidoId: string, overrides: Record<string, unknown> = {}) {
    return {
      pedidoId,
      mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
      estimacion: { aDefinir: true },
      ...overrides,
    };
  }

  async function postularse(pedidoId: string, sesion: Sesion): Promise<string> {
    const respuesta = await request(app.getHttpServer())
      .post("/postulaciones")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send(payloadPostulacion(pedidoId))
      .expect(201);
    return respuesta.body.id as string;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);
    parametros = moduleRef.get(ParametrosService);

    const [plomeria, palermo] = await Promise.all([
      prisma.categoria.findUniqueOrThrow({ where: { slug: "plomeria" } }),
      prisma.barrio.findUniqueOrThrow({ where: { nombre: "Palermo" } }),
    ]);
    categoriaPlomeriaId = plomeria.id;
    barrioPalermoId = palermo.id;

    // 5 logins en este archivo (/auth/otp/solicitar limita a 5 por IP por minuto).
    cliente = await loginComoCliente(TEL_CLIENTE);
    profesional1 = await loginComoProfesionalVerificado(TEL_PROFESIONAL_1);
    profesional2 = await loginComoProfesionalVerificado(TEL_PROFESIONAL_2);
    profesional3 = await loginComoProfesionalVerificado(TEL_PROFESIONAL_3);
    profesional4 = await loginComoProfesionalVerificado(TEL_PROFESIONAL_4);
  }, 30_000);

  afterAll(async () => {
    const usuariosDePrueba = await prisma.usuario.findMany({
      where: { telefono: { startsWith: PREFIJO_TELEFONO } },
      select: { id: true },
    });
    const idsUsuarios = usuariosDePrueba.map((usuario) => usuario.id);
    const perfiles = await prisma.perfilProfesional.findMany({
      where: { usuarioId: { in: idsUsuarios } },
      select: { id: true },
    });
    const idsPerfiles = perfiles.map((perfil) => perfil.id);

    await prisma.contacto.deleteMany({ where: { pedidoId: { in: pedidoIdsCreados } } });
    await prisma.postulacion.deleteMany({ where: { profesionalId: { in: idsPerfiles } } });
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

  it(
    "flujo completo: elige al 1ro y 2do sin caducar al resto (D2), completa el cupo de 3 (D3) y" +
      " 'no puedo tomarlo' no libera cupo ni borra el Contacto",
    async () => {
      const seleccionablesMax = await parametros.getNumero("seleccionables_max_por_pedido");
      expect(seleccionablesMax).toBe(3); // el resto del test asume el valor sembrado

      const pedido = await crearPedidoDirecto({ clienteId: cliente.usuarioId });

      const postulacion1 = await postularse(pedido, profesional1);
      const postulacion2 = await postularse(pedido, profesional2);
      const postulacion3 = await postularse(pedido, profesional3);
      const postulacion4 = await postularse(pedido, profesional4);

      // --- 1ra seleccion: primera entrada a contacto_habilitado (D1/§3) ---
      const eleccion1 = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacion1}/seleccionar`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(eleccion1.body.orden).toBe(1);
      expect(eleccion1.body.postulacionId).toBe(postulacion1);
      // docs/dominio.md §7: "Telefono del profesional | Oculto | Visible para
      // el cliente" — recien visible aca, en el Contacto ya creado.
      expect(eleccion1.body.profesional.telefono).toBeTruthy();

      let pedidoActualizado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido } });
      expect(pedidoActualizado.estado).toBe("contacto_habilitado");
      expect(pedidoActualizado.cantidadContactos).toBe(1);
      expect(pedidoActualizado.cierreAutomaticoEn).not.toBeNull();

      const contactosCliente1 = await request(app.getHttpServer())
        .get(`/pedidos/${pedido}/contacto`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(contactosCliente1.body).toHaveLength(1);
      expect(contactosCliente1.body[0].profesional.telefono).toBeTruthy();

      // El elegido ve el telefono/apellido/direccion completos del cliente
      // (docs/dominio.md §7), solo el elegido.
      const elegido1 = await request(app.getHttpServer())
        .get(`/postulaciones/${postulacion1}/elegido`)
        .set("Authorization", `Bearer ${profesional1.accessToken}`)
        .expect(200);
      expect(elegido1.body.cliente.telefono).toBe(TEL_CLIENTE);
      expect(elegido1.body.cliente.direccion.calle).toBe("Direccion de prueba de contacto");
      expect(elegido1.body.hayOtrosElegidos).toBe(false);

      // Otro profesional no elegido no puede ver ese contacto (ownership).
      await request(app.getHttpServer())
        .get(`/postulaciones/${postulacion1}/elegido`)
        .set("Authorization", `Bearer ${profesional2.accessToken}`)
        .expect(404);
      // Un tercero no dueño del pedido no ve sus contactos.
      await request(app.getHttpServer())
        .get(`/pedidos/${pedido}/contacto`)
        .set("Authorization", `Bearer ${profesional2.accessToken}`)
        .expect(404);

      // D2: mientras quede cupo de elegibles, las demas siguen enviada/vista.
      const restantesTrasEleccion1 = await prisma.postulacion.findMany({
        where: { id: { in: [postulacion2, postulacion3, postulacion4] } },
      });
      expect(
        restantesTrasEleccion1.every((p) => p.estado === "enviada" || p.estado === "vista"),
      ).toBe(true);
      const avisoEligioAOtro = await prisma.notificacion.findFirst({
        where: {
          usuarioId: profesional2.usuarioId,
          tipo: "cliente_eligio_a_otro",
          objetoId: pedido,
        },
      });
      expect(avisoEligioAOtro).not.toBeNull();

      // --- 2da seleccion: D3, no repite la transicion (el pedido ya estaba
      // en contacto_habilitado) ---
      const eleccion2 = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacion2}/seleccionar`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(eleccion2.body.orden).toBe(2);

      pedidoActualizado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido } });
      expect(pedidoActualizado.estado).toBe("contacto_habilitado");
      expect(pedidoActualizado.cantidadContactos).toBe(2);

      const contactosCliente2 = await request(app.getHttpServer())
        .get(`/pedidos/${pedido}/contacto`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(contactosCliente2.body).toHaveLength(2);

      // Elegir a un 2do no le revela nada al 1ro (D2/§7: revelado por
      // Contacto, no por pedido): solo se entera de que "hay otros elegidos".
      const elegido1DespuesDe2 = await request(app.getHttpServer())
        .get(`/postulaciones/${postulacion1}/elegido`)
        .set("Authorization", `Bearer ${profesional1.accessToken}`)
        .expect(200);
      expect(elegido1DespuesDe2.body.hayOtrosElegidos).toBe(true);
      expect(JSON.stringify(elegido1DespuesDe2.body)).not.toContain(TEL_PROFESIONAL_2);

      // --- 3ra seleccion: completa el cupo (D3) ---
      const eleccion3 = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacion3}/seleccionar`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(eleccion3.body.orden).toBe(3);

      pedidoActualizado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido } });
      expect(pedidoActualizado.cantidadContactos).toBe(3);

      // D2: al completarse el cupo de 3, la unica que quedaba viva caduca.
      const postulacion4Actualizada = await prisma.postulacion.findUniqueOrThrow({
        where: { id: postulacion4 },
      });
      expect(postulacion4Actualizada.estado).toBe("caducada");
      const avisoCompleto = await prisma.notificacion.findFirst({
        where: {
          usuarioId: profesional4.usuarioId,
          tipo: "cliente_completo_eleccion",
          objetoId: pedido,
        },
      });
      expect(avisoCompleto).not.toBeNull();

      // Ya no se puede elegir una postulacion caducada (el estado ya no es
      // enviada/vista: seleccionar() lo rechaza antes de llegar a mirar el
      // cupo, de ahi "conflicto" y no "limite_excedido").
      const eleccionRechazada = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacion4}/seleccionar`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(409);
      expect(eleccionRechazada.body.codigo).toBe("conflicto");

      // --- PR-06: el elegido avisa que no puede tomarlo (D3: no libera cupo) ---
      const noPuedoTomarlo = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacion1}/no-puedo-tomarlo`)
        .set("Authorization", `Bearer ${profesional1.accessToken}`)
        .expect(200);
      expect(noPuedoTomarlo.body.estado).toBe("retirada");

      pedidoActualizado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido } });
      expect(pedidoActualizado.cantidadContactos).toBe(3); // sin decrementar (D3)

      const contactoDePostulacion1 = await prisma.contacto.findUnique({
        where: { postulacionId: postulacion1 },
      });
      expect(contactoDePostulacion1).not.toBeNull(); // el Contacto no se borra (D3)

      // El cliente sigue viendo los 3 contactos, ahora con el 1ro "retirada".
      const contactosFinal = await request(app.getHttpServer())
        .get(`/pedidos/${pedido}/contacto`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(contactosFinal.body).toHaveLength(3);
      const bloqueRetirado = (
        contactosFinal.body as { postulacionId: string; estadoPostulacion: string }[]
      ).find((item) => item.postulacionId === postulacion1);
      expect(bloqueRetirado?.estadoPostulacion).toBe("retirada");
    },
    30_000,
  );

  it("carrera del cupo de 3 elegidos: de dos selecciones concurrentes para el ultimo lugar, exactamente una gana", async () => {
    const seleccionablesMax = await parametros.getNumero("seleccionables_max_por_pedido");
    // Simula un pedido que ya tiene 2 de 3 elegidos (mismo criterio que la
    // carrera del cupo por pedido en postulaciones.e2e-spec.ts: se deja el
    // cupo en "falta lugar para uno solo" insertando el contador directo).
    const pedido = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      estado: "contacto_habilitado",
      cantidadContactos: seleccionablesMax - 1,
    });

    const postulacionA = await postularse(pedido, profesional3);
    const postulacionB = await postularse(pedido, profesional4);

    const [respuestaA, respuestaB] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/postulaciones/${postulacionA}/seleccionar`)
        .set("Authorization", `Bearer ${cliente.accessToken}`),
      request(app.getHttpServer())
        .patch(`/postulaciones/${postulacionB}/seleccionar`)
        .set("Authorization", `Bearer ${cliente.accessToken}`),
    ]);

    const estados = [respuestaA.status, respuestaB.status].sort();
    // El lock FOR UPDATE sobre el pedido serializa el conteo: nunca las dos
    // triunfan ni las dos rechazan.
    expect(estados).toEqual([200, 409]);
    const rechazada = respuestaA.status === 409 ? respuestaA : respuestaB;
    expect(rechazada.body.codigo).toBe("limite_excedido");

    const pedidoFinal = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido } });
    expect(pedidoFinal.cantidadContactos).toBe(seleccionablesMax); // nunca 4

    const cantidadContactosReales = await prisma.contacto.count({ where: { pedidoId: pedido } });
    expect(cantidadContactosReales).toBe(1); // solo el ganador de la carrera crea un Contacto
  }, 30_000);
});
