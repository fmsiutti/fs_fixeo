import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import type { CrearPedido } from "@fixeo/shared";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";

const PREFIJO_TELEFONO = "+549110098";
const TELEFONO_FLUJO = `${PREFIJO_TELEFONO}001`;
const TELEFONO_REVISION = `${PREFIJO_TELEFONO}002`;
const TELEFONO_RACE = `${PREFIJO_TELEFONO}003`;

// Mismo truco que auth-cuenta.e2e-spec.ts: el mapa de codigos del driver
// `log` es privado solo a nivel de TypeScript.
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
    create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

describe("Pedidos: publicar, listar, ver, cancelar (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  let categoriaPlomeriaId: string;
  let barrioId: string;

  // Cleanup por id (pedidos/direcciones), no por prefijo: no hay un campo de
  // texto libre bueno para prefijar en esas tablas.
  const pedidoIdsCreados: string[] = [];
  const direccionIdsCreados: string[] = [];

  async function loginComoCliente(telefono: string): Promise<string> {
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
    return accessToken;
  }

  function direccionPayload(overrides: Partial<CrearPedido["direccion"]> = {}) {
    return {
      calle: "Av. de Prueba",
      numero: "123",
      tipoPropiedad: "casa" as const,
      barrioId,
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

  /** Registra el pedido creado para poder limpiarlo (pedido + su direccion) en afterAll. */
  async function registrarParaLimpieza(pedidoId: string): Promise<void> {
    pedidoIdsCreados.push(pedidoId);
    const registro = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      select: { direccionId: true },
    });
    direccionIdsCreados.push(registro.direccionId);
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
    barrioId = barrio.id;
  });

  afterAll(async () => {
    // evento_analitico no tiene FK hacia Usuario ni Pedido a proposito (tiene
    // que sobrevivir al borrado de la cuenta): la limpieza es manual, por id.
    const usuariosDePrueba = await prisma.usuario.findMany({
      where: { telefono: { startsWith: PREFIJO_TELEFONO } },
      select: { id: true },
    });
    await prisma.eventoAnalitico.deleteMany({
      where: {
        OR: [
          { pedidoId: { in: pedidoIdsCreados } },
          { usuarioId: { in: usuariosDePrueba.map((usuario) => usuario.id) } },
        ],
      },
    });
    // Los pedidos primero: Direccion tiene onDelete: Restrict mientras un
    // Pedido la referencia.
    await prisma.pedido.deleteMany({ where: { id: { in: pedidoIdsCreados } } });
    await prisma.direccion.deleteMany({ where: { id: { in: direccionIdsCreados } } });
    await prisma.usuario.deleteMany({ where: { telefono: { startsWith: PREFIJO_TELEFONO } } });
    await app.close();
  });

  it("rechaza sin token", async () => {
    await request(app.getHttpServer()).get("/pedidos").expect(401);
    await request(app.getHttpServer()).post("/pedidos").send(pedidoPayload()).expect(401);
  });

  it("publica un pedido con foto subida anonimamente, lo lista, lo muestra y lo cancela", async () => {
    const accessToken = await loginComoCliente(TELEFONO_FLUJO);
    const borradorId = randomUUID();
    const imagen = await crearImagenDePrueba();

    // La subida de fotos del asistente es publica: no lleva Authorization.
    const respuestaFoto = await request(app.getHttpServer())
      .post("/pedidos/borrador/fotos")
      .field("borradorId", borradorId)
      .attach("foto", imagen, { filename: "foto.jpg", contentType: "image/jpeg" })
      .expect(201);
    expect(typeof respuestaFoto.body.id).toBe("string");
    expect(typeof respuestaFoto.body.url).toBe("string");

    const respuestaCrear = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        pedidoPayload({
          borradorId,
          // Solo el id: la url la recalcula el backend a partir de
          // borradorId+id y confirma contra el storage que existe de verdad
          // (ver el bloqueante de seguridad que esto corrige).
          fotos: [{ id: respuestaFoto.body.id }],
        }),
      )
      .expect(201);

    expect(respuestaCrear.body.estado).toBe("publicado");
    expect(respuestaCrear.body.publicadoEn).not.toBeNull();
    expect(respuestaCrear.body.expiraEn).not.toBeNull();
    expect(respuestaCrear.body.fotos).toHaveLength(1);

    // docs/dominio.md §10: el evento se registra en el mismo cambio que la accion.
    const eventoPublicado = await prisma.eventoAnalitico.findFirst({
      where: { tipo: "pedido_publicado", pedidoId: respuestaCrear.body.id as string },
    });
    expect(eventoPublicado).not.toBeNull();
    expect(eventoPublicado?.categoria).toBe("plomeria");
    expect(eventoPublicado?.zona).toBe("Palermo");

    // Misma url que devolvio la subida: la calcula el mismo `urlPara` de
    // forma deterministica a partir de borradorId+id, no la manda el cliente.
    expect(respuestaCrear.body.fotos[0].url).toBe(respuestaFoto.body.url);
    const pedidoId = respuestaCrear.body.id as string;
    await registrarParaLimpieza(pedidoId);

    const respuestaListado = await request(app.getHttpServer())
      .get("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(respuestaListado.body.some((pedido: { id: string }) => pedido.id === pedidoId)).toBe(
      true,
    );

    const respuestaDetalle = await request(app.getHttpServer())
      .get(`/pedidos/${pedidoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(respuestaDetalle.body.id).toBe(pedidoId);
    expect(respuestaDetalle.body.barrio.nombre).toBe("Palermo");

    // docs/dominio.md §3: se edita hasta la primera postulacion; este pedido
    // todavia no tiene ninguna.
    const respuestaEditar = await request(app.getHttpServer())
      .patch(`/pedidos/${pedidoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        descripcion: "Descripcion editada: ahora tambien pierde agua el lavarropas",
        urgencia: "emergencia",
        franjas: ["tarde"],
      })
      .expect(200);
    expect(respuestaEditar.body.descripcion).toBe(
      "Descripcion editada: ahora tambien pierde agua el lavarropas",
    );
    expect(respuestaEditar.body.urgencia).toBe("emergencia");
    expect(respuestaEditar.body.franjas).toEqual(["tarde"]);

    // No se rechaza silenciosamente: si la edicion tiene un dato de contacto
    // el cliente lo corrige al toque, no se manda a en_revision.
    const respuestaEditarConContacto = await request(app.getHttpServer())
      .patch(`/pedidos/${pedidoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        descripcion: "Llamame al 11 4444 5555 para coordinar, gracias",
        urgencia: "emergencia",
        franjas: ["tarde"],
      })
      .expect(400);
    expect(respuestaEditarConContacto.body.codigo).toBe("validacion");

    const respuestaCancelar = await request(app.getHttpServer())
      .patch(`/pedidos/${pedidoId}/cancelar`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(respuestaCancelar.body.estado).toBe("cancelado");

    // Cancelado deja de ser "activo": no aparece mas en el listado de propios.
    const respuestaListadoTrasCancelar = await request(app.getHttpServer())
      .get("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(
      respuestaListadoTrasCancelar.body.some((pedido: { id: string }) => pedido.id === pedidoId),
    ).toBe(false);

    // D5: ya esta cancelado, no hay transicion cancelado -> cancelado.
    const respuestaSegundaCancelacion = await request(app.getHttpServer())
      .patch(`/pedidos/${pedidoId}/cancelar`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(409);
    expect(respuestaSegundaCancelacion.body.codigo).toBe("conflicto");
  }, 20_000);

  it("rechaza publicar con un id de foto inventado (nunca subido) en vez de crearla igual", async () => {
    const accessToken = await loginComoCliente(`${PREFIJO_TELEFONO}004`);

    const respuesta = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(pedidoPayload({ fotos: [{ id: randomUUID() }] }))
      .expect(400);

    expect(respuesta.body.codigo).toBe("validacion");
  });

  // Los dos casos (fotos repetidas, borrado de foto ya publicada) comparten
  // un solo test y un solo login: `/auth/otp/solicitar` limita a 5 por IP
  // por minuto (`LimiteSolicitudesGuard`, en memoria, por archivo de test) y
  // este archivo ya usa el resto del cupo con los demas casos, sin margen.
  it("rechaza fotos repetidas y no permite borrar la foto de un pedido ya publicado", async () => {
    const accessToken = await loginComoCliente(`${PREFIJO_TELEFONO}005`);
    const borradorId = randomUUID();
    const imagen = await crearImagenDePrueba();

    const respuestaFoto = await request(app.getHttpServer())
      .post("/pedidos/borrador/fotos")
      .field("borradorId", borradorId)
      .attach("foto", imagen, { filename: "foto.jpg", contentType: "image/jpeg" })
      .expect(201);
    const fotoId = respuestaFoto.body.id as string;

    const respuestaRepetida = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(pedidoPayload({ borradorId, fotos: [{ id: fotoId }, { id: fotoId }] }))
      .expect(400);
    expect(respuestaRepetida.body.codigo).toBe("validacion");

    const respuestaCrear = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(pedidoPayload({ borradorId, fotos: [{ id: fotoId }] }))
      .expect(201);
    await registrarParaLimpieza(respuestaCrear.body.id as string);

    // El endpoint de borrado de fotos de borrador no exige sesion (el
    // asistente de publicacion es anonimo). Sin la verificacion contra
    // foto_pedido, cualquiera con la url publica de la foto (que contiene el
    // mismo borradorId+id) podria borrar el archivo de un pedido real ya
    // publicado.
    await request(app.getHttpServer())
      .delete(`/pedidos/borrador/fotos/${fotoId}`)
      .query({ borradorId })
      .expect(204);

    const respuestaDetalle = await request(app.getHttpServer())
      .get(`/pedidos/${respuestaCrear.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(respuestaDetalle.body.fotos).toHaveLength(1);
    expect(respuestaDetalle.body.fotos[0].url).toBe(respuestaFoto.body.url);

    // El id de foto es la PK de foto_pedido y lo elige el cliente: sin este
    // chequeo, reusar el id de una foto ya publicada (el mismo que revela su
    // url publica) rompe la PK al crear y cae como error interno en vez de
    // un 400 (mismo cupo de login que el resto de este test).
    const respuestaFotoReusada = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(pedidoPayload({ borradorId, fotos: [{ id: fotoId }] }))
      .expect(400);
    expect(respuestaFotoReusada.body.codigo).toBe("validacion");
  });

  it("manda a en_revision un pedido cuya descripcion tiene un telefono, sin fijar publicadoEn", async () => {
    const accessToken = await loginComoCliente(TELEFONO_REVISION);

    const respuesta = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        pedidoPayload({
          descripcion: "Comuniquense al 11 4444 5555 para coordinar la visita, gracias",
        }),
      )
      .expect(201);

    expect(respuesta.body.estado).toBe("en_revision");
    expect(respuesta.body.publicadoEn).toBeNull();
    expect(respuesta.body.expiraEn).toBeNull();
    await registrarParaLimpieza(respuesta.body.id as string);

    // docs/dominio.md §3/§12: en_revision -> cancelado se agrego a proposito
    // para que un falso positivo del control automatico no deje al cliente
    // sin salida hasta que exista moderacion.
    const respuestaCancelar = await request(app.getHttpServer())
      .patch(`/pedidos/${respuesta.body.id}/cancelar`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(respuestaCancelar.body.estado).toBe("cancelado");
  });

  it("cupo de pedidos activos (carrera): de dos publicaciones simultaneas cuando falta lugar para una sola, gana exactamente una", async () => {
    const accessToken = await loginComoCliente(TELEFONO_RACE);

    // Dos pedidos activos ya existentes (secuenciales, para dejar el cupo en
    // "falta lugar para uno solo": el parametro sembrado es 3).
    const primero = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(pedidoPayload({ descripcion: "Primer pedido de la carrera, canilla que gotea" }))
      .expect(201);
    await registrarParaLimpieza(primero.body.id as string);

    const segundo = await request(app.getHttpServer())
      .post("/pedidos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        pedidoPayload({ descripcion: "Segundo pedido de la carrera, cable pelado en la cocina" }),
      )
      .expect(201);
    await registrarParaLimpieza(segundo.body.id as string);

    // Ahora sí, la carrera: dos POST concurrentes por el ultimo lugar del cupo.
    const [respuestaA, respuestaB] = await Promise.all([
      request(app.getHttpServer())
        .post("/pedidos")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(
          pedidoPayload({ descripcion: "Pedido A de la carrera, humedad en el techo del baño" }),
        ),
      request(app.getHttpServer())
        .post("/pedidos")
        .set("Authorization", `Bearer ${accessToken}`)
        .send(pedidoPayload({ descripcion: "Pedido B de la carrera, puerta que no cierra bien" })),
    ]);

    const estados = [respuestaA.status, respuestaB.status].sort((a, b) => a - b);
    // Nunca los dos triunfan, nunca los dos rechazan: el lock FOR UPDATE
    // sobre el usuario serializa el conteo del cupo.
    expect(estados).toEqual([201, 409]);

    const exitosa = respuestaA.status === 201 ? respuestaA : respuestaB;
    const fallida = respuestaA.status === 201 ? respuestaB : respuestaA;
    expect(fallida.body.codigo).toBe("limite_excedido");
    await registrarParaLimpieza(exitosa.body.id as string);

    // docs/dominio.md §10: "limite_alcanzado" se registra fuera de la
    // transaccion que fallo, asi que sobrevive al rollback del intento.
    // Filtrado por usuario para no engancharse con el evento de otro test.
    const usuarioRace = await prisma.usuario.findUniqueOrThrow({
      where: { telefono: TELEFONO_RACE },
      select: { id: true },
    });
    const eventoLimite = await prisma.eventoAnalitico.findFirst({
      where: { tipo: "limite_alcanzado", usuarioId: usuarioRace.id },
      orderBy: { creadoEn: "desc" },
    });
    expect(eventoLimite).not.toBeNull();
    expect(eventoLimite?.categoria).toBe("plomeria");
    expect(eventoLimite?.zona).toBe("Palermo");
  }, 20_000);
});
