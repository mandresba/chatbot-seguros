import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!process.env.OPENAI_API_KEY) {
  console.warn("Falta OPENAI_API_KEY en variables de entorno.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors({
  origin: FRONTEND_URL === "*" ? true : FRONTEND_URL,
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "chatbot-seguros", timestamp: new Date().toISOString() });
});

app.post("/chat", async (req, res) => {
  try {
    const { mensaje, expediente, historial = [] } = req.body;

    if (!mensaje || typeof mensaje !== "string") {
      return res.status(400).json({ error: "Debes enviar 'mensaje' como texto." });
    }

    const systemPrompt = `
Eres un asistente virtual especializado en liquidacion de seguros.

Objetivos:
- Responder claro, corto y util.
- Ayudar a operadores y usuarios a entender siniestros, coberturas, documentos faltantes y estados.
- Si no hay datos suficientes, decir exactamente que falta.
- No inventar coberturas ni decisiones finales.
- Si la respuesta depende de reglas del negocio o la poliza exacta, aclararlo.
- Explicar en lenguaje simple.

Reglas:
- Si el caso no tiene suficiente contexto, pide el numero de siniestro o datos faltantes.
- Si hay expediente, usalo para personalizar la respuesta.
- Si el usuario pide una decision definitiva de aprobacion/rechazo, responder como asistente orientativo, no como autoridad final.
- Devuelve texto plano, sin markdown complejo.
`;

    const expedienteContext = expediente
      ? `Contexto del expediente en JSON:\n${JSON.stringify(expediente, null, 2)}`
      : "No hay contexto de expediente.";

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: expedienteContext },
      ...historial
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-10),
      { role: "user", content: mensaje },
    ];

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages,
    });

    const respuesta = completion.choices?.[0]?.message?.content || "No pude generar una respuesta.";

    res.json({ respuesta });
  } catch (error) {
    console.error("Error /chat:", error);
    res.status(500).json({
      error: "Ocurrio un error al consultar la IA.",
      detalle: error?.message || "Error desconocido",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
