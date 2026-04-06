import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SERVER_SHARED_TOKEN = process.env.SERVER_SHARED_TOKEN || "";

const ALLOWED_ORIGINS = [
    "https://www.zielsystem.com",
    "https://zielsystem.com",
    "https://zielgroup.cl",
    "https://www.zielgroup.cl"
];

app.disable("x-powered-by");

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error("Origen no permitido por CORS."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Server-Token"],
}));

app.use(express.json({ limit: "1mb" }));

let openai = null;

if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
} else {
    console.warn("Falta OPENAI_API_KEY en variables de entorno.");
}

/*
|--------------------------------------------------------------------------
| RATE LIMIT SIMPLE EN MEMORIA
|--------------------------------------------------------------------------
*/
const rateMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 20;

function cleanupRateMap() {
    const now = Date.now();
    for (const [key, value] of rateMap.entries()) {
        if (now - value.windowStart > RATE_WINDOW_MS) {
            rateMap.delete(key);
        }
    }
}

setInterval(cleanupRateMap, 30 * 1000);

function rateLimit(req, res, next) {
    const ip =
        req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
        req.socket.remoteAddress ||
        "unknown";

    const now = Date.now();
    const current = rateMap.get(ip);

    if (!current || now - current.windowStart > RATE_WINDOW_MS) {
        rateMap.set(ip, {
            count: 1,
            windowStart: now,
        });
        return next();
    }

    if (current.count >= RATE_MAX_REQUESTS) {
        return res.status(429).json({
            ok: false,
            error: "Demasiadas solicitudes. Intenta nuevamente en un minuto."
        });
    }

    current.count += 1;
    rateMap.set(ip, current);
    next();
}

/*
|--------------------------------------------------------------------------
| TOKEN INTERNO ENTRE HOSTINGER Y RAILWAY
|--------------------------------------------------------------------------
*/
function verifyServerToken(req, res, next) {
    const received = req.headers["x-server-token"];

    if (!SERVER_SHARED_TOKEN) {
        return res.status(500).json({
            ok: false,
            error: "SERVER_SHARED_TOKEN no configurado en Railway."
        });
    }

    if (!received || received !== SERVER_SHARED_TOKEN) {
        return res.status(403).json({
            ok: false,
            error: "Acceso no autorizado."
        });
    }

    next();
}

function sanitizeText(value) {
    if (typeof value !== "string") return "";
    return value.trim().replace(/\s+/g, " ");
}

function normalizeHistorial(historial) {
    if (!Array.isArray(historial)) return [];

    return historial
        .filter(m =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .slice(-10)
        .map(m => ({
            role: m.role,
            content: sanitizeText(m.content).slice(0, 4000)
        }))
        .filter(m => m.content.length > 0);
}

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: "chatbot-seguros",
        endpoints: {
            health: "/health",
            chat: "/chat"
        },
        timestamp: new Date().toISOString()
    });
});

app.get("/health", (req, res) => {
    res.status(openai ? 200 : 500).json({
        ok: !!openai,
        service: "chatbot-seguros",
        model: OPENAI_MODEL,
        timestamp: new Date().toISOString()
    });
});

app.post("/chat", rateLimit, verifyServerToken, async (req, res) => {
    try {
        if (!openai) {
            return res.status(500).json({
                ok: false,
                error: "OPENAI_API_KEY no configurada en Railway."
            });
        }

        const mensaje = sanitizeText(req.body?.mensaje || "");
        const expediente = req.body?.expediente ?? null;
        const historial = normalizeHistorial(req.body?.historial);

        if (!mensaje) {
            return res.status(400).json({
                ok: false,
                error: "Debes enviar 'mensaje'."
            });
        }

        if (mensaje.length > 4000) {
            return res.status(400).json({
                ok: false,
                error: "El mensaje es demasiado largo."
            });
        }

        const systemPrompt = `
Eres un asistente virtual especializado en liquidación de siniestros.

Objetivos:
- Responder claro, breve y útil.
- Ayudar a asegurados, terceros, corredores y empresas a entender el estado de un siniestro.
- Explicar si existe liquidador asignado, corredor asociado, póliza relacionada, estado del caso, fechas relevantes y documentos faltantes, solo si esos datos vienen en el expediente.
- Si faltan datos, pedir exactamente uno de estos: número de siniestro, RUT, correo o número de póliza.
- No inventar coberturas, decisiones, estados, asignaciones ni plazos.
- No actuar como autoridad final ni emitir rechazo o aprobación definitiva.

Reglas:
- Si hay expediente, úsalo como fuente principal.
- Si no hay expediente, guía al usuario para identificar el caso.
- Si el usuario pregunta por el liquidador, responde con nombre, correo y teléfono solo si existen en el expediente.
- Si el usuario pregunta por el corredor, responde con nombre, correo y teléfono solo si existen en el expediente.
- Si el usuario pregunta por el estado del siniestro, usa el campo tipo_estado si existe.
- Responder siempre en español.
- Responder en texto plano.
`.trim();

        const expedienteContext = expediente
            ? `Contexto del expediente en JSON:\n${JSON.stringify(expediente)}`
            : "No hay contexto de expediente.";

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "system", content: expedienteContext },
            ...historial,
            { role: "user", content: mensaje }
        ];

        const completion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            temperature: 0.2,
            messages
        });

        const respuesta =
            completion.choices?.[0]?.message?.content?.trim() ||
            "No pude generar una respuesta.";

        return res.json({
            ok: true,
            respuesta
        });

    } catch (error) {
        console.error("Error /chat:", error?.message || error);

        return res.status(500).json({
            ok: false,
            error: "Ocurrió un error al consultar la IA.",
            detalle: error?.message || "Error desconocido"
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
        error: "Error interno del servidor."
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});