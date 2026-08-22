import {
  computeContentHash,
} from "@/core/ai-platform/knowledge/content-hash";

import {
  isCurrentlyEffective,
} from "@/core/ai-platform/knowledge/effective-date-policy";

import type {
  KnowledgeGovernanceService,
} from "@/core/ai-platform/knowledge/knowledge-governance-service";

import type {
  KnowledgeRepository,
} from "@/core/ai-platform/repositories/knowledge-repository";

import type {
  KnowledgeAudience,
  KnowledgeDocument,
} from "@/core/ai-platform/types/knowledge";

import type {
  KnowledgePublicationEnvironment,
} from "@/core/ai-platform/types/knowledge-publication";

export interface ApprovedKnowledgePublicationInput {
  sourceSystem: "sharepoint";
  sourceItemId: string;
  sourceVersion?: string;
  fileName: string;
  content: Buffer | Uint8Array;
  audience: KnowledgeAudience;
  knowledgeCategory?: string;
  knowledgeOwner?: string;
  knowledgeVersion?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  approvalStatus: string;
  sourceModifiedAt?: string | null;
}

export type ApprovedKnowledgePublicationOutcome =
  | "published"
  | "already_current"
  | "rejected_not_approved"
  | "rejected_wrong_audience"
  | "rejected_not_effective";

export interface ApprovedKnowledgePublicationResult {
  outcome: ApprovedKnowledgePublicationOutcome;
  knowledgeDocumentId?: string;
  supersededKnowledgeDocumentId?: string;
  publicationId?: string;
  contentHash?: string;
  metadataFingerprint?: string;
  providerMetadata?: Record<string, unknown>;
}

export interface PublishApprovedKnowledgeOptions {
  knowledgeRepository: KnowledgeRepository;
  governanceService: KnowledgeGovernanceService;
  targetProvider?: string;
  targetEnvironment?: KnowledgePublicationEnvironment;
  actorId?: string;
  now?: () => string;
}

function normalizeNullableString(
  value: string | null | undefined,
): string | undefined {
  const trimmed =
    typeof value === "string"
      ? value.trim()
      : "";

  return trimmed || undefined;
}

function sourceIdentityForInput(
  input: ApprovedKnowledgePublicationInput,
): string {
  return [
    input.sourceSystem,
    input.sourceItemId,
    input.audience,
  ].join(":");
}

function stableIdPart(
  value: string,
): string {
  return value
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

function stableJson(
  value: Record<string, unknown>,
): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(
        ([left], [right]) =>
          left.localeCompare(right),
      ),
    ),
  );
}

function metadataForFingerprint(input: {
  input: ApprovedKnowledgePublicationInput;
  effectiveFrom?: string;
  effectiveTo?: string;
}): Record<string, string | undefined> {
  return {
    fileName:
      input.input.fileName,
    knowledgeCategory:
      input.input.knowledgeCategory,
    knowledgeOwner:
      input.input.knowledgeOwner,
    knowledgeVersion:
      input.input.knowledgeVersion,
    effectiveFrom:
      input.effectiveFrom,
    effectiveTo:
      input.effectiveTo,
  };
}

function metadataFingerprintForInput(input: {
  input: ApprovedKnowledgePublicationInput;
  effectiveFrom?: string;
  effectiveTo?: string;
}): string {
  return computeContentHash(
    stableJson(
      metadataForFingerprint(input),
    ),
  );
}

function documentIdForVersion(input: {
  sourceIdentity: string;
  contentHash: string;
  metadataFingerprint: string;
}): string {
  return [
    "knowledge",
    stableIdPart(input.sourceIdentity),
    input.contentHash.slice(0, 16),
    input.metadataFingerprint.slice(0, 16),
  ].join("-");
}

function isApproved(
  approvalStatus: string,
): boolean {
  return (
    approvalStatus.trim().toLowerCase() ===
    "approved"
  );
}

function byNewestDocument(
  left: KnowledgeDocument,
  right: KnowledgeDocument,
): number {
  return (
    right.createdAt.localeCompare(
      left.createdAt,
    ) ||
    right.id.localeCompare(left.id)
  );
}

function documentMatchesSourceIdentity(
  document: KnowledgeDocument,
  sourceIdentity: string,
  sourceItemId: string,
): boolean {
  return (
    document.metadata
      ?.sourceIdentity ===
      sourceIdentity ||
    (document.metadata
      ?.sourceItemId ===
      sourceItemId &&
      document.audience ===
        sourceIdentity.split(":").at(-1))
  );
}

function contentTypeForFileName(
  fileName: string,
): string {
  const lower =
    fileName.toLowerCase();

  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (lower.endsWith(".md")) {
    return "text/markdown";
  }

  return "text/plain";
}

export class PublishApprovedKnowledge {
  private readonly targetProvider: string;

  private readonly targetEnvironment: KnowledgePublicationEnvironment;

  private readonly actorId: string;

  private readonly now: () => string;

  constructor(
    private readonly options: PublishApprovedKnowledgeOptions,
  ) {
    this.targetProvider =
      options.targetProvider ??
      "openai";
    this.targetEnvironment =
      options.targetEnvironment ??
      "development";
    this.actorId =
      options.actorId ??
      "sharepoint-publication";
    this.now =
      options.now ??
      (() => new Date().toISOString());
  }

  async execute(
    input: ApprovedKnowledgePublicationInput,
  ): Promise<ApprovedKnowledgePublicationResult> {
    if (
      !isApproved(
        input.approvalStatus,
      )
    ) {
      return {
        outcome:
          "rejected_not_approved",
      };
    }

    if (input.audience !== "public") {
      return {
        outcome:
          "rejected_wrong_audience",
      };
    }

    const timestamp =
      this.now();
    const effectiveFrom =
      normalizeNullableString(
        input.effectiveFrom,
      );
    const effectiveTo =
      normalizeNullableString(
        input.effectiveTo,
      );
    const contentBuffer =
      Buffer.from(input.content);
    const contentHash =
      computeContentHash(
        contentBuffer,
      );
    const sourceIdentity =
      sourceIdentityForInput(input);
    const metadataFingerprint =
      metadataFingerprintForInput({
        input,
        effectiveFrom,
        effectiveTo,
      });

    if (
      !this.isInputCurrentlyEffective({
        input,
        contentHash,
        effectiveFrom,
        effectiveTo,
        timestamp,
      })
    ) {
      return {
        outcome:
          "rejected_not_effective",
        contentHash,
        metadataFingerprint,
      };
    }

    const existingDocuments =
      await this.findDocumentsForSource(
        sourceIdentity,
        input.sourceItemId,
        input.audience,
      );

    const currentDocument =
      existingDocuments
        .filter(
          (document) =>
            document.status ===
              "approved" &&
            isCurrentlyEffective(
              document,
              timestamp,
            ),
        )
        .sort(byNewestDocument)[0];

    if (
      currentDocument?.contentHash ===
        contentHash &&
      currentDocument.metadata
        ?.metadataFingerprint ===
        metadataFingerprint
    ) {
      const publication =
        await this.options
          .governanceService.publish({
            documentId:
              currentDocument.id,
            targetProvider:
              this.targetProvider,
            targetEnvironment:
              this.targetEnvironment,
            now: timestamp,
          });

      return {
        outcome:
          publication.reason ===
          "already_current"
            ? "already_current"
            : "published",
        knowledgeDocumentId:
          currentDocument.id,
        publicationId:
          publication.publication.id,
        contentHash,
        metadataFingerprint,
        providerMetadata:
          publication.providerMetadata ??
          publication.publication
            .providerMetadata,
      };
    }

    const desiredDocumentId =
      documentIdForVersion({
        sourceIdentity,
        contentHash,
        metadataFingerprint,
      });

    const exactDocument =
      await this.options
        .knowledgeRepository.getDocument(
          desiredDocumentId,
        );

    if (
      exactDocument?.status ===
        "approved" &&
      exactDocument.contentHash ===
        contentHash &&
      exactDocument.metadata
        ?.metadataFingerprint ===
        metadataFingerprint
    ) {
      const publication =
        await this.options
          .governanceService.publish({
            documentId:
              exactDocument.id,
            targetProvider:
              this.targetProvider,
            targetEnvironment:
              this.targetEnvironment,
            now: timestamp,
          });

      return {
        outcome:
          publication.reason ===
          "already_current"
            ? "already_current"
            : "published",
        knowledgeDocumentId:
          exactDocument.id,
        publicationId:
          publication.publication.id,
        contentHash,
        metadataFingerprint,
        providerMetadata:
          publication.providerMetadata ??
          publication.publication
            .providerMetadata,
      };
    }

    const createdDocument =
      await this.createApprovedDocument({
        documentId:
          desiredDocumentId,
        input,
        contentBase64:
          contentBuffer.toString(
            "base64",
          ),
        contentHash,
        metadataFingerprint,
        sourceIdentity,
        effectiveFrom,
        effectiveTo,
      });

    const publication =
      await this.options
        .governanceService.publish({
          documentId:
            createdDocument.id,
          targetProvider:
            this.targetProvider,
          targetEnvironment:
            this.targetEnvironment,
          now: timestamp,
        });

    if (currentDocument) {
      await this.options
        .governanceService.unpublish({
          documentId:
            currentDocument.id,
          targetProvider:
            this.targetProvider,
          targetEnvironment:
            this.targetEnvironment,
        });

      await this.options
        .governanceService.supersede({
          oldDocumentId:
            currentDocument.id,
          replacementDocumentId:
            createdDocument.id,
          actorId:
            this.actorId,
          note:
            "Superseded by approved SharePoint publication",
        });
    }

    return {
      outcome:
        publication.reason ===
        "already_current"
          ? "already_current"
          : "published",
      knowledgeDocumentId:
        createdDocument.id,
      supersededKnowledgeDocumentId:
        currentDocument?.id,
      publicationId:
        publication.publication.id,
      contentHash,
      metadataFingerprint,
      providerMetadata:
        publication.providerMetadata ??
        publication.publication
          .providerMetadata,
    };
  }

  private isInputCurrentlyEffective(input: {
    input: ApprovedKnowledgePublicationInput;
    contentHash: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    timestamp: string;
  }): boolean {
    try {
      return isCurrentlyEffective(
        {
          id: "sharepoint-candidate",
          title:
            input.input.fileName,
          sourceSystem:
            input.input.sourceSystem,
          sourceReference:
            input.input.sourceItemId,
          audience:
            input.input.audience,
          status: "approved",
          category:
            input.input
              .knowledgeCategory,
          owner:
            input.input.knowledgeOwner,
          version:
            input.input
              .knowledgeVersion,
          effectiveFrom:
            input.effectiveFrom,
          effectiveTo:
            input.effectiveTo,
          contentHash:
            input.contentHash,
          createdAt:
            input.timestamp,
          updatedAt:
            input.timestamp,
          content: "",
        },
        input.timestamp,
      );
    } catch {
      return false;
    }
  }

  private async findDocumentsForSource(
    sourceIdentity: string,
    sourceItemId: string,
    audience: KnowledgeAudience,
  ): Promise<KnowledgeDocument[]> {
    const documents =
      await this.options
        .knowledgeRepository.listDocuments({
          audience,
          sourceSystem: "sharepoint",
        });

    return documents.filter(
      (document) =>
        documentMatchesSourceIdentity(
          document,
          sourceIdentity,
          sourceItemId,
        ),
    );
  }

  private async createApprovedDocument(input: {
    documentId: string;
    input: ApprovedKnowledgePublicationInput;
    contentBase64: string;
    contentHash: string;
    metadataFingerprint: string;
    sourceIdentity: string;
    effectiveFrom?: string;
    effectiveTo?: string;
  }): Promise<KnowledgeDocument> {
    const draft =
      await this.options
        .governanceService.createDraft({
          id:
            input.documentId,
          title:
            input.input.fileName,
          sourceSystem:
            input.input.sourceSystem,
          sourceReference:
            input.sourceIdentity,
          audience:
            input.input.audience,
          category:
            input.input
              .knowledgeCategory,
          owner:
            input.input.knowledgeOwner,
          version:
            input.input
              .knowledgeVersion ??
            input.input.sourceVersion,
          effectiveFrom:
            input.effectiveFrom,
          effectiveTo:
            input.effectiveTo,
          contentType:
            contentTypeForFileName(
              input.input.fileName,
            ),
          filename:
            input.input.fileName,
          contentHash:
            input.contentHash,
          actorId:
            this.actorId,
          metadata: {
            sourceIdentity:
              input.sourceIdentity,
            sourceItemId:
              input.input.sourceItemId,
            sourceVersion:
              input.input.sourceVersion,
            sourceModifiedAt:
              input.input
                .sourceModifiedAt ??
              undefined,
            metadataFingerprint:
              input.metadataFingerprint,
            rawContentEncoding:
              "base64",
          },
          content:
            input.contentBase64,
        });

    await this.options
      .governanceService
      .submitForReview({
        documentId:
          draft.id,
        actorId:
          this.actorId,
        note:
          "SharePoint content approval received",
      });

    return this.options
      .governanceService.approve({
        documentId:
          draft.id,
        actorId:
          this.actorId,
        note:
          "Approved in SharePoint before ingestion",
      });
  }
}
