import type {
  EmbeddingProvider,
} from "@/infrastructure/embeddings/embedding-provider";

import {
  GeminiEmbeddingProvider,
} from "@/infrastructure/embeddings/providers/gemini-embedding-provider";

const geminiProvider =
  new GeminiEmbeddingProvider();

export function getEmbeddingProvider():
  EmbeddingProvider {
  return geminiProvider;
}