import type {
  LoadedDocumentQASource,
} from "@/core/experiments/document-qa/types";

import type {
  KnowledgeRepository,
} from "@/infrastructure/repositories/knowledge-repository";

export interface LoadFullSourceDocumentInput {
  sourceId: string;
  repository?: Pick<
    KnowledgeRepository,
    "getActiveChunksBySource"
  >;
}

export async function loadFullSourceDocument({
  sourceId,
  repository,
}: LoadFullSourceDocumentInput): Promise<LoadedDocumentQASource> {
  const effectiveRepository =
    repository ??
    new (
      await import(
        "@/infrastructure/repositories/firestore-knowledge-repository"
      )
    ).FirestoreKnowledgeRepository();

  const chunks =
    await effectiveRepository.getActiveChunksBySource(
      sourceId,
      "public",
    );

  const sortedChunks =
    [...chunks].sort((left, right) =>
      left.id.localeCompare(right.id),
    );

  const sourceText =
    sortedChunks
      .map((chunk) => chunk.text.trim())
      .filter(Boolean)
      .join("\n\n");

  return {
    sourceText,
    sourceChunkCount:
      sortedChunks.length,
    sourceCharacterCount:
      sourceText.length,
  };
}
