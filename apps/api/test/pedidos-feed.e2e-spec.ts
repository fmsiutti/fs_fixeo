import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Urgencia } from "@fixeo/shared";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";
import { TwilioLogDriver } from "../src/infra/twilio/twilio-log.driver.js";
import { TwilioModule } from "../src/infra/twilio/twilio.module.js";
import { ParametrosService } from "../src/modules/parametros/parametros.service.js";

const PREFIJO_TELEFONO = "+549110097";
const TEL_CLIENTE = `${PREFIJO_TELEFONO}001`;
const TEL_PROFESIONAL_SIN_PERFIL = `${PREFIJO_TELEFONO}002`;
const TEL_PROFESIONAL_BARRIOS = `${PREFIJO_TELEFONO}003`;
const TEL_PROFESIONAL_RADIO = `${PREFIJO_TELEFONO}004`;

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
 * Feed y detalle del profesional (PR-02/PR-03, docs/dominio.md §6/§7). Todos
 * los pedidos de este archivo se insertan directo por Prisma (no via POST
 * /pedidos): lo que se ejercita aca es la lectura del feed, no el asistente
 * de publicacion (ya cubierto por pedidos.e2e-spec.ts), y asi se evita el
 * cupo de `pedidos_activos_max_por_cliente` (3) que un solo cliente con
 * muchos pedidos de prueba activos alcanzaria enseguida.
 */
describe("Feed y detalle del profesional (PR-02/PR-03, e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverOtp: TwilioLogDriver;
  let parametros: ParametrosService;
  let categoriaPlomeriaId: string;
  let categoriaGasId: string;
  let barrioPalermoId: string;
  let barrioBelgranoId: string;
  let barrioRecoletaId: string;

  let cliente: Sesion;
  let profesionalSinPerfil: Sesion;
  let profesionalBarrios: Sesion;
  let profesionalRadio: Sesion;

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

  async function armarOficioPlomeria(accessToken: string): Promise<void> {
    // El perfil tiene que existir antes de poder guardarle oficios (PR-01,
    // paso "datos basicos" antes que "oficios").
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
  }

  async function guardarZonaBarrios(accessToken: string, barrioIds: string[]): Promise<void> {
    await request(app.getHttpServer())
      .put("/perfil-profesional/zona")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ tipo: "barrios", barrioIds })
      .expect(200);
  }

  async function aprobarPerfil(usuarioId: string): Promise<void> {
    await prisma.perfilProfesional.update({
      where: { usuarioId },
      data: { estadoVerificacion: "aprobada" },
    });
  }

  /** Pedido insertado directo por Prisma: ver nota de la descripcion del describe. */
  async function crearPedidoDirecto(opciones: {
    clienteId: string;
    categoriaId: string;
    barrioId: string;
    urgencia?: Urgencia;
    estado?: "publicado" | "con_postulaciones" | "contacto_habilitado";
    cantidadContactos?: number;
    cantidadPostulaciones?: number;
    lat?: number;
    lng?: number;
    publicadoEn?: Date;
    conFoto?: boolean;
  }): Promise<string> {
    const direccion = await prisma.direccion.create({
      data: {
        calle: "Direccion de prueba del feed",
        numero: "1",
        tipoPropiedad: "casa",
        barrioId: opciones.barrioId,
        lat: opciones.lat ?? -34.6,
        lng: opciones.lng ?? -58.45,
      },
    });
    direccionIdsCreados.push(direccion.id);

    const pedido = await prisma.pedido.create({
      data: {
        clienteId: opciones.clienteId,
        categoriaId: opciones.categoriaId,
        descripcion: `Pedido de prueba del feed ${randomUUID()}`,
        urgencia: opciones.urgencia ?? "sin_apuro",
        franjas: ["manana"],
        direccionId: direccion.id,
        barrioId: opciones.barrioId,
        lat: opciones.lat ?? -34.6,
        lng: opciones.lng ?? -58.45,
        estado: opciones.estado ?? "publicado",
        publicadoEn: opciones.publicadoEn ?? new Date(),
        expiraEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cantidadContactos: opciones.cantidadContactos ?? 0,
        cantidadPostulaciones: opciones.cantidadPostulaciones ?? 0,
      },
    });
    pedidoIdsCreados.push(pedido.id);

    if (opciones.conFoto) {
      await prisma.fotoPedido.create({
        data: { pedidoId: pedido.id, url: "https://test.local/foto.jpg", orden: 0 },
      });
    }

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
    parametros = moduleRef.get(ParametrosService);

    const [plomeria, gas, palermo, belgrano, recoleta] = await Promise.all([
      prisma.categoria.findUniqueOrThrow({ where: { slug: "plomeria" } }),
      prisma.categoria.findUniqueOrThrow({ where: { slug: "gas" } }),
      prisma.barrio.findUniqueOrThrow({ where: { nombre: "Palermo" } }),
      prisma.barrio.findUniqueOrThrow({ where: { nombre: "Belgrano" } }),
      prisma.barrio.findUniqueOrThrow({ where: { nombre: "Recoleta" } }),
    ]);
    categoriaPlomeriaId = plomeria.id;
    categoriaGasId = gas.id;
    barrioPalermoId = palermo.id;
    barrioBelgranoId = belgrano.id;
    barrioRecoletaId = recoleta.id;

    // Los 4 logins de este archivo (`/auth/otp/solicitar` limita a 5 por IP
    // por minuto): uno por actor, reutilizado en todos los tests.
    cliente = await loginComoCliente(TEL_CLIENTE);
    await prisma.usuario.update({
      where: { id: cliente.usuarioId },
      data: { nombre: "Juana", apellido: "Gimenez" },
    });

    profesionalSinPerfil = await loginComoProfesional(TEL_PROFESIONAL_SIN_PERFIL);

    profesionalBarrios = await loginComoProfesional(TEL_PROFESIONAL_BARRIOS);
    await armarOficioPlomeria(profesionalBarrios.accessToken);
    await guardarZonaBarrios(profesionalBarrios.accessToken, [barrioPalermoId]);
    await aprobarPerfil(profesionalBarrios.usuarioId);

    profesionalRadio = await loginComoProfesional(TEL_PROFESIONAL_RADIO);
    await armarOficioPlomeria(profesionalRadio.accessToken);
    await request(app.getHttpServer())
      .put("/perfil-profesional/zona")
      .set("Authorization", `Bearer ${profesionalRadio.accessToken}`)
      .send({ tipo: "radio", centroLat: -34.6, centroLng: -58.45, radioKm: 10 })
      .expect(200);
    await aprobarPerfil(profesionalRadio.usuarioId);
  }, 30_000);

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

  it("un cliente (rol activo) no puede entrar al feed del profesional", async () => {
    await request(app.getHttpServer())
      .get("/pedidos/feed")
      .set("Authorization", `Bearer ${cliente.accessToken}`)
      .expect(403);
  });

  it("un profesional sin perfil armado ve el feed vacio (no es un error) y el detalle 404", async () => {
    const respuestaFeed = await request(app.getHttpServer())
      .get("/pedidos/feed")
      .set("Authorization", `Bearer ${profesionalSinPerfil.accessToken}`)
      .expect(200);
    expect(respuestaFeed.body).toEqual({ items: [], cursor: null, verificacionAprobada: false });

    await request(app.getHttpServer())
      .get(`/pedidos/feed/${randomUUID()}`)
      .set("Authorization", `Bearer ${profesionalSinPerfil.accessToken}`)
      .expect(404);
  });

  it("feed por zona de barrios: coincide categoria+barrio, respeta filtros, oculta el pedido sin cupo de elegibles, y el detalle no revela apellido ni telefono del cliente", async () => {
    const pedidoEmergenciaConFoto = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      urgencia: "emergencia",
      conFoto: true,
      publicadoEn: new Date(Date.now() - 60_000),
    });
    const pedidoSinApuro = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      urgencia: "sin_apuro",
    });
    // No visible: otro barrio, fuera de la zona del profesional.
    const pedidoOtroBarrio = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioBelgranoId,
    });
    // No visible: otra categoria, el profesional no tiene ese oficio.
    const pedidoOtraCategoria = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaGasId,
      barrioId: barrioPalermoId,
    });
    // Visible con cupo: contacto_habilitado pero todavia quedan elegibles (D2/D3).
    const pedidoConCupo = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      estado: "contacto_habilitado",
      cantidadContactos: 1,
    });
    // No visible: contacto_habilitado con el cupo de elegibles completo.
    const pedidoSinCupo = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      estado: "contacto_habilitado",
      cantidadContactos: 3,
    });
    // Visible y postulable en terminos de estado: el cupo de postulaciones
    // (PR-03, `postulacionesCupoLleno`) es un concepto distinto del cupo de
    // elegibles (409 mas abajo). No hardcodeamos el 8: se lee el parametro.
    const postulacionesMax = await parametros.getNumero("postulaciones_max_por_pedido");
    const pedidoPostulacionesCupoLleno = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      cantidadPostulaciones: postulacionesMax,
    });

    const respuestaFeed = await request(app.getHttpServer())
      .get("/pedidos/feed")
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(200);

    const idsVisibles = respuestaFeed.body.items.map((item: { id: string }) => item.id);
    expect(idsVisibles).toEqual(
      expect.arrayContaining([
        pedidoEmergenciaConFoto,
        pedidoSinApuro,
        pedidoConCupo,
        pedidoPostulacionesCupoLleno,
      ]),
    );
    expect(idsVisibles).not.toEqual(expect.arrayContaining([pedidoOtroBarrio]));
    expect(idsVisibles).not.toEqual(expect.arrayContaining([pedidoOtraCategoria]));
    expect(idsVisibles).not.toEqual(expect.arrayContaining([pedidoSinCupo]));
    expect(respuestaFeed.body.verificacionAprobada).toBe(true);

    // docs/dominio.md §6: "antiguedad descendente con los urgentes arriba".
    // Orden relativo, no una posicion fija: otro archivo e2e corriendo en
    // paralelo puede tener sus propios pedidos intercalados.
    const indiceEmergencia = idsVisibles.indexOf(pedidoEmergenciaConFoto);
    const indiceSinApuro = idsVisibles.indexOf(pedidoSinApuro);
    expect(indiceEmergencia).toBeGreaterThanOrEqual(0);
    expect(indiceEmergencia).toBeLessThan(indiceSinApuro);

    const itemConCupo = respuestaFeed.body.items.find(
      (item: { id: string }) => item.id === pedidoConCupo,
    );
    expect(itemConCupo.yaEligioAlguien).toBe(true);
    expect(itemConCupo.distanciaKm).toBeNull();

    // Filtro "categoriaId" solo acepta uno de los oficios propios del profesional.
    await request(app.getHttpServer())
      .get("/pedidos/feed")
      .query({ categoriaId: categoriaGasId })
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(400);

    // No se compara con una lista exacta: otro archivo e2e corriendo en
    // paralelo contra la misma base puede tener sus propios pedidos de
    // plomeria en Palermo. Alcanza con que el filtro incluya lo que tiene que
    // incluir y excluya lo que no cumple el criterio.
    const respuestaUrgencia = await request(app.getHttpServer())
      .get("/pedidos/feed")
      .query({ urgencia: "emergencia" })
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(200);
    const idsUrgencia = respuestaUrgencia.body.items.map((item: { id: string }) => item.id);
    expect(idsUrgencia).toEqual(expect.arrayContaining([pedidoEmergenciaConFoto]));
    expect(idsUrgencia).not.toEqual(expect.arrayContaining([pedidoSinApuro, pedidoConCupo]));

    const respuestaConFotos = await request(app.getHttpServer())
      .get("/pedidos/feed")
      .query({ conFotos: "true" })
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(200);
    const idsConFotos = respuestaConFotos.body.items.map((item: { id: string }) => item.id);
    expect(idsConFotos).toEqual(expect.arrayContaining([pedidoEmergenciaConFoto]));
    expect(idsConFotos).not.toEqual(expect.arrayContaining([pedidoSinApuro, pedidoConCupo]));

    // --- Detalle (PR-03) ---
    const respuestaDetalle = await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoSinApuro}`)
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(200);
    expect(respuestaDetalle.body.cliente).toEqual({ nombre: "Juana" });
    expect(JSON.stringify(respuestaDetalle.body)).not.toContain("Gimenez");
    expect(respuestaDetalle.body.postulacionesCupoLleno).toBe(false);
    expect(respuestaDetalle.body.yaEligioAlguien).toBe(false);
    expect(respuestaDetalle.body.seleccionablesLibres).toBe(3);
    expect(respuestaDetalle.body.distanciaKm).toBeNull();
    expect(respuestaDetalle.body.verificacionAprobada).toBe(true);

    // Cupo de postulaciones lleno (8 por defecto): visible y devuelve 200,
    // a diferencia del cupo de elegibles completo (409, mas abajo).
    const respuestaCupoLleno = await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoPostulacionesCupoLleno}`)
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(200);
    expect(respuestaCupoLleno.body.postulacionesCupoLleno).toBe(true);

    const pedidoActualizado = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoSinApuro },
    });
    expect(pedidoActualizado.vistas).toBe(1);
    const eventoVisto = await prisma.eventoAnalitico.findFirst({
      where: { tipo: "pedido_visto_por_profesional", pedidoId: pedidoSinApuro },
    });
    expect(eventoVisto).not.toBeNull();
    expect(eventoVisto?.categoria).toBe("plomeria");
    expect(eventoVisto?.zona).toBe("Palermo");

    // Pedido de otra categoria: el profesional no deberia poder verlo ni saber que existe.
    await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoOtraCategoria}`)
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(404);

    // Cupo de elegibles completo: 409 con el texto exacto para volver al feed.
    const respuestaSinCupo = await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoSinCupo}`)
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(409);
    expect(respuestaSinCupo.body.codigo).toBe("conflicto");
  }, 30_000);

  it("excluye del feed y del detalle los pedidos del propio usuario (cuenta con los dos roles)", async () => {
    const pedidoPropio = await crearPedidoDirecto({
      clienteId: profesionalBarrios.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
    });

    const respuestaFeed = await request(app.getHttpServer())
      .get("/pedidos/feed")
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(200);
    const idsVisibles = respuestaFeed.body.items.map((item: { id: string }) => item.id);
    expect(idsVisibles).not.toEqual(expect.arrayContaining([pedidoPropio]));

    await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoPropio}`)
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(404);
  });

  it("docs/dominio.md §6: un pedido contacto_habilitado sale del feed si falta CUALQUIERA de los dos cupos (elegibles o postulaciones)", async () => {
    const postulacionesMax = await parametros.getNumero("postulaciones_max_por_pedido");
    // Cupo de elegibles libre, pero cupo de postulaciones lleno: antes del
    // fix seguia visible porque solo se miraba el cupo de elegibles.
    const pedidoPostulacionesLlenoElegiblesLibre = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      estado: "contacto_habilitado",
      cantidadContactos: 0,
      cantidadPostulaciones: postulacionesMax,
    });

    const respuestaFeed = await request(app.getHttpServer())
      .get("/pedidos/feed")
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(200);
    const idsVisibles = respuestaFeed.body.items.map((item: { id: string }) => item.id);
    expect(idsVisibles).not.toEqual(
      expect.arrayContaining([pedidoPostulacionesLlenoElegiblesLibre]),
    );

    const respuestaDetalle = await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoPostulacionesLlenoElegiblesLibre}`)
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(409);
    expect(respuestaDetalle.body.codigo).toBe("conflicto");
  });

  it('un pedido en un estado terminal (cancelado) da 404 en el detalle, nunca el 409 de "ya eligió"', async () => {
    const pedidoCancelado = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
    });
    await prisma.pedido.update({ where: { id: pedidoCancelado }, data: { estado: "cancelado" } });

    const respuesta = await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoCancelado}`)
      .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
      .expect(404);
    expect(respuesta.body.codigo).toBe("no_encontrado");
  });

  it("feed por zona de radio: calcula distancia con PostGIS y respeta distanciaMaxKm", async () => {
    // Muy cerca del centro de la zona (misma coordenada): distancia ~0km.
    const pedidoCerca = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      lat: -34.6,
      lng: -58.45,
    });
    // Lejos, pero todavia dentro del radio de 10km.
    const pedidoLejosPeroDentro = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      lat: -34.65,
      lng: -58.5,
    });
    // Fuera del radio de 10km: no deberia matchear en absoluto.
    const pedidoFueraDeRadio = await crearPedidoDirecto({
      clienteId: cliente.usuarioId,
      categoriaId: categoriaPlomeriaId,
      barrioId: barrioPalermoId,
      lat: -35.5,
      lng: -59.5,
    });

    const respuestaFeed = await request(app.getHttpServer())
      .get("/pedidos/feed")
      .set("Authorization", `Bearer ${profesionalRadio.accessToken}`)
      .expect(200);
    const idsVisibles = respuestaFeed.body.items.map((item: { id: string }) => item.id);
    expect(idsVisibles).toEqual(expect.arrayContaining([pedidoCerca, pedidoLejosPeroDentro]));
    expect(idsVisibles).not.toEqual(expect.arrayContaining([pedidoFueraDeRadio]));

    const itemCerca = respuestaFeed.body.items.find(
      (item: { id: string }) => item.id === pedidoCerca,
    );
    expect(itemCerca.distanciaKm).toBeCloseTo(0, 1);
    // Bloqueante 1 (revision de codigo del slice 5): la distancia expuesta se
    // redondea a la media unidad mas cercana (privacidad, no trilaterar la
    // ubicacion exacta del pedido). x*2 exacto porque dividir por una
    // potencia de 2 no pierde precision en punto flotante.
    expect(Number.isInteger(itemCerca.distanciaKm * 2)).toBe(true);

    // distanciaMaxKm mas chico que el radio de la zona: excluye lo que esta
    // dentro del radio pero mas lejos que el filtro (no una lista exacta: los
    // pedidos de otros tests en esta misma zona geografica tambien pueden
    // caer a menos de 1km del centro).
    const respuestaFiltroDistancia = await request(app.getHttpServer())
      .get("/pedidos/feed")
      .query({ distanciaMaxKm: 1 })
      .set("Authorization", `Bearer ${profesionalRadio.accessToken}`)
      .expect(200);
    const idsFiltrados = respuestaFiltroDistancia.body.items.map((item: { id: string }) => item.id);
    expect(idsFiltrados).toEqual(expect.arrayContaining([pedidoCerca]));
    expect(idsFiltrados).not.toEqual(
      expect.arrayContaining([pedidoLejosPeroDentro, pedidoFueraDeRadio]),
    );

    const respuestaDetalle = await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoLejosPeroDentro}`)
      .set("Authorization", `Bearer ${profesionalRadio.accessToken}`)
      .expect(200);
    expect(typeof respuestaDetalle.body.distanciaKm).toBe("number");
    expect(respuestaDetalle.body.distanciaKm).toBeGreaterThan(0);
    expect(Number.isInteger(respuestaDetalle.body.distanciaKm * 2)).toBe(true);

    await request(app.getHttpServer())
      .get(`/pedidos/feed/${pedidoFueraDeRadio}`)
      .set("Authorization", `Bearer ${profesionalRadio.accessToken}`)
      .expect(404);
  }, 30_000);

  it("pagina por cursor sin saltar ni repetir filas, con orden por 3 campos (urgencia, publicadoEn, id)", async () => {
    // Zona de barrios propia para este test (Recoleta), sin superponerse con
    // los pedidos de Palermo del test anterior: la cuenta de items visibles
    // tiene que ser exacta para probar que no faltan ni sobran filas.
    await guardarZonaBarrios(profesionalBarrios.accessToken, [barrioRecoletaId]);

    const urgencias: Urgencia[] = ["emergencia", "esta_semana", "sin_apuro"];
    const TOTAL_PEDIDOS = 25; // > TAMANIO_PAGINA_FEED (20): fuerza mas de una pagina.
    const idsCreados: string[] = [];
    for (let indice = 0; indice < TOTAL_PEDIDOS; indice += 1) {
      const id = await crearPedidoDirecto({
        clienteId: cliente.usuarioId,
        categoriaId: categoriaPlomeriaId,
        barrioId: barrioRecoletaId,
        urgencia: urgencias[indice % urgencias.length],
        publicadoEn: new Date(Date.now() - indice * 1000),
      });
      idsCreados.push(id);
    }

    const vistos = new Set<string>();
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const respuesta = await request(app.getHttpServer())
        .get("/pedidos/feed")
        .query(cursor ? { cursor } : {})
        .set("Authorization", `Bearer ${profesionalBarrios.accessToken}`)
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
    expect(vistos.size).toBe(TOTAL_PEDIDOS);
    for (const id of idsCreados) {
      expect(vistos.has(id)).toBe(true); // ninguna fila salteada
    }
  }, 30_000);
});
