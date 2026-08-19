import type {
  KnowledgePublisher,
  PublishKnowledgeInput,
  PublishResult,
} from "@/core/ai-platform/knowledge/knowledge-publisher";

import {
  assertCanPublishKnowledge,
  type KnowledgePublicationTarget,
} from "@/core/ai-platform/knowledge/publication-policy";

import type {
  KnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/knowledge-publication-repository";

import {
  InMemoryKnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/in-memory/in-memory-knowledge-publication-repository";

import type {
  KnowledgePublicationEnvironment,
} from "@/core/ai-platform/types/knowledge-publication";

import {
  computeContentHash,
} from "@/core/ai-platform/knowledge/content-hash";

export interface MockKnowledgePublisherOptions {
  publicationRepository?: KnowledgePublicationRepository;
  targetAudience?: KnowledgePublicationTarget;
  failNextPublish?: boolean;
  now?: () => string;
}

export class MockKnowledgePublisher
  implements KnowledgePublisher
{
  readonly name = "mock";

  private failNextPublish: boolean;

  private readonly targetAudience: KnowledgePublicationTarget;

  private readonly publicationRepository: KnowledgePublicationRepository;

  private readonly now: () => string;

  private nextPublicationId = 1;

  constructor(
    options: MockKnowledgePublisherOptions = {},
  ) {
    this.publicationRepository =
      options.publicationRepository ??
      new InMemoryKnowledgePublicationRepository();
    this.targetAudience =
      options.targetAudience ?? "public";
    this.failNextPublish =
      options.failNextPublish ?? false;
    this.now =
      options.now ??
      (() => new Date().toISOString());
  }

  async publish(
    input: PublishKnowledgeInput,
  ): Promise<PublishResult> {
    assertCanPublishKnowledge({
      document:
        input.document,
      targetAudience:
        this.targetAudience,
      targetEnvironment:
        input.targetEnvironment,
      now:
        input.now,
    });

    const contentHash =
      input.document.contentHash ??
      computeContentHash(
        input.document.content,
      );

    const existing =
      await this.publicationRepository
        .findLatestPublication(
          input.document.id,
          input.targetProvider,
          input.targetEnvironment,
        );

    if (
      existing?.publicationStatus ===
        "published" &&
      existing.contentHash === contentHash
    ) {
      return {
        documentId:
          input.document.id,
        targetProvider:
          input.targetProvider,
        targetEnvironment:
          input.targetEnvironment,
        published: false,
        reason:
          "already_current",
        publication:
          existing,
      };
    }

    const timestamp =
      input.now ?? this.now();

    const publication =
      await this.publicationRepository
        .createPublication({
          id:
            `publication-${String(this.nextPublicationId++).padStart(6, "0")}`,
          documentId:
            input.document.id,
          targetProvider:
            input.targetProvider,
          targetEnvironment:
            input.targetEnvironment,
          publicationStatus:
            this.failNextPublish
              ? "failed"
              : "published",
          externalResourceId:
            this.failNextPublish
              ? undefined
              : `mock:${input.targetProvider}:${input.document.id}:${contentHash.slice(0, 12)}`,
          contentHash,
          publishedAt:
            this.failNextPublish
              ? undefined
              : timestamp,
          error:
            this.failNextPublish
              ? "Mock publication failure"
              : undefined,
          providerMetadata: {
            publisher:
              this.name,
          },
        });

    if (this.failNextPublish) {
      this.failNextPublish = false;
      throw new Error(
        "Mock publication failure",
      );
    }

    return {
      documentId:
        input.document.id,
      targetProvider:
        input.targetProvider,
      targetEnvironment:
        input.targetEnvironment,
      published: true,
      reason: "published",
      publication,
    };
  }

  async unpublish(
    documentId: string,
    targetProvider: string,
    targetEnvironment: KnowledgePublicationEnvironment = "development",
  ): Promise<void> {
    const existing =
      await this.publicationRepository
        .findLatestPublication(
          documentId,
          targetProvider,
          targetEnvironment,
        );

    if (!existing) {
      return;
    }

    await this.publicationRepository
      .updatePublication({
        id:
          existing.id,
        publicationStatus:
          "unpublished",
        unpublishedAt:
          this.now(),
      });
  }

  async listPublications(
    documentId: string,
  ) {
    return this.publicationRepository
      .listPublications({
        documentId,
      });
  }

  getPublicationRepository(): KnowledgePublicationRepository {
    return this.publicationRepository;
  }

  setFailNextPublish(): void {
    this.failNextPublish = true;
  }
}
