import { type EstadoPedido, type Franja, type TipoPropiedad, type Urgencia } from "@fixeo/shared";

export const ETIQUETAS_FRANJA: Record<Franja, string> = {
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
};

export const ETIQUETAS_URGENCIA: Record<Urgencia, string> = {
  emergencia: "Emergencia",
  esta_semana: "Esta semana",
  sin_apuro: "Sin apuro",
};

export const ETIQUETAS_TIPO_PROPIEDAD: Record<TipoPropiedad, string> = {
  casa: "Casa",
  departamento: "Departamento",
  otro: "Otro",
};

export const ETIQUETAS_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  publicado: "Publicado",
  con_postulaciones: "Con postulaciones",
  contacto_habilitado: "Contacto habilitado",
  cerrado: "Cerrado",
  expirado: "Expirado",
  cancelado: "Cancelado",
  bloqueado: "Bloqueado",
};

// Centro aproximado de CABA (Obelisco): fallback cuando el usuario no comparte
// su ubicacion. No hay geocoding en este slice, asi que ningun dato lo muestra
// de vuelta; solo evita mandar un 0/0 sin sentido.
export const LAT_FALLBACK_AMBA = -34.6037;
export const LNG_FALLBACK_AMBA = -58.3816;
