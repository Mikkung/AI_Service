import OpenAI from "openai";
import { env } from "@/core/config/env";
import type {
  AIProvider,
  GenerateTextInput,
  GenerateTextOutput,
} from "@/infrastructure/ai/ai-provider";

export class TyphoonProvider implements AIProvider {
  readonly name = "typhoon";

  private readonly client = new OpenAI({
    apiKey: env.TYPHOON_API_KEY,
    baseURL: env.TYPHOON_BASE_URL,
    timeout: 30_000,
    maxRetries: 2,
  });

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const response = await this.client.chat.completions.create({
      model: env.TYPHOON_MODEL,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userMessage },
      ],
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 600,
      stream: false,
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("Typhoon returned an empty answer.");

    return {
      answer,
      provider: this.name,
      model: response.model || env.TYPHOON_MODEL,

      finishReason:
        response.choices[0]?.finish_reason ??
        undefined,

      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}
