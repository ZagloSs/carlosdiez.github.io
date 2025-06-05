export const prerender = false;

import type { APIRoute } from 'astro';
import { google } from 'googleapis';

console.log('GOOGLE_APPLICATION_CREDENTIALS: credentials/google-service-account.json');

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    console.log('Datos recibidos para crear evento:', body);
    const { name, email, date, time, motivo } = body;

    // Autenticación con Google usando la ruta directa
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials/google-service-account.json',
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    console.log('Autenticación Google creada');

    const calendar = google.calendar({ version: 'v3', auth });
    console.log('Instancia de calendar creada');

    // Fecha y hora en formato RFC3339
    const startDateTime = new Date(`${date}T${time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hora
    console.log('startDateTime:', startDateTime.toISOString());
    console.log('endDateTime:', endDateTime.toISOString());

    const event = {
      summary: `Cita con ${name}`,
      description: motivo,
      start: { dateTime: startDateTime.toISOString(), timeZone: 'Europe/Madrid' },
      end: { dateTime: endDateTime.toISOString(), timeZone: 'Europe/Madrid' }
    };
    console.log('Evento a crear:', event);

    // Usa 'primary' o el ID de tu calendario
    const response = await calendar.events.insert({
      calendarId: 'carlosdiezmendez@gmail.com',
      requestBody: event,
    });
    console.log('Respuesta de Google Calendar:', response.data);

    // Enlace al evento en Google Calendar
    const htmlLink = response.data.htmlLink;

    return new Response(JSON.stringify({ success: true, eventId: response.data.id, htmlLink }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Error creando evento:', err);
    return new Response(JSON.stringify({ error: 'No se pudo crear el evento', details: String(err), stack: err?.stack }), { status: 500 });
  }
}; 