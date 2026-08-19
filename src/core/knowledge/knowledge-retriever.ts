import type {
  KnowledgeChunk,
  RetrieveForAnswerOutput,
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

    const queryEmbedding =
      await this.embedQuery(query);

    const chunks =
      await this.repository
        .getActiveChunks(
          input.audience,
        );

    const ranked =
      this.rankChunks(
        chunks,
        queryEmbedding,
      );

    return ranked.slice(
      0,
      input.limit ?? 3,
    );
  }

  async retrieveForAnswer(input: {
    query: string;
    audience:
      | "public"
      | "internal";
    semanticLimit?: number;
    seedLimit?: number;
  }): Promise<RetrieveForAnswerOutput> {
    const query = input.query.trim();

    if (!query) {
      throw new Error(
        "Retrieval query cannot be empty.",
      );
    }

    const queryEmbedding =
      await this.embedQuery(query);

    const chunks =
      await this.repository
        .getActiveChunks(
          input.audience,
        );

    const ranked =
      this.rankChunks(
        chunks,
        queryEmbedding,
      );

    if (!isBroadQuery(query)) {
      return {
        mode: "semantic",
        chunks: ranked.slice(
          0,
          input.semanticLimit ?? 3,
        ),
      };
    }

    const selectedSourceId =
      selectExpansionSourceId(
        ranked.slice(
          0,
          input.seedLimit ?? 12,
        ),
      );

    if (!selectedSourceId) {
      return {
        mode: "semantic",
        chunks: ranked.slice(
          0,
          input.semanticLimit ?? 3,
        ),
      };
    }

    const sourceChunks =
      await this.repository
        .getActiveChunksBySource(
          selectedSourceId,
          input.audience,
        );

    const expandedChunks =
      this.scoreChunksInSourceOrder(
        sourceChunks,
        queryEmbedding,
      );

    if (expandedChunks.length === 0) {
      return {
        mode: "semantic",
        chunks: ranked.slice(
          0,
          input.semanticLimit ?? 3,
        ),
      };
    }

    return {
      mode: "source_expansion",
      chunks: expandedChunks,
      expandedSourceId:
        selectedSourceId,
    };
  }

  private async embedQuery(
    query: string,
  ): Promise<number[]> {
    const provider =
      getEmbeddingProvider();

    const queryEmbedding =
      await provider.embedQuery({
        text: query,
      });

    return queryEmbedding.embedding;
  }

  private rankChunks(
    chunks: KnowledgeChunk[],
    queryEmbedding: number[],
  ): RetrievedChunk[] {
    return this.scoreChunksInSourceOrder(
      chunks,
      queryEmbedding,
    ).sort((a, b) => b.score - a.score);
  }

  private scoreChunksInSourceOrder(
    chunks: KnowledgeChunk[],
    queryEmbedding: number[],
  ): RetrievedChunk[] {
    return chunks
      .filter(
        (chunk) =>
          chunk.embedding.length ===
          queryEmbedding.length,
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
            queryEmbedding,
            chunk.embedding,
          ),
      }));
  }
}

interface SourceCandidate {
  sourceId: string;
  count: number;
  totalScore: number;
  bestScore: number;
}

const broadThaiPhrases = [
  "ทั้งหมด",
  "ทั้งหมดมีอะไรบ้าง",
  "มีอะไรบ้าง",
  "รายละเอียดทั้งหมด",
  "ข้อมูลทั้งหมด",
  "เกณฑ์ทั้งหมด",
  "ทุก option",
  "ทุกทางเลือก",
  "ภาพรวม",
  "สรุปเกณฑ์",
  "สรุปข้อมูลการรับสมัคร",
  "รายละเอียดการรับสมัคร",
];

const broadEnglishPatterns = [
  /\ball\b/i,
  /\beverything\b/i,
  /\bcomplete\b/i,
  /\bfull details\b/i,
  /\boverview\b/i,
  /\ball options\b/i,
  /\bcomplete criteria\b/i,
];

function isBroadQuery(
  query: string,
): boolean {
  const normalized =
    query.toLocaleLowerCase();

  return (
    broadThaiPhrases.some(
      (phrase) =>
        normalized.includes(phrase),
    ) ||
    broadEnglishPatterns.some(
      (pattern) =>
        pattern.test(query),
    )
  );
}

function selectExpansionSourceId(
  seedChunks: RetrievedChunk[],
): string | undefined {
  const candidates =
    new Map<string, SourceCandidate>();

  for (const chunk of seedChunks) {
    const existing =
      candidates.get(
        chunk.sourceId,
      );

    if (existing) {
      existing.count += 1;
      existing.totalScore +=
        chunk.score;
      existing.bestScore =
        Math.max(
          existing.bestScore,
          chunk.score,
        );
      continue;
    }

    candidates.set(
      chunk.sourceId,
      {
        sourceId:
          chunk.sourceId,
        count: 1,
        totalScore:
          chunk.score,
        bestScore:
          chunk.score,
      },
    );
  }

  const candidateList =
    Array.from(
      candidates.values(),
    );

  const multiChunkCandidates =
    candidateList.filter(
      (candidate) =>
        candidate.count > 1,
    );

  const selectionPool =
    multiChunkCandidates.length > 0
      ? multiChunkCandidates
      : candidateList;

  return selectionPool.sort(
    (a, b) =>
      b.totalScore -
        a.totalScore ||
      b.count - a.count ||
      b.bestScore -
        a.bestScore ||
      a.sourceId.localeCompare(
        b.sourceId,
      ),
  )[0]?.sourceId;
}
