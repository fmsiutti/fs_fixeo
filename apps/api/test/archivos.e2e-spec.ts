import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "../src/app.module.js";

async function crearImagenDePrueba(): Promise<Buffer> {
  return sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 200, b: 10 } },
  })
    .jpeg()
    .toBuffer();
}

describe("Archivos: subida y borrado de fotos de borrador (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sube una foto sin sesion y despues la borra", async () => {
    const borradorId = randomUUID();
    const imagen = await crearImagenDePrueba();

    const subida = await request(app.getHttpServer())
      .post("/pedidos/borrador/fotos")
      .field("borradorId", borradorId)
      .attach("foto", imagen, { filename: "foto.jpg", contentType: "image/jpeg" })
      .expect(201);
    expect(typeof subida.body.id).toBe("string");

    await request(app.getHttpServer())
      .delete(`/pedidos/borrador/fotos/${subida.body.id}`)
      .query({ borradorId })
      .expect(204);

    // Idempotente: borrar de nuevo lo que ya no existe no falla.
    await request(app.getHttpServer())
      .delete(`/pedidos/borrador/fotos/${subida.body.id}`)
      .query({ borradorId })
      .expect(204);
  });

  it("rechaza un id de foto que no es UUID en vez de intentar borrar esa ruta (path traversal)", async () => {
    const borradorId = randomUUID();
    const idMalicioso = "..%2F..%2F..%2F..%2Fetc%2Fpasswd";

    const respuesta = await request(app.getHttpServer())
      .delete(`/pedidos/borrador/fotos/${idMalicioso}`)
      .query({ borradorId })
      .expect(400);

    expect(respuesta.body.codigo).toBe("validacion");
  });

  it("rechaza un borradorId que no es UUID", async () => {
    await request(app.getHttpServer())
      .delete(`/pedidos/borrador/fotos/${randomUUID()}`)
      .query({ borradorId: "no-es-un-uuid" })
      .expect(400);
  });

  it("rechaza un mimetype que no es imagen", async () => {
    const respuesta = await request(app.getHttpServer())
      .post("/pedidos/borrador/fotos")
      .field("borradorId", randomUUID())
      .attach("foto", Buffer.from("no es una imagen"), {
        filename: "archivo.txt",
        contentType: "text/plain",
      })
      .expect(400);

    expect(respuesta.body.codigo).toBe("validacion");
  });

  it("topea la cantidad de fotos que se pueden subir para un mismo borradorId (fotos_max)", async () => {
    const borradorId = randomUUID();
    const imagen = await crearImagenDePrueba();

    // fotos_max sembrado es 6: subimos 6 sin problema y la septima rechaza.
    for (let i = 0; i < 6; i += 1) {
      await request(app.getHttpServer())
        .post("/pedidos/borrador/fotos")
        .field("borradorId", borradorId)
        .attach("foto", imagen, { filename: `foto-${i}.jpg`, contentType: "image/jpeg" })
        .expect(201);
    }

    const septima = await request(app.getHttpServer())
      .post("/pedidos/borrador/fotos")
      .field("borradorId", borradorId)
      .attach("foto", imagen, { filename: "foto-7.jpg", contentType: "image/jpeg" })
      .expect(400);

    expect(septima.body.codigo).toBe("validacion");
  }, 20_000);
});
