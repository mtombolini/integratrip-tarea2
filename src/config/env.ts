import { z } from "zod";

// Env validated lazily per group so pages that don't need a group (landing,
// health) work before every secret is provisioned.

const coreSchema = z.object({
  APP_BASE_URL: z
    .string()
    .url()
    .transform((v) => v.replace(/\/$/, "")),
  AS_BASE_URL: z
    .string()
    .url()
    .default("https://tarea1-auth-z2fqxmm2ja-uc.a.run.app")
    .transform((v) => v.replace(/\/$/, "")),
});

const dbSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

const cryptoSchema = z.object({
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be >= 16 chars"),
});

const loginSchema = z.object({
  APP_LOGIN_REALM: z.string().default("pre"),
  PRE_CLIENT_ID: z.string().min(1, "PRE_CLIENT_ID is required"),
  PRE_CLIENT_SECRET: z.string().min(1, "PRE_CLIENT_SECRET is required"),
});

// LLM proxy (gRPC). Student identity is optional here: when unset, the
// logged-in user's email/student_id (from the AS token) is used instead.
const llmSchema = z.object({
  LLM_GRPC_TARGET: z
    .string()
    .default("iic3103-tarea2-llm-z2fqxmm2ja-uc.a.run.app:443"),
  LLM_GRPC_TLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  LLM_STUDENT_EMAIL: z.string().optional(),
  LLM_STUDENT_ID: z.string().optional(),
});

// Nomic is used only by the server-side RAG tool. The projection id identifies
// the public map created from our processed magazine chunks; the API key never
// leaves this process and is never sent to Generate.
const ragSchema = z.object({
  NOMIC_API_KEY: z.string().min(1, "NOMIC_API_KEY is required"),
  NOMIC_PROJECTION_ID: z.string().min(1, "NOMIC_PROJECTION_ID is required"),
  NOMIC_API_BASE_URL: z
    .string()
    .url()
    .default("https://api-atlas.nomic.ai")
    .transform((v) => v.replace(/\/$/, "")),
  NOMIC_EMBEDDING_MODEL: z.string().default("gte-multilingual-base"),
});

function parse<T extends z.ZodType>(schema: T, group: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment (${group}): ${issues}`);
  }
  return result.data;
}

let _core: z.infer<typeof coreSchema> | undefined;
let _db: z.infer<typeof dbSchema> | undefined;
let _crypto: z.infer<typeof cryptoSchema> | undefined;
let _login: z.infer<typeof loginSchema> | undefined;
let _llm: z.infer<typeof llmSchema> | undefined;
let _rag: z.infer<typeof ragSchema> | undefined;

export const coreEnv = () => (_core ??= parse(coreSchema, "core"));
export const dbEnv = () => (_db ??= parse(dbSchema, "db"));
export const cryptoEnv = () => (_crypto ??= parse(cryptoSchema, "crypto"));
export const loginEnv = () => (_login ??= parse(loginSchema, "login"));
export const llmEnv = () => (_llm ??= parse(llmSchema, "llm"));
export const ragEnv = () => (_rag ??= parse(ragSchema, "rag"));

// Single callback registered with the AS, shared by login + all MCP flows.
export const redirectUri = () => `${coreEnv().APP_BASE_URL}/callback`;

export const clientMetadataDocumentUrl = () =>
  `${coreEnv().APP_BASE_URL}/oauth/client-metadata.json`;

export const loginIssuer = () =>
  `${coreEnv().AS_BASE_URL}/realms/${loginEnv().APP_LOGIN_REALM}`;

export const jwksUrl = () => `${coreEnv().AS_BASE_URL}/.well-known/jwks.json`;
