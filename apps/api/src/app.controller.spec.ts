import { AppController } from "./app.controller.js";

describe("AppController", () => {
  it("responde estado ok en /salud", () => {
    const controller = new AppController();

    expect(controller.salud()).toEqual({ estado: "ok" });
  });
});
