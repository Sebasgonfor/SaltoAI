import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const schema = {
  type: Type.OBJECT,
  properties: {
    skills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Habilidades extraídas de la historia de vida. Ej: 'Atención al Cliente', 'Ventas'"
    },
    traits: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Rasgos de personalidad laboral deducidos. Ej: 'Alta adaptabilidad', 'Orientación a resultados'"
    },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          quote: { type: Type.STRING, description: "Cita o resumen exacto de lo dicho como prueba." }
        }
      }
    }
  },
  required: ["skills", "traits", "evidence"]
};

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    
    // Si no hay API KEY, devolvemos un mock para que la demo funcione
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
       return NextResponse.json({
         skills: ["Gestión de Redes Sociales", "Ventas B2C", "Atención al Cliente"],
         traits: ["Tolerancia al caos", "Autodidacta", "Orientación al cliente"],
         evidence: [
           { skill: "Ventas B2C", quote: "Aumentó las ventas del local de su tía en un 30%." },
           { skill: "Gestión de Redes", quote: "Manejó el perfil de Instagram sin experiencia previa y consiguió 200 clientes nuevos." }
         ]
       });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extrae evidencia laboral de esta historia: ${prompt}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });

    const result = JSON.parse(response.text || "{}");
    return NextResponse.json(result);

  } catch (error) {
    console.error("Error en extracción:", error);
    return NextResponse.json({ error: "No pudimos procesar la historia." }, { status: 500 });
  }
}
