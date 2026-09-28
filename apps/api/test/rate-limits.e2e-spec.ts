import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";

const PREFIJO_TELEFONO = "+549110095";

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

/**
 * LimiteSolicitudesGuard (apps/api/src/common/guards/limite-solicitudes.guard.ts)
 * corre antes que la validacion zod del body (los Guards de Nest siempre
 * corren antes que los Pipes): alcanza con pegarle al endpoint con un body
 * invalido/minimo para gastar el cupo, sin tener que armar un pedido o una
 * postulacion validos en cada intento.
 */
async function loginBase(
  app: INestApplication,
  driverOtp: TwilioLogDriver,
  telefono: string,
): Promise<string> {
  await request(app.getHttpServer())
    .post("/auth/otp/solicitar")
    .send({ telefono, canal: "sms" })
    .expect(204);
  const codigo = leerCodigoOtp(driverOtp, telefono);
  const respuesta = await request(app.getHttpServer())
    .post("/auth/otp/confirmar")
    .send({ telefono, codigo })
    .expect(200);
  return respuesta.body.accessToken as string;
}

async function loginComoCliente(
  app: INestApplication,
  driverOtp: TwilioLogDriver,
  telefono: string,
): Promise<string> {
  const accessToken = await loginBase(app, driverOtp, telefono);
  await request(app.getHttpServer())
    .patch("/usuarios/yo/rol")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ rol: "cliente" })
    .expect(200);
  return accessToken;
}

async function loginComoProfesional(
  app: INestApplication,
  driverOtp: TwilioLogDriver,
  telefono: string,
): Promise<string> {
  const accessToken = await loginBase(app, driverOtp, telefono);
  await request(app.getHttpServer())
    .patch("/usuarios/yo/rol")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ rol: "profesional" })
    .expect(200);
  return accessToken;
}

describe("Limite de solicitudes: POST /pedidos (crear, 10/hora, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  const telefono = `${PREFIJO_TELEFONO}001`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { telefono } });
    await app.close();
  });

  it("deja pasar los primeros 10 intentos por hora y corta el 11avo con 429/limite_excedido", async () => {
    const accessToken = await loginComoCliente(app, driverOtp, telefono);

    const estados: number[] = [];
    for (let intento = 0; intento < 11; intento += 1) {
       
      const respuesta = await request(app.getHttpServer())
        .post("/pedidos")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({}); // body invalido a proposito: el guard corre antes del Pipe de validacion.
      estados.push(respuesta.status);
      if (respuesta.status === 429) {
        expect(respuesta.body.codigo).toBe("limite_excedido");
      }
    }

    expect(estados.slice(0, 10).every((status) => status !== 429)).toBe(true);
    expect(estados[10]).toBe(429);
  }, 20_000);
});

describe("Limite de solicitudes: POST /postulaciones (crear, 20/hora, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  const telefono = `${PREFIJO_TELEFONO}002`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { telefono } });
    await app.close();
  });

  it("deja pasar los primeros 20 intentos por hora y corta el 21avo con 429/limite_excedido", async () => {
    const accessToken = await loginComoProfesional(app, driverOtp, telefono);

    const estados: number[] = [];
    for (let intento = 0; intento < 21; intento += 1) {
       
      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({}); // body invalido a proposito, ver comentario del describe anterior.
      estados.push(respuesta.status);
      if (respuesta.status === 429) {
        expect(respuesta.body.codigo).toBe("limite_excedido");
      }
    }

    expect(estados.slice(0, 20).every((status) => status !== 429)).toBe(true);
    expect(estados[20]).toBe(429);
  }, 30_000);
});

describe("Limite de solicitudes: cupos independientes entre controllers (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  const telefonoCliente = `${PREFIJO_TELEFONO}003`;
  const telefonoProfesional = `${PREFIJO_TELEFONO}004`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { telefono: { in: [telefonoCliente, telefonoProfesional] } },
    });
    await app.close();
  });

  /**
   * Sospecha de bug (investigada durante el slice 10, test-writer) que
   * resultó no serlo: PedidosController.crear y PostulacionesController.crear
   * arman la MISMA clave de contador en LimiteSolicitudesGuard
   * (`context.getHandler().name` es literalmente "crear" en los dos, ver
   * apps/api/src/common/guards/limite-solicitudes.guard.ts linea 43), lo que
   * sugeriria que comparten cupo entre endpoints distintos.
   *
   * Se verificó instanciando el guard con un id aleatorio por constructor y
   * logueándolo en cada `canActivate`: Nest resuelve una instancia de
   * `LimiteSolicitudesGuard` distinta por controller cuando el guard se
   * referencia como clase suelta en `@UseGuards()` (no está registrado como
   * provider en ningún módulo), así que cada controller tiene su propio
   * `Map` en memoria pese a la clave idéntica. Este test protege ese
   * comportamiento: si el día de mañana alguien registra
   * `LimiteSolicitudesGuard` como provider compartido (por ejemplo en un
   * `CommonModule` para inyectarlo en otro lado), Nest empezaría a reusar una
   * sola instancia y este test se rompería, señalando que hace falta
   * calificar la clave con el controller (`context.getClass().name`).
   */
  it("agotar el cupo de POST /pedidos no consume el cupo de POST /postulaciones, aunque ambos usen el nombre de metodo 'crear'", async () => {
    const clienteToken = await loginComoCliente(app, driverOtp, telefonoCliente);
    const profesionalToken = await loginComoProfesional(app, driverOtp, telefonoProfesional);

    // Agota el cupo de pedidos.crear (10/hora) para esta IP.
    for (let intento = 0; intento < 10; intento += 1) {
       
      await request(app.getHttpServer())
        .post("/pedidos")
        .set("Authorization", `Bearer ${clienteToken}`)
        .send({});
    }

    // postulaciones.crear tiene su propio limite configurado en 20/hora: un
    // profesional que todavia no uso ninguno de sus 20 intentos deberia
    // poder hacer las 20 solicitudes sin ver un 429.
    const estados: number[] = [];
    for (let intento = 0; intento < 20; intento += 1) {
       
      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesionalToken}`)
        .send({});
      estados.push(respuesta.status);
    }

    expect(estados.every((status) => status !== 429)).toBe(true);
  }, 30_000);
});
