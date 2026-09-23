import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";

describe("Eventos: registro de analitica del asistente (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoriaPlomeriaId: string;
  const eventoIdsCreados: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const categoriaPlomeria = await prisma.categoria.findUniqueOrThrow({
      where: { slug: "plomeria" },
    });
    categoriaPlomeriaId = categoriaPlomeria.id;
  });

  afterAll(async () => {
    await prisma.eventoAnalitico.deleteMany({ where: { id: { in: eventoIdsCreados } } });
    await app.close();
  });

  it("registra un evento del asistente sin sesion, resolviendo categoriaId contra el catalogo", async () => {
    await request(app.getHttpServer())
      .post("/eventos")
      .send({ tipo: "asistente_iniciado", categoriaId: categoriaPlomeriaId })
      .expect(204);

    const evento = await prisma.eventoAnalitico.findFirstOrThrow({
      where: { tipo: "asistente_iniciado", categoria: "plomeria" },
      orderBy: { creadoEn: "desc" },
    });
    eventoIdsCreados.push(evento.id);
    expect(evento.rol).toBe("cliente");
    expect(evento.usuarioId).toBeNull();
  });

  it("guarda categoria null en vez de fallar si el id no corresponde a ninguna categoria real", async () => {
    await request(app.getHttpServer())
      .post("/eventos")
      .send({ tipo: "asistente_paso_completado", categoriaId: crypto.randomUUID(), paso: "que" })
      .expect(204);

    const evento = await prisma.eventoAnalitico.findFirstOrThrow({
      where: { tipo: "asistente_paso_completado" },
      orderBy: { creadoEn: "desc" },
    });
    eventoIdsCreados.push(evento.id);
    expect(evento.categoria).toBeNull();
    expect(evento.metadata).toEqual({ paso: "que" });
  });

  it("rechaza un tipo de evento que no le corresponde disparar al cliente", async () => {
    // pedido_publicado y limite_alcanzado los registra el backend directo
    // desde PedidosService, nunca a pedido del cliente.
    await request(app.getHttpServer())
      .post("/eventos")
      .send({ tipo: "pedido_publicado" })
      .expect(400);
  });

  it("rechaza un categoriaId que no es un uuid valido, en vez de aceptar texto libre", async () => {
    await request(app.getHttpServer())
      .post("/eventos")
      .send({ tipo: "asistente_iniciado", categoriaId: "cualquier-cosa" })
      .expect(400);
  });
});
