import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { UsuarioVista } from "@fixeo/shared";
import type { Env } from "../../config/env.schema.js";
import { LimiteSolicitudes } from "../../common/decorators/limite-solicitudes.decorator.js";
import { LimiteSolicitudesGuard } from "../../common/guards/limite-solicitudes.guard.js";
import { AuthService } from "./auth.service.js";
import { SolicitarOtpDto } from "./dto/solicitar-otp.dto.js";
import { ConfirmarOtpDto } from "./dto/confirmar-otp.dto.js";
import { NOMBRE_COOKIE_REFRESH } from "./auth.constants.js";

interface RespuestaSesion {
  accessToken: string;
  usuario: UsuarioVista;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  @Post("otp/solicitar")
  @UseGuards(LimiteSolicitudesGuard)
  @LimiteSolicitudes({ maximo: 5, ventanaMs: 60_000 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async solicitarOtp(@Body() dto: SolicitarOtpDto): Promise<void> {
    await this.authService.solicitarOtp(dto.telefono, dto.canal);
  }

  @Post("otp/confirmar")
  @UseGuards(LimiteSolicitudesGuard)
  @LimiteSolicitudes({ maximo: 10, ventanaMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  async confirmarOtp(
    @Body() dto: ConfirmarOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespuestaSesion> {
    const sesion = await this.authService.confirmarOtp(dto.telefono, dto.codigo);
    this.setearCookieRefresh(res, sesion.refreshTokenPlano, sesion.refreshTokenExpiraEn);
    return { accessToken: sesion.accessToken, usuario: sesion.usuario };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refrescar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespuestaSesion> {
    const refreshTokenPlano = this.leerCookieRefresh(req);
    if (!refreshTokenPlano) {
      this.limpiarCookieRefresh(res);
      throw new UnauthorizedException({ codigo: "refresh_invalido", mensaje: "Falta la sesion" });
    }

    try {
      const sesion = await this.authService.refrescar(refreshTokenPlano);
      this.setearCookieRefresh(res, sesion.refreshTokenPlano, sesion.refreshTokenExpiraEn);
      return { accessToken: sesion.accessToken, usuario: sesion.usuario };
    } catch (error) {
      this.limpiarCookieRefresh(res);
      throw error;
    }
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshTokenPlano = this.leerCookieRefresh(req);
    await this.authService.cerrarSesion(refreshTokenPlano);
    this.limpiarCookieRefresh(res);
  }

  private leerCookieRefresh(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[NOMBRE_COOKIE_REFRESH];
  }

  private setearCookieRefresh(res: Response, valor: string, expiraEn: Date): void {
    res.cookie(NOMBRE_COOKIE_REFRESH, valor, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.configService.get("NODE_ENV", { infer: true }) === "production",
      expires: expiraEn,
      path: "/",
    });
  }

  private limpiarCookieRefresh(res: Response): void {
    res.clearCookie(NOMBRE_COOKIE_REFRESH, { path: "/" });
  }
}
