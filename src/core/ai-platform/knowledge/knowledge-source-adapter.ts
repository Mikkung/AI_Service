import type {
  KnowledgeSourceSystem,
} from "@/core/ai-platform/types/knowledge";

export interface SourceDocumentDescriptor {
  sourceReference: string;
  title: string;
  filename?: string;
  modifiedAt?: string;
  metadata?: Record<string, unknown>;
}

export type SourceDocumentContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "file";
      filePath: string;
    };

export interface SourceDocumentPayload {
  descriptor: SourceDocumentDescriptor;
  content: SourceDocumentContent;
}

export interface KnowledgeSourceAdapter {
  readonly sourceSystem: KnowledgeSourceSystem;

  listChangedDocuments(
    since?: string,
  ): Promise<SourceDocumentDescriptor[]>;

  fetchDocument(
    sourceReference: string,
  ): Promise<SourceDocumentPayload>;
}
