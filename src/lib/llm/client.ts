import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { llmEnv } from "@/config/env";
import type { GenerateResponse, LlmMessage, LlmTool } from "./types";

// Thin gRPC client for iic3103.llm.v1.Llm/Generate. One call = one model turn;
// the agent loop lives in src/lib/agent. Never retries: RESOURCE_EXHAUSTED is
// surfaced to the user, who retries by sending a new message.

const PROTO_PATH = path.join(process.cwd(), "proto", "llm.proto");
const DEADLINE_MS = 90_000;

type GenerateFn = (
  req: unknown,
  metadata: grpc.Metadata,
  options: grpc.CallOptions,
  cb: (err: grpc.ServiceError | null, res: GenerateResponse) => void,
) => void;
type LlmStub = grpc.Client & { Generate: GenerateFn };

const globalForLlm = globalThis as unknown as { __llm?: LlmStub };

function stub(): LlmStub {
  if (globalForLlm.__llm) return globalForLlm.__llm;
  const def = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const pkg = grpc.loadPackageDefinition(def) as unknown as {
    iic3103: { llm: { v1: { Llm: grpc.ServiceClientConstructor } } };
  };
  const { LLM_GRPC_TARGET, LLM_GRPC_TLS } = llmEnv();
  const creds = LLM_GRPC_TLS
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();
  const Ctor = pkg.iic3103.llm.v1.Llm;
  globalForLlm.__llm = new Ctor(LLM_GRPC_TARGET, creds) as unknown as LlmStub;
  return globalForLlm.__llm;
}

export type LlmErrorCode =
  | "UNAUTHENTICATED"
  | "PERMISSION_DENIED"
  | "RESOURCE_EXHAUSTED"
  | "INVALID_ARGUMENT"
  | "INTERNAL"
  | "UNAVAILABLE"
  | "DEADLINE_EXCEEDED"
  | "UNKNOWN";

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

function toLlmError(err: grpc.ServiceError): LlmError {
  const name = (grpc.status[err.code] ?? "UNKNOWN") as string;
  const known: LlmErrorCode[] = [
    "UNAUTHENTICATED",
    "PERMISSION_DENIED",
    "RESOURCE_EXHAUSTED",
    "INVALID_ARGUMENT",
    "INTERNAL",
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED",
  ];
  const code = (known as string[]).includes(name) ? (name as LlmErrorCode) : "UNKNOWN";
  return new LlmError(code, err.details || err.message);
}

export type StudentIdentity = { email: string; studentId: string };

export function generate(
  identity: StudentIdentity,
  messages: LlmMessage[],
  tools: LlmTool[],
): Promise<GenerateResponse> {
  const metadata = new grpc.Metadata();
  metadata.set("x-student-email", identity.email);
  metadata.set("x-student-id", identity.studentId);

  return new Promise((resolve, reject) => {
    stub().Generate(
      { messages, tools },
      metadata,
      { deadline: Date.now() + DEADLINE_MS },
      (err, res) => (err ? reject(toLlmError(err)) : resolve(res)),
    );
  });
}

/** Env-configured identity wins; otherwise the logged-in user's own. */
export function resolveIdentity(session: {
  email: string;
  studentId?: string;
}): StudentIdentity {
  const env = llmEnv();
  const email = env.LLM_STUDENT_EMAIL || session.email;
  const studentId = env.LLM_STUDENT_ID || session.studentId;
  if (!studentId) {
    throw new LlmError(
      "UNAUTHENTICATED",
      "Falta el número de alumno para el proxy LLM (configura LLM_STUDENT_ID).",
    );
  }
  return { email, studentId };
}
