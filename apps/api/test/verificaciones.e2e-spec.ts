import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";

const PREFIJO_TELEFONO = "+549110096";
const TEL_PROFESIONAL = `${PREFIJO_TELEFONO}001`;
const TEL_MODERADOR = `${PREFIJO_TELEFONO}002`;
const TEL_SOPORTE = `${PREFIJO_TELEFONO}003`;
const TEL_CLIENTE_SIN_PERFIL = `${PREFIJO_TELEFONO}004`;

// Mismo truco que auth-cuenta.e2e-spec.ts / pedidos.e2e-spec.ts: el mapa de
// codigos del driver `log` es privado solo a nivel de TypeScript.
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

/** Imagen valida minima para ejercitar sharp de verdad, sin depender de un fixture en disco. */
async function crearImagenDePrueba(): Promise<Buffer> {
  return sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 20, g: 20, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

interface OficioVistaTest {
  id: string;
  categoria: { id: string; slug: string };
  matriculaEstado: string;
}

describe("Verificaciones: armado de perfil, documentos y cola de moderacion (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  let categoriaGasId: string;
  let categoriaElectricidadId: string;
  let categoriaPlomeriaId: string;

  async function loginBase(telefono: string): Promise<{ accessToken: string; usuarioId: string }> {
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

  async function loginComoProfesional(
    telefono: string,
  ): Promise<{ accessToken: string; usuarioId: string }> {
    const sesion = await loginBase(telefono);
    await request(app.getHttpServer())
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ rol: "profesional" })
      .expect(200);
    return sesion;
  }

  async function loginComoCliente(
    telefono: string,
  ): Promise<{ accessToken: string; usuarioId: string }> {
    const sesion = await loginBase(telefono);
    await request(app.getHttpServer())
      .patch("/usuarios/yo/rol")
      .set("Authorization", `Bearer ${sesion.accessToken}`)
      .send({ rol: "cliente" })
      .expect(200);
    return sesion;
  }

  /**
   * Moderador y soporte son roles de sistema: el toggle publico de
   * usuarios/yo/rol nunca los permite (ROLES_ELEGIBLES_USUARIO), asi que la
   * unica forma de armar estos usuarios de prueba es pisando rolActivo
   * directo en la base, como haria un alta manual real.
   */
  async function loginComoRolDeSistema(
    telefono: string,
    rol: "moderador" | "soporte",
  ): Promise<{ accessToken: string; usuarioId: string }> {
    const sesion = await loginBase(telefono);
    await prisma.usuario.update({ where: { id: sesion.usuarioId }, data: { rolActivo: rol } });
    return sesion;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);

    const [gas, electricidad, plomeria] = await Promise.all([
      prisma.categoria.findUniqueOrThrow({ where: { slug: "gas" } }),
      prisma.categoria.findUniqueOrThrow({ where: { slug: "electricidad" } }),
      prisma.categoria.findUniqueOrThrow({ where: { slug: "plomeria" } }),
    ]);
    categoriaGasId = gas.id;
    categoriaElectricidadId = electricidad.id;
    categoriaPlomeriaId = plomeria.id;
  });

  afterAll(async () => {
    const usuariosDePrueba = await prisma.usuario.findMany({
      where: { telefono: { startsWith: PREFIJO_TELEFONO } },
      select: { id: true },
    });
    const idsUsuarios = usuariosDePrueba.map((usuario) => usuario.id);

    // acceso_documento.moderador_id es onDelete: Restrict: hay que borrar la
    // auditoria antes de poder borrar al moderador de prueba.
    await prisma.accesoDocumento.deleteMany({ where: { moderadorId: { in: idsUsuarios } } });
    // notificacion y evento_analitico no tienen FK hacia usuario a proposito
    // (tienen que sobrevivir al borrado de la cuenta): limpieza manual.
    await prisma.notificacion.deleteMany({ where: { usuarioId: { in: idsUsuarios } } });
    await prisma.eventoAnalitico.deleteMany({ where: { usuarioId: { in: idsUsuarios } } });
    // El resto (perfil_profesional, oficio_profesional, zona_cobertura,
    // verificacion, refresh_token) cascadea desde Usuario.
    await prisma.usuario.deleteMany({ where: { telefono: { startsWith: PREFIJO_TELEFONO } } });
    await app.close();
  });

  it("arma el perfil, sube documentos, y la cola de moderacion los resuelve respetando roles y concurrencia", async () => {
    const profesional = await loginComoProfesional(TEL_PROFESIONAL);

    // --- PR-01: datos basicos, oficios (con y sin matricula) y zona ---
    await request(app.getHttpServer())
      .patch("/perfil-profesional")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .send({ presentacion: "Gasista y electricista matriculado", aniosExperiencia: 8 })
      .expect(200);

    const respuestaOficios = await request(app.getHttpServer())
      .put("/perfil-profesional/oficios")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .send({
        oficios: [
          { categoriaId: categoriaGasId, subcategorias: [] },
          { categoriaId: categoriaElectricidadId, subcategorias: [] },
          { categoriaId: categoriaPlomeriaId, subcategorias: ["Destapaciones"] },
        ],
      })
      .expect(200);

    const oficios = respuestaOficios.body.oficios as OficioVistaTest[];
    const oficioGas = oficios.find((oficio) => oficio.categoria.slug === "gas");
    const oficioElectricidad = oficios.find((oficio) => oficio.categoria.slug === "electricidad");
    const oficioPlomeria = oficios.find((oficio) => oficio.categoria.slug === "plomeria");
    expect(oficioGas?.matriculaEstado).toBe("pendiente");
    expect(oficioElectricidad?.matriculaEstado).toBe("pendiente");
    expect(oficioPlomeria?.matriculaEstado).toBe("no_requerida");

    const respuestaZona = await request(app.getHttpServer())
      .put("/perfil-profesional/zona")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .send({ tipo: "radio", centroLat: -34.6, centroLng: -58.45, radioKm: 5 })
      .expect(200);
    expect(respuestaZona.body.zonaCobertura).toEqual({
      tipo: "radio",
      centroLat: -34.6,
      centroLng: -58.45,
      radioKm: 5,
    });

    // --- Documentos de verificacion: identidad + matricula de gas y electricidad ---
    const imagen = await crearImagenDePrueba();

    const respuestaIdentidad = await request(app.getHttpServer())
      .post("/verificaciones/documentos")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .field("tipo", "identidad")
      .attach("documento", imagen, { filename: "dni.jpg", contentType: "image/jpeg" })
      .expect(201);
    const verificacionIdentidadId = respuestaIdentidad.body.id as string;
    expect(respuestaIdentidad.body.estado).toBe("pendiente");

    const respuestaMatriculaGas = await request(app.getHttpServer())
      .post("/verificaciones/documentos")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .field("tipo", "matricula")
      .field("oficioId", oficioGas!.id)
      .field("matriculaNumero", "GAS-12345")
      .field("matriculaEnte", "ENARGAS")
      .field("matriculaVenceEn", "2030-01-01")
      .attach("documento", imagen, { filename: "matricula-gas.jpg", contentType: "image/jpeg" })
      .expect(201);
    const verificacionMatriculaGasId = respuestaMatriculaGas.body.id as string;

    const respuestaMatriculaElectricidad = await request(app.getHttpServer())
      .post("/verificaciones/documentos")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .field("tipo", "matricula")
      .field("oficioId", oficioElectricidad!.id)
      .field("matriculaNumero", "ELEC-999")
      .field("matriculaEnte", "Colegio de electricistas")
      .field("matriculaVenceEn", "2030-01-01")
      .attach("documento", imagen, {
        filename: "matricula-electricidad.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);
    const verificacionMatriculaElectricidadId = respuestaMatriculaElectricidad.body.id as string;

    // --- GET propio: pendiente en el perfil y en cada oficio que exige matricula ---
    const respuestaPropia = await request(app.getHttpServer())
      .get("/perfil-profesional")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .expect(200);
    expect(respuestaPropia.body.estadoVerificacion).toBe("pendiente");
    const oficiosPropios = respuestaPropia.body.oficios as OficioVistaTest[];
    expect(oficiosPropios.find((o) => o.categoria.slug === "gas")?.matriculaEstado).toBe(
      "pendiente",
    );
    expect(oficiosPropios.find((o) => o.categoria.slug === "electricidad")?.matriculaEstado).toBe(
      "pendiente",
    );
    expect(oficiosPropios.find((o) => o.categoria.slug === "plomeria")?.matriculaEstado).toBe(
      "no_requerida",
    );

    // --- Visibilidad de la cola: solo moderador/soporte pueden listar ---
    const moderador = await loginComoRolDeSistema(TEL_MODERADOR, "moderador");
    const soporte = await loginComoRolDeSistema(TEL_SOPORTE, "soporte");

    await request(app.getHttpServer())
      .get("/admin/verificaciones")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .expect(403);

    // Soporte ve la cola (es solo lectura en todo el back office), pero
    // nunca los documentos: docs/dominio.md §13, "URLs firmadas... solo
    // para moderadores". Ni se firma nada ni se audita un acceso que no
    // ocurrio (apps/api/CLAUDE.md "Archivos").
    const respuestaColaSoporte = await request(app.getHttpServer())
      .get("/admin/verificaciones")
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .expect(200);
    const idsEnColaSoporte = (
      respuestaColaSoporte.body.items as Array<{ id: string; documentos: string[] }>
    ).map((item) => item.id);
    expect(idsEnColaSoporte).toEqual(
      expect.arrayContaining([
        verificacionIdentidadId,
        verificacionMatriculaGasId,
        verificacionMatriculaElectricidadId,
      ]),
    );
    for (const item of respuestaColaSoporte.body.items as Array<{ documentos: string[] }>) {
      expect(item.documentos).toEqual([]);
    }
    const accesosDeSoporte = await prisma.accesoDocumento.findMany({
      where: { moderadorId: soporte.usuarioId },
    });
    expect(accesosDeSoporte).toHaveLength(0);

    // Moderador si recibe los documentos, ya resueltos a URLs firmadas
    // (driver log: prefijo /uploads-dev-privado/, carpeta privada que
    // nunca se sirve como estatica), nunca la key cruda que
    // Verificacion.documentos guarda en la base. Cada GET de la cola audita
    // el acceso: una fila por verificacion vista, con el id del moderador
    // que la vio.
    const respuestaCola = await request(app.getHttpServer())
      .get("/admin/verificaciones")
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .expect(200);

    const verificacionEnBase = await prisma.verificacion.findUniqueOrThrow({
      where: { id: verificacionIdentidadId },
    });
    const keyCruda = verificacionEnBase.documentos[0]!;
    const itemIdentidadEnCola = (
      respuestaCola.body.items as Array<{ id: string; documentos: string[] }>
    ).find((item) => item.id === verificacionIdentidadId)!;
    expect(itemIdentidadEnCola.documentos[0]).not.toBe(keyCruda);
    expect(itemIdentidadEnCola.documentos[0]).toContain(keyCruda);
    expect(itemIdentidadEnCola.documentos[0]?.startsWith("/uploads-dev-privado/")).toBe(true);

    const accesosDeModerador = await prisma.accesoDocumento.findMany({
      where: { moderadorId: moderador.usuarioId },
    });
    expect(accesosDeModerador.length).toBeGreaterThanOrEqual(3);
    const verificacionesAuditadas = new Set(accesosDeModerador.map((a) => a.verificacionId));
    expect(verificacionesAuditadas.has(verificacionIdentidadId)).toBe(true);

    // --- Resolver: solo moderador, nunca soporte ---
    await request(app.getHttpServer())
      .patch(`/admin/verificaciones/${verificacionIdentidadId}/resolver`)
      .set("Authorization", `Bearer ${soporte.accessToken}`)
      .send({ accion: "aprobar" })
      .expect(403);

    const respuestaAprobar = await request(app.getHttpServer())
      .patch(`/admin/verificaciones/${verificacionIdentidadId}/resolver`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ accion: "aprobar" })
      .expect(200);
    expect(respuestaAprobar.body.estado).toBe("aprobada");

    const perfilTrasAprobar = await prisma.perfilProfesional.findUniqueOrThrow({
      where: { usuarioId: profesional.usuarioId },
    });
    expect(perfilTrasAprobar.estadoVerificacion).toBe("aprobada");
    expect(perfilTrasAprobar.verificadoEn).not.toBeNull();

    const notificacionIdentidad = await prisma.notificacion.findFirst({
      where: {
        usuarioId: profesional.usuarioId,
        tipo: "verificacion_resuelta",
        objetoId: verificacionIdentidadId,
      },
    });
    expect(notificacionIdentidad).not.toBeNull();

    // D5/guarda de concurrencia: ya no esta pendiente, resolver de nuevo es 409.
    const respuestaSegundaResolucion = await request(app.getHttpServer())
      .patch(`/admin/verificaciones/${verificacionIdentidadId}/resolver`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({ accion: "aprobar" })
      .expect(409);
    expect(respuestaSegundaResolucion.body.codigo).toBe("conflicto");

    // --- Rechazar la matricula de gas, con motivo tipificado + detalle ---
    const respuestaRechazar = await request(app.getHttpServer())
      .patch(`/admin/verificaciones/${verificacionMatriculaGasId}/resolver`)
      .set("Authorization", `Bearer ${moderador.accessToken}`)
      .send({
        accion: "rechazar",
        motivo: "documento_vencido",
        detalle: "La foto de la matricula esta vencida, recarga una vigente",
      })
      .expect(200);
    expect(respuestaRechazar.body.estado).toBe("rechazada");
    expect(respuestaRechazar.body.motivoRechazo).toBe(
      "documento_vencido: La foto de la matricula esta vencida, recarga una vigente",
    );

    const oficioGasTrasRechazo = await prisma.oficioProfesional.findUniqueOrThrow({
      where: { id: oficioGas!.id },
    });
    expect(oficioGasTrasRechazo.matriculaEstado).toBe("rechazada");

    // GET propio: la verificacion de matricula rechazada trae su oficioId,
    // para que el frontend atribuya el motivo de rechazo al oficio correcto
    // (nunca a "el mas reciente", que se equivoca con 2+ oficios rechazados).
    const respuestaPropiaTrasRechazo = await request(app.getHttpServer())
      .get("/perfil-profesional")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .expect(200);
    const verificacionesPropias = respuestaPropiaTrasRechazo.body.verificaciones as Array<{
      id: string;
      oficioId: string | null;
      estado: string;
    }>;
    const verificacionMatriculaGasPropia = verificacionesPropias.find(
      (v) => v.id === verificacionMatriculaGasId,
    );
    expect(verificacionMatriculaGasPropia?.oficioId).toBe(oficioGas!.id);
    const verificacionIdentidadPropia = verificacionesPropias.find(
      (v) => v.id === verificacionIdentidadId,
    );
    expect(verificacionIdentidadPropia?.oficioId).toBeNull();

    const notificacionMatriculaGas = await prisma.notificacion.findFirst({
      where: {
        usuarioId: profesional.usuarioId,
        tipo: "verificacion_resuelta",
        objetoId: verificacionMatriculaGasId,
      },
    });
    expect(notificacionMatriculaGas).not.toBeNull();

    // --- Carrera: dos resoluciones concurrentes de la misma verificacion
    // (matricula de electricidad, todavia pendiente) solo dejan pasar una.
    const [respuestaA, respuestaB] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/admin/verificaciones/${verificacionMatriculaElectricidadId}/resolver`)
        .set("Authorization", `Bearer ${moderador.accessToken}`)
        .send({ accion: "aprobar" }),
      request(app.getHttpServer())
        .patch(`/admin/verificaciones/${verificacionMatriculaElectricidadId}/resolver`)
        .set("Authorization", `Bearer ${moderador.accessToken}`)
        .send({ accion: "aprobar" }),
    ]);
    const estados = [respuestaA.status, respuestaB.status].sort((a, b) => a - b);
    expect(estados).toEqual([200, 409]);

    const oficioElectricidadTrasCarrera = await prisma.oficioProfesional.findUniqueOrThrow({
      where: { id: oficioElectricidad!.id },
    });
    expect(oficioElectricidadTrasCarrera.matriculaEstado).toBe("validada");

    // --- Un cliente sin perfil profesional (rol activo cliente) recibe 404 ---
    const cliente = await loginComoCliente(TEL_CLIENTE_SIN_PERFIL);
    const respuestaClienteSinPerfil = await request(app.getHttpServer())
      .get("/perfil-profesional")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .expect(404);
    expect(respuestaClienteSinPerfil.body.codigo).toBe("no_encontrado");
  }, 30_000);
});
