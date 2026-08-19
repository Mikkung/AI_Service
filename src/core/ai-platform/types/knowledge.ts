export type KnowledgeAudience =
  | "public"
  | "internal";

export type KnowledgeStatus =
  | "draft"
  | "review"
  | "approved"
  | "superseded"
  | "archived";

export type KnowledgeSourceSystem =
  | "sharepoint"
  | "manual"
  | "approved_qa"
  | "other";

export interface KnowledgeDocumentMetadata {
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
  approvedAt?: string;
  approvedBy?: string;
  supersededByDocumentId?: string;
  externalSourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeDocument {
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
  approvedAt?: string;
  approvedBy?: string;
  supersededByDocumentId?: string;
  metadata?: Record<string, unknown>;
  content: string;
}

export interface KnowledgeDocumentScope {
  audience?: KnowledgeAudience;
  categories?: string[];
  documentIds?: string[];
}

export type KnowledgeApprovalAction =
  | "submitted_for_review"
  | "returned_to_draft"
  | "approved"
  | "superseded"
  | "archived";

export interface KnowledgeApproval {
  id: string;
  documentId: string;
  action: KnowledgeApprovalAction;
  actorId: string;
  note?: string;
  createdAt: string;
}
