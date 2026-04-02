# Chatbot de seguros - backend base

Este proyecto es un backend sencillo para un chatbot relacionado con una app de liquidacion de seguros.

## Que hace
- expone `GET /health`
- expone `POST /chat`
- recibe un mensaje del frontend
- envia el mensaje a OpenAI
- devuelve una respuesta util para seguros

## Requisitos
- Node.js 18 o superior
- Una cuenta en Railway
- Una API key de OpenAI

## 1) Instalar localmente
```bash
npm install
```

## 2) Variables de entorno
Crea un archivo `.env` basado en `.env.example`

Ejemplo:
```env
OPENAI_API_KEY=tu_clave
OPENAI_MODEL=gpt-4o-mini
FRONTEND_URL=https://tu-dominio.com
PORT=3000
```

## 3) Ejecutar local
```bash
npm run dev
```

## 4) Probar con Postman o curl
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "mensaje": "Que documentos faltan para liquidar este siniestro?",
    "expediente": {
      "numero": "SIN-1001",
      "estado": "Observado",
      "documentosRecibidos": ["DNI", "Denuncia policial"],
      "documentosFaltantes": ["Factura", "Informe de inspeccion"],
      "tipoCobertura": "Todo riesgo parcial"
    }
  }'
```

## 5) Desplegar en Railway
### Opcion A: desde GitHub
1. Sube esta carpeta a un repositorio.
2. En Railway: New Project -> Deploy from GitHub repo.
3. Selecciona el repo.
4. En Variables agrega:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - `FRONTEND_URL`
5. Railway detecta `npm install` y luego `npm start`.
6. Genera un dominio publico para usarlo desde tu web.

### Opcion B: con CLI
Si luego quieres usar Railway CLI, puedes hacerlo, pero GitHub es mas facil para empezar.

## 6) Como llamarlo desde tu web
Ejemplo frontend:
```html
<script>
async function enviarMensaje() {
  const mensaje = document.getElementById('mensaje').value;

  const r = await fetch('https://TU-BACKEND.up.railway.app/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mensaje,
      expediente: {
        numero: 'SIN-1001',
        estado: 'En revision',
        tipoCobertura: 'Terceros completo'
      }
    })
  });

  const data = await r.json();
  document.getElementById('respuesta').innerText = data.respuesta || data.error;
}
</script>

<input id="mensaje" placeholder="Escribe tu consulta" />
<button onclick="enviarMensaje()">Enviar</button>
<pre id="respuesta"></pre>
```

## 7) Siguiente mejora recomendada
Cuando esto ya funcione, el siguiente paso es conectar funciones reales de tu sistema, por ejemplo:
- consultar expediente por numero
- listar documentos faltantes
- leer estado real del siniestro
- usar reglas del negocio

Asi el bot deja de ser solo conversacional y empieza a responder con datos reales.
