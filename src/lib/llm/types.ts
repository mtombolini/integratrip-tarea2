// Plain TS mirror of proto/llm.proto (iic3103.llm.v1). proto-loader is
// configured with keepCase:false, so fields arrive in camelCase.

export type LlmRole = "USER" | "MODEL" | "TOOL";

export type LlmTool = {
  name: string;
  description: string;
  inputSchemaJson: string;
};

export type LlmFunctionCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type LlmFunctionResult = {
  id: string;
  name: string;
  resultJson: string;
  isError: boolean;
};

export type LlmMessage = {
  role: LlmRole;
  text?: string;
  functionCalls?: LlmFunctionCall[];
  functionResults?: LlmFunctionResult[];
};

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type GenerateResponse = {
  text: string;
  functionCalls: LlmFunctionCall[];
  model: string;
  latencyMs: number;
  usage?: LlmUsage;
  stop: boolean;
};
