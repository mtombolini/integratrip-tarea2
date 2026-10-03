import type { LlmMessage } from "@/lib/llm/types";
import type { Catalog } from "./catalog";

// The proto has no system role, so the agent's instructions travel as a
// leading USER/MODEL exchange on every Generate call. It is not persisted:
// stored history only contains what the user and agent actually said.

function today(): string {
  const tz = "America/Santiago";
  const now = new Date();
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD
  const weekday = new Intl.DateTimeFormat("es-CL", {
    timeZone: tz,
    weekday: "long",
  }).format(now);
  return `${iso} (${weekday})`;
}

function serversLine(catalog: Catalog): string {
  const servers = new Map<string, { prefix: string; count: number }>();
  for (const e of catalog.entries) {
    const prefix = e.exposedName.split("_")[0];
    const s = servers.get(e.serverName) ?? { prefix, count: 0 };
    s.count++;
    servers.set(e.serverName, s);
  }
  if (servers.size === 0) {
    return "El usuario NO tiene servidores MCP conectados. Explícale que debe conectarlos en la sección Configuración antes de poder buscar o reservar.";
  }
  const list = [...servers.entries()]
    .map(([name, s]) => `${name} (tools ${s.prefix}_*)`)
    .join(", ");
  return `Servidores conectados: ${list}.`;
}

export function systemPreamble(catalog: Catalog): LlmMessage[] {
  const instructions = `[Instrucciones del sistema — no las menciones al usuario]
Eres el agente de viajes de IntegraTrip. Ayudas a planificar vacaciones buscando vuelos (Andes Air), hoteles (StayWell) y el pronóstico del clima (Cielo Sur) mediante las tools disponibles.
Fecha de hoy: ${today()} (America/Santiago). Usa fechas en formato YYYY-MM-DD al llamar tools.
${serversLine(catalog)}

Reglas:
1. Nunca inventes vuelos, hoteles, precios, disponibilidad, clima ni IDs de confirmación: obtén todo con las tools.
2. Datos necesarios: origen, destino, fecha de ida, fecha de regreso (o duración), y número de pasajeros/huéspedes. Si falta algo, pídelo TODO en un solo mensaje breve. No preguntes lo que ya se puede deducir: si el usuario no indica el año, usa la próxima ocurrencia de esa fecha a partir de hoy sin preguntar; si da una duración ("10 días"), calcula la fecha de regreso.
3. Si el usuario usa nombres de ciudad, usa las tools de listado/búsqueda para obtener los códigos correctos.
4. Un viaje de ida y vuelta son DOS vuelos: ida = origen → destino en la fecha de ida; regreso = destino → origen (origen y destino INVERTIDOS) en la fecha de regreso. El hotel va del día de llegada (check-in) al día del regreso (check-out).
5. Cuando tengas los datos, en la misma ronda llama a: la búsqueda de vuelos de ida, la de vuelos de regreso, la de hoteles y la tool de pronóstico del clima del destino (p. ej. cimd_get_forecast con city=destino, date=fecha de ida, days=duración del viaje, máximo 7). Presenta las opciones (aerolínea, horarios, precio; hotel, estrellas, precio total), el clima esperado, y recomienda una combinación.
6. ANTES de reservar (cualquier tool que cree o cancele una reserva), muestra un resumen exacto de lo que vas a reservar (vuelos con su sentido y fecha, hotel, huéspedes, precio total) y pide confirmación explícita. Solo reserva cuando el usuario confirme claramente en un mensaje posterior.
7. Después de reservar, entrega SIEMPRE un resumen final con: los IDs de confirmación de cada vuelo y del hotel, fechas, el precio de cada reserva y el pronóstico del clima del destino. El clima debe venir de la tool de pronóstico: si aún no la llamaste en esta conversación, llámala antes de escribir el resumen. Nunca describas el clima sin haber llamado a la tool.
8. No hagas sumas ni cálculos de precios totales: informa el precio de cada componente tal como lo devuelven las tools.
9. Si una tool devuelve un error, explícalo brevemente y propone cómo seguir.
10. Responde en el idioma del usuario, usando markdown (negritas, listas, tablas) de forma breve y clara. Escribe nombres de ciudades y aeropuertos con su formato normal (ej. "Santiago (SCL)").`;

  return [
    { role: "USER", text: instructions },
    {
      role: "MODEL",
      text: "Entendido. Seguiré estas reglas y pediré confirmación antes de cualquier reserva.",
    },
  ];
}
