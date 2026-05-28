import type { PlatformKey } from "@/lib/platforms";

export interface Shot {
  range: string;
  intent: string;
  voiceover: string;
  onscreen?: string;
}

export interface DayScript {
  day: number;
  takes: Shot[];
  bRoll: string[];
  caption: string;
}

export const SCRIPTS: Record<number, DayScript> = {
  1: {
    day: 1,
    takes: [
      {
        range: "0–3s",
        intent: "Hook",
        voiceover:
          "Un cliente me dijo 'mándame propuesta'. Le pedí a ChatGPT que escribiera la peor propuesta posible. Y cerré así.",
        onscreen: "Cerré $40K con la peor propuesta posible",
      },
      {
        range: "3–10s",
        intent: "Setup",
        voiceover:
          "En ventas B2B la peor propuesta no es la mala. Es la genérica. La que cualquier IA mediocre podría escribir.",
        onscreen: "B-roll: pantalla ChatGPT",
      },
      {
        range: "10–25s",
        intent: "Demostración",
        voiceover:
          "Le pedí a ChatGPT: 'Sos un vendedor flojo. Escribime la propuesta más genérica posible para un cliente que dijo mándame propuesta sin contexto.' ChatGPT me devolvió esto. Lo leí. Y entendí qué NO mandar.",
        onscreen: "Prompt completo en pantalla",
      },
      {
        range: "25–32s",
        intent: "Insight",
        voiceover: "Lo opuesto a esto fue lo que mandé. Cerré en 4 días.",
        onscreen: "Contraste = relevancia",
      },
      {
        range: "32–35s",
        intent: "CTA",
        voiceover:
          "Si querés el prompt completo y la propuesta que mandé, comentá PROPUESTA. Te llega al DM.",
      },
    ],
    bRoll: [
      "Captura de pantalla con el prompt en ChatGPT",
      "Captura de respuesta de ChatGPT (anonimizada)",
      "Screenshot de la propuesta real ofuscada",
    ],
    caption:
      "Un cliente me dijo 'mándame propuesta'. Le pedí a ChatGPT la PEOR propuesta posible. Cerré $40K con lo opuesto.\n\n→ Comentá PROPUESTA y te mando el prompt + el archivo real (anonimizado).\n\n#ventasconia #ventasb2b #chatgpt #copywriting #neuroventas #salesai #cierredeventas",
  },
  2: {
    day: 2,
    takes: [
      {
        range: "0–3s",
        intent: "Hook",
        voiceover:
          "Decía esto en 9 de 10 llamadas. Cerraba 1. La cambié por esto. Ahora cierro 5.",
        onscreen: "Cambié 1 frase y tripliqué cierres",
      },
      {
        range: "3–10s",
        intent: "Frase mala",
        voiceover: "La frase mala era: ¿Tenés alguna duda? Suena suave. No mueve nada.",
        onscreen: "❌ ¿Tenés alguna duda?",
      },
      {
        range: "10–20s",
        intent: "Frase buena",
        voiceover:
          "La frase buena es: Si esto se aprobara mañana, ¿qué tendría que pasar después?",
        onscreen: "✅ Si esto se aprobara mañana...",
      },
      {
        range: "20–28s",
        intent: "Por qué funciona",
        voiceover:
          "Porque obliga al cliente a imaginar el después. Y el después es donde están los bloqueos reales.",
      },
      {
        range: "28–30s",
        intent: "CTA",
        voiceover: "Comentá si te animás a probarla esta semana.",
      },
    ],
    bRoll: [
      "Texto grande en pantalla: frase mala vs frase buena",
      "Animación tachado de la frase mala",
    ],
    caption:
      "9 de 10 llamadas terminaban con ¿tenés alguna duda? Cerraba 1.\n\nLa cambié por una pregunta de implementación. Ahora cierro 5.\n\n→ Probala esta semana y contame.\n\n#ventasconia #ventasb2b #chatgpt #cierredeventas #neuroventas",
  },
  3: {
    day: 3,
    takes: [
      {
        range: "0–3s",
        intent: "Hook",
        voiceover:
          "Subí mi última cadena de correos a Claude. Le dije: ¿cómo cerrarías esto? Lo que respondió me dejó frío.",
        onscreen: "Claude negoció por mí",
      },
      {
        range: "3–15s",
        intent: "Contexto",
        voiceover:
          "Era un cliente B2B que llevaba 3 semanas sin responder. Le pasé toda la conversación a Claude — anonimizada — y le pedí que escriba el siguiente mensaje.",
        onscreen: "B-roll: pantalla Claude con thread",
      },
      {
        range: "15–28s",
        intent: "Lo que devolvió",
        voiceover:
          "Lo que devolvió era técnicamente impecable. Pero le faltaba algo: la incomodidad que vos sentís cuando alguien no te responde.",
        onscreen: "70% acierto · 30% pierde",
      },
      {
        range: "28–38s",
        intent: "Insight",
        voiceover:
          "Claude acierta el 70%. El 30% que falla es el que importa: el tono humano que reconoce que algo se rompió.",
      },
      {
        range: "38–45s",
        intent: "CTA",
        voiceover: "Subo el prompt completo en comentarios. Comentá CLAUDE y te llega.",
      },
    ],
    bRoll: [
      "Screenshots anonimizados del thread real",
      "Pantalla compartida de Claude con la respuesta completa",
    ],
    caption:
      "Le pedí a Claude que cierre un deal B2B atascado. Acertó el 70%.\n\nEl 30% restante es donde se ganan los deals.\n\n→ Comentá CLAUDE para el prompt completo.\n\n#ventasconia #claude #ventasb2b #ia #neuroventas",
  },
  4: {
    day: 4,
    takes: [
      {
        range: "0–3s",
        intent: "Hook",
        voiceover:
          "Si tu cliente dice 'está caro', NO digas estas 3 cosas. Spoiler: nada de 'es una inversión'.",
        onscreen: "3 frases prohibidas",
      },
      {
        range: "3–12s",
        intent: "Frase 1",
        voiceover:
          "Uno: 'Es una inversión, no un gasto'. Suena a manual de los 90. El cliente lo escuchó 50 veces.",
        onscreen: "❌ Es una inversión",
      },
      {
        range: "12–22s",
        intent: "Frase 2",
        voiceover:
          "Dos: '¿Comparado con qué?'. Suena defensivo. Tu cliente no es el enemigo.",
        onscreen: "❌ ¿Comparado con qué?",
      },
      {
        range: "22–32s",
        intent: "Frase 3",
        voiceover:
          "Tres: 'Te entiendo perfectamente'. No, no entendés. Y el cliente lo sabe.",
        onscreen: "❌ Te entiendo perfectamente",
      },
      {
        range: "32–40s",
        intent: "Alternativa + CTA",
        voiceover:
          "En su lugar decí: 'Cuando decís caro, ¿comparás contra algo específico o es la primera reacción?'. Eso abre la conversación. ¿Cuál era tu favorita prohibida?",
      },
    ],
    bRoll: [
      "Tipografía grande en pantalla por cada frase",
      "Cara de Poncho asintiendo cuando dice la alternativa",
    ],
    caption:
      "3 frases que NO podés decir cuando te dicen 'está caro'.\n\nLa última te va a doler: 'Te entiendo perfectamente' es la peor.\n\nLa pregunta que sí abre conversación está al final del video.\n\n#ventasconia #ventasb2b #neuroventas #cierredeventas",
  },
  5: {
    day: 5,
    takes: [
      {
        range: "0–3s",
        intent: "Hook",
        voiceover:
          "Pasé 5 días probando prompts en mi WhatsApp Business. 4 fracasaron. El quinto me triplicó respuestas.",
        onscreen: "5 prompts · 1 ganador",
      },
      {
        range: "3–15s",
        intent: "Los 4 que fallaron",
        voiceover:
          "Los 4 que fallaron tenían algo en común: pedían algo. Una reunión, una respuesta, un 'avisame'.",
        onscreen: "B-roll: capturas WA con respuestas en cero",
      },
      {
        range: "15–32s",
        intent: "El que ganó",
        voiceover:
          "El que ganó decía: 'Hola [nombre]. Estaba revisando [contexto específico] y se me ocurrió compartirte esto: [insight de 2 líneas]. Sin presión, solo lo dejo acá por si te sirve.'",
        onscreen: "Prompt completo en pantalla",
      },
      {
        range: "32–40s",
        intent: "Por qué funciona",
        voiceover:
          "Funciona porque no pide. Da. Y la gente responde a lo que le da algo concreto, no a lo que le saca tiempo.",
      },
      {
        range: "40–45s",
        intent: "CTA",
        voiceover: "Probalo esta semana y contame en DM. WHATS para el archivo completo.",
      },
    ],
    bRoll: [
      "5 cards en pantalla con los 5 prompts (4 tachados, 1 marcado)",
      "Screenshot anonimizado de respuesta WhatsApp real",
    ],
    caption:
      "5 prompts WhatsApp. 4 fracasaron. El quinto triplicó respuestas.\n\nEl secreto: no pide. Da.\n\n→ Comentá WHATS y te mando el archivo.\n\n#ventasconia #whatsappbusiness #ventasb2b #copywriting",
  },
  6: {
    day: 6,
    takes: [
      {
        range: "0–3s",
        intent: "Hook",
        voiceover:
          "Me llegaron 50 DMs esta semana. Voy a contestar los 5 más difíciles en cámara.",
        onscreen: "Q&A semana 1",
      },
      {
        range: "3–12s",
        intent: "Pregunta 1",
        voiceover:
          "Primera: '¿Funciona si vendés a empresa familiar?' Respuesta corta: sí, pero cambia el ciclo. El familiar decide en almuerzos, no en reuniones.",
      },
      {
        range: "12–22s",
        intent: "Pregunta 2",
        voiceover:
          "Segunda: '¿Cuántos prompts uso por venta?' Yo uso 3: uno para investigar, uno para escribir, uno para criticar lo que escribí.",
      },
      {
        range: "22–35s",
        intent: "Pregunta 3",
        voiceover:
          "Tercera: '¿La IA reemplaza al vendedor?' No. Reemplaza al vendedor que no la usa. Eso sí.",
      },
      {
        range: "35–55s",
        intent: "Preguntas 4 y 5 + CTA",
        voiceover:
          "Cuarta y quinta las contesto en el video. Si querés que conteste la tuya, dejá comentario y la incluyo el sábado.",
      },
    ],
    bRoll: [
      "Capturas de los DMs reales (anonimizados, solo texto)",
      "Cara de Poncho leyendo cada pregunta",
    ],
    caption:
      "5 preguntas reales que recibí esta semana. Las contesto sin filtro.\n\n→ Dejá la tuya en comentarios para el Q&A del sábado que viene.\n\n#ventasconia #ventasb2b #chatgpt #qa",
  },
  7: {
    day: 7,
    takes: [
      {
        range: "0–3s",
        intent: "Hook",
        voiceover:
          "Lo más importante que aprendí esta semana hablando con vendedores.",
        onscreen: "Cierre semana 1",
      },
      {
        range: "3–15s",
        intent: "Patrón 1",
        voiceover:
          "Patrón 1: la gente no quiere prompts. Quiere saber qué pensar antes de pedirle a la IA que escriba.",
      },
      {
        range: "15–28s",
        intent: "Patrón 2",
        voiceover:
          "Patrón 2: el 80% de los DMs eran sobre objeciones, no sobre prospección. La gente está vendiendo, no buscando vender.",
      },
      {
        range: "28–42s",
        intent: "Patrón 3",
        voiceover:
          "Patrón 3: el contenido que más se guardó fue el de la frase prohibida, no el del prompt de $40K. La gente quiere quitar errores, no agregar más cosas.",
      },
      {
        range: "42–50s",
        intent: "Cierre + CTA",
        voiceover:
          "Semana 2 arrancamos serie nueva: vendedores reales contando cómo cierran. Quedate. Comentá si te gustó la semana 1.",
      },
    ],
    bRoll: [
      "Captura de feed con los comentarios destacados",
      "Métricas básicas (views, comentarios) en overlay",
    ],
    caption:
      "Cierre semana 1: 3 patrones que vi en los comentarios.\n\n→ Semana 2 arranca lunes. Quedate.\n\n#ventasconia #ventasb2b #aprendizajepublico",
  },
};

export function scriptFor(day: number): DayScript | null {
  return SCRIPTS[day] ?? null;
}

export function fallbackScript(day: number, theme: string, platform: PlatformKey): DayScript {
  return {
    day,
    takes: [
      { range: "0–3s", intent: "Hook", voiceover: `Tema: ${theme}. Hook punzante en 1 frase, sin contexto previo.` },
      { range: "3–12s", intent: "Setup", voiceover: "Contexto en 2 frases. Ejemplo concreto, no abstracto." },
      { range: "12–25s", intent: "Insight", voiceover: "El punto contraintuitivo. Una sola idea." },
      { range: "25–35s", intent: "Demostración", voiceover: "Mostrar cómo se hace o ejemplo aplicado." },
      { range: "35–40s", intent: "CTA", voiceover: "Acción concreta del espectador (comentar, guardar, DM)." },
    ],
    bRoll: [
      "Pantalla compartida del tema",
      "Cara de Poncho a cámara para inicio y CTA",
    ],
    caption: `${theme}.\n\nEscribir caption de 80–120 chars + 5 hashtags de la semana correspondiente.\n\nPlataforma: ${platform}.`,
  };
}
