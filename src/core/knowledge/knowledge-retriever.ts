import type {
  RetrievedChunk,
} from "@/core/knowledge/types";

import {
  cosineSimilarity,
} from "@/core/knowledge/cosine-similarity";

import {
  getEmbeddingProvider,
} from "@/infrastructure/embeddings/provider-registry";

import {
  FirestoreKnowledgeRepository,
} from "@/infrastructure/repositories/firestore-knowledge-repository";

export class KnowledgeRetriever {
  constructor(
    private readonly repository =
      new FirestoreKnowledgeRepository(),
  ) {}

  async retrieve(input: {
    query: string;
    audience:
      | "public"
      | "internal";
    limit?: number;
  }): Promise<RetrievedChunk[]> {
    const query = input.query.trim();

    if (!query) {
      throw new Error(
        "Retrieval query cannot be empty.",
      );
    }

    const provider =
      getEmbeddingProvider();

    const queryEmbedding =
      await provider.embedQuery({
        text: query,
      });

    const chunks =
      await this.repository
        .getActiveChunks(
          input.audience,
        );

    const ranked =
      chunks
        .filter(
          (chunk) =>
            chunk.embedding.length ===
            queryEmbedding.embedding.length,
        )
        .map((chunk) => ({
          id: chunk.id,
          sourceId:
            chunk.sourceId,
          title:
            chunk.title,
          text:
            chunk.text,

          score:
            cosineSimilarity(
              queryEmbedding.embedding,
              chunk.embedding,
            ),
        }))
        .sort(
          (a, b) =>
            b.score - a.score,
        );

    return ranked.slice(
      0,
      input.limit ?? 3,
    );
  }
}