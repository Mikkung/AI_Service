import {
  randomUUID,
} from "node:crypto";

import {
  computeContentHash,
} from "@/core/ai-platform/knowledge/content-hash";

import {
  isCurrentlyEffective,
} from "@/core/ai-platform/knowledge/effective-date-policy";

import type {
  KnowledgePublisher,
  PublishResult,
} from "@/core/ai-platform/knowledge/knowledge-publisher";

import {
  approvalActionForTransition,
  assertKnowledgeStatusTransition,
} from "@/core/ai-platform/knowledge/knowledge-state-machine";

import type {
  KnowledgeRepository,
} from "@/core/ai-platform/repositories/knowledge-repository";

import type {
  KnowledgePublicationEnvironment,
} from "@/core/ai-platform/types/knowledge-publication";

import type {
  KnowledgeAudience,
  KnowledgeDocument,
  KnowledgeSourceSystem,
  KnowledgeStatus,
} from "@/core/ai-platform/types/knowledge";

export interface GovernanceIdGenerator {
  nextId(prefix: string): string;
}

export class SequentialGovernanceIdGenerator
  implements GovernanceIdGenerator
{
  private next = 1;

  nextId(prefix: string): string {
    const id =
      String(this.next).padStart(
        6,
        "0",
      );
    this.next += 1;
    return `${prefix}-${id}`;
  }
}

export class RandomUuidGovernanceIdGenerator
  implements GovernanceIdGenerator
{
  nextId(prefix: string): string {
    return `${prefix}-${randomUUID()}`;
  }
}

export interface KnowledgeGovernanceServiceDependencies {
  knowledgeRepository: KnowledgeRepository;
  publisher?: KnowledgePublisher;
  idGenerator?: GovernanceIdGenerator;
  now?: () => string;
}

export interface CreateDraftInput {
  id?: string;
  title: string;
  sourceSystem: KnowledgeSourceSystem;
  sourceReference?: string;
  audience: KnowledgeAudience;
  category?: string;
  owner?: string;
  version?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  contentType?: string;
  filename?: string;
  contentHash?: string;
  actorId: string;
  metadata?: Record<string, unknown>;
  content: string;
}

export interface KnowledgeTransitionInput {
  documentId: string;
  actorId: string;
  note?: string;
}

export interface ApproveKnowledgeInput
  extends KnowledgeTransitionInput {}

export interface SupersedeKnowledgeInput {
  oldDocumentId: string;
  replacementDocumentId: string;
  actorId: string;
  note?: string;
}

export interface GetCurrentKnowledgeInput {
  audience: KnowledgeAudience;
  category?: string;
  now?: string;
}

export interface PublishKnowledgeDocumentInput {
  documentId: string;
  targetProvider: string;
  targetEnvironment: KnowledgePublicationEnvironment;
  now?: string;
}

export interface UnpublishKnowledgeDocumentInput {
  documentId: string;
  targetProvider: string;
  targetEnvironment?: KnowledgePublicationEnvironment;
}

export class KnowledgeGovernanceService {
  private readonly idGenerator: GovernanceIdGenerator;

  private readonly now: () => string;

  constructor(
    private readonly dependencies: KnowledgeGovernanceServiceDependencies,
  ) {
    this.idGenerator =
      dependencies.idGenerator ??
      new SequentialGovernanceIdGenerator();
    this.now =
      dependencies.now ??
      (() => new Date().toISOString());
  }

  async createDraft(
    input: CreateDraftInput,
  ): Promise<KnowledgeDocument> {
    const timestamp =
      this.now();

    return this.dependencies
      .knowledgeRepository
      .createDocument({
        id:
          input.id ??
          this.idGenerator.nextId("knowledge"),
        title:
          input.title,
        sourceSystem:
          input.sourceSystem,
        sourceReference:
          input.sourceReference,
        audience:
          input.audience,
        status: "draft",
        category:
          input.category,
        owner:
          input.owner,
        version:
          input.version,
        effectiveFrom:
          input.effectiveFrom,
        effectiveTo:
          input.effectiveTo,
        contentType:
          input.contentType,
        filename:
          input.filename,
        contentHash:
          input.contentHash ??
          computeContentHash(input.content),
        createdAt:
          timestamp,
        updatedAt:
          timestamp,
        metadata:
          input.metadata,
        content:
          input.content,
      });
  }

  async submitForReview(
    input: KnowledgeTransitionInput,
  ): Promise<KnowledgeDocument> {
    return this.transitionStatus(
      input,
      "review",
    );
  }

  async returnToDraft(
    input: KnowledgeTransitionInput,
  ): Promise<KnowledgeDocument> {
    return this.transitionStatus(
      input,
      "draft",
    );
  }

  async approve(
    input: ApproveKnowledgeInput,
  ): Promise<KnowledgeDocument> {
    const document =
      await this.transitionStatus(
        input,
        "approved",
        {
          approvedAt:
            this.now(),
          approvedBy:
            input.actorId,
        },
      );

    return document;
  }

  async supersede(
    input: SupersedeKnowledgeInput,
  ): Promise<KnowledgeDocument> {
    const replacement =
      await this.requireDocument(
        input.replacementDocumentId,
      );

    if (
      replacement.status !== "approved"
    ) {
      throw new Error(
        "Replacement document must be approved before supersession",
      );
    }

    return this.transitionStatus(
      {
        documentId:
          input.oldDocumentId,
        actorId:
          input.actorId,
        note:
          input.note,
      },
      "superseded",
      {
        supersededByDocumentId:
          input.replacementDocumentId,
      },
    );
  }

  async archive(
    input: KnowledgeTransitionInput,
  ): Promise<KnowledgeDocument> {
    return this.transitionStatus(
      input,
      "archived",
    );
  }

  async getCurrentApprovedKnowledge(
    input: GetCurrentKnowledgeInput,
  ): Promise<KnowledgeDocument[]> {
    return this.dependencies
      .knowledgeRepository
      .findCurrentApprovedDocuments({
        audience:
          input.audience,
        category:
          input.category,
        now:
          input.now ?? this.now(),
      });
  }

  async publish(
    input: PublishKnowledgeDocumentInput,
  ): Promise<PublishResult> {
    if (!this.dependencies.publisher) {
      throw new Error(
        "Knowledge publisher is not configured",
      );
    }

    const document =
      await this.requireDocument(
        input.documentId,
      );

    if (
      !isCurrentlyEffective(
        document,
        input.now ?? this.now(),
      )
    ) {
      throw new Error(
        "Only approved and currently effective knowledge can be published",
      );
    }

    return this.dependencies.publisher.publish({
      document,
      targetProvider:
        input.targetProvider,
      targetEnvironment:
        input.targetEnvironment,
      now:
        input.now ?? this.now(),
    });
  }

  async unpublish(
    input: UnpublishKnowledgeDocumentInput,
  ): Promise<void> {
    if (!this.dependencies.publisher) {
      throw new Error(
        "Knowledge publisher is not configured",
      );
    }

    await this.dependencies.publisher
      .unpublish(
        input.documentId,
        input.targetProvider,
        input.targetEnvironment,
      );
  }

  private async transitionStatus(
    input: KnowledgeTransitionInput,
    status: KnowledgeStatus,
    extra: Partial<KnowledgeDocument> = {},
  ): Promise<KnowledgeDocument> {
    const document =
      await this.requireDocument(
        input.documentId,
      );

    assertKnowledgeStatusTransition(
      document.status,
      status,
    );

    const timestamp =
      this.now();

    const updated =
      await this.dependencies
        .knowledgeRepository
        .transitionDocumentStatus({
          id: document.id,
          expectedStatus:
            document.status,
          status,
          updatedAt:
            timestamp,
          approvedAt:
            extra.approvedAt,
          approvedBy:
            extra.approvedBy,
          supersededByDocumentId:
            extra.supersededByDocumentId,
          approval: {
            id:
              this.idGenerator.nextId(
                "approval",
              ),
            documentId:
              document.id,
            action:
              approvalActionForTransition(
                status,
              ),
            actorId:
              input.actorId,
            note:
              input.note,
            createdAt:
              timestamp,
          },
        });

    return updated;
  }

  private async requireDocument(
    documentId: string,
  ): Promise<KnowledgeDocument> {
    const document =
      await this.dependencies
        .knowledgeRepository
        .getDocument(documentId);

    if (!document) {
      throw new Error(
        `Knowledge document not found: ${documentId}`,
      );
    }

    return document;
  }
}
