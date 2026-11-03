import { ragEnv } from "@/config/env";

export const RAG_TOOL_NAME = "rag_search_magazines";
export const RAG_REJECTION = "No encontré información suficiente en las revistas proporcionadas.";
const MAX_QUERIES = 5;
const MAX_RESULTS = 4;
const MAX_TEXT_CHARS = 2_400;

export type MagazineFragment = {
  id: string;
  text: string;
  source: string;
  issue: number;
  headings: string[];
  pages: number[];
  similarity?: number;
};

type SearchHit = Record<string, unknown> & {
  _similarity?: number;
  id?: string;
};

async function postJson<T>(url: string, body: unknown, apiKey: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Nomic request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((x) => x.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\s*>\s*|\s*,\s*/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function numberList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number).filter((x) => Number.isInteger(x) && x > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/\s*,\s*/)
      .map(Number)
      .filter((x) => Number.isInteger(x) && x > 0);
  }
  return [];
}

function normalizeHit(hit: SearchHit): MagazineFragment | null {
  const id = typeof hit.id === "string" ? hit.id : null;
  const text = typeof hit.text === "string" ? hit.text.trim() : "";
  const issue = Number(hit.issue);
  if (!id || !text || !Number.isInteger(issue)) return null;
  return {
    id,
    text: text.slice(0, MAX_TEXT_CHARS),
    source: typeof hit.source === "string" ? hit.source : `traveling${issue}.pdf`,
    issue,
    headings: stringList(hit.headings),
    pages: numberList(hit.pages),
    similarity: typeof hit._similarity === "number" ? hit._similarity : undefined,
  };
}

async function searchOne(query: string, k: number): Promise<MagazineFragment[]> {
  const env = ragEnv();
  const embedding = await postJson<{ embeddings?: unknown }>(
    `${env.NOMIC_API_BASE_URL}/v1/embedding/text`,
    {
      texts: [query],
      model: env.NOMIC_EMBEDDING_MODEL,
      task_type: "search_query",
    },
    env.NOMIC_API_KEY,
  );
  const vector = Array.isArray(embedding.embeddings) ? embedding.embeddings[0] : null;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("Nomic returned no query embedding");
  }

  const result = await postJson<{ data?: SearchHit[] }>(
    `${env.NOMIC_API_BASE_URL}/v1/query/topk`,
    {
      projection_id: env.NOMIC_PROJECTION_ID,
      k,
      fields: ["id", "text", "source", "issue", "headings", "pages"],
      query: vector,
    },
    env.NOMIC_API_KEY,
  );
  return (result.data ?? []).map(normalizeHit).filter((hit): hit is MagazineFragment => hit !== null);
}

export async function searchMagazines(queries: string[], limit = MAX_RESULTS) {
  const normalized = queries.map((query) => query.trim()).filter(Boolean).slice(0, MAX_QUERIES);
  if (normalized.length === 0) {
    return { queries: [], fragments: [], rejection: RAG_REJECTION };
  }

  const groups = await Promise.all(normalized.map((query) => searchOne(query, 5)));
  const unique = new Map<string, MagazineFragment>();
  for (const hit of groups.flat()) {
    const previous = unique.get(hit.id);
    if (!previous || (hit.similarity ?? -Infinity) > (previous.similarity ?? -Infinity)) {
      unique.set(hit.id, hit);
    }
  }
  const fragments = [...unique.values()]
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, Math.min(limit, MAX_RESULTS));
  return {
    queries: normalized,
    fragments,
    rejection: fragments.length === 0 ? RAG_REJECTION : undefined,
  };
}

export async function executeMagazineSearch(args: Record<string, unknown>) {
  const rawQueries = Array.isArray(args.queries)
    ? args.queries
    : typeof args.query === "string"
      ? [args.query]
      : [];
  const queries = rawQueries.filter((query): query is string => typeof query === "string");
  return searchMagazines(queries);
}
