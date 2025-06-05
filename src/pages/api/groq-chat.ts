export const prerender = false;

import type { APIRoute } from 'astro';
import { proyectos } from '../../data/projects.js';
import { ChatGroq } from "@langchain/groq";
import { google } from 'googleapis';

const cartaPresentacion = `Soy Carlos Díez, un apasionado desarrollador web con un enfoque creativo y técnico. Mi camino en el mundo del desarrollo comenzó con una curiosidad innata por resolver problemas y crear experiencias digitales atractivas.

Disfruto combinando diseño y funcionalidad para crear proyectos que no solo se vean bien, sino que también proporcionen una experiencia de usuario excepcional. Mi objetivo es seguir aprendiendo y creciendo en este campo en constante evolución.

Cuando no estoy programando, me gusta explorar nuevas tecnologías, leer sobre diseño y participar en comunidades de desarrolladores.`;

const experiencia = `
2023 - Actualidad: Desarrollador Web Frontend en Agencia Digital CreaTech. Desarrollo de interfaces de usuario modernas y responsive utilizando React, Vue.js y tecnologías relacionadas. Colaboración en equipos ágiles para entregar proyectos de alta calidad para diversos clientes.

2021 - 2023: Diseñador UI/UX en Estudio Innova. Creación de prototipos interactivos y diseños visuales para aplicaciones web y móviles. Realización de investigaciones de usuarios y pruebas de usabilidad para mejorar la experiencia del usuario.

2020 - 2021: Pasante en Desarrollo Web en TechSolutions. Aprendizaje práctico de HTML, CSS y JavaScript. Participación en proyectos de sitios web corporativos y colaboración con el equipo de diseño para implementar interfaces.`;

function resumenProyectos() {
  return proyectos.map(p => `- ${p.title}: ${p.bio} (${p.timeSpent})`).join('\n');
}

const contactoFooter = `
Contacto:
- Email: cdiezmendez@gmail.com
- Ubicación: Madrid, España
- GitHub: https://github.com/zagloss
- LinkedIn: https://www.linkedin.com/in/carlos-d%C3%ADez-b2339422a/
`;

const contactoPagina = `
Página de contacto:
- Puedes contactar a Carlos para preguntas o propuestas a través del email cdiezmendez@gmail.com o usando el formulario de contacto en la web.
`;

const contexto = `Carta de presentación:\n${cartaPresentacion}\n\nProyectos disponibles:\n${resumenProyectos()}\n\nExperiencia:\n${experiencia}\n\n${contactoFooter}\n${contactoPagina}`;

const systemPrompt = `Eres un asistente útil y simpático para la web personal de Carlos Díez. Además de responder dudas sobre la web, puedes ayudar a agendar citas en el calendario de Carlos.

Cuando el usuario quiera agendar una cita, pregunta uno a uno los siguientes datos: nombre, email, motivo, fecha (AAAA-MM-DD) y hora (24h, HH:MM). Cuando tengas todos los datos, muestra un resumen y pregunta: "¿Quieres que cree la cita con estos datos? Sí/No".

Si el usuario responde "Sí", responde con el siguiente JSON (sin explicaciones):
{
  "action": "create_event",
  "data": {
    "name": "NOMBRE",
    "email": "EMAIL",
    "date": "AAAA-MM-DD",
    "time": "HH:MM",
    "motivo": "MOTIVO"
  }
}

Ejemplo de respuesta correcta:
{
  "action": "create_event",
  "data": {
    "name": "Fer",
    "email": "fer@fer.com",
    "date": "2025-06-05",
    "time": "21:10",
    "motivo": "oferta laboral"
  }
}

Ejemplo de respuesta incorrecta:
¡Perfecto! Aquí tienes tu cita: { ... }

No expliques nada, solo responde con el JSON cuando corresponda. Si el usuario responde "No", pregunta qué dato quiere cambiar o cancela la cita.

Contexto:
Carta de presentación: Soy Carlos Díez, desarrollador web en Madrid. Proyectos: Sudoku solver, FpQuest. Experiencia: Frontend en CreaTech, UI/UX en Estudio Innova, pasante en TechSolutions. Contacto: cdiezmendez@gmail.com, GitHub: zagloss, LinkedIn: carlos-díez-b2339422a.`;

function extractFirstJson(str: string) {
  const jsonStart = str.indexOf('{');
  if (jsonStart === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = jsonStart; i < str.length; i++) {
    if (str[i] === '{') depth++;
    if (str[i] === '}') depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end === -1) return null;
  let jsonStr = str.slice(jsonStart, end).trim();
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && obj.action === 'create_event' && obj.data) {
      return obj;
    }
  } catch (e) {}
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { history } = await request.json();
    const apiKey = import.meta.env.GROQ_API_KEY;
    const model = "llama3-8b-8192";

    let messages = history && Array.isArray(history) && history.length > 0
      ? history
      : [
          { role: 'system', content: systemPrompt },
          { role: 'assistant', content: '¡Hola! Soy el asistente virtual de Carlos. ¿En qué puedo ayudarte?' }
        ];
    if (messages[0].role === 'system') {
      messages[0].content = systemPrompt;
    }

    const chat = new ChatGroq({
      apiKey: apiKey,
      model: model,
      temperature: 0.7,
      maxTokens: 512,
    });

    const lcMessages = messages.map(m => {
      if (m.role === 'system') return { role: 'system', content: m.content };
      if (m.role === 'user') return { role: 'user', content: m.content };
      if (m.role === 'assistant') {
        let content = m.content;
        if (typeof content !== 'string') {
          try {
            content = JSON.stringify(content);
          } catch {
            content = String(content);
          }
        }
        return { role: 'assistant', content };
      }
      return m;
    });

    console.log('Historial enviado al modelo:', lcMessages);

    const response = await chat.invoke(lcMessages);
    console.log('Respuesta completa del modelo:', response);
    // Asegura que aiMessage sea string
    let aiMessage: string;
    if (typeof response.content === 'string') {
      aiMessage = response.content;
    } else if (Array.isArray(response.content)) {
      aiMessage = response.content.map((c: any) => (typeof c === 'string' ? c : JSON.stringify(c))).join('\n');
    } else {
      aiMessage = 'No se pudo obtener respuesta de la IA.';
    }

    // Detecta si la respuesta es un JSON de cita
    const parsed = extractFirstJson(aiMessage);
    if (parsed) {
      // Llama a Google Calendar internamente
      try {
        const { name, email, date, time, motivo } = parsed.data;
        // Autenticación con Google
        const auth = new google.auth.GoogleAuth({
          keyFile: 'credentials/google-service-account.json',
          scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        const calendar = google.calendar({ version: 'v3', auth });
        const startDateTime = new Date(`${date}T${time}:00`);
        const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
        const event = {
          summary: `Cita con ${name}`,
          description: motivo,
          start: { dateTime: startDateTime.toISOString(), timeZone: 'Europe/Madrid' },
          end: { dateTime: endDateTime.toISOString(), timeZone: 'Europe/Madrid' }
        };
        const gcalRes = await calendar.events.insert({
          calendarId: 'carlosdiezmendez@gmail.com',
          requestBody: event,
        });
        const htmlLink = gcalRes.data.htmlLink;
        // Devuelve mensaje de éxito al usuario
        return new Response(JSON.stringify({ response: `¡Cita creada con éxito! Puedes verla aquí: <a href="${htmlLink}" target="_blank">Ver en Google Calendar</a>` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        console.error('Error creando evento en Google Calendar:', err);
        return new Response(JSON.stringify({ response: 'No se pudo crear la cita. Motivo: ' + (err.message || 'Error desconocido') }), { status: 200 });
      }
    }

    // Respuesta normal
    return new Response(JSON.stringify({ response: aiMessage }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Error en el endpoint:', err);
    return new Response(JSON.stringify({ error: 'Error en el endpoint', details: String(err) }), { status: 500 });
  }
}; 