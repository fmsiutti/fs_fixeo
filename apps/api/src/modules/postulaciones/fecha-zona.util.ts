/**
 * D7 (docs/dominio.md §12): "el dia corre de medianoche a medianoche en
 * America/Argentina/Buenos_Aires". Sin agregar una libreria de fechas
 * (CLAUDE.md raiz, anti-sobreingenieria #4): `Intl.DateTimeFormat` alcanza
 * para resolver el offset de la zona horaria del parametro de negocio
 * (`limite_diario_zona_horaria`) sin hardcodear "-03:00".
 *
 * Argentina no tiene horario de verano desde 2009, asi que el offset es fijo
 * y sumarle 24 h a la medianoche de hoy da exactamente la medianoche de
 * manana. Si el parametro apuntara a una zona con horario de verano el
 * calculo de "proxima medianoche" podria errar por una hora en el dia del
 * cambio; no es el caso de este piloto.
 */

/** Offset en minutos entre la zona horaria y UTC (positivo = al este de UTC) en el instante `fecha`. */
function offsetMinutos(zona: string, fecha: Date): number {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partes = Object.fromEntries(
    formateador.formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
  );
  return (comoUtc - fecha.getTime()) / 60_000;
}

/** Instante UTC de la medianoche local (00:00) del dia de `fecha` en `zona`. */
export function inicioDelDiaEnZona(fecha: Date, zona: string): Date {
  const offset = offsetMinutos(zona, fecha);
  const formateadorFecha = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const partes = Object.fromEntries(
    formateadorFecha.formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  const medianocheComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
  );
  return new Date(medianocheComoUtc - offset * 60_000);
}

/** Instante UTC de la proxima medianoche local en `zona`, a partir de `fecha` (D7: "a que hora se renueva"). */
export function proximaMedianocheEnZona(fecha: Date, zona: string): Date {
  const inicioDeHoy = inicioDelDiaEnZona(fecha, zona);
  return new Date(inicioDeHoy.getTime() + 24 * 60 * 60 * 1000);
}
