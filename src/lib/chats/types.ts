// Client-safe shapes of stored chat data (Dates arrive as ISO strings).

export type UiFunctionCall = { id: string; name: string; arguments: unknown };
export type UiFunctionResult = {
  id: string;
  name: string;
  result: unknown;
  isError: boolean;
};

export type UiMessage = {
  id: string;
  seq: number;
  role: "user" | "model" | "tool" | "error";
  text: string | null;
  functionCalls: UiFunctionCall[] | null;
  functionResults: UiFunctionResult[] | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type UiChat = { id: string; title: string; updatedAt: string };

export type CatalogTool = {
  name: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
  authType: string;
};
