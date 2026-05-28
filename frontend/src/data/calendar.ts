import type { PlatformKey } from "@/lib/platforms";

export type Format =
  | "Reel"
  | "Video"
  | "Carrusel"
  | "Post"
  | "Live"
  | "Foto"
  | "Repost";

export interface DayPiece {
  hook: string;
  format: Format;
  cta: string;
  description?: string;
}

export interface CalendarDay {
  day: number;
  week: 1 | 2 | 3 | 4;
  phase: "validacion" | "doble_down" | "amplificacion" | "conversion";
  theme: string;
  platforms: Record<PlatformKey, DayPiece>;
}

export const CALENDAR: CalendarDay[] = [
  {
    day: 1,
    week: 1,
    phase: "validacion",
    theme: "El prompt que cerró $40K USD",
    platforms: {
      tiktok: {
        hook: "Un cliente me dijo 'mándame propuesta'. Le pedí a ChatGPT la peor propuesta posible. Cerré así.",
        format: "Video",
        cta: "Comentá PROPUESTA y te mando el prompt",
        description: "Mostrar el prompt en pantalla + por qué funcionó. Contraste = relevancia.",
      },
      instagram: {
        hook: "La peor propuesta posible me cerró $40K. Te explico el contraintuitivo.",
        format: "Carrusel",
        cta: "Guardá si te toca mandar propuesta esta semana",
        description: "6 slides: la pregunta del cliente → el prompt → respuesta IA → lo opuesto → mi propuesta → resultado.",
      },
      linkedin: {
        hook: "B2B: la propuesta genérica es peor que la mala. Te explico el contraste como técnica de venta.",
        format: "Post",
        cta: "¿Cuál fue la última propuesta genérica que te llegó?",
        description: "Texto reflexivo 800 chars. Pregunta abierta al final.",
      },
      facebook: {
        hook: "Cerré $40K con la propuesta opuesta a lo que sugería ChatGPT. Te cuento por qué.",
        format: "Repost",
        cta: "Compartí si conocés a alguien que vende B2B",
      },
    },
  },
  {
    day: 2,
    week: 1,
    phase: "validacion",
    theme: "La frase que mata el 90% de tus ventas",
    platforms: {
      tiktok: {
        hook: "Decía esto en 9 de 10 llamadas. Cerraba 1. Cambié la frase. Ahora cierro 5.",
        format: "Video",
        cta: "Comentá si te animás a probarla esta semana",
        description: "Frase mala: '¿Tenés alguna duda?'. Frase buena: 'Si esto se aprobara mañana, ¿qué tendría que pasar después?'",
      },
      instagram: {
        hook: "5 frases que matan ventas (y qué decir en su lugar).",
        format: "Carrusel",
        cta: "Guardá y probá una esta semana",
        description: "6 slides: 5 pares frase-mala / frase-buena + slide final con CTA",
      },
      linkedin: {
        hook: "El cierre por compromiso supera al cierre por presión en B2B. Reformulá '¿tenés dudas?' por la pregunta de implementación.",
        format: "Post",
        cta: "¿Qué frase de cierre usás vos hoy?",
      },
      facebook: {
        hook: "Cambié 1 frase y triplique cierres. Te explico.",
        format: "Repost",
        cta: "Etiquetá a un vendedor que necesita esto",
      },
    },
  },
  {
    day: 3,
    week: 1,
    phase: "validacion",
    theme: "Le pedí a Claude que negocie por mí",
    platforms: {
      tiktok: {
        hook: "Subí mi última cadena de correos a Claude. Le dije: ¿cómo cerrarías esto? Lo que respondió me dejó frío.",
        format: "Video",
        cta: "Subo el prompt completo en comentarios",
        description: "Pantalla compartida con screenshots anonimizados + voz off. 45s.",
      },
      instagram: {
        hook: "Claude vs vendedor humano: dónde acierta el 70%, dónde falla el 30% que importa.",
        format: "Reel",
        cta: "Comentá CLAUDE si querés el prompt",
        description: "Re-uso del TT con primeros 2s distintos para evitar marca de agua.",
      },
      linkedin: {
        hook: "La IA acierta el 70% en negociación B2B. Pero el 30% restante es donde se ganan o pierden los deals. Análisis.",
        format: "Post",
        cta: "¿Usás IA en tu pipeline? Contame cómo.",
      },
      facebook: {
        hook: "Probé que Claude negocie un deal real. Esto pasó.",
        format: "Repost",
        cta: "Compartí con quien le interese IA + ventas",
      },
    },
  },
  {
    day: 4,
    week: 1,
    phase: "validacion",
    theme: "Si tu cliente dice 'está caro', NO digas esto",
    platforms: {
      tiktok: {
        hook: "Si tu cliente dice 'está caro', NO digas estas 3 cosas. Spoiler: nada de 'es una inversión'.",
        format: "Video",
        cta: "¿Cuál era tu favorita prohibida?",
        description: "Tipografía grande en pantalla + voz rápida. 40s. 3 frases prohibidas + 3 alternativas.",
      },
      instagram: {
        hook: "3 frases prohibidas cuando te dicen 'está caro' (y qué decir en su lugar).",
        format: "Carrusel",
        cta: "Guardá para tu próxima objeción",
        description: "6 slides: intro + 3 prohibidas + 3 alternativas + cierre.",
      },
      linkedin: {
        hook: "La objeción de precio en B2B es información, no rechazo. Te muestro 3 reformulaciones que cambian el cierre.",
        format: "Post",
        cta: "¿Cuál es la objeción más cara que cerraste?",
      },
      facebook: {
        hook: "Lo que NO decir cuando dicen 'está caro'. 3 errores que cuestan ventas.",
        format: "Repost",
        cta: "Pasalo a tu equipo comercial",
      },
    },
  },
  {
    day: 5,
    week: 1,
    phase: "validacion",
    theme: "5 prompts WhatsApp Business — el que cerró",
    platforms: {
      tiktok: {
        hook: "Probé 5 prompts en mi WhatsApp Business. 4 fracasaron. El quinto me triplicó respuestas.",
        format: "Video",
        cta: "Probá esta semana y contame en DM",
        description: "Mostrar el prompt ganador + por qué. 45s.",
      },
      instagram: {
        hook: "El prompt de WhatsApp que triplica respuestas en ventas B2B.",
        format: "Reel",
        cta: "Comentá WHATS y te mando el archivo",
      },
      linkedin: {
        hook: "Caso B2B: prompt de WhatsApp + métricas reales (+200% respuestas en 5 días).",
        format: "Post",
        cta: "¿Qué canal te genera más conversaciones cualificadas?",
      },
      facebook: {
        hook: "Triplicar respuestas en WhatsApp Business con 1 prompt. Funciona.",
        format: "Repost",
        cta: "Compartí con quien venda por WhatsApp",
      },
    },
  },
  {
    day: 6,
    week: 1,
    phase: "validacion",
    theme: "Q&A semana 1 — los 5 DMs más difíciles",
    platforms: {
      tiktok: {
        hook: "Me llegaron 50 DMs esta semana. Voy a contestar los 5 más difíciles en cámara.",
        format: "Video",
        cta: "Si querés que conteste el tuyo, dejá comentario",
        description: "60s formato casual, sin guion estricto.",
      },
      instagram: {
        hook: "Las 5 preguntas más duras de la semana — respuestas reales.",
        format: "Reel",
        cta: "DM si tu pregunta no aparece",
      },
      linkedin: {
        hook: "5 preguntas reales que recibí esta semana sobre IA en ventas B2B. Respuestas honestas, sin marketing.",
        format: "Post",
        cta: "¿Cuál de estas te resuena hoy?",
      },
      facebook: {
        hook: "Q&A semana 1 — las 5 preguntas más difíciles sobre ventas con IA.",
        format: "Repost",
        cta: "Dejá tu pregunta y la contesto la próxima",
      },
    },
  },
  {
    day: 7,
    week: 1,
    phase: "validacion",
    theme: "Lo que aprendí de los comentarios esta semana",
    platforms: {
      tiktok: {
        hook: "Lo más importante que aprendí esta semana hablando con vendedores.",
        format: "Video",
        cta: "Semana 2 arrancamos serie nueva — quedate",
        description: "Captura de feed/comentarios reales. 50s reflexivo.",
      },
      instagram: {
        hook: "Síntesis semana 1: 3 patrones que vi en los comentarios.",
        format: "Reel",
        cta: "Guardá para la próxima semana",
      },
      linkedin: {
        hook: "Aprendizaje en público: 3 cosas que validé hablando con +50 vendedores B2B esta semana.",
        format: "Post",
        cta: "¿Cuál de estos 3 te aplica?",
      },
      facebook: {
        hook: "Lo que aprendí de los comentarios + qué viene la próxima semana.",
        format: "Repost",
        cta: "Seguime para no perderte la serie",
      },
    },
  },
  // Semana 2 — Doble down
  {
    day: 8,
    week: 2,
    phase: "doble_down",
    theme: "Serie 'Vendedores reales' — ep 1: el sobreviviente",
    platforms: {
      tiktok: {
        hook: "Entrevisté a un vendedor que cerró 2 deals B2B con 1 prompt. Esto contó.",
        format: "Video",
        cta: "Comentá EP1 para el archivo completo",
        description: "Voz del entrevistado + B-roll de pantalla.",
      },
      instagram: {
        hook: "Ep 1 — Vendedor real: 2 deals cerrados con 1 prompt.",
        format: "Reel",
        cta: "Guardá si querés ver el episodio 2",
      },
      linkedin: {
        hook: "Caso real: vendedor B2B + 1 prompt + 2 cierres en 14 días. Análisis del workflow.",
        format: "Post",
        cta: "¿Querés que entreviste a alguien de tu equipo?",
      },
      facebook: {
        hook: "Vendedor real cerró 2 deals con IA. Te lo cuento.",
        format: "Repost",
        cta: "Etiquetá a un vendedor del equipo",
      },
    },
  },
  {
    day: 9,
    week: 2,
    phase: "doble_down",
    theme: "Demo en vivo: armar propuesta con IA en 4 min",
    platforms: {
      tiktok: {
        hook: "Te muestro cómo armo una propuesta B2B con IA en 4 minutos. Sin filtro.",
        format: "Video",
        cta: "Comentá DEMO para la plantilla",
        description: "Grabación de pantalla con timer visible.",
      },
      instagram: {
        hook: "Propuesta B2B en 4 minutos con IA. Sin trucos.",
        format: "Reel",
        cta: "DM PROPUESTA para la plantilla",
      },
      linkedin: {
        hook: "Workflow en vivo: propuesta B2B en 4 minutos usando Claude + plantilla estructurada.",
        format: "Post",
        cta: "¿Cuánto tardás vos hoy en armar una propuesta?",
      },
      facebook: {
        hook: "Demo: propuesta de ventas en 4 minutos con IA.",
        format: "Repost",
        cta: "Compartí con el equipo comercial",
      },
    },
  },
  {
    day: 10,
    week: 2,
    phase: "doble_down",
    theme: "Los 3 errores al usar ChatGPT en ventas",
    platforms: {
      tiktok: {
        hook: "3 errores que veo todos los días al usar ChatGPT en ventas. El segundo te cuesta cierres.",
        format: "Video",
        cta: "¿Cometiste alguno? Comentá",
      },
      instagram: {
        hook: "3 errores con ChatGPT que matan tus ventas (y cómo arreglarlos).",
        format: "Carrusel",
        cta: "Guardá si usás ChatGPT en prospección",
        description: "6 slides: 3 errores + 3 fixes + cierre.",
      },
      linkedin: {
        hook: "3 anti-patterns frecuentes al integrar ChatGPT en pipeline B2B. El más caro: prompts sin contexto del comprador.",
        format: "Post",
        cta: "¿Cuál es el que más ves en tu equipo?",
      },
      facebook: {
        hook: "3 errores comunes con ChatGPT en ventas. Te ahorran tiempo.",
        format: "Repost",
        cta: "Pasalo al equipo",
      },
    },
  },
  {
    day: 11,
    week: 2,
    phase: "doble_down",
    theme: "El framework SPIN + ChatGPT",
    platforms: {
      tiktok: {
        hook: "Usé el framework SPIN combinado con ChatGPT. Aumenté discovery 3x.",
        format: "Video",
        cta: "Comentá SPIN y te mando el prompt",
      },
      instagram: {
        hook: "Framework SPIN + IA: el discovery más rápido que vi en B2B.",
        format: "Carrusel",
        cta: "Guardá para tu próxima discovery call",
        description: "8 slides: 4 categorías SPIN + ejemplos.",
      },
      linkedin: {
        hook: "SPIN selling sigue funcionando en 2026. Acelerarlo con IA es la diferencia entre 30 min y 10 min por call.",
        format: "Post",
        cta: "¿Seguís usando SPIN o tenés tu propio framework?",
      },
      facebook: {
        hook: "El framework de ventas clásico + IA. 3x más rápido el discovery.",
        format: "Repost",
        cta: "Compartí con tu manager",
      },
    },
  },
  {
    day: 12,
    week: 2,
    phase: "doble_down",
    theme: "Análisis de un email malo (anonimizado)",
    platforms: {
      tiktok: {
        hook: "Me mandaron este email frío. Te muestro qué estuvo mal y qué hubiera funcionado.",
        format: "Video",
        cta: "Mandame el tuyo en DM y lo destrozo gratis",
        description: "Screenshot anonimizado + reacción + reescritura.",
      },
      instagram: {
        hook: "Cómo NO escribir un email frío B2B. Antes/después.",
        format: "Carrusel",
        cta: "DM EMAIL si querés feedback del tuyo",
        description: "Antes/después en 4 slides.",
      },
      linkedin: {
        hook: "Análisis público de un email frío real (anonimizado). Los 4 errores clave + reescritura.",
        format: "Post",
        cta: "¿Querés que analice el tuyo? DM",
      },
      facebook: {
        hook: "Destrucción gentil de un email frío + cómo arreglarlo.",
        format: "Repost",
        cta: "Pasalo a tu SDR",
      },
    },
  },
  {
    day: 13,
    week: 2,
    phase: "doble_down",
    theme: "Cómo califico leads en 30s con IA",
    platforms: {
      tiktok: {
        hook: "Califico leads B2B en 30 segundos con un prompt. Te lo muestro en vivo.",
        format: "Video",
        cta: "Comentá LEADS para el prompt",
      },
      instagram: {
        hook: "Calificación de leads en 30 segundos con IA. El prompt que uso.",
        format: "Reel",
        cta: "DM LEADS si querés el prompt",
      },
      linkedin: {
        hook: "Lead scoring asistido por IA: criterios + prompt + reducción de 5 min a 30s por lead.",
        format: "Post",
        cta: "¿Cómo califican leads en tu pipeline hoy?",
      },
      facebook: {
        hook: "30 segundos para calificar un lead. Con IA, en serio.",
        format: "Repost",
        cta: "Compartí con prospectadores",
      },
    },
  },
  {
    day: 14,
    week: 2,
    phase: "doble_down",
    theme: "Q&A semana 2 — comparación con S1",
    platforms: {
      tiktok: {
        hook: "Q&A semana 2: contesto las preguntas + comparo qué cambió respecto a la semana 1.",
        format: "Video",
        cta: "Si querés que conteste la tuya, dejá comentario",
      },
      instagram: {
        hook: "Q&A sem 2 + qué aprendí distinto a sem 1.",
        format: "Reel",
        cta: "DM tu pregunta para Q&A sem 3",
      },
      linkedin: {
        hook: "Comparativa semana 1 vs semana 2: qué hooks engancharon más en audiencia B2B.",
        format: "Post",
        cta: "¿Te resuena más la primera o la segunda semana?",
      },
      facebook: {
        hook: "Q&A semana 2 + cambios que estoy probando.",
        format: "Repost",
        cta: "Dejame tu pregunta",
      },
    },
  },
  // Semana 3 — Amplificación
  {
    day: 15,
    week: 3,
    phase: "amplificacion",
    theme: "Cocina conmigo: armando una demo en vivo",
    platforms: {
      tiktok: {
        hook: "Cocina conmigo. Vamos a armar una demo de venta de cero. Sin cortes.",
        format: "Live",
        cta: "Quedate hasta el final para el archivo",
      },
      instagram: {
        hook: "Live armando una demo B2B con vos en cámara.",
        format: "Live",
        cta: "Subscribite al recordatorio",
      },
      linkedin: {
        hook: "Sesión en vivo: armado de demo B2B de principio a fin. Lo grabamos para reusarlo.",
        format: "Post",
        cta: "Reservá tu lugar (link en perfil)",
      },
      facebook: {
        hook: "En vivo: armado de demo de venta con IA, paso a paso.",
        format: "Repost",
        cta: "Compartí con tu equipo",
      },
    },
  },
  {
    day: 16,
    week: 3,
    phase: "amplificacion",
    theme: "Colaboración con otro creador del nicho",
    platforms: {
      tiktok: {
        hook: "Le pedí a [creador] que critique mi pipeline de ventas. Esto pasó.",
        format: "Video",
        cta: "Etiquetá a tu próximo colaborador",
      },
      instagram: {
        hook: "Dueto con [creador]: dos visiones sobre IA en ventas.",
        format: "Reel",
        cta: "Comentá quién querés que invite la próxima",
      },
      linkedin: {
        hook: "Conversación con [colaborador]: dos visiones complementarias sobre IA aplicada a ventas B2B.",
        format: "Post",
        cta: "¿Con quién te gustaría que hiciera la próxima?",
      },
      facebook: {
        hook: "Colab con [creador]: dos vendedores debatiendo IA en ventas.",
        format: "Repost",
        cta: "Compartí si te interesa el tema",
      },
    },
  },
  {
    day: 17,
    week: 3,
    phase: "amplificacion",
    theme: "El sistema que uso para hacer follow-ups",
    platforms: {
      tiktok: {
        hook: "Te muestro mi sistema de follow-up. 3 mensajes + 2 prompts. Funciona el 60% del tiempo.",
        format: "Video",
        cta: "Comentá FOLLOW para la plantilla",
      },
      instagram: {
        hook: "Sistema de follow-up en 5 pasos (con IA).",
        format: "Carrusel",
        cta: "Guardá para tu próximo silencio post-demo",
        description: "5 slides: timeline + plantillas de mensaje.",
      },
      linkedin: {
        hook: "Sistema de follow-up: 3 mensajes + 2 prompts. Cadencia que sostiene la conversación sin sonar a SDR.",
        format: "Post",
        cta: "¿Cómo manejás los silencios post-demo?",
      },
      facebook: {
        hook: "Mi sistema de follow-up paso a paso. Cero presión.",
        format: "Repost",
        cta: "Pasalo a tu equipo",
      },
    },
  },
  {
    day: 18,
    week: 3,
    phase: "amplificacion",
    theme: "La objeción que me cuesta más cerrar",
    platforms: {
      tiktok: {
        hook: "Hay una objeción que todavía me cuesta cerrar. Te la cuento sin filtro.",
        format: "Video",
        cta: "Comentá si te pasa lo mismo",
      },
      instagram: {
        hook: "Confesión: la objeción que aún no domino del todo.",
        format: "Reel",
        cta: "DM si querés trabajar esa objeción en común",
      },
      linkedin: {
        hook: "Vulnerabilidad pública: la objeción que aún me cuesta. Reflexión sobre límites de los frameworks.",
        format: "Post",
        cta: "¿Cuál es la objeción que más te cuesta a vos?",
      },
      facebook: {
        hook: "La objeción que no puedo domar. ¿Te pasa?",
        format: "Repost",
        cta: "Contame la tuya en comentarios",
      },
    },
  },
  {
    day: 19,
    week: 3,
    phase: "amplificacion",
    theme: "Demo: armo script de cold call con IA",
    platforms: {
      tiktok: {
        hook: "Cold call script con IA en 3 minutos. Te muestro el prompt completo.",
        format: "Video",
        cta: "Comentá COLD para el prompt",
      },
      instagram: {
        hook: "Cold call que sí funciona: script generado en 3 min con IA.",
        format: "Reel",
        cta: "DM COLD para el archivo",
      },
      linkedin: {
        hook: "Cold calling sigue vivo en B2B. Le sumé IA a la prep y bajé el tiempo de 30 a 3 minutos por cuenta.",
        format: "Post",
        cta: "¿Cold calling sigue vivo en tu segmento?",
      },
      facebook: {
        hook: "Script de llamada en frío en 3 min, con IA.",
        format: "Repost",
        cta: "Compartí con SDRs",
      },
    },
  },
  {
    day: 20,
    week: 3,
    phase: "amplificacion",
    theme: "Q&A semana 3 + tendencias del feed",
    platforms: {
      tiktok: {
        hook: "Q&A semana 3 + qué está viralizando en ventas con IA esta semana.",
        format: "Video",
        cta: "Comentá tu pregunta para la próxima Q&A",
      },
      instagram: {
        hook: "Q&A sem 3 + 3 tendencias del feed que vale la pena ver.",
        format: "Reel",
        cta: "DM tendencias para la lista completa",
      },
      linkedin: {
        hook: "3 tendencias en IA + ventas que están moviendo el feed esta semana. Análisis.",
        format: "Post",
        cta: "¿Cuál te llama más la atención?",
      },
      facebook: {
        hook: "Q&A sem 3 + lo que estoy viendo en el feed.",
        format: "Repost",
        cta: "Etiquetá a quien le interese",
      },
    },
  },
  {
    day: 21,
    week: 3,
    phase: "amplificacion",
    theme: "Charla con un escéptico de la IA en ventas",
    platforms: {
      tiktok: {
        hook: "Lo invité al canal a alguien que cree que la IA en ventas es sobrevalorada. Esto debatimos.",
        format: "Video",
        cta: "¿De qué lado estás? Comentá",
      },
      instagram: {
        hook: "Debate con un escéptico: ¿la IA en ventas es hype o herramienta?",
        format: "Reel",
        cta: "Comentá tu lado",
      },
      linkedin: {
        hook: "Conversación con un escéptico de la IA en ventas. 3 críticas válidas + 3 que no se sostienen.",
        format: "Post",
        cta: "¿Sos escéptico, evangelista o pragmático?",
      },
      facebook: {
        hook: "Debate honesto: ¿la IA en ventas es hype o no?",
        format: "Repost",
        cta: "Dejá tu opinión",
      },
    },
  },
  // Semana 4 — Conversión
  {
    day: 22,
    week: 4,
    phase: "conversion",
    theme: "Caso real B2B (x2 cierres en 30 días)",
    platforms: {
      tiktok: {
        hook: "Caso real B2B: cómo un cliente mío cerró 2 deals en 30 días con un workflow simple.",
        format: "Video",
        cta: "Comentá CASO para el detalle completo",
      },
      instagram: {
        hook: "Caso B2B con métricas reales: 2 cierres en 30 días.",
        format: "Carrusel",
        cta: "DM CASO para el archivo",
        description: "7 slides: contexto + workflow + métricas + conclusión.",
      },
      linkedin: {
        hook: "Caso de estudio B2B: 2 deals cerrados en 30 días con workflow IA + cadencia humana. Métricas y aprendizajes.",
        format: "Post",
        cta: "¿Querés que publique más casos? Comentá",
      },
      facebook: {
        hook: "Caso real: 2 cierres B2B en 30 días, con IA + humano.",
        format: "Repost",
        cta: "Compartí con quien necesite ver el resultado",
      },
    },
  },
  {
    day: 23,
    week: 4,
    phase: "conversion",
    theme: "Reto: armá tu propio prompt en 5 minutos",
    platforms: {
      tiktok: {
        hook: "Reto: en 5 minutos te enseño a armar tu propio prompt de ventas. Sin plantillas, te enseño la lógica.",
        format: "Video",
        cta: "Mandame el tuyo en DM y te doy feedback",
      },
      instagram: {
        hook: "Aprendé a armar tu prompt — no a copiar el mío.",
        format: "Carrusel",
        cta: "Mandalo en DM para feedback",
        description: "6 slides: estructura + 4 ejemplos + checklist.",
      },
      linkedin: {
        hook: "Enseñá a tu equipo a armar prompts, no les regales prompts. La diferencia entre dependencia y autonomía.",
        format: "Post",
        cta: "¿Cómo entrenás a tu equipo en IA?",
      },
      facebook: {
        hook: "Reto de 5 minutos: armá tu primer prompt de ventas.",
        format: "Repost",
        cta: "Etiquetá a un colega para que lo intente",
      },
    },
  },
  {
    day: 24,
    week: 4,
    phase: "conversion",
    theme: "Lo que NO te dicen sobre vender con IA",
    platforms: {
      tiktok: {
        hook: "Lo que NO te dicen sobre vender con IA. 3 verdades incómodas.",
        format: "Video",
        cta: "¿Cuál te dolió más? Comentá",
      },
      instagram: {
        hook: "3 verdades incómodas sobre la IA en ventas.",
        format: "Carrusel",
        cta: "Guardá si estás iniciando con IA",
        description: "5 slides: 3 verdades + 1 implicación + cierre.",
      },
      linkedin: {
        hook: "3 cosas que los influencers de IA + ventas no te cuentan. Honestidad por encima del hype.",
        format: "Post",
        cta: "¿Qué otra verdad incómoda agregarías?",
      },
      facebook: {
        hook: "La verdad incómoda sobre vender con IA. 3 puntos.",
        format: "Repost",
        cta: "Compartí con tu red comercial",
      },
    },
  },
  {
    day: 25,
    week: 4,
    phase: "conversion",
    theme: "Anuncio del taller/oferta/mentoría",
    platforms: {
      tiktok: {
        hook: "Después de 30 días pidiéndomelo, abrí cupo para mentoría 1-a-1. Detalles abajo.",
        format: "Video",
        cta: "Link en bio. Cupo limitado.",
      },
      instagram: {
        hook: "Mentoría 1-a-1: 4 cupos disponibles este mes.",
        format: "Reel",
        cta: "DM MENTORIA para los detalles",
      },
      linkedin: {
        hook: "Mentoría B2B 1-a-1 sobre IA en ventas. 4 cupos. Estructura, criterios, expectativas — todo público.",
        format: "Post",
        cta: "Aplicá en el link",
      },
      facebook: {
        hook: "Abrí cupo para mentoría 1-a-1. Si ventas + IA te interesa, mirá esto.",
        format: "Repost",
        cta: "Detalles en el link",
      },
    },
  },
  {
    day: 26,
    week: 4,
    phase: "conversion",
    theme: "Opinión sobre tendencia hot del mes",
    platforms: {
      tiktok: {
        hook: "Mi opinión sobre [tendencia] en ventas. Sin pelos en la lengua.",
        format: "Video",
        cta: "¿Estás de acuerdo? Comentá",
      },
      instagram: {
        hook: "Opinión: [tendencia] es hype o herramienta real.",
        format: "Reel",
        cta: "DM si querés que profundice",
      },
      linkedin: {
        hook: "Take honesto sobre [tendencia] aplicada a ventas B2B. 3 razones por las que es útil, 1 por la que no.",
        format: "Post",
        cta: "¿Tu take?",
      },
      facebook: {
        hook: "Mi opinión sobre [tendencia hot] en ventas con IA.",
        format: "Repost",
        cta: "Dejá la tuya",
      },
    },
  },
  {
    day: 27,
    week: 4,
    phase: "conversion",
    theme: "Q&A semana 4 + testimonios reales",
    platforms: {
      tiktok: {
        hook: "Q&A final del mes + 3 testimonios reales de quienes aplicaron el contenido.",
        format: "Video",
        cta: "Si lo aplicaste, contame en DM",
      },
      instagram: {
        hook: "Q&A sem 4 + 3 testimonios de gente que aplicó.",
        format: "Reel",
        cta: "DM tu testimonio si te ayudó",
      },
      linkedin: {
        hook: "3 testimonios reales (citados con permiso) + Q&A sem 4. Lo que sí movió la aguja.",
        format: "Post",
        cta: "Si aplicaste algo, comentá tu experiencia",
      },
      facebook: {
        hook: "Q&A final + testimonios reales del mes.",
        format: "Repost",
        cta: "Contá tu resultado en comentarios",
      },
    },
  },
  {
    day: 28,
    week: 4,
    phase: "conversion",
    theme: "Errores del mes 1 — lo que NO repetiría",
    platforms: {
      tiktok: {
        hook: "3 errores que cometí este mes haciendo este challenge. Lo que NO repetiría.",
        format: "Video",
        cta: "¿Cuál te sorprendió más?",
      },
      instagram: {
        hook: "Honestidad pública: 3 errores del mes 1.",
        format: "Carrusel",
        cta: "Guardá si estás por arrancar tu propio challenge",
        description: "4 slides: 3 errores + 1 lección.",
      },
      linkedin: {
        hook: "30 días publicando diario: 3 errores que no volvería a cometer + 1 que sí valió.",
        format: "Post",
        cta: "¿Qué error público te marcó a vos?",
      },
      facebook: {
        hook: "3 errores del primer mes de challenge. Honesto.",
        format: "Repost",
        cta: "Compartí con quien quiera arrancar",
      },
    },
  },
  {
    day: 29,
    week: 4,
    phase: "conversion",
    theme: "Roadmap del próximo mes — qué sigue",
    platforms: {
      tiktok: {
        hook: "Qué viene en el mes 2. Spoiler: cambia el formato y suma series.",
        format: "Video",
        cta: "Quedate y suscribite",
      },
      instagram: {
        hook: "Roadmap mes 2: tres cosas nuevas.",
        format: "Reel",
        cta: "Comentá qué querés que profundice",
      },
      linkedin: {
        hook: "Roadmap público mes 2: series, casos B2B, colaboraciones B2B. Lo planeo en abierto.",
        format: "Post",
        cta: "¿Qué te gustaría ver primero?",
      },
      facebook: {
        hook: "Qué viene el próximo mes. Plan público.",
        format: "Repost",
        cta: "Seguime para el mes 2",
      },
    },
  },
  {
    day: 30,
    week: 4,
    phase: "conversion",
    theme: "Métricas + agradecimiento + apertura",
    platforms: {
      tiktok: {
        hook: "30 días, 30 videos. Estas son las métricas reales — sin filtro.",
        format: "Video",
        cta: "Gracias por estar. Mes 2 arranca lunes.",
      },
      instagram: {
        hook: "Métricas reales del mes 1: lo que funcionó y lo que no.",
        format: "Carrusel",
        cta: "Comentá si vas a hacer tu propio challenge",
        description: "6 slides: views totales, ER, follows, comments, DMs, deals.",
      },
      linkedin: {
        hook: "Cierre mes 1: métricas reales (views, follows, conversaciones, deals). Pública toda la data.",
        format: "Post",
        cta: "¿Te animás a publicar las tuyas?",
      },
      facebook: {
        hook: "Cierre del mes. Las métricas reales del challenge.",
        format: "Repost",
        cta: "Gracias por estar — seguimos en mes 2",
      },
    },
  },
];

export function dayByNumber(n: number): CalendarDay | undefined {
  return CALENDAR.find((d) => d.day === n);
}
