import type {
  OpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/openai-rag-types";

import type {
  KnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/knowledge-publication-repository";

import type {
  KnowledgePublication,
} from "@/core/ai-platform/types/knowledge-publication";

const PROTECTED_CANONICAL_FILE_ID =
  "file-NG32bTBK6jEH7Sgd4bL4zk";

export interface VectorStoreFileAttachment {
  id: string;
  status?: string;
  created_at?: number;
  vector_store_id?: string;
}

export interface OpenAIFileMetadata {
  id: string;
  filename?: string;
  created_at?: number;
}

export interface VectorStoreCleanupClient {
  files: {
    retrieve(
      fileId: string,
    ): Promise<OpenAIFileMetadata>;
    delete?: (
      fileId: string,
    ) => Promise<unknown>;
  };
  vectorStores: {
    files: {
      list(
        vectorStoreId: string,
        query?: Record<string, unknown>,
      ):
        | Promise<unknown>
        | AsyncIterable<VectorStoreFileAttachment>
        | unknown;
      retrieve?(
        fileId: string,
        params: {
          vector_store_id: string;
        },
      ): Promise<VectorStoreFileAttachment>;
      delete(
        fileId: string,
        params: {
          vector_store_id: string;
        },
      ): Promise<unknown>;
    };
  };
}

export interface VectorStoreCleanupDependencies {
  vectorStoreConfigRepository: OpenAIVectorStoreConfigRepository;
  publicationRepository: KnowledgePublicationRepository;
  client: VectorStoreCleanupClient;
}

export interface VectorStoreCleanupRequest {
  list?: boolean;
  fileId?: string;
  execute?: boolean;
}

export interface VectorStoreCleanupFileReport {
  fileId: string;
  filename?: string;
  status?: string;
  createdAt?: number;
}

export interface VectorStoreCleanupReport {
  vectorStoreId: string;
  mode: "list" | "inspect" | "detach";
  dryRun: boolean;
  executed: boolean;
  files?: VectorStoreCleanupFileReport[];
  file?: VectorStoreCleanupFileReport;
  publicationReferences?: Array<{
    publicationId: string;
    publicationStatus: string;
    documentId: string;
    targetProvider: string;
    targetEnvironment: string;
  }>;
  action: string;
  warnings: string[];
}

function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

function hasDataArray(
  value: unknown,
): value is {
  data: unknown[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(
      (value as { data?: unknown })
        .data,
    )
  );
}

function normalizeAttachment(
  value: unknown,
): VectorStoreFileAttachment {
  const item =
    value as Partial<VectorStoreFileAttachment>;

  return {
    id: String(item.id ?? ""),
    status:
      typeof item.status === "string"
        ? item.status
        : undefined,
    created_at:
      typeof item.created_at ===
      "number"
        ? item.created_at
        : undefined,
    vector_store_id:
      typeof item.vector_store_id ===
      "string"
        ? item.vector_store_id
        : undefined,
  };
}

async function collectVectorStoreFiles(
  client: VectorStoreCleanupClient,
  vectorStoreId: string,
): Promise<VectorStoreFileAttachment[]> {
  const listed =
    client.vectorStores.files.list(
      vectorStoreId,
      {
        order: "desc",
      },
    );

  if (isAsyncIterable(listed)) {
    const files: VectorStoreFileAttachment[] =
      [];

    for await (const item of listed) {
      files.push(
        normalizeAttachment(item),
      );
    }

    return files;
  }

  const resolved = await listed;

  if (isAsyncIterable(resolved)) {
    const files: VectorStoreFileAttachment[] =
      [];

    for await (const item of resolved) {
      files.push(
        normalizeAttachment(item),
      );
    }

    return files;
  }

  if (Array.isArray(resolved)) {
    return resolved.map(
      normalizeAttachment,
    );
  }

  if (hasDataArray(resolved)) {
    return resolved.data.map(
      normalizeAttachment,
    );
  }

  return [];
}

async function resolveActiveVectorStoreId(
  repository: OpenAIVectorStoreConfigRepository,
): Promise<string> {
  const config =
    await repository
      .getVectorStoreConfig({
        audience: "public",
        environment:
          "development",
      });

  if (!config) {
    throw new Error(
      "OpenAI public development vector store is not configured in Firestore",
    );
  }

  return config.vectorStoreId;
}

function publicationReferencesFile(
  publication: KnowledgePublication,
  fileId: string,
): boolean {
  return (
    publication.externalResourceId ===
      fileId ||
    publication.providerMetadata
      ?.fileId === fileId
  );
}

async function publicationReferences(
  repository: KnowledgePublicationRepository,
  fileId: string,
) {
  const publications =
    await repository.listPublications({
      targetProvider: "openai",
      targetEnvironment:
        "development",
    });

  return publications
    .filter((publication) =>
      publicationReferencesFile(
        publication,
        fileId,
      ),
    )
    .map((publication) => ({
      publicationId:
        publication.id,
      publicationStatus:
        publication.publicationStatus,
      documentId:
        publication.documentId,
      targetProvider:
        publication.targetProvider,
      targetEnvironment:
        publication.targetEnvironment,
    }));
}

async function fileReport(
  client: VectorStoreCleanupClient,
  attachment: VectorStoreFileAttachment,
): Promise<VectorStoreCleanupFileReport> {
  let metadata: OpenAIFileMetadata | null =
    null;

  try {
    metadata =
      await client.files.retrieve(
        attachment.id,
      );
  } catch {
    metadata = null;
  }

  return {
    fileId:
      attachment.id,
    filename:
      metadata?.filename,
    status:
      attachment.status,
    createdAt:
      attachment.created_at ??
      metadata?.created_at,
  };
}

export async function inspectVectorStoreFiles(
  dependencies: VectorStoreCleanupDependencies,
): Promise<VectorStoreCleanupReport> {
  const vectorStoreId =
    await resolveActiveVectorStoreId(
      dependencies
        .vectorStoreConfigRepository,
    );
  const attachments =
    await collectVectorStoreFiles(
      dependencies.client,
      vectorStoreId,
    );

  return {
    vectorStoreId,
    mode: "list",
    dryRun: true,
    executed: false,
    files:
      await Promise.all(
        attachments.map(
          (attachment) =>
            fileReport(
              dependencies.client,
              attachment,
            ),
        ),
      ),
    action:
      "Listed files currently attached to the active OpenAI public development vector store",
    warnings: [],
  };
}

export async function inspectOrDetachVectorStoreFile(
  dependencies: VectorStoreCleanupDependencies,
  request: {
    fileId: string;
    execute?: boolean;
  },
): Promise<VectorStoreCleanupReport> {
  const vectorStoreId =
    await resolveActiveVectorStoreId(
      dependencies
        .vectorStoreConfigRepository,
    );
  const attachments =
    await collectVectorStoreFiles(
      dependencies.client,
      vectorStoreId,
    );
  const attachment =
    attachments.find(
      (item) =>
        item.id === request.fileId,
    );

  if (!attachment) {
    throw new Error(
      `File is not attached to active vector store: ${request.fileId}`,
    );
  }

  const references =
    await publicationReferences(
      dependencies
        .publicationRepository,
      request.fileId,
    );
  const warnings: string[] = [];
  const reportFile =
    await fileReport(
      dependencies.client,
      attachment,
    );

  if (
    request.fileId ===
    PROTECTED_CANONICAL_FILE_ID
  ) {
    throw new Error(
      `Refusing to detach protected canonical Admission file: ${request.fileId}`,
    );
  }

  if (references.length > 0) {
    throw new Error(
      `Refusing to detach file referenced by Firestore publication record(s): ${references.map((reference) => reference.publicationId).join(", ")}`,
    );
  }

  if (!request.execute) {
    return {
      vectorStoreId,
      mode: "inspect",
      dryRun: true,
      executed: false,
      file:
        reportFile,
      publicationReferences:
        references,
      action:
        "Dry run: file is attached and would be detached from the vector store only",
      warnings,
    };
  }

  await dependencies.client
    .vectorStores.files.delete(
      request.fileId,
      {
        vector_store_id:
          vectorStoreId,
      },
    );

  return {
    vectorStoreId,
    mode: "detach",
    dryRun: false,
    executed: true,
    file:
      reportFile,
    publicationReferences:
      references,
    action:
      "Executed: detached file from vector store only; base OpenAI file was not deleted",
    warnings,
  };
}

export async function runVectorStoreOrphanCleanup(
  dependencies: VectorStoreCleanupDependencies,
  request: VectorStoreCleanupRequest,
): Promise<VectorStoreCleanupReport> {
  if (request.list) {
    return inspectVectorStoreFiles(
      dependencies,
    );
  }

  if (!request.fileId) {
    throw new Error(
      "Pass --list or --file-id <file-id>",
    );
  }

  return inspectOrDetachVectorStoreFile(
    dependencies,
    {
      fileId:
        request.fileId,
      execute:
        request.execute,
    },
  );
}
