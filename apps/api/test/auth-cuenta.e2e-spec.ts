import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";

const PREFIJO_TELEFONO = "+549110099";
const TELEFONO = `${PREFIJO_TELEFONO}0001`;

/**
 * El mapa de codigos del driver `log` es `private` solo a nivel de TypeScript
 * (se borra al compilar): lo leemos directo desde la instancia resuelta por el
 * TestingModule, en vez de parsear el mensaje de log.
 */
interface DriverConMapaInterno {
  codigos: Map<string, { codigo: string; expiraEn: number }>;
}

function leerCodigoOtp(driver: TwilioLogDriver, telefono: string): string {
  const interno = driver as unknown as DriverConMapaInterno;
  const guardado = interno.codigos.get(telefono);
  if (!guardado) {
    throw new Error(
      `No se genero un codigo otp para ${telefono}. ¿Se llamo a POST /auth/otp/solicitar antes?`,
    );
  }
  return guardado.codigo;
}

describe("Auth y cuenta: flujo completo (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // El parseo de cookies y la validacion zod ya se registran adentro de
    // AppModule (cookieParser como middleware, ZodValidationPipe como
    // APP_PIPE), asi que cualquier bootstrap de AppModule los tiene gratis.
    await app.init();

    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { telefono: { startsWith: PREFIJO_TELEFONO } } });
    await app.close();
  });

  it("registra por otp, gestiona rol y datos, refresca, cierra sesion, elimina y libera el telefono", async () => {
    const agente = request.agent(app.getHttpServer());

    await agente.post("/auth/otp/solicitar").send({ telefono: TELEFONO, canal: "sms" }).expect(204);

    const codigo = leerCodigoOtp(driverOtp, TELEFONO);
    const respuestaConfirmar = await agente
      .post("/auth/otp/confirmar")
      .send({ telefono: TELEFONO, codigo })
      .expect(200);

    expect(respuestaConfirmar.body.usuario.rolActivo).toBeNull();
    expect(respuestaConfirmar.body.usuario.telefono).toBe(TELEFONO);
    expect(respuestaConfirmar.headers["set-cookie"]).toBeDefined();
    const accessToken = respuestaConfirmar.body.accessToken as string;
    const idUsuarioOriginal = respuestaConfirmar.body.usuario.id as string;
    const cookieRefreshOriginal = respuestaConfirmar.headers["set-cookie"] as unknown as string[];

    const respuestaYo = await agente
      .get("/usuarios/yo")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(respuestaYo.body.id).toBe(idUsuarioOriginal);
    expect(respuestaYo.body.rolActivo).toBeNull();

    // El toggle de rol solo acepta cliente/profesional: la restriccion vive en
    // el schema zod del borde (ROLES_ELEGIBLES_USUARIO), no en el service.
    // El FiltroErrores global tiene que traducir el 400 de zod al contrato
    // { codigo, mensaje } de errorApiSchema, no al shape crudo de nestjs-zod.
    const respuestaRolInvalido = await agente
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ rol: "moderador" })
      .expect(400);
    expect(respuestaRolInvalido.body.codigo).toBe("validacion");
    expect(typeof respuestaRolInvalido.body.mensaje).toBe("string");

    const respuestaRol = await agente
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ rol: "cliente" })
      .expect(200);
    expect(respuestaRol.body.rolActivo).toBe("cliente");

    const respuestaDatos = await agente
      .patch("/usuarios/yo")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ nombre: "Ana", apellido: "Gomez", email: "ana@example.com" })
      .expect(200);
    expect(respuestaDatos.body.nombre).toBe("Ana");
    expect(respuestaDatos.body.apellido).toBe("Gomez");
    expect(respuestaDatos.body.email).toBe("ana@example.com");

    // Un campo vaciado ("") tiene que borrarse de verdad (null), no quedar
    // como estaba: un "" que Prisma tratara como undefined haria que la
    // respuesta pareciera exitosa sin cambiar nada en la base.
    const respuestaEmailBorrado = await agente
      .patch("/usuarios/yo")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email: "" })
      .expect(200);
    expect(respuestaEmailBorrado.body.email).toBeNull();
    expect(respuestaEmailBorrado.body.nombre).toBe("Ana");

    const respuestaTrasBorrar = await agente
      .get("/usuarios/yo")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(respuestaTrasBorrar.body.email).toBeNull();

    const respuestaRefresh = await agente.post("/auth/refresh").expect(200);
    const accessTokenNuevo = respuestaRefresh.body.accessToken as string;
    expect(accessTokenNuevo).not.toBe(accessToken);
    expect(respuestaRefresh.body.usuario.id).toBe(idUsuarioOriginal);

    // La regla de seguridad central de la rotacion: el refresh token viejo
    // (el que uso el request anterior) ya no sirve, aunque el agente ahora
    // tenga en su jar la cookie nueva. Lo reenviamos a mano.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", cookieRefreshOriginal)
      .expect(401);

    await agente.post("/auth/logout").expect(204);

    // La sesion quedo cerrada: el refresh ya no funciona (la cookie se limpio).
    await agente.post("/auth/refresh").expect(401);

    // Login nuevo (la sesion anterior no sirve mas) para poder eliminar la cuenta.
    await agente.post("/auth/otp/solicitar").send({ telefono: TELEFONO, canal: "sms" }).expect(204);
    const segundoCodigo = leerCodigoOtp(driverOtp, TELEFONO);
    const respuestaSegundoLogin = await agente
      .post("/auth/otp/confirmar")
      .send({ telefono: TELEFONO, codigo: segundoCodigo })
      .expect(200);
    expect(respuestaSegundoLogin.body.usuario.id).toBe(idUsuarioOriginal);
    // El rol elegido antes se conserva: sigue siendo el mismo usuario, no uno duplicado.
    expect(respuestaSegundoLogin.body.usuario.rolActivo).toBe("cliente");
    const accessTokenSegundoLogin = respuestaSegundoLogin.body.accessToken as string;

    await agente
      .delete("/usuarios/yo")
      .set("Authorization", `Bearer ${accessTokenSegundoLogin}`)
      .expect(204);

    // El telefono original quedo libre (se anonimizo en la baja logica): se
    // puede volver a pedir otp y registrarse de cero con el mismo numero.
    await agente.post("/auth/otp/solicitar").send({ telefono: TELEFONO, canal: "sms" }).expect(204);
    const codigoTrasEliminar = leerCodigoOtp(driverOtp, TELEFONO);
    const respuestaRegistroNuevo = await agente
      .post("/auth/otp/confirmar")
      .send({ telefono: TELEFONO, codigo: codigoTrasEliminar })
      .expect(200);

    expect(respuestaRegistroNuevo.body.usuario.id).not.toBe(idUsuarioOriginal);
    expect(respuestaRegistroNuevo.body.usuario.rolActivo).toBeNull();
    expect(respuestaRegistroNuevo.body.usuario.telefono).toBe(TELEFONO);
  });

  it("rechaza el acceso a /usuarios/yo sin token", async () => {
    await request(app.getHttpServer()).get("/usuarios/yo").expect(401);
  });
});
