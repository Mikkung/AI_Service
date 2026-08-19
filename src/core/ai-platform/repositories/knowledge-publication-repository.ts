import type {
  KnowledgePublication,
  KnowledgePublicationEnvironment,
  KnowledgePublicationStatus,
} from "@/core/ai-platform/types/knowledge-publication";

export interface CreateKnowledgePublicationInput {
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

export interface UpdateKnowledgePublicationInput {
  id: string;
  publicationStatus?: KnowledgePublicationStatus;
  externalResourceId?: string;
  publishedAt?: string;
  unpublishedAt?: string;
  error?: string;
  providerMetadata?: Record<string, unknown>;
}

export interface ListKnowledgePublicationsFilter {
  documentId?: string;
  targetProvider?: string;
  targetEnvironment?: KnowledgePublicationEnvironment;
  publicationStatus?: KnowledgePublicationStatus;
}

export interface KnowledgePublicationRepository {
  createPublication(
    input: CreateKnowledgePublicationInput,
  ): Promise<KnowledgePublication>;

  getPublication(
    id: string,
  ): Promise<KnowledgePublication | null>;

  findLatestPublication(
    documentId: string,
    targetProvider: string,
    targetEnvironment?: KnowledgePublicationEnvironment,
  ): Promise<KnowledgePublication | null>;

  updatePublication(
    input: UpdateKnowledgePublicationInput,
  ): Promise<KnowledgePublication>;

  listPublications(
    filters?: ListKnowledgePublicationsFilter,
  ): Promise<KnowledgePublication[]>;
}
