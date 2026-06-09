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
  {
    id: "seed_diego_castro",
    data: {
      name: "Diego Castro",
      summary:
        "Joven 22 de Barranquilla. Se enseñó solo a hacer páginas web simples para tiendas del barrio — landing pages en HTML/CSS, formularios que llegan a WhatsApp.",
      skills: ["HTML/CSS", "WordPress básico", "Formularios web", "Atención al cliente"],
      traits: ["Autodidacta", "Curiosidad técnica", "Resolución de problemas"],
      evidence: [
        {
          skill: "HTML/CSS",
          quote: "Aprendió HTML y CSS por YouTube y le hizo la landing a 4 negocios del barrio sin haber estudiado programación.",
        },
        {
          skill: "Formularios web",
          quote: "Conectó un formulario de contacto a WhatsApp Business para una panadería; los pedidos pasaron de llamadas a chats.",
        },
      ],
    },
  },
  {
    id: "seed_natalia_meza",
    data: {
      name: "Natalia Meza",
      summary:
        "Joven 20, ayudó a la cooperativa de su madre con planillas de pagos y reportes mensuales. Buena con Excel y con explicar números a gente no técnica.",
      skills: ["Excel intermedio", "Reportes operativos", "Comunicación con stakeholders", "Análisis básico de datos"],
      traits: ["Detallista", "Paciencia", "Calma bajo presión"],
      evidence: [
        {
          skill: "Excel intermedio",
          quote: "Armó la planilla de pagos mensuales de 60 asociados de la cooperativa; antes lo llevaban en cuaderno.",
        },
        {
          skill: "Comunicación con stakeholders",
          quote: "Explicaba a las socias mayores cómo leer el reporte mensual sin hacerlas sentir incómodas.",
        },
      ],
    },
  },
  {
    id: "seed_kevin_ortega",
    data: {
      name: "Kevin Ortega",
      summary:
        "Joven 23 de Soledad, trabajó como repartidor un año y montó un grupo de WhatsApp con clientes recurrentes para programar pedidos del barrio.",
      skills: ["Logística básica", "WhatsApp Business", "Atención al Cliente", "Coordinación operativa"],
      traits: ["Proactividad", "Tolerancia al caos", "Orientación a resultados"],
      evidence: [
        {
          skill: "WhatsApp Business",
          quote: "Armó un grupo de 80 clientes recurrentes y agendaba entregas semanales; redujo viajes en vacío a la mitad.",
        },
        {
          skill: "Coordinación operativa",
          quote: "Organizaba rutas para 3 motorizados sin tener mapa formal, solo conocimiento del barrio.",
        },
      ],
    },
  },
  {
    id: "seed_valentina_acosta",
    data: {
      name: "Valentina Acosta",
      summary:
        "Joven 21, manejó el Instagram y TikTok de un salón de belleza durante 8 meses. Sabe armar contenido orgánico, contestar DMs y agendar.",
      skills: ["Instagram", "TikTok", "Atención por DM", "Agendamiento de citas"],
      traits: ["Creatividad", "Curiosidad", "Orientación al cliente"],
      evidence: [
        {
          skill: "Instagram",
          quote: "Subió la cuenta del salón de 400 a 3.500 seguidores en 8 meses sin pauta paga, solo Reels.",
        },
        {
          skill: "Agendamiento de citas",
          quote: "Reemplazó la libreta de agendamientos por un sistema de DMs ordenado; bajó los plantones.",
        },
      ],
    },
  },
  {
    id: "seed_brayan_mendez",
    data: {
      name: "Brayan Méndez",
      summary:
        "Joven 19, le ayudó al hermano mayor con un emprendimiento de comida en casa. Maneja pedidos por WhatsApp, cobros y entregas en el barrio.",
      skills: ["Atención al cliente", "WhatsApp Business", "Manejo de efectivo", "Logística de barrio"],
      traits: ["Responsable", "Tolerancia al caos", "Proactividad"],
      evidence: [
        {
          skill: "WhatsApp Business",
          quote: "Aprendió a usar catálogo y respuestas rápidas; los pedidos se duplicaron en 3 meses.",
        },
        {
          skill: "Manejo de efectivo",
          quote: "Llevaba la planilla diaria de cobros y nunca le faltó plata al cierre.",
        },
      ],
    },
  },
];
