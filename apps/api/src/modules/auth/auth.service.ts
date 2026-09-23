import { createHash, randomBytes } from "node:crypto";
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { CanalOtp, UsuarioVista } from "@fixeo/shared";
import type { Env } from "../../config/env.schema.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { PROVEEDOR_OTP, type ProveedorOtp } from "../../infra/twilio/proveedor-otp.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { mapearUsuarioAVista } from "../usuarios/usuarios.vistas.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DIAS = 30;

// Limites de OTP por telefono, en memoria: alcanza para una sola instancia de
// la api (piloto). Con mas de una instancia esto necesitaria un store
// compartido (Redis) en vez de un Map local.
const VENTANA_LIMITE_TELEFONO_MS = 10 * 60 * 1000;
const MAX_SOLICITUDES_POR_TELEFONO = 3;
const MAX_INTENTOS_CONFIRMAR_POR_TELEFONO = 5;

function excepcionLimiteExcedido(mensaje: string): HttpException {
  return new HttpException({ codigo: "limite_excedido", mensaje }, HttpStatus.TOO_MANY_REQUESTS);
}

interface Contador {
  intentos: number;
  ventanaDesde: number;
}

/** Poda entradas de ventana vencida para que el Map no crezca sin techo. */
function podarVencidos(mapa: Map<string, Contador>, ventanaMs: number, ahora: number): void {
  for (const [clave, contador] of mapa) {
    if (ahora - contador.ventanaDesde > ventanaMs) {
      mapa.delete(clave);
    }
  }
}

export interface SesionEmitida {
  accessToken: string;
  refreshTokenPlano: string;
  refreshTokenExpiraEn: Date;
  usuario: UsuarioVista;
}

@Injectable()
export class AuthService {
  private readonly intentosSolicitarPorTelefono = new Map<string, Contador>();
  private readonly intentosConfirmarPorTelefono = new Map<string, Contador>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
    @Inject(PROVEEDOR_OTP) private readonly proveedorOtp: ProveedorOtp,
  ) {}

  async solicitarOtp(telefono: string, canal: CanalOtp): Promise<void> {
    this.chequearLimite(
      this.intentosSolicitarPorTelefono,
      telefono,
      MAX_SOLICITUDES_POR_TELEFONO,
      "Demasiadas solicitudes de codigo para este telefono, esperá unos minutos",
    );
    await this.proveedorOtp.enviarCodigo(telefono, canal);
  }

  async confirmarOtp(telefono: string, codigo: string): Promise<SesionEmitida> {
    this.chequearLimite(
      this.intentosConfirmarPorTelefono,
      telefono,
      MAX_INTENTOS_CONFIRMAR_POR_TELEFONO,
      "Demasiados intentos con este telefono, pedí un codigo nuevo en unos minutos",
    );

    const valido = await this.proveedorOtp.verificarCodigo(telefono, codigo);
    if (!valido) {
      throw new UnauthorizedException({
        codigo: "otp_invalido",
        mensaje: "El codigo es invalido o expiro",
      });
    }
    // Codigo correcto: el intento no cuenta contra el limite de fuerza bruta.
    this.intentosConfirmarPorTelefono.delete(telefono);

    const ahora = new Date();
    const usuario = await this.prisma.usuario.upsert({
      where: { telefono },
      update: { ultimoAcceso: ahora },
      create: { telefono, ultimoAcceso: ahora },
    });

    if (usuario.estado !== "activo") {
      throw new ForbiddenException({
        codigo: "cuenta_suspendida",
        mensaje: "Esta cuenta no puede iniciar sesion",
      });
    }

    return this.emitirSesion(usuario);
  }

  async refrescar(refreshTokenPlano: string): Promise<SesionEmitida> {
    const tokenHash = this.hashearToken(refreshTokenPlano);
    const registro = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!registro || registro.revocadoEn || registro.expiraEn < new Date()) {
      throw new UnauthorizedException({ codigo: "refresh_invalido", mensaje: "La sesion vencio" });
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { id: registro.usuarioId } });
    if (!usuario || usuario.estado !== "activo") {
      throw new UnauthorizedException({ codigo: "refresh_invalido", mensaje: "La sesion vencio" });
    }

    // Rotacion: el token usado se revoca y se emite uno nuevo, dentro de una
    // transaccion. El `updateMany` con `revocadoEn: null` en el where hace la
    // revocacion atomica: si dos requests llegan con el mismo token a la vez,
    // solo una gana la carrera (count === 1); la otra ve count === 0 y, en vez
    // de emitir una segunda sesion valida a partir de un token ya usado (señal
    // de robo de cookie), revoca TODAS las sesiones del usuario.
    const ahora = new Date();
    const { plano, hash, expiraEn } = this.generarRefreshToken();
    const resultado = await this.prisma.$transaction(async (tx) => {
      const revocacion = await tx.refreshToken.updateMany({
        where: { id: registro.id, revocadoEn: null },
        data: { revocadoEn: ahora },
      });
      if (revocacion.count === 0) {
        return null;
      }
      await tx.refreshToken.create({ data: { usuarioId: usuario.id, tokenHash: hash, expiraEn } });
      return tx.usuario.update({ where: { id: usuario.id }, data: { ultimoAcceso: ahora } });
    });

    if (!resultado) {
      await this.prisma.refreshToken.updateMany({
        where: { usuarioId: usuario.id, revocadoEn: null },
        data: { revocadoEn: ahora },
      });
      throw new UnauthorizedException({ codigo: "refresh_invalido", mensaje: "La sesion vencio" });
    }

    const accessToken = await this.emitirAccessToken(usuario.id, usuario.rolActivo);
    return {
      accessToken,
      refreshTokenPlano: plano,
      refreshTokenExpiraEn: expiraEn,
      usuario: mapearUsuarioAVista(resultado),
    };
  }

  async cerrarSesion(refreshTokenPlano: string | undefined): Promise<void> {
    if (!refreshTokenPlano) return;
    const tokenHash = this.hashearToken(refreshTokenPlano);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }

  private chequearLimite(
    mapa: Map<string, Contador>,
    clave: string,
    maximo: number,
    mensaje: string,
  ): void {
    const ahora = Date.now();
    podarVencidos(mapa, VENTANA_LIMITE_TELEFONO_MS, ahora);
    const registro = mapa.get(clave);

    if (!registro || ahora - registro.ventanaDesde > VENTANA_LIMITE_TELEFONO_MS) {
      mapa.set(clave, { intentos: 1, ventanaDesde: ahora });
      return;
    }

    if (registro.intentos >= maximo) {
      throw excepcionLimiteExcedido(mensaje);
    }

    registro.intentos += 1;
  }

  private async emitirSesion(usuario: Usuario): Promise<SesionEmitida> {
    const accessToken = await this.emitirAccessToken(usuario.id, usuario.rolActivo);
    const { plano, hash, expiraEn } = this.generarRefreshToken();
    await this.prisma.refreshToken.create({
      data: { usuarioId: usuario.id, tokenHash: hash, expiraEn },
    });

    return {
      accessToken,
      refreshTokenPlano: plano,
      refreshTokenExpiraEn: expiraEn,
      usuario: mapearUsuarioAVista(usuario),
    };
  }

  private emitirAccessToken(
    usuarioId: string,
    rolActivo: UsuarioVista["rolActivo"],
  ): Promise<string> {
    const secret = this.configService.get("JWT_ACCESS_SECRET", { infer: true });
    return this.jwtService.signAsync(
      { sub: usuarioId, rol: rolActivo },
      { secret, expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  private generarRefreshToken(): { plano: string; hash: string; expiraEn: Date } {
    const plano = randomBytes(32).toString("hex");
    const expiraEn = new Date(Date.now() + REFRESH_TOKEN_TTL_DIAS * 24 * 60 * 60 * 1000);
    return { plano, hash: this.hashearToken(plano), expiraEn };
  }

  private hashearToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
