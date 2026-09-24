import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";
import { inicioDelDiaEnZona } from "../src/modules/postulaciones/fecha-zona.util.js";
import { ParametrosService } from "../src/modules/parametros/parametros.service.js";

const PREFIJO_TELEFONO = "+549110093";
const TEL_CLIENTE = `${PREFIJO_TELEFONO}001`;
const TEL_PROFESIONAL = `${PREFIJO_TELEFONO}002`;
const TEL_PROFESIONAL_2 = `${PREFIJO_TELEFONO}003`;
const TEL_PROFESIONAL_SIN_VERIFICAR = `${PREFIJO_TELEFONO}004`;

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
 * PR-04/PR-05/CL-08/CL-09 (docs/dominio.md §4, §6 ultimo bloque, §7).
 * Los pedidos de este archivo se insertan directo por Prisma (mismo criterio
 * que pedidos-feed.e2e-spec.ts): lo que se ejercita aca es Postulacion, no el
 * asistente de publicacion.
 */
describe("Postulaciones (PR-04/PR-05/CL-08/CL-09, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  let parametros: ParametrosService;
  let categoriaPlomeriaId: string;
  let categoriaGasId: string;
  let categoriaAireId: string;
  let barrioPalermoId: string;

  let cliente: Sesion;
  let profesional: Sesion; // plomero + gas (sin matricula validada), verificado
  let profesional2: Sesion; // plomero verificado, distinto del anterior
  let profesionalSinVerificar: Sesion; // plomero, perfil pendiente

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

  async function crearPedidoDirecto(opciones: {
    clienteId: string;
    categoriaId: string;
    estado?: "publicado" | "con_postulaciones" | "contacto_habilitado" | "cancelado";
    cantidadContactos?: number;
    cantidadPostulaciones?: number;
  }): Promise<string> {
    const direccion = await prisma.direccion.create({
      data: {
        calle: "Direccion de prueba de postulaciones",
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
        categoriaId: opciones.categoriaId,
        descripcion: `Pedido de prueba de postulaciones ${randomUUID()}`,
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

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TwilioModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    driverOtp = moduleRef.get(TwilioLogDriver);
    parametros = moduleRef.get(ParametrosService);

    const [plomeria, gas, aire, palermo] = await Promise.all([
      prisma.categoria.findUniqueOrThrow({ where: { slug: "plomeria" } }),
      prisma.categoria.findUniqueOrThrow({ where: { slug: "gas" } }),
      prisma.categoria.findUniqueOrThrow({ where: { slug: "aire-acondicionado" } }),
      prisma.barrio.findUniqueOrThrow({ where: { nombre: "Palermo" } }),
    ]);
    categoriaPlomeriaId = plomeria.id;
    categoriaGasId = gas.id;
    categoriaAireId = aire.id;
    barrioPalermoId = palermo.id;

    // 4 logins en este archivo (`/auth/otp/solicitar` limita a 5 por IP por minuto).
    cliente = await loginComoCliente(TEL_CLIENTE);

    profesional = await loginComoProfesional(TEL_PROFESIONAL);
    await request(app.getHttpServer())
      .patch("/perfil-profesional")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .send({ presentacion: "Plomero y gasista de prueba" })
      .expect(200);
    await request(app.getHttpServer())
      .put("/perfil-profesional/oficios")
      .set("Authorization", `Bearer ${profesional.accessToken}`)
      .send({
        oficios: [
          { categoriaId: categoriaPlomeriaId, subcategorias: [] },
          { categoriaId: categoriaGasId, subcategorias: [] },
        ],
      })
      .expect(200);
    await prisma.perfilProfesional.update({
      where: { usuarioId: profesional.usuarioId },
      data: { estadoVerificacion: "aprobada" },
    });

    profesional2 = await loginComoProfesional(TEL_PROFESIONAL_2);
    await request(app.getHttpServer())
      .patch("/perfil-profesional")
      .set("Authorization", `Bearer ${profesional2.accessToken}`)
      .send({ presentacion: "Plomero de prueba 2" })
      .expect(200);
    await request(app.getHttpServer())
      .put("/perfil-profesional/oficios")
      .set("Authorization", `Bearer ${profesional2.accessToken}`)
      .send({ oficios: [{ categoriaId: categoriaPlomeriaId, subcategorias: [] }] })
      .expect(200);
    await prisma.perfilProfesional.update({
      where: { usuarioId: profesional2.usuarioId },
      data: { estadoVerificacion: "aprobada" },
    });

    profesionalSinVerificar = await loginComoProfesional(TEL_PROFESIONAL_SIN_VERIFICAR);
    await request(app.getHttpServer())
      .patch("/perfil-profesional")
      .set("Authorization", `Bearer ${profesionalSinVerificar.accessToken}`)
      .send({ presentacion: "Plomero sin verificar" })
      .expect(200);
    await request(app.getHttpServer())
      .put("/perfil-profesional/oficios")
      .set("Authorization", `Bearer ${profesionalSinVerificar.accessToken}`)
      .send({ oficios: [{ categoriaId: categoriaPlomeriaId, subcategorias: [] }] })
      .expect(200);
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

    await prisma.postulacion.deleteMany({ where: { profesionalId: { in: idsPerfiles } } });
    await prisma.plantillaMensaje.deleteMany({ where: { perfilId: { in: idsPerfiles } } });
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

  describe("crear (PR-04)", () => {
    it("exige identidad verificada", async () => {
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });

      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesionalSinVerificar.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(403);
      expect(respuesta.body.codigo).toBe("no_autorizado");
    });

    it("exige matricula validada y vigente en gas (categoria con matricula obligatoria)", async () => {
      const pedidoGas = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaGasId,
      });

      // `profesional` tiene el oficio de gas, pero su matricula sigue en
      // "pendiente" (nunca se aprobo una Verificacion): bloquea.
      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedidoGas))
        .expect(403);
      expect(respuesta.body.codigo).toBe("no_autorizado");
    });

    it("exige matricula vigente en gas: 'validada' pero vencida bloquea igual que 'pendiente'", async () => {
      // "matricula validada y vigente" (regla no negociable #5): una
      // matricula que se aprobo mas no esta vencida no cuenta como vigente.
      const oficioGas = await prisma.oficioProfesional.findFirstOrThrow({
        where: { perfil: { usuarioId: profesional.usuarioId }, categoriaId: categoriaGasId },
      });
      await prisma.oficioProfesional.update({
        where: { id: oficioGas.id },
        data: {
          matriculaEstado: "validada",
          matriculaVenceEn: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });

      try {
        const pedidoGas = await crearPedidoDirecto({
          clienteId: cliente.usuarioId,
          categoriaId: categoriaGasId,
        });

        const respuesta = await request(app.getHttpServer())
          .post("/postulaciones")
          .set("Authorization", `Bearer ${profesional.accessToken}`)
          .send(payloadPostulacion(pedidoGas))
          .expect(403);
        expect(respuesta.body.codigo).toBe("no_autorizado");
      } finally {
        // Restaura el oficio a como estaba (matricula "pendiente", sin
        // vencimiento) para no acoplar el orden de los tests siguientes.
        await prisma.oficioProfesional.update({
          where: { id: oficioGas.id },
          data: { matriculaEstado: "pendiente", matriculaVenceEn: null },
        });
      }
    });

    it("no exige matricula en aire acondicionado (matricula 'recomendada', no bloquea sin ella)", async () => {
      // docs/dominio.md §1: matricula obligatoria solo en gas y electricidad.
      // En aire acondicionado (recomendada) alcanza con la identidad verificada.
      await request(app.getHttpServer())
        .put("/perfil-profesional/oficios")
        .set("Authorization", `Bearer ${profesional2.accessToken}`)
        .send({
          oficios: [
            { categoriaId: categoriaPlomeriaId, subcategorias: [] },
            { categoriaId: categoriaAireId, subcategorias: [] },
          ],
        })
        .expect(200);

      const pedidoAire = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaAireId,
      });

      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional2.accessToken}`)
        .send(payloadPostulacion(pedidoAire))
        .expect(201);
      expect(respuesta.body.estado).toBe("enviada");
    });

    it("rechaza un mensaje con datos de contacto (regla no negociable #6)", async () => {
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });

      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(
          payloadPostulacion(pedido, {
            mensaje: "Llamame al 11 4444-5555 así coordinamos directo, mejor que por acá",
          }),
        )
        .expect(400);
      expect(respuesta.body.codigo).toBe("validacion");
    });

    it("un pedido que no acepta postulaciones (cancelado) da 409", async () => {
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        estado: "cancelado",
      });

      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(409);
      expect(respuesta.body.codigo).toBe("conflicto");
    });

    it("crea la postulacion, pasa el pedido a con_postulaciones en la primera, avisa al cliente y no permite postularse dos veces", async () => {
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });

      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido, { disponibilidad: "Tardes de lunes a viernes" }))
        .expect(201);
      expect(respuesta.body.estado).toBe("enviada");
      expect(respuesta.body.otroYaElegido).toBe(false);
      expect(respuesta.body.pedido.id).toBe(pedido);

      const pedidoActualizado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido } });
      expect(pedidoActualizado.estado).toBe("con_postulaciones");
      expect(pedidoActualizado.cantidadPostulaciones).toBe(1);

      const evento = await prisma.eventoAnalitico.findFirst({
        where: { tipo: "postulacion_enviada", pedidoId: pedido },
      });
      expect(evento).not.toBeNull();
      expect(evento?.categoria).toBe("plomeria");
      expect(evento?.rol).toBe("profesional");

      const notificacion = await prisma.notificacion.findFirst({
        where: { usuarioId: cliente.usuarioId, tipo: "primera_postulacion", objetoId: pedido },
      });
      expect(notificacion).not.toBeNull();

      // Ya postulado: la unique constraint (pedidoId, profesionalId) lo impide.
      const respuestaDuplicada = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(409);
      expect(respuestaDuplicada.body.codigo).toBe("conflicto");
    });

    it("carrera del cupo por pedido: de dos postulaciones concurrentes para el ultimo lugar, exactamente una gana", async () => {
      const postulacionesMax = await parametros.getNumero("postulaciones_max_por_pedido");
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        cantidadPostulaciones: postulacionesMax - 1,
      });

      const [respuestaA, respuestaB] = await Promise.all([
        request(app.getHttpServer())
          .post("/postulaciones")
          .set("Authorization", `Bearer ${profesional.accessToken}`)
          .send(payloadPostulacion(pedido)),
        request(app.getHttpServer())
          .post("/postulaciones")
          .set("Authorization", `Bearer ${profesional2.accessToken}`)
          .send(payloadPostulacion(pedido)),
      ]);

      const estados = [respuestaA.status, respuestaB.status].sort();
      expect(estados).toEqual([201, 409]);
      const rechazada = respuestaA.status === 409 ? respuestaA : respuestaB;
      expect(rechazada.body.codigo).toBe("limite_excedido");

      const pedidoFinal = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido } });
      expect(pedidoFinal.cantidadPostulaciones).toBe(postulacionesMax);
    });

    it("carrera del limite diario: de dos postulaciones concurrentes a pedidos distintos para el ultimo lugar del dia, exactamente una gana", async () => {
      const limiteDiario = await parametros.getNumero("postulaciones_max_por_profesional_dia");
      const zonaHoraria = await parametros.getTexto("limite_diario_zona_horaria");
      const perfil = await prisma.perfilProfesional.findUniqueOrThrow({
        where: { usuarioId: profesional2.usuarioId },
      });
      // Mismo calculo que PostulacionesService (D7: medianoche en
      // America/Argentina/Buenos_Aires, no medianoche UTC).
      const inicioDeHoy = inicioDelDiaEnZona(new Date(), zonaHoraria);
      const usadas = await prisma.postulacion.count({
        where: { profesionalId: perfil.id, enviadaEn: { gte: inicioDeHoy } },
      });

      // Rellena el contador de hoy hasta dejar exactamente un lugar libre,
      // con postulaciones "falsas" insertadas directo (no cuenta para el
      // cupo por pedido: son pedidos propios de relleno).
      const faltantes = limiteDiario - usadas - 1;
      for (let i = 0; i < faltantes; i += 1) {
        const pedidoRelleno = await crearPedidoDirecto({
          clienteId: cliente.usuarioId,
          categoriaId: categoriaPlomeriaId,
        });
        await prisma.postulacion.create({
          data: {
            pedidoId: pedidoRelleno,
            profesionalId: perfil.id,
            mensaje: "Postulacion de relleno para el test de limite diario",
            estimacionADefinir: true,
          },
        });
        await prisma.pedido.update({
          where: { id: pedidoRelleno },
          data: { cantidadPostulaciones: { increment: 1 } },
        });
      }

      const pedidoUno = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });
      const pedidoDos = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });

      const [respuestaA, respuestaB] = await Promise.all([
        request(app.getHttpServer())
          .post("/postulaciones")
          .set("Authorization", `Bearer ${profesional2.accessToken}`)
          .send(payloadPostulacion(pedidoUno)),
        request(app.getHttpServer())
          .post("/postulaciones")
          .set("Authorization", `Bearer ${profesional2.accessToken}`)
          .send(payloadPostulacion(pedidoDos)),
      ]);

      const estados = [respuestaA.status, respuestaB.status].sort();
      expect(estados).toEqual([201, 409]);
      const rechazada = respuestaA.status === 409 ? respuestaA : respuestaB;
      expect(rechazada.body.codigo).toBe("limite_excedido");

      const usadasFinal = await prisma.postulacion.count({
        where: { profesionalId: perfil.id, enviadaEn: { gte: inicioDeHoy } },
      });
      expect(usadasFinal).toBe(limiteDiario);
    }, 30_000);
  });

  describe("contacto_habilitado con cupo libre (docs/dominio.md §6 ultimo bloque, D2/D3)", () => {
    it("acepta una postulacion nueva mientras quede cupo de elegibles y de postulaciones, sin cambiar de estado", async () => {
      const seleccionablesMax = await parametros.getNumero("seleccionables_max_por_pedido");
      const postulacionesMax = await parametros.getNumero("postulaciones_max_por_pedido");
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        estado: "contacto_habilitado",
        cantidadContactos: seleccionablesMax - 1,
        cantidadPostulaciones: postulacionesMax - 1,
      });

      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(201);
      expect(respuesta.body.estado).toBe("enviada");
      // D2: "el cliente ya eligio a un profesional, tu propuesta sigue en juego".
      expect(respuesta.body.otroYaElegido).toBe(true);

      const pedidoActualizado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido } });
      // D3: la 2da/3ra postulacion sobre un pedido ya en contacto_habilitado
      // no reabre ni cambia el estado (el pedido entra una sola vez).
      expect(pedidoActualizado.estado).toBe("contacto_habilitado");
      expect(pedidoActualizado.cantidadPostulaciones).toBe(postulacionesMax);
    });

    it("rechaza con 409 si ya se completo el cupo de elegibles aunque el pedido siga en contacto_habilitado", async () => {
      const seleccionablesMax = await parametros.getNumero("seleccionables_max_por_pedido");
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        estado: "contacto_habilitado",
        cantidadContactos: seleccionablesMax,
        cantidadPostulaciones: 2,
      });

      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(409);
      expect(respuesta.body.codigo).toBe("conflicto");
    });

    it("rechaza con 409 si ya se completo el cupo de postulaciones aunque quede cupo de elegibles", async () => {
      const postulacionesMax = await parametros.getNumero("postulaciones_max_por_pedido");
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        estado: "contacto_habilitado",
        cantidadContactos: 1,
        cantidadPostulaciones: postulacionesMax,
      });

      const respuesta = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(409);
      expect(respuesta.body.codigo).toBe("conflicto");
    });
  });

  describe("contador diario (PR-04)", () => {
    it("devuelve usadas/maximo/renuevaEn coherentes", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/postulaciones/contador-diario")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .expect(200);
      expect(typeof respuesta.body.usadas).toBe("number");
      expect(typeof respuesta.body.maximo).toBe("number");
      expect(new Date(respuesta.body.renuevaEn).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("listar y retirar (PR-05)", () => {
    it("lista en 'enviadas' y permite retirar; retirar dos veces da conflicto", async () => {
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });
      const creada = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(201);
      const postulacionId = creada.body.id as string;

      const listado = await request(app.getHttpServer())
        .get("/postulaciones")
        .query({ grupo: "enviadas" })
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .expect(200);
      expect(
        (listado.body.items as { id: string }[]).some((item) => item.id === postulacionId),
      ).toBe(true);

      const retirada = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacionId}/retirar`)
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .expect(200);
      expect(retirada.body.estado).toBe("retirada");

      await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacionId}/retirar`)
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .expect(409);

      const listadoCerradas = await request(app.getHttpServer())
        .get("/postulaciones")
        .query({ grupo: "cerradas" })
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .expect(200);
      expect(
        (listadoCerradas.body.items as { id: string }[]).some((item) => item.id === postulacionId),
      ).toBe(true);
    });

    it("un profesional no puede retirar la postulacion de otro", async () => {
      // profesional2 ya agoto su limite diario en el test de la carrera de
      // arriba: se crea con `profesional` y se intenta retirar con
      // `profesionalSinVerificar` (tiene perfil propio, no necesita postularse
      // para que el chequeo de ownership de retirar() lo distinga).
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });
      const creada = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/postulaciones/${creada.body.id}/retirar`)
        .set("Authorization", `Bearer ${profesionalSinVerificar.accessToken}`)
        .expect(404);
    });

    it("pagina 'mis postulaciones' por cursor sin saltar ni repetir filas", async () => {
      // `profesionalSinVerificar` no se postulo todavia en ningun otro test de
      // este archivo: sirve de perfil "limpio" para contar exacto. Se insertan
      // las postulaciones directo por Prisma (no por POST) para no chocar con
      // el limite diario del profesional (10) ni con el de identidad
      // verificada, que no hace falta para ejercitar la paginacion de listar().
      const perfil = await prisma.perfilProfesional.findUniqueOrThrow({
        where: { usuarioId: profesionalSinVerificar.usuarioId },
      });
      const TOTAL_POSTULACIONES = 25; // > TAMANIO_PAGINA de PostulacionesService.listar (20).
      const idsCreados: string[] = [];
      for (let indice = 0; indice < TOTAL_POSTULACIONES; indice += 1) {
        const pedido = await crearPedidoDirecto({
          clienteId: cliente.usuarioId,
          categoriaId: categoriaPlomeriaId,
        });
        const postulacion = await prisma.postulacion.create({
          data: {
            pedidoId: pedido,
            profesionalId: perfil.id,
            mensaje: `Postulacion de paginacion numero ${indice}`,
            estimacionADefinir: true,
            enviadaEn: new Date(Date.now() - indice * 1000),
          },
        });
        idsCreados.push(postulacion.id);
      }

      const vistos = new Set<string>();
      let cursor: string | null = null;
      let paginas = 0;
      do {
        const respuesta = await request(app.getHttpServer())
          .get("/postulaciones")
          .query({ grupo: "enviadas", ...(cursor ? { cursor } : {}) })
          .set("Authorization", `Bearer ${profesionalSinVerificar.accessToken}`)
          .expect(200);

        for (const item of respuesta.body.items as { id: string }[]) {
          expect(vistos.has(item.id)).toBe(false); // ninguna fila repetida entre paginas
          vistos.add(item.id);
        }
        cursor = respuesta.body.cursor;
        paginas += 1;
        expect(paginas).toBeLessThan(10); // guarda contra un loop infinito si algo esta mal
      } while (cursor);

      expect(paginas).toBeGreaterThan(1);
      expect(vistos.size).toBe(TOTAL_POSTULACIONES);
      for (const id of idsCreados) {
        expect(vistos.has(id)).toBe(true); // ninguna fila salteada
      }
    }, 30_000);
  });

  describe("vista del cliente (CL-08)", () => {
    it("marca 'enviada' -> 'vista' al listar, permite descartar y revertir dentro de la ventana", async () => {
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });
      const creada = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(201);
      const postulacionId = creada.body.id as string;

      const listado = await request(app.getHttpServer())
        .get(`/pedidos/${pedido}/postulaciones`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      const item = (listado.body as { id: string; estado: string; puedeDescartar: boolean }[]).find(
        (it) => it.id === postulacionId,
      );
      expect(item?.estado).toBe("vista");
      expect(item?.puedeDescartar).toBe(true);

      const evento = await prisma.eventoAnalitico.findFirst({
        where: { tipo: "postulacion_vista", pedidoId: pedido },
      });
      expect(evento).not.toBeNull();
      expect(evento?.rol).toBe("cliente");

      const descartada = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacionId}/descartar`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(descartada.body.estado).toBe("descartada");
      expect(descartada.body.puedeRevertirDescarte).toBe(true);

      const revertida = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacionId}/revertir-descarte`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(revertida.body.estado).toBe("vista");
    });

    it("no permite revertir un descarte fuera de la ventana de descarte_reversible_horas", async () => {
      const pedido = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
      });
      const creada = await request(app.getHttpServer())
        .post("/postulaciones")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send(payloadPostulacion(pedido))
        .expect(201);
      const postulacionId = creada.body.id as string;

      await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacionId}/descartar`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);

      const horas = await parametros.getNumero("descarte_reversible_horas");
      await prisma.postulacion.update({
        where: { id: postulacionId },
        data: { descartadaEn: new Date(Date.now() - (horas + 1) * 60 * 60 * 1000) },
      });

      const respuesta = await request(app.getHttpServer())
        .patch(`/postulaciones/${postulacionId}/revertir-descarte`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(409);
      expect(respuesta.body.codigo).toBe("conflicto");
    });

    it("un cliente no puede ver ni descartar postulaciones de un pedido ajeno", async () => {
      const pedido = await crearPedidoDirecto({
        clienteId: profesional.usuarioId, // dueño distinto de "cliente"
        categoriaId: categoriaPlomeriaId,
      });

      await request(app.getHttpServer())
        .get(`/pedidos/${pedido}/postulaciones`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(404);
    });
  });

  describe("perfil publico (CL-09)", () => {
    it("devuelve el perfil sin telefono ni datos privados, y registra el evento", async () => {
      const perfil = await prisma.perfilProfesional.findUniqueOrThrow({
        where: { usuarioId: profesional.usuarioId },
      });

      const respuesta = await request(app.getHttpServer())
        .get(`/profesionales/${perfil.id}`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(200);
      expect(respuesta.body.id).toBe(perfil.id);
      expect(respuesta.body.estadoVerificacion).toBe("aprobada");
      expect(JSON.stringify(respuesta.body)).not.toContain("telefono");

      const evento = await prisma.eventoAnalitico.findFirst({
        where: { tipo: "perfil_profesional_visto", usuarioId: cliente.usuarioId },
      });
      expect(evento).not.toBeNull();
      expect(evento?.rol).toBe("cliente");
    });

    it("404 si el perfil no existe", async () => {
      await request(app.getHttpServer())
        .get(`/profesionales/${randomUUID()}`)
        .set("Authorization", `Bearer ${cliente.accessToken}`)
        .expect(404);
    });
  });

  describe("plantillas de mensaje", () => {
    it("crea, lista y borra una plantilla propia", async () => {
      const creada = await request(app.getHttpServer())
        .post("/perfil-profesional/plantillas")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .send({ texto: "Hola, puedo pasar mañana a la tarde a hacer una estimación" })
        .expect(201);
      expect(typeof creada.body.id).toBe("string");

      const listado = await request(app.getHttpServer())
        .get("/perfil-profesional/plantillas")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .expect(200);
      expect((listado.body as { id: string }[]).some((item) => item.id === creada.body.id)).toBe(
        true,
      );

      await request(app.getHttpServer())
        .delete(`/perfil-profesional/plantillas/${creada.body.id}`)
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .expect(200);

      const listadoTrasBorrar = await request(app.getHttpServer())
        .get("/perfil-profesional/plantillas")
        .set("Authorization", `Bearer ${profesional.accessToken}`)
        .expect(200);
      expect(
        (listadoTrasBorrar.body as { id: string }[]).some((item) => item.id === creada.body.id),
      ).toBe(false);
    });
  });
});
