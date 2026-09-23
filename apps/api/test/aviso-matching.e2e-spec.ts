import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { CrearPedido } from "@fixeo/shared";
import { AppModule } from "../src/app.module.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";
import { ParametrosService } from "../src/modules/parametros/parametros.service.js";
import { MatchingService } from "../src/modules/pedidos/pedidos-matching.service.js";

const PREFIJO_TELEFONO = "+549110095";
const TEL_CLIENTE = `${PREFIJO_TELEFONO}001`;
const TEL_PROFESIONAL_COINCIDE = `${PREFIJO_TELEFONO}002`;
const TEL_PROFESIONAL_SIN_APROBAR = `${PREFIJO_TELEFONO}003`;
const TEL_PROFESIONAL_RADIO = `${PREFIJO_TELEFONO}004`;
const TEL_PROFESIONAL_SUSPENDIDO = `${PREFIJO_TELEFONO}005`;

interface DriverConMapaInterno {
  codigos: Map<string, { codigo: string; expiraEn: number }>;
}

interface Sesion {
  accessToken: string;
  usuarioId: string;
}

/**
 * Punto geografico a `distanciaMetros` de `centro`, calculado con el mismo
 * `ST_Project` de PostGIS que subyace a `ST_Distance`/`ST_DWithin` en el
 * codigo de produccion. Evita construir el punto con una formula manual
 * (haversine a mano, por ejemplo) que podria no coincidir exactamente con el
 * calculo geodésico real y volver el test fragil cerca del limite del radio.
 */
async function puntoADistancia(
  prismaCliente: PrismaService,
  centro: { lat: number; lng: number },
  distanciaMetros: number,
): Promise<{ lat: number; lng: number }> {
  const [resultado] = await prismaCliente.$queryRaw<{ lat: number; lng: number }[]>(Prisma.sql`
    SELECT ST_Y(pt::geometry) AS lat, ST_X(pt::geometry) AS lng
    FROM (
      SELECT ST_Project(
        ST_MakePoint(${centro.lng}, ${centro.lat})::geography,
        ${distanciaMetros}::float8,
        radians(0)
      ) AS pt
    ) sub
  `);
  return resultado;
}

function leerCodigoOtp(driver: TwilioLogDriver, telefono: string): string {
  const interno = driver as unknown as DriverConMapaInterno;
  const guardado = interno.codigos.get(telefono);
  if (!guardado) {
    throw new Error(`No se genero un codigo otp para ${telefono}.`);
  }
  return guardado.codigo;
}

/** El job corre async (BullMQ, Redis real): esperamos hasta que aparezca la notificacion o venza el timeout. */
async function esperarHasta<T>(
  intentar: () => Promise<T | null>,
  timeoutMs = 8_000,
  pasoMs = 200,
): Promise<T> {
  const limite = Date.now() + timeoutMs;
  for (;;) {
    const resultado = await intentar();
    if (resultado) return resultado;
    if (Date.now() > limite) {
      throw new Error("Se agoto el tiempo esperando el resultado del job de matching.");
    }
    await new Promise((resolve) => setTimeout(resolve, pasoMs));
  }
}

/**
 * Aviso inicial de matching (docs/dominio.md §6, BullMQ). A diferencia de
 * pedidos-feed.e2e-spec.ts, aca si importa publicar via el endpoint real
 * (POST /pedidos): lo que se prueba es que publicar encola el job, y que el
 * worker (en el mismo proceso, contra Redis real) lo procesa y notifica.
 */
describe("Aviso inicial a profesionales coincidentes (job de BullMQ, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  let matching: MatchingService;
  let parametros: ParametrosService;
  let categoriaPlomeriaId: string;
  let barrioPalermoId: string;
  let cliente: Sesion;

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

  async function loginComoProfesional(telefono: string): Promise<Sesion> {
    const sesion = await loginBase(telefono);
    await request(app.getHttpServer())
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ rol: "profesional" })
      .expect(200);
    return sesion;
  }

  async function armarPerfilCoincidente(accessToken: string): Promise<void> {
    await request(app.getHttpServer())
      .patch("/perfil-profesional")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ presentacion: "Plomero de prueba" })
      .expect(200);
    await request(app.getHttpServer())
      .put("/perfil-profesional/oficios")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ oficios: [{ categoriaId: categoriaPlomeriaId, subcategorias: [] }] })
      .expect(200);
    await request(app.getHttpServer())
      .put("/perfil-profesional/zona")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ tipo: "barrios", barrioIds: [barrioPalermoId] })
      .expect(200);
  }

  /** Pedido insertado directo por Prisma, en la zona de Palermo usada por este archivo. */
  async function crearPedidoDirecto(clienteId: string): Promise<string> {
    const direccion = await prisma.direccion.create({
      data: {
        calle: "Direccion de prueba del matching",
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
        clienteId,
        categoriaId: categoriaPlomeriaId,
        descripcion: `Pedido de prueba del matching ${randomUUID()}`,
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
    pedidoIdsCreados.push(pedido.id);
    return pedido.id;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);
    matching = moduleRef.get(MatchingService);
    parametros = moduleRef.get(ParametrosService);

    const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "plomeria" } });
    categoriaPlomeriaId = categoria.id;
    const barrio = await prisma.barrio.findUniqueOrThrow({ where: { nombre: "Palermo" } });
    barrioPalermoId = barrio.id;

    // Compartido entre los `it` de este archivo (limite de 5 solicitudes de
    // OTP por IP y por minuto: ver LimiteSolicitudesGuard).
    cliente = await loginComoCliente(TEL_CLIENTE);
  }, 20_000);

  afterAll(async () => {
    const usuariosDePrueba = await prisma.usuario.findMany({
      where: { telefono: { startsWith: PREFIJO_TELEFONO } },
      select: { id: true },
    });
    const idsUsuarios = usuariosDePrueba.map((usuario) => usuario.id);

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

  it("al publicar un pedido, encola el aviso y el worker notifica solo a los profesionales aprobados que coinciden", async () => {
    const profesionalCoincide = await loginComoProfesional(TEL_PROFESIONAL_COINCIDE);
    await armarPerfilCoincidente(profesionalCoincide.accessToken);
    await prisma.perfilProfesional.update({
      where: { usuarioId: profesionalCoincide.usuarioId },
      data: { estadoVerificacion: "aprobada" },
    });

    // Mismo oficio y zona, pero verificacion todavia pendiente: docs/dominio.md
    // §6 exige verificacion aprobada para entrar al matching.
    const profesionalSinAprobar = await loginComoProfesional(TEL_PROFESIONAL_SIN_APROBAR);
    await armarPerfilCoincidente(profesionalSinAprobar.accessToken);

    const payload: CrearPedido = {
      categoriaId: categoriaPlomeriaId,
      descripcion: "Se rompio el caño de agua fria y hay que cambiarlo urgente",
      urgencia: "sin_apuro",
      franjas: ["manana"],
      direccion: {
        calle: "Av. de Prueba",
        numero: "123",
        tipoPropiedad: "casa",
        barrioId: barrioPalermoId,
        lat: -34.6,
        lng: -58.45,
      },
      borradorId: randomUUID(),
      fotos: [],
    };

    const respuestaCrear = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send(payload)
      .expect(201);
    expect(respuestaCrear.body.estado).toBe("publicado");
    const pedidoId = respuestaCrear.body.id as string;
    pedidoIdsCreados.push(pedidoId);
    const registro = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      select: { direccionId: true },
    });
    direccionIdsCreados.push(registro.direccionId);

    const notificacion = await esperarHasta(() =>
      prisma.notificacion.findFirst({
        where: {
          usuarioId: profesionalCoincide.usuarioId,
          tipo: "pedido_nuevo_coincide",
          objetoId: pedidoId,
        },
      }),
    );
    expect(notificacion).not.toBeNull();

    // Nunca deberia notificarse a un profesional sin verificacion aprobada,
    // ni aunque el job ya haya terminado de procesar (esperamos un instante
    // extra por si el worker todavia estuviera escribiendo esta segunda fila).
    await new Promise((resolve) => setTimeout(resolve, 500));
    const notificacionIndebida = await prisma.notificacion.findFirst({
      where: {
        usuarioId: profesionalSinAprobar.usuarioId,
        tipo: "pedido_nuevo_coincide",
        objetoId: pedidoId,
      },
    });
    expect(notificacionIndebida).toBeNull();
  }, 20_000);

  it("un pedido de emergencia amplia el radio de aviso a una zona tipo radio (docs/dominio.md §6, radio_aviso_emergencia_factor)", async () => {
    const RADIO_KM = 5;
    const centro = { lat: -34.6, lng: -58.45 };

    const profesionalRadio = await loginComoProfesional(TEL_PROFESIONAL_RADIO);
    await request(app.getHttpServer())
      .patch("/perfil-profesional")
      .set("Authorization", `Bearer ${profesionalRadio.accessToken}`)
      .send({ presentacion: "Plomero de radio de prueba" })
      .expect(200);
    await request(app.getHttpServer())
      .put("/perfil-profesional/oficios")
      .set("Authorization", `Bearer ${profesionalRadio.accessToken}`)
      .send({ oficios: [{ categoriaId: categoriaPlomeriaId, subcategorias: [] }] })
      .expect(200);
    await request(app.getHttpServer())
      .put("/perfil-profesional/zona")
      .set("Authorization", `Bearer ${profesionalRadio.accessToken}`)
      .send({ tipo: "radio", centroLat: centro.lat, centroLng: centro.lng, radioKm: RADIO_KM })
      .expect(200);
    await prisma.perfilProfesional.update({
      where: { usuarioId: profesionalRadio.usuarioId },
      data: { estadoVerificacion: "aprobada" },
    });

    // Punto a mitad de camino entre el radio normal y el radio ampliado
    // (radio_aviso_emergencia_factor, sembrado en 1.5): claramente fuera de
    // RADIO_KM y claramente dentro de RADIO_KM * factor, sin quedar cerca de
    // ninguno de los dos limites.
    const factorEmergencia = await parametros.getNumero("radio_aviso_emergencia_factor");
    const distanciaMetros = RADIO_KM * 1000 * ((1 + factorEmergencia) / 2);
    const puntoEntreRadios = await puntoADistancia(prisma, centro, distanciaMetros);

    async function crearPedidoDirecto(urgencia: "sin_apuro" | "emergencia"): Promise<string> {
      const direccion = await prisma.direccion.create({
        data: {
          calle: "Direccion de prueba del radio de emergencia",
          numero: "1",
          tipoPropiedad: "casa",
          barrioId: barrioPalermoId,
          lat: puntoEntreRadios.lat,
          lng: puntoEntreRadios.lng,
        },
      });
      direccionIdsCreados.push(direccion.id);

      const pedido = await prisma.pedido.create({
        data: {
          clienteId: cliente.usuarioId,
          categoriaId: categoriaPlomeriaId,
          descripcion: `Pedido de prueba del radio de emergencia ${randomUUID()}`,
          urgencia,
          franjas: ["manana"],
          direccionId: direccion.id,
          barrioId: barrioPalermoId,
          lat: puntoEntreRadios.lat,
          lng: puntoEntreRadios.lng,
          estado: "publicado",
          publicadoEn: new Date(),
          expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      pedidoIdsCreados.push(pedido.id);
      return pedido.id;
    }

    // Llamamos a MatchingService directo (sin pasar por la cola de BullMQ):
    // lo que importa aca es la consulta geoespacial real contra Postgres, ya
    // cubierto por el worker en el test anterior. Ir directo evita que un
    // test sobre geometria dependa ademas de la latencia del job.
    const pedidoSinApuroId = await crearPedidoDirecto("sin_apuro");
    const coincidentesSinApuro = await matching.buscarCoincidentes(pedidoSinApuroId);
    expect(coincidentesSinApuro).not.toContain(profesionalRadio.usuarioId);

    const pedidoEmergenciaId = await crearPedidoDirecto("emergencia");
    const coincidentesEmergencia = await matching.buscarCoincidentes(pedidoEmergenciaId);
    expect(coincidentesEmergencia).toContain(profesionalRadio.usuarioId);
  }, 20_000);

  it("no notifica al mismo usuario que publico el pedido, aunque tenga un perfil profesional coincidente (cuenta con los dos roles)", async () => {
    // Reutiliza la cuenta `cliente` (docs/dominio.md §2: un mismo usuario
    // puede tener perfil de cliente y de profesional).
    await armarPerfilCoincidente(cliente.accessToken);
    await prisma.perfilProfesional.update({
      where: { usuarioId: cliente.usuarioId },
      data: { estadoVerificacion: "aprobada" },
    });

    const pedidoId = await crearPedidoDirecto(cliente.usuarioId);
    const coincidentes = await matching.buscarCoincidentes(pedidoId);
    expect(coincidentes).not.toContain(cliente.usuarioId);
  });

  it("no notifica a un profesional suspendido, aunque cumpla el resto de los criterios de matching", async () => {
    const profesionalSuspendido = await loginComoProfesional(TEL_PROFESIONAL_SUSPENDIDO);
    await armarPerfilCoincidente(profesionalSuspendido.accessToken);
    await prisma.perfilProfesional.update({
      where: { usuarioId: profesionalSuspendido.usuarioId },
      data: { estadoVerificacion: "aprobada" },
    });
    await prisma.usuario.update({
      where: { id: profesionalSuspendido.usuarioId },
      data: { estado: "suspendido" },
    });

    const pedidoId = await crearPedidoDirecto(cliente.usuarioId);
    const coincidentes = await matching.buscarCoincidentes(pedidoId);
    expect(coincidentes).not.toContain(profesionalSuspendido.usuarioId);
  });
});
