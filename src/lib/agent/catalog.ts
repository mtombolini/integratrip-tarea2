import { listConnections } from "@/lib/connections/repo";
import { listTools } from "@/lib/mcp/client";
import type { LlmTool } from "@/lib/llm/types";
import type { AuthType } from "@/lib/oauth/types";

// Catalog of every tool the user has available across their connected MCPs.
// MCP tool names collide across servers (list_bookings, …) and the LLM proxy
// requires [A-Za-z_][A-Za-z0-9_]{0,63}, so each tool is exposed under a
// server-prefixed name (pre_search_flights, dcr_book_hotel, …) and mapped
// back to (connection, original name) when the model calls it.

export type CatalogEntry = {
  exposedName: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  connectionId: string;
  serverName: string;
  authType: AuthType;
};

export type CatalogWarning = { serverName: string; message: string };

export type Catalog = {
  entries: CatalogEntry[];
  byName: Map<string, CatalogEntry>;
  warnings: CatalogWarning[];
};

const MAX_NAME = 64;
const CACHE_TTL_MS = 60_000;

function sanitize(name: string): string {
  const s = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(s) ? s : `_${s}`;
}

function exposedName(prefix: string, tool: string, taken: Set<string>): string {
  const base = `${prefix}_${sanitize(tool)}`.slice(0, MAX_NAME);
  let name = base;
  for (let i = 2; taken.has(name); i++) {
    const suffix = `_${i}`;
    name = base.slice(0, MAX_NAME - suffix.length) + suffix;
  }
  taken.add(name);
  return name;
}

// The proxy forwards the schema to Gemini; meta keys like $schema add noise.
function cleanSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...rest } = schema as Record<string, unknown>;
  return { type: "object", properties: {}, ...rest };
}

const cache = new Map<string, { at: number; key: string; catalog: Catalog }>();

export async function buildCatalog(userId: string): Promise<Catalog> {
  const connections = await listConnections(userId);
  const key = connections.map((c) => c.id).sort().join(",");
  const hit = cache.get(userId);
  if (hit && hit.key === key && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.catalog;
  }

  // Oldest first so the first connection of a type keeps the plain prefix.
  const ordered = [...connections].reverse();
  const results = await Promise.allSettled(
    ordered.map((c) => listTools(userId, c.id)),
  );

  const entries: CatalogEntry[] = [];
  const warnings: CatalogWarning[] = [];
  const taken = new Set<string>();
  const prefixCount = new Map<string, number>();

  ordered.forEach((conn, i) => {
    const res = results[i];
    if (res.status === "rejected") {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      warnings.push({ serverName: conn.name, message: msg });
      return;
    }
    const n = (prefixCount.get(conn.authType) ?? 0) + 1;
    prefixCount.set(conn.authType, n);
    const prefix = n === 1 ? conn.authType : `${conn.authType}${n}`;

    for (const tool of res.value) {
      entries.push({
        exposedName: exposedName(prefix, tool.name, taken),
        toolName: tool.name,
        description: tool.description ?? tool.title ?? "",
        inputSchema: cleanSchema(tool.inputSchema),
        connectionId: conn.id,
        serverName: conn.name,
        authType: conn.authType,
      });
    }
  });

  const catalog: Catalog = {
    entries,
    byName: new Map(entries.map((e) => [e.exposedName, e])),
    warnings,
  };
  // Don't cache partial catalogs: a failing server may recover next message.
  if (warnings.length === 0) cache.set(userId, { at: Date.now(), key, catalog });
  return catalog;
}

export function toLlmTools(catalog: Catalog): LlmTool[] {
  return catalog.entries.map((e) => ({
    name: e.exposedName,
    description: `[${e.serverName}] ${e.description}`.slice(0, 1024),
    inputSchemaJson: JSON.stringify(e.inputSchema),
  }));
}
