import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { CrearPedido } from "@fixeo/shared";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";

const PREFIJO_TELEFONO = "+549110094";
const TEL_CLIENTE = `${PREFIJO_TELEFONO}001`;

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

describe("Denuncias (PR-03: canal de denuncia sobre un pedido, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  let categoriaPlomeriaId: string;
  let barrioPalermoId: string;

  const pedidoIdsCreados: string[] = [];
  const direccionIdsCreados: string[] = [];

  async function loginComoCliente(telefono: string): Promise<{ accessToken: string }> {
    await request(app.getHttpServer())
      .post("/auth/otp/solicitar")
      .send({ telefono, canal: "sms" })
      .expect(204);
    const codigo = leerCodigoOtp(driverOtp, telefono);
    const respuesta = await request(app.getHttpServer())
      .post("/auth/otp/confirmar")
      .send({ telefono, codigo })
      .expect(200);
    const accessToken = respuesta.body.accessToken as string;
    await request(app.getHttpServer())
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ rol: "cliente" })
      .expect(200);
    return { accessToken };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);

    const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: "plomeria" } });
    categoriaPlomeriaId = categoria.id;
    const barrio = await prisma.barrio.findUniqueOrThrow({ where: { nombre: "Palermo" } });
    barrioPalermoId = barrio.id;
  });

  afterAll(async () => {
    const usuariosDePrueba = await prisma.usuario.findMany({
      where: { telefono: { startsWith: PREFIJO_TELEFONO } },
      select: { id: true },
    });
    const idsUsuarios = usuariosDePrueba.map((usuario) => usuario.id);

    await prisma.denuncia.deleteMany({ where: { reportanteId: { in: idsUsuarios } } });
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

  it("rechaza sin token", async () => {
    await request(app.getHttpServer())
      .post("/denuncias")
      .send({ tipoObjeto: "pedido", objetoId: randomUUID(), motivo: "Contenido inadecuado" })
      .expect(401);
  });

  it("crea la denuncia de un pedido existente, y rechaza un pedido inexistente", async () => {
    const cliente = await loginComoCliente(TEL_CLIENTE);

    const payload: CrearPedido = {
      categoriaId: categoriaPlomeriaId,
      descripcion: "Necesito arreglar una perdida de agua en el bano principal",
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
    const respuestaPedido = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send(payload)
      .expect(201);
    const pedidoId = respuestaPedido.body.id as string;
    pedidoIdsCreados.push(pedidoId);
    const registro = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      select: { direccionId: true },
    });
    direccionIdsCreados.push(registro.direccionId);

    const respuestaDenuncia = await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send({
        tipoObjeto: "pedido",
        objetoId: pedidoId,
        motivo: "Datos de contacto en la descripcion",
        detalle: "El texto menciona un telefono",
      })
      .expect(201);
    expect(typeof respuestaDenuncia.body.id).toBe("string");

    const denunciaGuardada = await prisma.denuncia.findUniqueOrThrow({
      where: { id: respuestaDenuncia.body.id as string },
    });
    expect(denunciaGuardada.estado).toBe("pendiente");
    expect(denunciaGuardada.objetoId).toBe(pedidoId);
    expect(denunciaGuardada.reportanteId).toBe(
      (await prisma.usuario.findUniqueOrThrow({ where: { telefono: TEL_CLIENTE } })).id,
    );

    // Revision de codigo del slice 5: el mismo reportante denunciando el
    // mismo objeto dos veces no crea una segunda fila, devuelve el mismo id.
    const respuestaDenunciaDuplicada = await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send({
        tipoObjeto: "pedido",
        objetoId: pedidoId,
        motivo: "Motivo distinto, mismo objeto",
      })
      .expect(201);
    expect(respuestaDenunciaDuplicada.body.id).toBe(respuestaDenuncia.body.id);
    expect(await prisma.denuncia.count({ where: { objetoId: pedidoId } })).toBe(1);

    const respuestaPedidoInexistente = await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send({ tipoObjeto: "pedido", objetoId: randomUUID(), motivo: "Contenido inadecuado" })
      .expect(404);
    expect(respuestaPedidoInexistente.body.codigo).toBe("no_encontrado");
  });

  it("rechaza tipoObjeto 'resenia' (todavia no tiene pantalla, slice 8)", async () => {
    const cliente = await loginComoCliente(`${PREFIJO_TELEFONO}010`);

    const respuesta = await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send({ tipoObjeto: "resenia", objetoId: randomUUID(), motivo: "Contenido inadecuado" })
      .expect(400);
    expect(respuesta.body.codigo).toBe("validacion");
  });

  // Slice 6: CL-09 y PR-05/CL-08 desbloquean "perfil" y "postulacion" (antes
  // rechazados sin importar si el objeto existia).
  it("rechaza 'perfil' y 'postulacion' inexistentes con 404, no con 400 generico", async () => {
    const cliente = await loginComoCliente(`${PREFIJO_TELEFONO}012`);

    const respuestaPerfil = await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send({ tipoObjeto: "perfil", objetoId: randomUUID(), motivo: "Contenido inadecuado" })
      .expect(404);
    expect(respuestaPerfil.body.codigo).toBe("no_encontrado");

    const respuestaPostulacion = await request(app.getHttpServer())
      .post("/denuncias")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .send({ tipoObjeto: "postulacion", objetoId: randomUUID(), motivo: "Contenido inadecuado" })
      .expect(404);
    expect(respuestaPostulacion.body.codigo).toBe("no_encontrado");
  });

  it("limita la cantidad de denuncias por unidad de tiempo (revision de codigo del slice 5)", async () => {
    const cliente = await loginComoCliente(`${PREFIJO_TELEFONO}011`);

    const respuestas = [];
    // El limite configurado es 10 por hora; 12 intentos garantizan pasarlo
    // sin depender de cuantas llamadas previas ya hizo esta suite al mismo
    // endpoint (el contador es por IP, compartido dentro de este archivo).
    for (let intento = 0; intento < 12; intento += 1) {
      respuestas.push(
        await request(app.getHttpServer())
          .post("/denuncias")
          .set("Authorization", `Bearer ${cliente.accessToken}`)
          .send({ tipoObjeto: "pedido", objetoId: randomUUID(), motivo: `Motivo ${intento}` }),
      );
    }

    expect(respuestas.some((respuesta) => respuesta.status === 429)).toBe(true);
  });
});
