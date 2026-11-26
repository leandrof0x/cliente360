export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: "nombre", label: "Nombre completo del cliente" },
  { key: "primer_nombre", label: "Primer nombre del cliente" },
  { key: "empresa_cliente", label: "Empresa del cliente" },
  { key: "negocio", label: "Nombre de tu negocio" },
  { key: "vendedor", label: "Tu nombre" },
  { key: "producto", label: "Producto o servicio de la oportunidad" },
  { key: "valor", label: "Valor estimado de la oportunidad" },
];

export const TEMPLATE_CATEGORIES = ["Bienvenida", "Seguimiento", "Cotización", "Recordatorio", "Agradecimiento", "Reactivación", "Otro"];

export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string | null | undefined>>;

/** Reemplaza {variable} por su valor. Las variables sin dato se quitan prolijamente. */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body
    .replace(/\{(\w+)\}/g, (match, key: string) => {
      if (!TEMPLATE_VARIABLES.some((v) => v.key === key)) return match;
      return (vars[key] ?? "").toString().trim();
    })
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Plantillas sugeridas que el usuario puede agregar con un clic (y luego editar). */
export const STARTER_TEMPLATES: { name: string; category: string; body: string }[] = [
  {
    name: "Bienvenida a nueva consulta",
    category: "Bienvenida",
    body: "¡Hola {primer_nombre}! Gracias por comunicarte con {negocio}. Soy {vendedor} y te voy a ayudar con tu consulta. ¿Me contás un poco más de lo que necesitás?",
  },
  {
    name: "Seguimiento de cotización",
    category: "Seguimiento",
    body: "Hola {primer_nombre}, ¿cómo estás? Te escribo de {negocio} para saber si pudiste revisar la propuesta de {producto}. Quedo atento a cualquier duda.",
  },
  {
    name: "Envío de cotización",
    category: "Cotización",
    body: "Hola {primer_nombre}, te paso la cotización de {producto} por un total de {valor}. Si te parece bien, coordinamos los próximos pasos.",
  },
  {
    name: "Recordatorio de cita",
    category: "Recordatorio",
    body: "Hola {primer_nombre}, te recordamos tu cita con {negocio}. Si necesitás reprogramar, avisanos por este medio. ¡Te esperamos!",
  },
  {
    name: "Agradecimiento por la compra",
    category: "Agradecimiento",
    body: "¡Gracias por tu compra, {primer_nombre}! En {negocio} valoramos tu confianza. Cualquier cosa que necesites, escribinos.",
  },
  {
    name: "Reactivar cliente",
    category: "Reactivación",
    body: "Hola {primer_nombre}, hace un tiempo que no hablamos. En {negocio} tenemos novedades que te pueden interesar. ¿Te cuento?",
  },
];
