import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

// Per-user data hangs off users.id; that is how isolation is enforced.

export const authTypeEnum = pgEnum("auth_type", ["pre", "dcr", "cimd"]);
export const flowKindEnum = pgEnum("flow_kind", ["login", "connect"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  subject: text("subject").notNull().unique(), // AS `sub` (UC email)
  email: text("email").notNull(),
  studentId: text("student_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mcpConnections = pgTable(
  "mcp_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    authType: authTypeEnum("auth_type").notNull(),
    resourceUrl: text("resource_url").notNull(), // …/mcp, also the token audience
    issuer: text("issuer").notNull(),
    authorizationEndpoint: text("authorization_endpoint").notNull(),
    tokenEndpoint: text("token_endpoint").notNull(),
    scopes: text("scopes").notNull().default("mcp:tools"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("mcp_connections_user_idx").on(t.userId),
    uniqueIndex("mcp_connections_user_resource_uq").on(t.userId, t.resourceUrl),
  ],
);

export const mcpClientRegistrations = pgTable("mcp_client_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectionId: uuid("connection_id")
    .notNull()
    .unique()
    .references(() => mcpConnections.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  clientSecretEnc: text("client_secret_enc"), // encrypted; null for public (cimd)
  metadataDocumentUrl: text("metadata_document_url"), // cimd only
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mcpTokens = pgTable("mcp_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectionId: uuid("connection_id")
    .notNull()
    .unique()
    .references(() => mcpConnections.id, { onDelete: "cascade" }),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Short-lived state for an in-flight authorization-code flow, matched by `state`.
export const oauthFlows = pgTable(
  "oauth_flows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    state: text("state").notNull().unique(),
    kind: flowKindEnum("kind").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    codeVerifier: text("code_verifier").notNull(),
    resource: text("resource").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("oauth_flows_state_idx").on(t.state)],
);

// ── Tarea 2: chats ─────────────────────────────────────────────────────────
// chat_messages is the source of truth for the LLM context: replaying the
// rows of a chat in `seq` order rebuilds the exact USER/MODEL/TOOL history
// sent to Generate. `error` rows are shown in the UI and replayed as a short
// MODEL note so the history stays well-formed after an interrupted turn.

export const chatRoleEnum = pgEnum("chat_role", ["user", "model", "tool", "error"]);

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("chats_user_updated_idx").on(t.userId, t.updatedAt)],
);

export type StoredFunctionCall = { id: string; name: string; arguments: unknown };
export type StoredFunctionResult = {
  id: string;
  name: string;
  result: unknown;
  isError: boolean;
};

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: chatRoleEnum("role").notNull(),
    text: text("text"),
    functionCalls: jsonb("function_calls").$type<StoredFunctionCall[]>(),
    functionResults: jsonb("function_results").$type<StoredFunctionResult[]>(),
    // model, latency, token usage, error code… (display/debug only)
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("chat_messages_chat_seq_uq").on(t.chatId, t.seq)],
);

// One row per tools/call executed by the agent: which MCP server/connection
// served it, with what arguments, and what came back.
export const toolInvocations = pgTable(
  "tool_invocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    callId: text("call_id").notNull(),
    exposedName: text("exposed_name").notNull(), // e.g. pre_search_flights
    toolName: text("tool_name").notNull(), // name on the MCP server
    connectionId: uuid("connection_id").references(() => mcpConnections.id, {
      onDelete: "set null",
    }),
    serverName: text("server_name").notNull(),
    arguments: jsonb("arguments"),
    result: jsonb("result"),
    isError: boolean("is_error").notNull().default(false),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("tool_invocations_chat_idx").on(t.chatId)],
);

export type User = typeof users.$inferSelect;
export type McpConnection = typeof mcpConnections.$inferSelect;
export type McpClientRegistration = typeof mcpClientRegistrations.$inferSelect;
export type McpToken = typeof mcpTokens.$inferSelect;
export type OAuthFlow = typeof oauthFlows.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ToolInvocation = typeof toolInvocations.$inferSelect;
