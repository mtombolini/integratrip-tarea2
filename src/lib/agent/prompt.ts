import type { LlmMessage } from "@/lib/llm/types";
import type { Catalog } from "./catalog";

// The proto has no system role, so the agent's instructions travel as a
// leading USER/MODEL exchange on every Generate call. It is not persisted:
// stored history only contains what the user and agent actually said.

function today(): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
2. Antes de buscar, asegúrate de tener la información necesaria (origen, destino, fechas de ida/vuelta o check-in/check-out, número de pasajeros/huéspedes y cualquier parámetro obligatorio de las tools). Si falta algo, pregúntalo de forma concisa y en un solo mensaje.
3. Si el usuario usa nombres de ciudad, usa las tools de listado/búsqueda para obtener los códigos correctos.
4. Presenta las opciones encontradas (con precio y horarios) y recomienda una.
5. ANTES de reservar un vuelo u hotel (cualquier tool que cree o cancele una reserva), muestra un resumen exacto de lo que vas a reservar y pide confirmación explícita. Solo ejecuta la reserva cuando el usuario confirme claramente en un mensaje posterior.
6. Después de reservar, entrega un resumen final del viaje con los IDs de confirmación del vuelo y del hotel, fechas, y el pronóstico del clima del destino.
7. Si una tool devuelve un error, explícalo brevemente y propone cómo seguir.
8. Responde en el idioma del usuario, usando markdown (negritas, listas, tablas) de forma breve y clara.`;

  return [
    { role: "USER", text: instructions },
    {
      role: "MODEL",
      text: "Entendido. Seguiré estas reglas y pediré confirmación antes de cualquier reserva.",
    },
  ];
}
