import type {
  KnowledgeDocument,
  KnowledgeDocumentScope,
} from "@/core/ai-platform/types/knowledge";

export interface KnowledgeProvider {
  getDocument(
    documentId: string,
  ): Promise<KnowledgeDocument | null>;

  listDocuments(
    scope?: KnowledgeDocumentScope,
  ): Promise<KnowledgeDocument[]>;
}
