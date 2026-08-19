import {
  computeContentHash,
} from "@/core/ai-platform/knowledge/content-hash";

import type {
  KnowledgeSourceAdapter,
} from "@/core/ai-platform/knowledge/knowledge-source-adapter";

import type {
  KnowledgeGovernanceService,
} from "@/core/ai-platform/knowledge/knowledge-governance-service";

import type {
  KnowledgeAudience,
} from "@/core/ai-platform/types/knowledge";

export interface KnowledgeSyncInput {
  since?: string;
  defaultAudience: KnowledgeAudience;
  defaultCategory?: string;
  actorId: string;
  submitForReview?: boolean;
}

export interface KnowledgeSyncResult {
  createdDocumentIds: string[];
  submittedForReviewDocumentIds: string[];
}

export class KnowledgeSyncService {
  constructor(
    private readonly sourceAdapter: KnowledgeSourceAdapter,
    private readonly governanceService: KnowledgeGovernanceService,
  ) {}

  async syncChangedDocuments(
    input: KnowledgeSyncInput,
  ): Promise<KnowledgeSyncResult> {
    const descriptors =
      await this.sourceAdapter
        .listChangedDocuments(
          input.since,
        );

    const createdDocumentIds: string[] = [];
    const submittedForReviewDocumentIds: string[] =
      [];

    for (const descriptor of descriptors) {
      const payload =
        await this.sourceAdapter
          .fetchDocument(
            descriptor.sourceReference,
          );

      if (
        payload.content.type !== "text"
      ) {
        continue;
      }

      const document =
        await this.governanceService
          .createDraft({
            title:
              descriptor.title,
            sourceSystem:
              this.sourceAdapter
                .sourceSystem,
            sourceReference:
              descriptor.sourceReference,
            audience:
              input.defaultAudience,
            category:
              input.defaultCategory,
            filename:
              descriptor.filename,
            actorId:
              input.actorId,
            metadata:
              descriptor.metadata,
            content:
              payload.content.text,
          });

      createdDocumentIds.push(
        document.id,
      );

      if (input.submitForReview) {
        await this.governanceService
          .submitForReview({
            documentId:
              document.id,
            actorId:
              input.actorId,
            note:
              `Source sync candidate ${computeContentHash(payload.content.text).slice(0, 12)}`,
          });

        submittedForReviewDocumentIds
          .push(document.id);
      }
    }

    return {
      createdDocumentIds,
      submittedForReviewDocumentIds,
    };
  }
}
