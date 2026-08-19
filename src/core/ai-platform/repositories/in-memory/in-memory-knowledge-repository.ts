import {
  isCurrentlyEffective,
} from "@/core/ai-platform/knowledge/effective-date-policy";

import type {
  CreateKnowledgeDocumentInput,
  FindCurrentApprovedDocumentsFilter,
  KnowledgeRepository,
  ListKnowledgeDocumentsFilter,
  UpdateKnowledgeDocumentInput,
} from "@/core/ai-platform/repositories/knowledge-repository";

import type {
  KnowledgeApproval,
  KnowledgeDocument,
} from "@/core/ai-platform/types/knowledge";

function cloneDocument(
  document: KnowledgeDocument,
): KnowledgeDocument {
  return {
    ...document,
    metadata:
      document.metadata
        ? {
            ...document.metadata,
          }
        : undefined,
  };
}

function cloneApproval(
  approval: KnowledgeApproval,
): KnowledgeApproval {
  return {
    ...approval,
  };
}

export class InMemoryKnowledgeRepository
  implements KnowledgeRepository
{
  private readonly documents =
    new Map<string, KnowledgeDocument>();

  private readonly approvals =
    new Map<string, KnowledgeApproval[]>();

  async createDocument(
    input: CreateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    if (this.documents.has(input.id)) {
      throw new Error(
        `Knowledge document already exists: ${input.id}`,
      );
    }

    const document: KnowledgeDocument = {
      ...input,
    };

    this.documents.set(
      document.id,
      cloneDocument(document),
    );

    return cloneDocument(document);
  }

  async getDocument(
    id: string,
  ): Promise<KnowledgeDocument | null> {
    const document =
      this.documents.get(id);

    return document
      ? cloneDocument(document)
      : null;
  }

  async updateDocument(
    input: UpdateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const existing =
      this.documents.get(input.id);

    if (!existing) {
      throw new Error(
        `Knowledge document not found: ${input.id}`,
      );
    }

    const updated: KnowledgeDocument = {
      ...existing,
      ...input,
      updatedAt:
        input.updatedAt,
    };

    this.documents.set(
      input.id,
      cloneDocument(updated),
    );

    return cloneDocument(updated);
  }

  async listDocuments(
    filters: ListKnowledgeDocumentsFilter = {},
  ): Promise<KnowledgeDocument[]> {
    return [
      ...this.documents.values(),
    ]
      .filter(
        (document) =>
          (!filters.audience ||
            document.audience ===
              filters.audience) &&
          (!filters.status ||
            document.status ===
              filters.status) &&
          (!filters.category ||
            document.category ===
              filters.category) &&
          (!filters.owner ||
            document.owner ===
              filters.owner) &&
          (!filters.sourceSystem ||
            document.sourceSystem ===
              filters.sourceSystem),
      )
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.id.localeCompare(right.id)
          : left.createdAt.localeCompare(
              right.createdAt,
            ),
      )
      .map(cloneDocument);
  }

  async findCurrentApprovedDocuments(
    filters: FindCurrentApprovedDocumentsFilter,
  ): Promise<KnowledgeDocument[]> {
    return (
      await this.listDocuments({
        audience:
          filters.audience,
        status: "approved",
        category:
          filters.category,
      })
    ).filter((document) =>
      isCurrentlyEffective(
        document,
        filters.now,
      ),
    );
  }

  async recordApproval(
    approval: KnowledgeApproval,
  ): Promise<void> {
    const existing =
      this.approvals.get(
        approval.documentId,
      ) ?? [];

    this.approvals.set(
      approval.documentId,
      [
        ...existing,
        cloneApproval(approval),
      ],
    );
  }

  async listApprovals(
    documentId: string,
  ): Promise<KnowledgeApproval[]> {
    return (
      this.approvals.get(documentId) ?? []
    )
      .slice()
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.id.localeCompare(right.id)
          : left.createdAt.localeCompare(
              right.createdAt,
            ),
      )
      .map(cloneApproval);
  }
}
