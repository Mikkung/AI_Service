import type {
  KnowledgeApproval,
  KnowledgeAudience,
  KnowledgeDocument,
  KnowledgeSourceSystem,
  KnowledgeStatus,
} from "@/core/ai-platform/types/knowledge";

export interface CreateKnowledgeDocumentInput {
  id: string;
  title: string;
  sourceSystem: KnowledgeSourceSystem;
  sourceReference?: string;
  audience: KnowledgeAudience;
  status: KnowledgeStatus;
  category?: string;
  owner?: string;
  version?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  contentType?: string;
  filename?: string;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  content: string;
}

export interface UpdateKnowledgeDocumentInput {
  id: string;
  title?: string;
  sourceReference?: string;
  audience?: KnowledgeAudience;
  status?: KnowledgeStatus;
  category?: string;
  owner?: string;
  version?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  contentType?: string;
  filename?: string;
  contentHash?: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  supersededByDocumentId?: string;
  metadata?: Record<string, unknown>;
  content?: string;
}

export interface ListKnowledgeDocumentsFilter {
  audience?: KnowledgeAudience;
  status?: KnowledgeStatus;
  category?: string;
  owner?: string;
  sourceSystem?: KnowledgeSourceSystem;
}

export interface FindCurrentApprovedDocumentsFilter {
  audience: KnowledgeAudience;
  category?: string;
  now?: string;
}

export interface KnowledgeRepository {
  createDocument(
    input: CreateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument>;

  getDocument(
    id: string,
  ): Promise<KnowledgeDocument | null>;

  updateDocument(
    input: UpdateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument>;

  listDocuments(
    filters?: ListKnowledgeDocumentsFilter,
  ): Promise<KnowledgeDocument[]>;

  findCurrentApprovedDocuments(
    filters: FindCurrentApprovedDocumentsFilter,
  ): Promise<KnowledgeDocument[]>;

  recordApproval(
    approval: KnowledgeApproval,
  ): Promise<void>;

  listApprovals(
    documentId: string,
  ): Promise<KnowledgeApproval[]>;
}
