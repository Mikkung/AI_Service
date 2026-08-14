export type ChatChannel =
  | "test"
  | "web"
  | "line"
  | "facebook"
  | "teams";

export interface ChatInput {
  sessionId?: string;
  userId?: string;
  channel: ChatChannel;
  message: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatSource {
  id: string;
  sourceId: string;
  title: string;
  score: number;
}

export interface ChatOutput {
  sessionId: string;
  answer: string;
  provider: string;
  model: string;
  latencyMs: number;

  sources: ChatSource[];

  usage?: TokenUsage;
}