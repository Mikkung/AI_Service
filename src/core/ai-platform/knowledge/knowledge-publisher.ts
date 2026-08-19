import type {
  KnowledgeDocument,
} from "@/core/ai-platform/types/knowledge";

import type {
  KnowledgePublication,
  KnowledgePublicationEnvironment,
} from "@/core/ai-platform/types/knowledge-publication";

export type PublishKnowledgeReason =
  | "published"
  | "already_current";

export interface PublishKnowledgeInput {
  document: KnowledgeDocument;
  targetProvider: string;
  targetEnvironment: KnowledgePublicationEnvironment;
  now?: string;
}

export interface PublishResult {
  documentId: string;
  targetProvider: string;
  targetEnvironment: KnowledgePublicationEnvironment;
  published: boolean;
  reason: PublishKnowledgeReason;
  publication: KnowledgePublication;
  providerMetadata?: Record<string, unknown>;
}

export interface KnowledgePublisher {
  readonly name: string;

  publish(
    input: PublishKnowledgeInput,
  ): Promise<PublishResult>;

  unpublish(
    documentId: string,
    targetProvider: string,
    targetEnvironment?: KnowledgePublicationEnvironment,
  ): Promise<void>;
}
