import type { Profile } from "./types";

export type SeedProfile = Omit<Profile, "id" | "createdAt" | "embedding">;

export const SEED_PROFILES: { id: string; data: SeedProfile }[] = [
  {
    id: "seed_camila_silva",
    data: {
      name: "Camila Silva",
      summary:
        "Joven de 21 años que manejó las redes y las ventas del negocio de comida de su tía durante 2 años. Aprende sola, responde clientes y maneja caos de local pequeño.",
      skills: ["Gestión de Redes Sociales", "Ventas B2C", "Atención al Cliente", "Copywriting básico"],
      traits: ["Tolerancia al caos", "Autodidacta", "Orientación a resultados", "Proactividad"],
      evidence: [
        {
          skill: "Ventas B2C",
          quote: "En 6 meses triplicó las ventas del local de su tía gracias al manejo de pedidos por Instagram.",
        },
        {
          skill: "Gestión de Redes Sociales",
          quote: "Aprendió sola a usar Reels y consiguió 200 clientes nuevos sin pagar publicidad.",
        },
        {
          skill: "Atención al Cliente",
          quote: "Respondía mensajes a toda hora y resolvía reclamos sin tener un protocolo.",
        },
      ],
    },
  },
  {
    id: "seed_andres_bermejo",
    data: {
      name: "Andrés Bermejo",
      summary:
        "Joven 23, autodidacta. Le armó al taller mecánico de su barrio un sistema simple en Excel para llevar órdenes y proveedores. Termina lo que empieza.",
      skills: ["Excel intermedio", "Organización operativa", "Soporte básico", "Resolución de problemas"],
      traits: ["Autodidacta", "Metódico", "Tolerancia a la frustración"],
      evidence: [
        {
          skill: "Organización operativa",
          quote: "Diseñó una planilla que reemplazó las anotaciones en papel del taller; redujo errores en pedidos.",
        },
        {
          skill: "Autodidacta",
          quote: "Aprendió fórmulas y validaciones de Excel por YouTube sin que nadie le pidiera.",
        },
      ],
    },
  },
  {
    id: "seed_luisa_pertuz",
    data: {
      name: "Luisa Pertuz",
      summary:
        "Joven 20, trabajó como mesera informal en cumpleaños y eventos familiares. Buena con gente, paciente, traduce reclamos en soluciones.",
      skills: ["Atención al Cliente", "Hospitalidad", "Trabajo bajo presión", "Comunicación interpersonal"],
      traits: ["Empatía", "Calma bajo presión", "Tolerancia al caos"],
      evidence: [
        {
          skill: "Atención al Cliente",
          quote: "En un evento de 80 personas manejó sola los reclamos de comida demorada sin que escalara.",
        },
        {
          skill: "Trabajo bajo presión",
          quote: "Hizo turnos de 8 horas seguidas atendiendo mesas, sin perder amabilidad.",
        },
      ],
    },
  },
  {
    id: "seed_jhon_marquez",
    data: {
      name: "Jhon Márquez",
      summary:
        "Joven 22, creador de contenido en TikTok para emprendimientos locales pequeños. Escribe ganchos y entiende qué hace que un video llegue.",
      skills: ["Creación de contenido", "Copywriting", "Edición de video básica", "Estrategia de TikTok"],
      traits: ["Creatividad", "Curiosidad", "Autonomía"],
      evidence: [
        {
          skill: "Creación de contenido",
          quote: "Un video que escribió y editó para una panadería del barrio llegó a 80 mil vistas orgánicas.",
        },
        {
          skill: "Copywriting",
          quote: "Reescribió las descripciones de productos de una tienda online y subieron los clics.",
        },
      ],
    },
  },
  {
    id: "seed_maritza_polo",
    data: {
      name: "Maritza Polo",
      summary:
        "Joven 24, ayudaba a su mamá en la tienda del barrio: pedidos, inventario, fiados, cuadre diario de caja. Sabe llevar números chicos.",
      skills: ["Inventario", "Manejo de caja", "Atención al Cliente", "Operaciones de tienda"],
      traits: ["Responsable", "Detallista", "Orientación a resultados"],
      evidence: [
        {
          skill: "Manejo de caja",
          quote: "Cuadraba la caja diaria y detectó faltantes que nadie había visto durante meses.",
        },
        {
          skill: "Inventario",
          quote: "Ordenó el stock de la tienda y armó un sistema de pedidos al proveedor por WhatsApp.",
        },
      ],
    },
  },
];
