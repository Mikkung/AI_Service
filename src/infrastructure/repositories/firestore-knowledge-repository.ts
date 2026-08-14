import {
  FieldValue,
} from "firebase-admin/firestore";

import type {
  KnowledgeChunk,
} from "@/core/knowledge/types";

import type {
  KnowledgeRepository,
  SaveKnowledgeSourceInput,
} from "@/infrastructure/repositories/knowledge-repository";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

export class FirestoreKnowledgeRepository
  implements KnowledgeRepository
{
  async saveSource(
    input: SaveKnowledgeSourceInput,
  ): Promise<void> {
    await firestore
      .collection("ai_knowledge_sources")
      .doc(input.id)
      .set(
        {
          ...input,
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        },
      );
  }

  async saveChunk(
    chunk: KnowledgeChunk,
  ): Promise<void> {
    await firestore
      .collection("ai_knowledge_chunks")
      .doc(chunk.id)
      .set(
        {
          ...chunk,
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        },
      );
  }

  async getActiveChunks(
    audience: "public" | "internal",
  ): Promise<KnowledgeChunk[]> {
    const snapshot = await firestore
      .collection("ai_knowledge_chunks")
      .where("status", "==", "active")
      .limit(200)
      .get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();

        return {
          id: doc.id,
          sourceId:
            String(data.sourceId),
          title:
            String(data.title),
          text:
            String(data.text),

          audience:
            data.audience,
          status:
            data.status,

          embedding:
            Array.isArray(data.embedding)
              ? data.embedding.map(Number)
              : [],

          embeddingProvider:
            String(
              data.embeddingProvider,
            ),

          embeddingModel:
            String(
              data.embeddingModel,
            ),

          embeddingDimensions:
            Number(
              data.embeddingDimensions,
            ),
        } as KnowledgeChunk;
      })
      .filter(
        (chunk) =>
          chunk.audience === audience,
      );
  }
}
