import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const ALLOWED_ORIGINS = [
const ALLOWED_ORIGINS = [
    "https://www.zielsystem.com",
    "https://zielsystem.com",
    "https://zielgroup.cl",
    "https://www.zielgroup.cl"
];

if (!process.env.OPENAI_API_KEY) {
    console.warn("Falta OPENAI_API_KEY en variables de entorno.");
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.disable("x-powered-by");

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) return callback(null, true);

            if (ALLOWED_ORIGINS.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error("Origen no permitido por CORS."));
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(express.json({ limit: "1mb" }));

function sanitizeText(value) {
    if (typeof value !== "string") return "";
    return value.trim().replace(/\s+/g, " ");
}

function normalizeHistorial(historial) {
    if (!Array.isArray(historial)) return [];

    return historial
        .filter(
            (m) =>
                m &&
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string"
        )
        .slice(-10)
        .map((m) => ({
            role: m.role,
            content: sanitizeText(m.content).slice(0, 4000),
        }))
        .filter((m) => m.content.length > 0);
}

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: "chatbot-seguros",
        endpoints: {
            health: "/health",
            chat: "/chat",
        },
        allowed_origins: ALLOWED_ORIGINS,
        timestamp: new Date().toISOString(),
    });
});

app.get("/health", (req, res) => {
    const ok = Boolean(process.env.OPENAI_API_KEY);

    res.status(ok ? 200 : 500).json({
        ok,
        service: "chatbot-seguros",
        model: OPENAI_MODEL,
        allowed_origins: ALLOWED_ORIGINS,
        timestamp: new Date().toISOString(),
    });
});

app.post("/chat", async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({
                ok: false,
                error: "OPENAI_API_KEY no configurada.",
            });
        }

        const mensaje = sanitizeText(req.body?.mensaje);
        const expediente = req.body?.expediente ?? null;
        const historial = normalizeHistorial(req.body?.historial);

        if (!mensaje) {
            return res.status(400).json({
                ok: false,
                error: "Debes enviar 'mensaje' como texto.",
            });
        }

        if (mensaje.length > 4000) {
            return res.status(400).json({
                ok: false,
                error: "El mensaje es demasiado largo.",
            });
        }

        const systemPrompt = `
Eres un asistente virtual especializado en liquidación de seguros.

Objetivos:
- Responder claro, breve y útil.
- Ayudar a operadores y usuarios a entender siniestros, coberturas, documentos faltantes y estados.
- Si no hay datos suficientes, decir exactamente qué falta.
- No inventar coberturas, reglas, estados ni decisiones finales.
- Si la respuesta depende de reglas del negocio o de la póliza exacta, aclararlo.
- Explicar en lenguaje simple.

Reglas:
- Si el caso no tiene suficiente contexto, pedir el número de siniestro o los datos faltantes.
- Si hay expediente, usarlo para personalizar la respuesta.
- Si el usuario pide una decisión definitiva de aprobación o rechazo, responder solo como asistente orientativo, no como autoridad final.
- Responder en texto plano.
- Responder siempre en español.
`.trim();

        const expedienteContext = expediente
            ? `Contexto del expediente en JSON:\n${JSON.stringify(expediente)}`
            : "No hay contexto de expediente.";

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "system", content: expedienteContext },
            ...historial,
            { role: "user", content: mensaje },
        ];

        const completion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            temperature: 0.2,
            messages,
        });

        const respuesta =
            completion.choices?.[0]?.message?.content?.trim() ||
            "No pude generar una respuesta.";

        return res.status(200).json({
            ok: true,
            respuesta,
        });
    } catch (error) {
        console.error("Error /chat:", error);

        return res.status(500).json({
            ok: false,
            error: "Ocurrió un error al consultar la IA.",
            detalle: error?.message || "Error desconocido",
        });
    }
});

app.use((err, req, res, next) => {
    if (err?.message === "Origen no permitido por CORS.") {
        return res.status(403).json({
            ok: false,
            error: err.message,
        });
    }

    return res.status(500).json({
        ok: false,
        error: "Error interno del servidor.",
    });
});

app.use((req, res) => {
    res.status(404).json({
        ok: false,
        error: "Ruta no encontrada.",
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});