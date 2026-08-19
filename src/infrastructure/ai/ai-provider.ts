import type { TokenUsage } from "@/core/chat/types";

export interface GenerateTextInput {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateTextOutput {
  answer: string;
  provider: string;
  model: string;
  finishReason?:string;
  usage?: TokenUsage;
}

export interface AIProvider {
  readonly name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
}
