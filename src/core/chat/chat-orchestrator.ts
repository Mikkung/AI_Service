import { randomUUID } from "node:crypto";
import type { ChatInput, ChatOutput } from "@/core/chat/types";
import { getAIProvider } from "@/infrastructure/ai/provider-registry";
import type { ChatRepository } from "@/infrastructure/repositories/chat-repository";
import { FirestoreChatRepository } from "@/infrastructure/repositories/firestore-chat-repository";

const SYSTEM_PROMPT = `
You are the test version of the official ISE AI assistant.

Rules:
- Answer in Thai unless the user asks in another language.
- Be polite, clear, and concise.
- This phase does not have an approved knowledge base yet.
- Do not invent admissions policies, fees, dates, requirements, or internal information.
- When verified information is unavailable, clearly say that staff confirmation is required.
`.trim();

export class ChatOrchestrator {
  constructor(
    private readonly repository: ChatRepository = new FirestoreChatRepository(),
  ) {}

  async execute(input: ChatInput): Promise<ChatOutput> {
    const sessionId = input.sessionId ?? randomUUID();
    const provider = getAIProvider();

    await this.repository.ensureSession({
      sessionId,
      channel: input.channel,
      userId: input.userId,
    });

    await this.repository.addMessage({
      sessionId,
      role: "user",
      text: input.message,
      channel: input.channel,
    });

    const startedAt = Date.now();

    try {
      const result = await provider.generateText({
        systemPrompt: SYSTEM_PROMPT,
        userMessage: input.message,
        temperature: 0.2,
        maxTokens: 600,
      });

      const latencyMs = Date.now() - startedAt;

      await Promise.all([
        this.repository.addMessage({
          sessionId,
          role: "assistant",
          text: result.answer,
          channel: input.channel,
          provider: result.provider,
          model: result.model,
        }),
        this.repository.addModelRun({
          sessionId,
          provider: result.provider,
          model: result.model,
          latencyMs,
          success: true,
          usage: result.usage,
        }),
      ]);

      return {
        sessionId,
        answer: result.answer,
        provider: result.provider,
        model: result.model,
        latencyMs,
        usage: result.usage,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : "Unknown AI error";

      await this.repository.addModelRun({
        sessionId,
        provider: provider.name,
        model: "unknown",
        latencyMs,
        success: false,
        errorMessage: message,
      });

      throw error;
    }
  }
}
