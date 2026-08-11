import type { ChatChannel, TokenUsage } from "@/core/chat/types";

export interface EnsureSessionInput {
  sessionId: string;
  channel: ChatChannel;
  userId?: string;
}

export interface AddMessageInput {
  sessionId: string;
  role: "user" | "assistant" | "system";
  text: string;
  channel: ChatChannel;
  provider?: string;
  model?: string;
}

export interface AddModelRunInput {
  sessionId: string;
  provider: string;
  model: string;
  latencyMs: number;
  success: boolean;
  usage?: TokenUsage;
  errorMessage?: string;
}

export interface ChatRepository {
  ensureSession(input: EnsureSessionInput): Promise<void>;
  addMessage(input: AddMessageInput): Promise<string>;
  addModelRun(input: AddModelRunInput): Promise<string>;
}
