import OpenAI, {
  toFile,
} from "openai";

import {
  computeContentHash,
} from "@/core/ai-platform/knowledge/content-hash";

import type {
  KnowledgePublisher,
  PublishKnowledgeInput,
  PublishResult,
} from "@/core/ai-platform/knowledge/knowledge-publisher";

import {
  assertCanPublishKnowledge,
  type KnowledgePublicationTarget,
} from "@/core/ai-platform/knowledge/publication-policy";

import {
  FileOpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/file-openai-vector-store-config-repository";

import type {
  OpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/openai-rag-types";

import {
  InMemoryKnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/in-memory/in-memory-knowledge-publication-repository";

import type {
  KnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/knowledge-publication-repository";

import type {
  KnowledgeDocument,
} from "@/core/ai-platform/types/knowledge";

import type {
  KnowledgePublicationEnvironment,
} from "@/core/ai-platform/types/knowledge-publication";

export const OPENAI_PUBLIC_DEVELOPMENT_VECTOR_STORE_NAME =
  "ISE Public Knowledge - Development";

interface OpenAIFileObject {
  id: string;
}

interface OpenAIVectorStoreObject {
  id: string;
  name?: string;
}

interface OpenAIVectorStoreFileObject {
  id: string;
  status?: string;
  last_error?: {
    message?: string;
  } | null;
}

export interface OpenAIKnowledgePublisherClient {
  files: {
    create(
      body: Record<string, unknown>,
    ): Promise<OpenAIFileObject>;
  };
  vectorStores: {
    create(
      body: Record<string, unknown>,
    ): Promise<OpenAIVectorStoreObject>;
    files: {
      createAndPoll?: (
        vectorStoreId: string,
        body: Record<string, unknown>,
      ) => Promise<OpenAIVectorStoreFileObject>;
      create: (
        vectorStoreId: string,
        body: Record<string, unknown>,
      ) => Promise<OpenAIVectorStoreFileObject>;
      delete?: (
        fileId: string,
        params: Record<string, unknown>,
      ) => Promise<unknown>;
    };
  };
}

export interface OpenAIKnowledgePublisherOptions {
  client?: OpenAIKnowledgePublisherClient;
  apiKey?: string;
  publicVectorStoreId?: string;
  publicationRepository?: KnowledgePublicationRepository;
  vectorStoreConfigRepository?: OpenAIVectorStoreConfigRepository;
  targetAudience?: KnowledgePublicationTarget;
  now?: () => string;
}

function sanitizeAttributeValue(
  value: unknown,
): string | number | boolean | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
}

function publicationId(
  documentId: string,
  contentHash: string,
): string {
  return [
    "openai-publication",
    documentId.replace(
      /[^a-zA-Z0-9_-]/g,
      "_",
    ),
    contentHash.slice(0, 12),
  ].join("-");
}

function filenameForDocument(
  document: KnowledgeDocument,
): string {
  return (
    document.filename ??
    `${document.id}.txt`
  );
}

function contentBufferForDocument(
  document: KnowledgeDocument,
): Buffer {
  if (
    document.metadata
      ?.rawContentEncoding ===
      "base64"
  ) {
    return Buffer.from(
      document.content,
      "base64",
    );
  }

  return Buffer.from(
    document.content,
    "utf8",
  );
}

export class OpenAIKnowledgePublisher
  implements KnowledgePublisher
{
  readonly name = "openai";

  private readonly client?: OpenAIKnowledgePublisherClient;

  private readonly apiKey?: string;

  private readonly publicVectorStoreId?: string;

  private readonly publicationRepository: KnowledgePublicationRepository;

  private readonly vectorStoreConfigRepository: OpenAIVectorStoreConfigRepository;

  private readonly targetAudience: KnowledgePublicationTarget;

  private readonly now: () => string;

  constructor(
    options: OpenAIKnowledgePublisherOptions = {},
  ) {
    this.client =
      options.client;
    this.apiKey =
      options.apiKey ??
      process.env.OPENAI_API_KEY;
    this.publicVectorStoreId =
      options.publicVectorStoreId ??
      process.env
        .OPENAI_PUBLIC_VECTOR_STORE_ID;
    this.publicationRepository =
      options.publicationRepository ??
      new InMemoryKnowledgePublicationRepository();
    this.vectorStoreConfigRepository =
      options.vectorStoreConfigRepository ??
      new FileOpenAIVectorStoreConfigRepository();
    this.targetAudience =
      options.targetAudience ?? "public";
    this.now =
      options.now ??
      (() => new Date().toISOString());
  }

  async publish(
    input: PublishKnowledgeInput,
  ): Promise<PublishResult> {
    if (
      input.targetProvider !==
      this.name
    ) {
      throw new Error(
        "OpenAIKnowledgePublisher can only publish to targetProvider=openai",
      );
    }

    if (
      input.targetEnvironment !==
      "development"
    ) {
      throw new Error(
        "Phase D supports OpenAI public development publication only",
      );
    }

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
    const client =
      this.resolveClient();
    const vectorStoreId =
      await this.ensurePublicDevelopmentVectorStore(
        timestamp,
      );

    try {
      const uploadedFile =
        await client.files.create({
          file: await toFile(
            contentBufferForDocument(
              input.document,
            ),
            filenameForDocument(
              input.document,
            ),
            {
              type:
                input.document.contentType ??
                "text/plain",
            },
          ),
          purpose: "assistants",
        });

      const attributes =
        this.attributesForDocument(
          input.document,
          contentHash,
        );

      const vectorStoreFile =
        client.vectorStores.files
          .createAndPoll
          ? await client.vectorStores.files
              .createAndPoll(
                vectorStoreId,
                {
                  file_id:
                    uploadedFile.id,
                  attributes,
                },
              )
          : await client.vectorStores.files
              .create(
                vectorStoreId,
                {
                  file_id:
                    uploadedFile.id,
                  attributes,
                },
              );

      if (
        vectorStoreFile.status ===
          "failed"
      ) {
        throw new Error(
          vectorStoreFile.last_error
            ?.message ??
            "OpenAI vector store file processing failed",
        );
      }

      const publication =
        await this.publicationRepository
          .createPublication({
            id:
              publicationId(
                input.document.id,
                contentHash,
              ),
            documentId:
              input.document.id,
            targetProvider:
              input.targetProvider,
            targetEnvironment:
              input.targetEnvironment,
            publicationStatus:
              "published",
            externalResourceId:
              uploadedFile.id,
            contentHash,
            publishedAt:
              timestamp,
            providerMetadata: {
              provider:
                this.name,
              vectorStoreId,
              fileId:
                uploadedFile.id,
              vectorStoreFileId:
                vectorStoreFile.id,
              vectorStoreFileStatus:
                vectorStoreFile.status,
            },
          });

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
        providerMetadata:
          publication.providerMetadata,
      };
    } catch (error) {
      await this.publicationRepository
        .createPublication({
          id:
            `${publicationId(input.document.id, contentHash)}-failed-${Date.now()}`,
          documentId:
            input.document.id,
          targetProvider:
            input.targetProvider,
          targetEnvironment:
            input.targetEnvironment,
          publicationStatus:
            "failed",
          contentHash,
          error:
            error instanceof Error
              ? error.message
              : "Unknown OpenAI publication error",
          providerMetadata: {
            provider:
              this.name,
            vectorStoreId,
          },
        });

      throw error;
    }
  }

  async unpublish(
    documentId: string,
    targetProvider: string,
    targetEnvironment: KnowledgePublicationEnvironment = "development",
  ): Promise<void> {
    if (targetProvider !== this.name) {
      return;
    }

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

    const vectorStoreId =
      typeof existing.providerMetadata
        ?.vectorStoreId ===
      "string"
        ? existing.providerMetadata
            .vectorStoreId
        : undefined;

    if (
      existing.externalResourceId &&
      vectorStoreId
    ) {
      await this.resolveClient()
        .vectorStores.files.delete?.(
          existing.externalResourceId,
          {
            vector_store_id:
              vectorStoreId,
          },
        );
    }

    await this.publicationRepository
      .updatePublication({
        id: existing.id,
        publicationStatus:
          "unpublished",
        unpublishedAt:
          this.now(),
      });
  }

  getPublicationRepository(): KnowledgePublicationRepository {
    return this.publicationRepository;
  }

  private async ensurePublicDevelopmentVectorStore(
    timestamp: string,
  ): Promise<string> {
    if (this.publicVectorStoreId) {
      return this.publicVectorStoreId;
    }

    const target = {
      audience: "public" as const,
      environment:
        "development" as const,
    };

    const existing =
      await this.vectorStoreConfigRepository
        .getVectorStoreConfig(
          target,
        );

    if (existing) {
      return existing.vectorStoreId;
    }

    const vectorStore =
      await this.resolveClient()
        .vectorStores.create({
          name:
            OPENAI_PUBLIC_DEVELOPMENT_VECTOR_STORE_NAME,
          metadata: {
            audience: "public",
            environment:
              "development",
            managedBy:
              "ise-ai-platform-v2",
          },
        });

    await this.vectorStoreConfigRepository
      .saveVectorStoreConfig({
        ...target,
        vectorStoreId:
          vectorStore.id,
        name:
          vectorStore.name ??
          OPENAI_PUBLIC_DEVELOPMENT_VECTOR_STORE_NAME,
        createdAt:
          timestamp,
        updatedAt:
          timestamp,
      });

    return vectorStore.id;
  }

  private attributesForDocument(
    document: KnowledgeDocument,
    contentHash: string,
  ): Record<string, string | number | boolean> {
    const attributes: Record<
      string,
      string | number | boolean
    > = {
      audience:
        document.audience,
      status:
        document.status,
      knowledgeDocumentId:
        document.id,
      title:
        document.title.slice(
          0,
          512,
        ),
      contentHash,
    };

    for (const [
      key,
      value,
    ] of Object.entries({
      category:
        document.category,
      owner:
        document.owner,
      version:
        document.version,
      effectiveFrom:
        document.effectiveFrom,
      effectiveTo:
        document.effectiveTo,
      filename:
        document.filename,
      sourceSystem:
        document.sourceSystem,
      sourceReference:
        document.sourceReference,
    })) {
      const sanitized =
        sanitizeAttributeValue(value);

      if (sanitized !== undefined) {
        attributes[key] =
          typeof sanitized === "string"
            ? sanitized.slice(0, 512)
            : sanitized;
      }
    }

    return attributes;
  }

  private resolveClient(): OpenAIKnowledgePublisherClient {
    if (this.client) {
      return this.client;
    }

    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for OpenAI knowledge publication",
      );
    }

    return new OpenAI({
      apiKey: this.apiKey,
    }) as unknown as OpenAIKnowledgePublisherClient;
  }
}
