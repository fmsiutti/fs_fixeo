import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";

const PREFIJO_TELEFONO = "+549110097";
const TEL_A = `${PREFIJO_TELEFONO}001`;
const TEL_B = `${PREFIJO_TELEFONO}002`;

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

// CO-05/CO-06 (docs/dominio.md §9). No ejercita el flujo real de suscripcion
// del navegador (PushManager): las suscripciones se insertan directo por
// Prisma, igual que otros e2e insertan datos de base que no dependen del
// endpoint bajo prueba (ver postulaciones.e2e-spec.ts, crearPedidoDirecto).
describe("Notificaciones: lista (CO-05) y suscripciones push (CO-06, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;

  let usuarioA: Sesion;
  let usuarioB: Sesion;

  const notificacionIdsCreados: string[] = [];

  async function loginComoCliente(telefono: string): Promise<Sesion> {
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
    return { accessToken, usuarioId: respuesta.body.usuario.id as string };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);

    usuarioA = await loginComoCliente(TEL_A);
    usuarioB = await loginComoCliente(TEL_B);
  });

  afterAll(async () => {
    await prisma.notificacion.deleteMany({ where: { id: { in: notificacionIdsCreados } } });
    await prisma.suscripcionPush.deleteMany({
      where: { usuarioId: { in: [usuarioA.usuarioId, usuarioB.usuarioId] } },
    });
    await prisma.usuario.deleteMany({ where: { telefono: { startsWith: PREFIJO_TELEFONO } } });
    await app.close();
  });

  it("GET /notificaciones/vapid-clave-publica responde sin Authorization", async () => {
    const respuesta = await request(app.getHttpServer())
      .get("/notificaciones/vapid-clave-publica")
      .expect(200);
    expect(typeof respuesta.body.clavePublica).toBe("string");
  });

  it("los endpoints con sesion exigen Authorization (401 sin token)", async () => {
    await request(app.getHttpServer()).get("/notificaciones").expect(401);
    await request(app.getHttpServer()).patch(`/notificaciones/${randomUUID()}/leida`).expect(401);
    await request(app.getHttpServer())
      .post("/notificaciones/push-suscripciones")
      .send({ endpoint: "https://push.example/x", keys: { p256dh: "p", auth: "a" } })
      .expect(401);
    await request(app.getHttpServer())
      .delete("/notificaciones/push-suscripciones")
      .send({ endpoint: "https://push.example/x" })
      .expect(401);
  });

  it("un usuario nunca puede listar ni marcar leida una notificacion de otro (404, no revela que existe)", async () => {
    const notificacionDeB = await prisma.notificacion.create({
      data: { usuarioId: usuarioB.usuarioId, tipo: "primera_postulacion", objetoId: randomUUID() },
    });
    notificacionIdsCreados.push(notificacionDeB.id);

    // A no la ve en su propio listado.
    const listaDeA = await request(app.getHttpServer())
      .get("/notificaciones")
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .expect(200);
    const idsDeA = (listaDeA.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(idsDeA).not.toContain(notificacionDeB.id);

    // A no puede marcarla leida: 404 uniforme, igual que si no existiera.
    const respuestaMarcar = await request(app.getHttpServer())
      .patch(`/notificaciones/${notificacionDeB.id}/leida`)
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .expect(404);
    expect(respuestaMarcar.body.codigo).toBe("no_encontrado");

    // Un id que directamente no existe da el mismo 404, con el mismo codigo.
    const respuestaInexistente = await request(app.getHttpServer())
      .patch(`/notificaciones/${randomUUID()}/leida`)
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .expect(404);
    expect(respuestaInexistente.body.codigo).toBe("no_encontrado");

    // La notificacion de B sigue sin leer: A nunca la toco de verdad.
    const notificacionSinTocar = await prisma.notificacion.findUniqueOrThrow({
      where: { id: notificacionDeB.id },
    });
    expect(notificacionSinTocar.leidaEn).toBeNull();

    // El dueño real si puede marcarla leida.
    await request(app.getHttpServer())
      .patch(`/notificaciones/${notificacionDeB.id}/leida`)
      .set("Authorization", `Bearer ${usuarioB.accessToken}`)
      .expect(204);
    const notificacionLeida = await prisma.notificacion.findUniqueOrThrow({
      where: { id: notificacionDeB.id },
    });
    expect(notificacionLeida.leidaEn).not.toBeNull();
  });

  // Fix 2 (a), revision de codigo del slice 10: `suscribirPushSchema` ahora
  // exige un host de la allowlist de proveedores de push reales (SSRF). Los
  // endpoints de prueba usan "fcm.googleapis.com" (formato real de Chrome/
  // Edge/Android) en vez de un host inventado.
  function endpointFcmDePrueba(): string {
    return `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
  }

  it("rechaza un endpoint que no es de un proveedor de push reconocido (SSRF)", async () => {
    const respuesta = await request(app.getHttpServer())
      .post("/notificaciones/push-suscripciones")
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .send({
        endpoint: "http://10.0.0.5:8080/webhook-interno",
        keys: { p256dh: "p", auth: "a" },
      })
      .expect(400);

    expect(respuesta.body.codigo).toBe("validacion");
  });

  it("suscribir con el mismo endpoint y las MISMAS claves reasigna la suscripcion (dispositivo compartido)", async () => {
    const endpointCompartido = endpointFcmDePrueba();

    await request(app.getHttpServer())
      .post("/notificaciones/push-suscripciones")
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .send({ endpoint: endpointCompartido, keys: { p256dh: "p256dh-igual", auth: "auth-igual" } })
      .expect(204);

    const suscripcionDeA = await prisma.suscripcionPush.findUniqueOrThrow({
      where: { endpoint: endpointCompartido },
    });
    expect(suscripcionDeA.usuarioId).toBe(usuarioA.usuarioId);

    // B se re-suscribe con el mismo endpoint y las mismas claves (mismo
    // dispositivo/navegador, login distinto): la fila pasa a ser de B, no
    // se duplica (Fix 3: mismas claves, no es robo de suscripcion).
    await request(app.getHttpServer())
      .post("/notificaciones/push-suscripciones")
      .set("Authorization", `Bearer ${usuarioB.accessToken}`)
      .send({ endpoint: endpointCompartido, keys: { p256dh: "p256dh-igual", auth: "auth-igual" } })
      .expect(204);

    const filasConEseEndpoint = await prisma.suscripcionPush.findMany({
      where: { endpoint: endpointCompartido },
    });
    expect(filasConEseEndpoint).toHaveLength(1);
    expect(filasConEseEndpoint[0]?.usuarioId).toBe(usuarioB.usuarioId);
  });

  // Fix 3, revision de codigo del slice 10: antes del fix, un endpoint
  // ajeno con claves inventadas reasignaba la suscripcion ("robo") dejando
  // al dueño real sin poder recibir push. Ahora, claves distintas dan
  // conflicto y la fila original no se toca.
  it("suscribir con un endpoint ajeno y claves DISTINTAS da conflicto y no roba la suscripcion", async () => {
    const endpointDeA = endpointFcmDePrueba();

    await request(app.getHttpServer())
      .post("/notificaciones/push-suscripciones")
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .send({ endpoint: endpointDeA, keys: { p256dh: "p256dh-a", auth: "auth-a" } })
      .expect(204);

    const respuestaConflicto = await request(app.getHttpServer())
      .post("/notificaciones/push-suscripciones")
      .set("Authorization", `Bearer ${usuarioB.accessToken}`)
      .send({ endpoint: endpointDeA, keys: { p256dh: "p256dh-inventada", auth: "auth-inventada" } })
      .expect(409);
    expect(respuestaConflicto.body.codigo).toBe("conflicto");

    const suscripcionSigueDeA = await prisma.suscripcionPush.findUniqueOrThrow({
      where: { endpoint: endpointDeA },
    });
    expect(suscripcionSigueDeA.usuarioId).toBe(usuarioA.usuarioId);
    expect(suscripcionSigueDeA.p256dh).toBe("p256dh-a");
  });

  it("desuscribir un endpoint ajeno no borra nada (la suscripcion del dueño real sigue viva)", async () => {
    const endpointDeA = `https://push.example/solo-a-${randomUUID()}`;
    await prisma.suscripcionPush.create({
      data: {
        usuarioId: usuarioA.usuarioId,
        endpoint: endpointDeA,
        p256dh: "p256dh-a",
        auth: "auth-a",
      },
    });

    // B intenta desuscribir el endpoint de A: la ruta esta scopeada por
    // usuarioId + endpoint, asi que no encuentra nada que borrar.
    await request(app.getHttpServer())
      .delete("/notificaciones/push-suscripciones")
      .set("Authorization", `Bearer ${usuarioB.accessToken}`)
      .send({ endpoint: endpointDeA })
      .expect(204);

    const suscripcionSigueViva = await prisma.suscripcionPush.findUnique({
      where: { endpoint: endpointDeA },
    });
    expect(suscripcionSigueViva).not.toBeNull();
    expect(suscripcionSigueViva?.usuarioId).toBe(usuarioA.usuarioId);

    // El dueño real si puede desuscribirse.
    await request(app.getHttpServer())
      .delete("/notificaciones/push-suscripciones")
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .send({ endpoint: endpointDeA })
      .expect(204);
    expect(
      await prisma.suscripcionPush.findUnique({ where: { endpoint: endpointDeA } }),
    ).toBeNull();
  });

  it("lista pagina por cursor: paginaMaxima+1 se corta y trae cursor no nulo", async () => {
    const tipo = `tipo_de_prueba_${randomUUID()}`;
    const creadas = [];
    for (let i = 0; i < 21; i += 1) {
      creadas.push(
        await prisma.notificacion.create({
          data: { usuarioId: usuarioA.usuarioId, tipo, objetoId: randomUUID() },
        }),
      );
    }
    notificacionIdsCreados.push(...creadas.map((n) => n.id));

    const primeraPagina = await request(app.getHttpServer())
      .get("/notificaciones")
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .expect(200);
    expect(primeraPagina.body.items).toHaveLength(20);
    expect(primeraPagina.body.cursor).not.toBeNull();

    const segundaPagina = await request(app.getHttpServer())
      .get("/notificaciones")
      .query({ cursor: primeraPagina.body.cursor as string })
      .set("Authorization", `Bearer ${usuarioA.accessToken}`)
      .expect(200);
    const idsPrimera = (primeraPagina.body.items as Array<{ id: string }>).map((i) => i.id);
    const idsSegunda = (segundaPagina.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(idsPrimera.some((id) => idsSegunda.includes(id))).toBe(false);
  });
});
