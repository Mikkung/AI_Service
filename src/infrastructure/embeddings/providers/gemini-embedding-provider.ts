import { GoogleGenAI } from "@google/genai";

import { env } from "@/core/config/env";

import type {
  EmbeddingProvider,
  EmbeddingResult,
} from "@/infrastructure/embeddings/embedding-provider";

export class GeminiEmbeddingProvider
  implements EmbeddingProvider
{
  readonly name = "gemini";

  private readonly client = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
  });

  async embedDocument(input: {
    text: string;
    title?: string;
  }): Promise<EmbeddingResult> {
    return this.embed({
      text: input.text,
      title: input.title,
      taskType: "RETRIEVAL_DOCUMENT",
    });
  }

  async embedQuery(input: {
    text: string;
  }): Promise<EmbeddingResult> {
    return this.embed({
      text: input.text,
      taskType: "RETRIEVAL_QUERY",
    });
  }

  private async embed(input: {
    text: string;
    title?: string;
    taskType:
      | "RETRIEVAL_DOCUMENT"
      | "RETRIEVAL_QUERY";
  }): Promise<EmbeddingResult> {
    const text = input.text.trim();

    if (!text) {
      throw new Error(
        "Embedding text cannot be empty.",
      );
    }

    const response =
      await this.client.models.embedContent({
        model: env.EMBEDDING_MODEL,
        contents: text,
        config: {
          taskType: input.taskType,
          outputDimensionality:
            env.EMBEDDING_DIMENSIONS,
          ...(input.title
            ? { title: input.title }
            : {}),
        },
      });

    const embedding =
      response.embeddings?.[0]?.values;

    if (
      !embedding ||
      embedding.length === 0
    ) {
      throw new Error(
        "Gemini returned an empty embedding.",
      );
    }

    if (
      embedding.length !==
      env.EMBEDDING_DIMENSIONS
    ) {
      throw new Error(
        `Unexpected embedding dimensions: ${embedding.length}`,
      );
    }

    return {
      embedding,
      provider: this.name,
      model: env.EMBEDDING_MODEL,
      dimensions: embedding.length,
    };
  }
}