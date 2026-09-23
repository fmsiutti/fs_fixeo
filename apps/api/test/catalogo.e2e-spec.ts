import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { barrioVistaSchema, categoriaVistaSchema } from "@fixeo/shared";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infra/prisma/prisma.service.js";

const SLUG_CATEGORIA_INACTIVA = "zz-test-categoria-inactiva";
const NOMBRE_BARRIO_INACTIVO = "zz-test-barrio-inactivo";

describe("Catalogo: GET /categorias y GET /barrios (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.categoria.deleteMany({ where: { slug: SLUG_CATEGORIA_INACTIVA } });
    await prisma.barrio.deleteMany({ where: { nombre: NOMBRE_BARRIO_INACTIVO } });
    await app.close();
  });

  describe("GET /categorias", () => {
    it("devuelve 200 sin autenticacion con las 9 categorias sembradas (8 del piloto + Otro), con el shape de CategoriaVista", async () => {
      const respuesta = await request(app.getHttpServer()).get("/categorias").expect(200);

      expect(Array.isArray(respuesta.body)).toBe(true);
      expect(respuesta.body.length).toBe(9);
      for (const categoria of respuesta.body) {
        categoriaVistaSchema.parse(categoria);
      }

      const gas = respuesta.body.find((categoria: { slug: string }) => categoria.slug === "gas");
      expect(gas).toBeDefined();
      expect(gas.requiereMatricula).toBe("obligatoria");

      const plomeria = respuesta.body.find(
        (categoria: { slug: string }) => categoria.slug === "plomeria",
      );
      expect(plomeria).toBeDefined();
      expect(plomeria.requiereMatricula).toBe("no_exigida");

      // D1 (docs/dominio.md §12): "Otro" dispara en_revision al publicar y
      // necesita existir como categoria real, no un slug hardcodeado.
      const otro = respuesta.body.find((categoria: { slug: string }) => categoria.slug === "otro");
      expect(otro).toBeDefined();
      expect(otro.requiereMatricula).toBe("no_exigida");
    });

    it("no devuelve categorias con activa = false", async () => {
      await prisma.categoria.create({
        data: {
          nombre: "ZZ Test Categoria Inactiva",
          slug: SLUG_CATEGORIA_INACTIVA,
          subcategorias: [],
          preguntasGuia: [],
          requiereMatricula: "no_exigida",
          activa: false,
        },
      });

      const respuesta = await request(app.getHttpServer()).get("/categorias").expect(200);

      const encontrada = respuesta.body.find(
        (categoria: { slug: string }) => categoria.slug === SLUG_CATEGORIA_INACTIVA,
      );
      expect(encontrada).toBeUndefined();
    });
  });

  describe("GET /barrios", () => {
    it("devuelve 200 sin autenticacion con los 65 barrios sembrados, con el shape de BarrioVista", async () => {
      const respuesta = await request(app.getHttpServer()).get("/barrios").expect(200);

      expect(Array.isArray(respuesta.body)).toBe(true);
      expect(respuesta.body.length).toBe(65);
      for (const barrio of respuesta.body) {
        barrioVistaSchema.parse(barrio);
      }

      const palermo = respuesta.body.find(
        (barrio: { nombre: string }) => barrio.nombre === "Palermo",
      );
      expect(palermo).toBeDefined();
    });

    it("no devuelve barrios con activo = false", async () => {
      await prisma.barrio.create({
        data: { nombre: NOMBRE_BARRIO_INACTIVO, activo: false },
      });

      const respuesta = await request(app.getHttpServer()).get("/barrios").expect(200);

      const encontrado = respuesta.body.find(
        (barrio: { nombre: string }) => barrio.nombre === NOMBRE_BARRIO_INACTIVO,
      );
      expect(encontrado).toBeUndefined();
    });
  });
});
