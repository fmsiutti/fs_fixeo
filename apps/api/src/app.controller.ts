import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("salud")
  salud(): { estado: "ok" } {
    return { estado: "ok" };
  }
}
