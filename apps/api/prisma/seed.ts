import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { ExigenciaMatricula, PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL es requerida para correr el seed");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Categorias del piloto (documento §2.3, docs/dominio.md §1).
// subcategorias queda vacio: CL-03 no construyo todavia una pantalla para
// elegirlas (sin eso, sembrarlas seria contenido inerte). preguntasGuia si se
// completa: son 1 a 2 preguntas cortas por oficio para CL-03, redactadas para
// este seed (el documento funcional no detalla su contenido, no hay una
// decision D que las cubra).
const categorias: {
  nombre: string;
  slug: string;
  requiereMatricula: ExigenciaMatricula;
  preguntasGuia: string[];
}[] = [
  {
    nombre: "Plomería",
    slug: "plomeria",
    requiereMatricula: ExigenciaMatricula.no_exigida,
    preguntasGuia: ["¿Qué artefacto o instalación es?", "¿Hay pérdida de agua activa ahora?"],
  },
  {
    nombre: "Gas",
    slug: "gas",
    requiereMatricula: ExigenciaMatricula.obligatoria,
    preguntasGuia: ["¿Qué artefacto de gas es?", "¿Sentís olor a gas ahora?"],
  },
  {
    nombre: "Electricidad",
    slug: "electricidad",
    requiereMatricula: ExigenciaMatricula.obligatoria,
    preguntasGuia: ["¿Qué parte de la instalación falla?", "¿Se cortó la luz en toda la casa?"],
  },
  {
    nombre: "Pintura",
    slug: "pintura",
    requiereMatricula: ExigenciaMatricula.no_exigida,
    preguntasGuia: ["¿Interior o exterior?", "¿Cuántos ambientes aproximadamente?"],
  },
  {
    nombre: "Albañilería",
    slug: "albanileria",
    requiereMatricula: ExigenciaMatricula.no_exigida,
    preguntasGuia: ["¿Qué tipo de trabajo necesitás?", "¿Es una reparación chica o una obra?"],
  },
  {
    nombre: "Aire acondicionado",
    slug: "aire-acondicionado",
    requiereMatricula: ExigenciaMatricula.recomendada,
    preguntasGuia: ["¿Instalación o reparación?", "¿Qué tipo de equipo tenés o querés instalar?"],
  },
  {
    nombre: "Carpintería",
    slug: "carpinteria",
    requiereMatricula: ExigenciaMatricula.no_exigida,
    preguntasGuia: ["¿Qué mueble o estructura es?", "¿Es a medida o una reparación?"],
  },
  {
    nombre: "Cerrajería",
    slug: "cerrajeria",
    requiereMatricula: ExigenciaMatricula.no_exigida,
    preguntasGuia: ["¿Quedaste afuera o es un cambio de cerradura?", "¿Qué tipo de cerradura es?"],
  },
  // D1 (docs/dominio.md §12): la categoria "Otro" es la que dispara en_revision
  // al publicar. Necesita existir como fila real para que Pedido.categoriaId
  // pueda referenciarla, no un slug hardcodeado en el codigo del asistente.
  // Sin preguntas guia: ya va a revision siempre, no necesita guiar nada.
  {
    nombre: "Otro",
    slug: "otro",
    requiereMatricula: ExigenciaMatricula.no_exigida,
    preguntasGuia: [],
  },
];

// Catalogo de barrios (decision D10, docs/dominio.md §12): los 48 barrios de
// CABA (15 comunas) mas los partidos del primer cordon del GBA. Todo el
// conjunto arranca activo porque ES la zona del piloto.
const barriosCaba = [
  "Agronomía",
  "Almagro",
  "Balvanera",
  "Barracas",
  "Belgrano",
  "Boedo",
  "Caballito",
  "Chacarita",
  "Coghlan",
  "Colegiales",
  "Constitución",
  "Flores",
  "Floresta",
  "La Boca",
  "La Paternal",
  "Liniers",
  "Mataderos",
  "Monte Castro",
  "Montserrat",
  "Nueva Pompeya",
  "Núñez",
  "Palermo",
  "Parque Avellaneda",
  "Parque Chacabuco",
  "Parque Chas",
  "Parque Patricios",
  "Puerto Madero",
  "Recoleta",
  "Retiro",
  "Saavedra",
  "San Cristóbal",
  "San Nicolás",
  "San Telmo",
  "Vélez Sársfield",
  "Versalles",
  "Villa Crespo",
  "Villa del Parque",
  "Villa Devoto",
  "Villa General Mitre",
  "Villa Lugano",
  "Villa Luro",
  "Villa Ortúzar",
  "Villa Pueyrredón",
  "Villa Real",
  "Villa Riachuelo",
  "Villa Santa Rita",
  "Villa Soldati",
  "Villa Urquiza",
];

const partidosPrimerCordon = [
  "Vicente López",
  "San Isidro",
  "San Fernando",
  "Tigre",
  "San Martín",
  "Tres de Febrero",
  "Hurlingham",
  "Ituzaingó",
  "Morón",
  "La Matanza",
  "Ezeiza",
  "Esteban Echeverría",
  "Almirante Brown",
  "Lomas de Zamora",
  "Lanús",
  "Avellaneda",
  "Quilmes",
];

const barrios = [...barriosCaba, ...partidosPrimerCordon];

// Parametros de negocio (docs/dominio.md §5), valores iniciales del piloto.
const parametros: { clave: string; valor: number | string }[] = [
  { clave: "postulaciones_max_por_pedido", valor: 8 },
  { clave: "postulaciones_max_por_profesional_dia", valor: 10 },
  { clave: "pedidos_activos_max_por_cliente", valor: 3 },
  { clave: "seleccionables_max_por_pedido", valor: 3 },
  { clave: "pedido_vigencia_dias", valor: 7 },
  { clave: "cierre_automatico_dias", valor: 14 },
  { clave: "postergacion_desenlace_dias", valor: 7 },
  { clave: "notificados_iniciales", valor: 30 },
  { clave: "cuota_rotacion_porcentaje", valor: 20 },
  { clave: "rotacion_resenias_umbral", valor: 5 },
  { clave: "aviso_sin_postulaciones_horas", valor: 12 },
  { clave: "consulta_contacto_horas", valor: 48 },
  { clave: "consulta_desenlace_dias", valor: 7 },
  { clave: "aviso_expiracion_dia", valor: 6 },
  { clave: "descarte_reversible_horas", valor: 24 },
  { clave: "descripcion_min", valor: 20 },
  { clave: "descripcion_max", valor: 1000 },
  { clave: "fotos_max", valor: 6 },
  { clave: "documentos_verificacion_max", valor: 5 },
  { clave: "limite_diario_zona_horaria", valor: "America/Argentina/Buenos_Aires" },
];

// Los tres upsert de abajo son deliberadamente "create-only" en el `update`
// para todo lo que un operador puede llegar a cambiar despues del seed
// inicial (activa/activo, valor): D10 dice que los barrios activos se editan
// "sin migracion ni deploy" desde AD-04, y docs/dominio.md §5 dice que los
// parametros "van a cambiar durante el piloto". Si el `update` reescribiera
// esos campos, un `prisma migrate dev` (que corre el seed solo) pisaria
// cualquier edicion operativa de vuelta a estos valores iniciales.

async function seedCategorias(): Promise<void> {
  for (const categoria of categorias) {
    await prisma.categoria.upsert({
      where: { slug: categoria.slug },
      update: {
        nombre: categoria.nombre,
        requiereMatricula: categoria.requiereMatricula,
      },
      create: {
        nombre: categoria.nombre,
        slug: categoria.slug,
        subcategorias: [],
        preguntasGuia: categoria.preguntasGuia,
        requiereMatricula: categoria.requiereMatricula,
        activa: true,
      },
    });
  }
}

// Ojo al editar nombres de esta lista: el upsert es por `nombre`, asi que
// renombrar un barrio ya sembrado CREA una fila nueva y deja la vieja activa
// y visible en GET /barrios para siempre (nadie la borra sola). Si hace falta
// renombrar uno, borrar a mano la fila vieja despues de correr el seed. Ya
// paso una vez con "Vélez Sarsfield" -> "Vélez Sársfield".
async function seedBarrios(): Promise<void> {
  for (const nombre of barrios) {
    await prisma.barrio.upsert({
      where: { nombre },
      update: {},
      create: { nombre, activo: true },
    });
  }
}

async function seedParametros(): Promise<void> {
  for (const parametro of parametros) {
    await prisma.parametroNegocio.upsert({
      where: { clave: parametro.clave },
      update: {},
      create: { clave: parametro.clave, valor: parametro.valor },
    });
  }
}

async function main(): Promise<void> {
  await seedCategorias();
  await seedBarrios();
  await seedParametros();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
