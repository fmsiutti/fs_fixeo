import {
  Body,
  Controller,
  FileTypeValidator,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { VerificacionVista } from "@fixeo/shared";
import { LimiteSolicitudes } from "../../common/decorators/limite-solicitudes.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { LimiteSolicitudesGuard } from "../../common/guards/limite-solicitudes.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { SubirDocumentoVerificacionDto } from "./dto/subir-documento-verificacion.dto.js";
import { VerificacionesService } from "./verificaciones.service.js";

@UseGuards(JwtAuthGuard)
@Controller("verificaciones")
export class VerificacionesController {
  constructor(private readonly verificacionesService: VerificacionesService) {}

  @Post("documentos")
  @UseGuards(LimiteSolicitudesGuard)
  @LimiteSolicitudes({ maximo: 20, ventanaMs: 60_000 })
  @UseInterceptors(FileInterceptor("documento"))
  subirDocumento(
    @UsuarioActual() usuario: Usuario,
    @UploadedFile(
      new ParseFilePipe({
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        validators: [
          // 10 MB: documentos de verificacion (foto o PDF), un poco mas
          // permisivo que las fotos de pedido (8 MB).
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^(image\/jpeg|image\/png|application\/pdf)$/,
            // Sin dependencia "file-type" para inspeccionar magic numbers
            // (CLAUDE.md: no agregar dependencias nuevas sin preguntar); se
            // valida el mimetype declarado. sharp falla mas adelante si una
            // imagen declarada no es realmente una imagen valida.
            skipMagicNumbersValidation: true,
          }),
        ],
      }),
    )
    archivo: Express.Multer.File,
    @Body() dto: SubirDocumentoVerificacionDto,
  ): Promise<VerificacionVista> {
    return this.verificacionesService.subirDocumento(usuario.id, archivo, dto);
  }
}
