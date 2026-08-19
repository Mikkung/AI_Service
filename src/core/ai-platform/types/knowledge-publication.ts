export type KnowledgePublicationEnvironment =
  | "development"
  | "production";

export type KnowledgePublicationStatus =
  | "pending"
  | "published"
  | "failed"
  | "unpublished";

export interface KnowledgePublication {
  id: string;
  documentId: string;
  targetProvider: string;
  targetEnvironment: KnowledgePublicationEnvironment;
  publicationStatus: KnowledgePublicationStatus;
  externalResourceId?: string;
  contentHash: string;
  publishedAt?: string;
  unpublishedAt?: string;
  error?: string;
  providerMetadata?: Record<string, unknown>;
}
