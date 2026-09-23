import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { LimiteSolicitudes } from "../../common/decorators/limite-solicitudes.decorator.js";
import { LimiteSolicitudesGuard } from "../../common/guards/limite-solicitudes.guard.js";
import { ArchivosService, type FotoSubida } from "./archivos.service.js";
import { EliminarFotoBorradorDto } from "./dto/eliminar-foto-borrador.dto.js";
import { SubirFotoBorradorDto } from "./dto/subir-foto-borrador.dto.js";

const TAMANIO_MAXIMO_BYTES = 8 * 1024 * 1024;

// Publico (sin JwtAuthGuard): el asistente sube fotos antes de que exista
// cuenta o pedido (CL-03, la cuenta se pide al final). El borradorId es la
// unica identidad, no requiere autenticacion.
@Controller("pedidos/borrador/fotos")
export class ArchivosController {
  constructor(private readonly archivosService: ArchivosService) {}

  @Post()
  @UseGuards(LimiteSolicitudesGuard)
  @LimiteSolicitudes({ maximo: 30, ventanaMs: 60_000 })
  @UseInterceptors(FileInterceptor("foto"))
  subirFoto(
    @UploadedFile(
      new ParseFilePipe({
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        validators: [
          new MaxFileSizeValidator({ maxSize: TAMANIO_MAXIMO_BYTES }),
          new FileTypeValidator({
            fileType: /^(image\/jpeg|image\/png|image\/webp)$/,
            // No hay dependencia "file-type" instalada (CLAUDE.md: no agregar
            // dependencias nuevas sin preguntar) para inspeccionar los magic
            // numbers del archivo; se valida el mimetype declarado por el
            // cliente. sharp igual falla mas adelante si el contenido no es
            // una imagen valida.
            skipMagicNumbersValidation: true,
          }),
        ],
      }),
    )
    archivo: Express.Multer.File,
    @Body() dto: SubirFotoBorradorDto,
  ): Promise<FotoSubida> {
    return this.archivosService.subirFotoBorrador(dto.borradorId, archivo);
  }

  @Delete(":id")
  @UseGuards(LimiteSolicitudesGuard)
  @LimiteSolicitudes({ maximo: 30, ventanaMs: 60_000 })
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminarFoto(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: EliminarFotoBorradorDto,
  ): Promise<void> {
    return this.archivosService.eliminarFotoBorrador(query.borradorId, id);
  }
}
