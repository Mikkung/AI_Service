import type {
  KnowledgePublisher,
} from "@/core/ai-platform/knowledge/knowledge-publisher";

import type {
  KnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/knowledge-publication-repository";

import type {
  KnowledgeRepository,
} from "@/core/ai-platform/repositories/knowledge-repository";

import type {
  KnowledgeDocument,
} from "@/core/ai-platform/types/knowledge";

import type {
  KnowledgePublication,
  KnowledgePublicationEnvironment,
} from "@/core/ai-platform/types/knowledge-publication";

const CANONICAL_SHAREPOINT_SOURCE_IDENTITY =
  "sharepoint:83:public";

const LOCAL_TEST_DOCUMENT_ID_PREFIX =
  "knowledge-sharepoint_local-admiss";

export interface KnowledgeUnpublishDependencies {
  knowledgeRepository: KnowledgeRepository;
  publicationRepository: KnowledgePublicationRepository;
  publisher: Pick<
    KnowledgePublisher,
    "unpublish"
  >;
}

export interface KnowledgeUnpublishRequest {
  documentId: string;
  execute?: boolean;
  targetProvider?: string;
  targetEnvironment?: KnowledgePublicationEnvironment;
}

export interface KnowledgeUnpublishReport {
  documentId: string;
  sourceSystem: string;
  sourceReference?: string;
  sourceIdentity?: string;
  audience: string;
  status: string;
  latestPublicationId: string;
  publicationStatus: string;
  targetProvider: string;
  targetEnvironment: KnowledgePublicationEnvironment;
  vectorStoreId?: string;
  fileId?: string;
  dryRun: boolean;
  executed: boolean;
  wouldChange: boolean;
  action: string;
  warnings: string[];
}

function stringMetadata(
  metadata:
    | Record<string, unknown>
    | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];

  return typeof value === "string"
    ? value
    : undefined;
}

function sourceIdentityForDocument(
  document: KnowledgeDocument,
): string | undefined {
  return (
    stringMetadata(
      document.metadata,
      "sourceIdentity",
    ) ??
    document.sourceReference
  );
}

function isCanonicalSharePointItem83(
  document: KnowledgeDocument,
): boolean {
  const sourceIdentity =
    sourceIdentityForDocument(
      document,
    );
  const sourceItemId =
    stringMetadata(
      document.metadata,
      "sourceItemId",
    );

  return (
    sourceIdentity ===
      CANONICAL_SHAREPOINT_SOURCE_IDENTITY ||
    (document.sourceSystem ===
      "sharepoint" &&
      document.audience ===
        "public" &&
      sourceItemId === "83")
  );
}

function looksLikeRealSharePointDocument(
  document: KnowledgeDocument,
): boolean {
  const sourceIdentity =
    sourceIdentityForDocument(
      document,
    );
  const sourceItemId =
    stringMetadata(
      document.metadata,
      "sourceItemId",
    );

  if (
    document.sourceSystem !==
    "sharepoint"
  ) {
    return false;
  }

  if (
    document.id.startsWith(
      LOCAL_TEST_DOCUMENT_ID_PREFIX,
    )
  ) {
    return false;
  }

  return ![
    document.id,
    sourceIdentity,
    sourceItemId,
  ].some(
    (value) =>
      value
        ?.toLowerCase()
        .includes("local") ?? false,
  );
}

function byNewestPublication(
  left: KnowledgePublication,
  right: KnowledgePublication,
): number {
  return (
    (right.publishedAt ?? "")
      .localeCompare(
        left.publishedAt ?? "",
      ) ||
    right.id.localeCompare(left.id)
  );
}

function providerMetadataString(
  publication: KnowledgePublication,
  key: string,
): string | undefined {
  const value =
    publication.providerMetadata?.[key];

  return typeof value === "string"
    ? value
    : undefined;
}

function reportFor(input: {
  document: KnowledgeDocument;
  publication: KnowledgePublication;
  dryRun: boolean;
  executed: boolean;
  wouldChange: boolean;
  action: string;
  warnings: string[];
}): KnowledgeUnpublishReport {
  return {
    documentId:
      input.document.id,
    sourceSystem:
      input.document.sourceSystem,
    sourceReference:
      input.document.sourceReference,
    sourceIdentity:
      sourceIdentityForDocument(
        input.document,
      ),
    audience:
      input.document.audience,
    status:
      input.document.status,
    latestPublicationId:
      input.publication.id,
    publicationStatus:
      input.publication
        .publicationStatus,
    targetProvider:
      input.publication
        .targetProvider,
    targetEnvironment:
      input.publication
        .targetEnvironment,
    vectorStoreId:
      providerMetadataString(
        input.publication,
        "vectorStoreId",
      ),
    fileId:
      providerMetadataString(
        input.publication,
        "fileId",
      ) ??
      input.publication
        .externalResourceId,
    dryRun:
      input.dryRun,
    executed:
      input.executed,
    wouldChange:
      input.wouldChange,
    action:
      input.action,
    warnings:
      input.warnings,
  };
}

export async function unpublishKnowledgePublication(
  dependencies: KnowledgeUnpublishDependencies,
  request: KnowledgeUnpublishRequest,
): Promise<KnowledgeUnpublishReport> {
  const targetProvider =
    request.targetProvider ?? "openai";
  const targetEnvironment =
    request.targetEnvironment ??
    "development";

  if (targetProvider !== "openai") {
    throw new Error(
      "knowledge:unpublish only supports targetProvider=openai",
    );
  }

  const document =
    await dependencies
      .knowledgeRepository
      .getDocument(request.documentId);

  if (!document) {
    throw new Error(
      `Knowledge document not found: ${request.documentId}`,
    );
  }

  if (
    isCanonicalSharePointItem83(
      document,
    )
  ) {
    throw new Error(
      "Refusing to unpublish canonical SharePoint Item 83 public document",
    );
  }

  if (document.audience !== "public") {
    throw new Error(
      `Refusing to unpublish non-public document: ${document.id}`,
    );
  }

  const publications =
    await dependencies
      .publicationRepository
      .listPublications({
        documentId:
          document.id,
      });

  if (publications.length === 0) {
    throw new Error(
      `No publication found for document: ${document.id}`,
    );
  }

  const publication =
    publications
      .filter(
        (item) =>
          item.targetProvider ===
            targetProvider &&
          item.targetEnvironment ===
            targetEnvironment,
      )
      .sort(byNewestPublication)[0];

  if (!publication) {
    throw new Error(
      `No ${targetProvider}/${targetEnvironment} publication found for document: ${document.id}`,
    );
  }

  const warnings =
    looksLikeRealSharePointDocument(
      document,
    )
      ? [
          "WARNING: this looks like a real SharePoint-sourced public document. Verify it is not the canonical current publication before executing.",
        ]
      : [];

  if (
    publication.publicationStatus ===
    "unpublished"
  ) {
    return reportFor({
      document,
      publication,
      dryRun: !request.execute,
      executed: false,
      wouldChange: false,
      action:
        "No changes: latest publication is already unpublished",
      warnings,
    });
  }

  if (
    publication.publicationStatus !==
    "published"
  ) {
    throw new Error(
      `Refusing to unpublish publication in status ${publication.publicationStatus}: ${publication.id}`,
    );
  }

  if (!request.execute) {
    return reportFor({
      document,
      publication,
      dryRun: true,
      executed: false,
      wouldChange: true,
      action:
        "Dry run: would detach the OpenAI file from the vector store and mark the publication unpublished",
      warnings,
    });
  }

  await dependencies.publisher
    .unpublish(
      document.id,
      targetProvider,
      targetEnvironment,
    );

  const updatedPublication =
    (await dependencies
      .publicationRepository
      .getPublication(
        publication.id,
      )) ?? publication;

  return reportFor({
    document,
    publication:
      updatedPublication,
    dryRun: false,
    executed: true,
    wouldChange: false,
    action:
      "Executed: detached the OpenAI file from the vector store and marked the publication unpublished",
    warnings,
  });
}
