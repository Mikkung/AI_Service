import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  AnswerService,
} from "../answering/answer-service";

import {
  unpublishKnowledgePublication,
} from "../admin/knowledge-unpublish";

import {
  runVectorStoreOrphanCleanup,
} from "../admin/vector-store-orphan-cleanup";

import {
  evaluateGroundingResult,
} from "../answering/grounding-gate";

import {
  getChannelPolicy,
} from "../channels/channel-policy";

import {
  computeContentHash,
} from "../knowledge/content-hash";

import {
  isCurrentlyEffective,
} from "../knowledge/effective-date-policy";

import {
  KnowledgeGovernanceService,
  RandomUuidGovernanceIdGenerator,
  type GovernanceIdGenerator,
} from "../knowledge/knowledge-governance-service";

import {
  KnowledgeSyncService,
} from "../knowledge/knowledge-sync-service";

import {
  assertKnowledgeStatusTransition,
  canTransitionKnowledgeStatus,
} from "../knowledge/knowledge-state-machine";

import {
  assertCanPublishKnowledge,
} from "../knowledge/publication-policy";

import {
  PublishApprovedKnowledge,
} from "../integrations/sharepoint/approved-knowledge-publication";

import {
  OneDriveQueueAdapter,
} from "../integrations/sharepoint/onedrive-queue-adapter";

import {
  handleSharePointPublicationRequest,
  parsePowerAutomatePublicationPayload,
  parseRawPowerAutomatePublicationRequest,
} from "../integrations/sharepoint/power-automate-http-adapter";

import {
  assertConversationTransition,
  canTransitionConversationMode,
} from "../conversations/conversation-transitions";

import {
  ConversationService,
  RandomUuidIdGenerator,
  type ConversationServiceResult,
  type IdGenerator,
} from "../conversations/conversation-service";

import {
  FirestoreAIPlatformConversationRepository,
} from "../repositories/firestore/firestore-ai-platform-conversation-repository";

import {
  ConversationConflictError,
  ConversationInvariantError,
} from "../repositories/conversation-workflow-repository";

import {
  FirestoreAIPlatformConversationWorkflowRepository,
} from "../repositories/firestore/firestore-ai-platform-conversation-workflow-repository";

import {
  FirestoreAIPlatformHandoffRepository,
} from "../repositories/firestore/firestore-ai-platform-handoff-repository";

import {
  InMemoryConversationRepository,
} from "../repositories/in-memory/in-memory-conversation-repository";

import {
  InMemoryHandoffRepository,
} from "../repositories/in-memory/in-memory-handoff-repository";

import {
  InMemoryKnowledgePublicationRepository,
} from "../repositories/in-memory/in-memory-knowledge-publication-repository";

import {
  InMemoryKnowledgeRepository,
} from "../repositories/in-memory/in-memory-knowledge-repository";

import type {
  TransitionKnowledgeDocumentStatusInput,
} from "../repositories/knowledge-repository";

import {
  removeUndefinedFirestoreValues,
} from "../repositories/firestore/firestore-serialization";

import {
  MockKnowledgePublisher,
} from "../providers/mock/mock-knowledge-publisher";

import {
  MockKnowledgeSourceAdapter,
} from "../providers/mock/mock-knowledge-source-adapter";

import {
  InMemoryOpenAIVectorStoreConfigRepository,
} from "../providers/openai/in-memory-openai-vector-store-config-repository";

import type {
  OpenAIVectorStoreConfig,
  OpenAIVectorStoreConfigRepository,
  OpenAIVectorStoreTarget,
} from "../providers/openai/openai-rag-types";

import {
  OpenAIGroundedQAProvider,
} from "../providers/openai/openai-grounded-qa-provider";

import {
  OpenAIKnowledgePublisher,
  type OpenAIKnowledgePublisherClient,
} from "../providers/openai/openai-knowledge-publisher";

import {
  mapOpenAIResponseToGroundedQAResult,
  UNSUPPORTED_BY_KB,
} from "../providers/openai/openai-response-mapper";

import {
  getGroundedQAProvider,
  listGroundedQAProviderNames,
} from "../registry/grounded-qa-provider-registry";

import type {
  GroundedQAProvider,
  GroundedQARequest,
  GroundedQAResult,
} from "../types/grounded-answer";

import type {
  ConversationMessage,
} from "../types/conversations";

import type {
  KnowledgeDocument,
} from "../types/knowledge";

class TestIdGenerator
  implements IdGenerator
{
  private next = 1;

  nextId(prefix: string): string {
    const id =
      String(this.next).padStart(
        3,
        "0",
      );
    this.next += 1;
    return `${prefix}-${id}`;
  }
}

class TestGovernanceIdGenerator
  implements GovernanceIdGenerator
{
  private next = 1;

  nextId(prefix: string): string {
    const id =
      String(this.next).padStart(
        3,
        "0",
      );
    this.next += 1;
    return `${prefix}-${id}`;
  }
}

class ConstantGovernanceIdGenerator
  implements GovernanceIdGenerator
{
  nextId(prefix: string): string {
    return `${prefix}-fixed`;
  }
}

type FakeFirestoreData =
  Record<string, unknown>;

function cloneFakeFirestoreValue(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      cloneFakeFirestoreValue,
    );
  }

  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) ===
      Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      ).map(([key, nested]) => [
        key,
        cloneFakeFirestoreValue(
          nested,
        ),
      ]),
    );
  }

  return value;
}

function cloneFakeFirestoreData(
  data: FakeFirestoreData,
): FakeFirestoreData {
  return cloneFakeFirestoreValue(
    data,
  ) as FakeFirestoreData;
}

class FakeFirestoreDocumentSnapshot {
  readonly exists: boolean;

  constructor(
    readonly id: string,
    private readonly value:
      | FakeFirestoreData
      | undefined,
  ) {
    this.exists =
      value !== undefined;
  }

  data(): FakeFirestoreData | undefined {
    return this.value
      ? cloneFakeFirestoreData(
          this.value,
        )
      : undefined;
  }
}

class FakeFirestoreDocumentReference {
  constructor(
    private readonly documents: Map<
      string,
      FakeFirestoreData
    >,
    readonly collectionName: string,
    readonly id: string,
  ) {}

  async create(
    data: FakeFirestoreData,
  ): Promise<void> {
    if (this.documents.has(this.id)) {
      throw new Error(
        `Document already exists: ${this.id}`,
      );
    }

    this.documents.set(
      this.id,
      cloneFakeFirestoreData(data),
    );
  }

  async get(): Promise<FakeFirestoreDocumentSnapshot> {
    return new FakeFirestoreDocumentSnapshot(
      this.id,
      this.documents.get(this.id),
    );
  }

  async set(
    data: FakeFirestoreData,
  ): Promise<void> {
    this.documents.set(
      this.id,
      cloneFakeFirestoreData(data),
    );
  }
}

class FakeFirestoreCollectionReference {
  constructor(
    private readonly documents: Map<
      string,
      FakeFirestoreData
    >,
    readonly collectionName: string,
    readonly filters: Array<{
      field: string;
      value: unknown;
    }> = [],
  ) {}

  doc(
    id: string,
  ): FakeFirestoreDocumentReference {
    return new FakeFirestoreDocumentReference(
      this.documents,
      this.collectionName,
      id,
    );
  }

  where(
    field: string,
    operator: "==",
    value: unknown,
  ): FakeFirestoreCollectionReference {
    assert.equal(operator, "==");

    return new FakeFirestoreCollectionReference(
      this.documents,
      this.collectionName,
      [
        ...this.filters,
        {
          field,
          value,
        },
      ],
    );
  }

  async get(): Promise<{
    docs: FakeFirestoreDocumentSnapshot[];
  }> {
    return {
      docs: [
        ...this.documents.entries(),
      ]
        .filter(([, data]) =>
          this.matchesFilters(data),
        )
        .map(
        ([id, data]) =>
          new FakeFirestoreDocumentSnapshot(
            id,
            data,
          ),
      ),
    };
  }

  private matchesFilters(
    data: FakeFirestoreData,
  ): boolean {
    return this.filters.every(
      (filter) =>
        data[filter.field] ===
        filter.value,
    );
  }
}

class FakeFirestore {
  private collections =
    new Map<
      string,
      Map<string, FakeFirestoreData>
    >();

  private versions =
    new Map<string, number>();

  collection(
    name: string,
  ): FakeFirestoreCollectionReference {
    let collection =
      this.collections.get(name);

    if (!collection) {
      collection =
        new Map<
          string,
          FakeFirestoreData
        >();
      this.collections.set(
        name,
        collection,
      );
    }

    return new FakeFirestoreCollectionReference(
      collection,
      name,
    );
  }

  async runTransaction<T>(
    updateFunction: (
      transaction: FakeFirestoreTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 0;
      attempt < 2;
      attempt += 1
    ) {
      const staged =
        cloneFakeCollections(
          this.collections,
        );
      const transaction =
        new FakeFirestoreTransaction(
          staged,
          new Map(this.versions),
        );
      const result =
        await updateFunction(transaction);
      const conflict =
        this.getTransactionConflict(
          transaction,
        );

      if (conflict) {
        if (attempt === 0) {
          continue;
        }

        throw new Error(conflict);
      }

      this.collections = staged;

      for (const key of transaction.writeModes.keys()) {
        this.versions.set(
          key,
          (this.versions.get(key) ?? 0) +
            1,
        );
      }

      return result;
    }

    throw new Error(
      "Transaction failed after retry",
    );
  }

  getStoredDocument(
    collectionName: string,
    documentId: string,
  ): FakeFirestoreData | undefined {
    const document =
      this.collections
        .get(collectionName)
        ?.get(documentId);

    return document
      ? cloneFakeFirestoreData(
          document,
        )
      : undefined;
  }

  private getTransactionConflict(
    transaction: FakeFirestoreTransaction,
  ): string | null {
    for (const [
      key,
      version,
    ] of transaction.readVersions) {
      if (
        (this.versions.get(key) ?? 0) !==
        version
      ) {
        return `Transaction conflict: ${key}`;
      }
    }

    for (const [
      key,
      mode,
    ] of transaction.writeModes) {
      if (
        mode === "create" &&
        (this.versions.get(key) ?? 0) > 0
      ) {
        return `Document already exists: ${key}`;
      }
    }

    return null;
  }
}

function cloneFakeCollections(
  collections: Map<
    string,
    Map<string, FakeFirestoreData>
  >,
): Map<
  string,
  Map<string, FakeFirestoreData>
> {
  return new Map(
    [...collections.entries()].map(
      ([collectionName, documents]) => [
        collectionName,
        new Map(
          [...documents.entries()].map(
            ([documentId, data]) => [
              documentId,
              cloneFakeFirestoreData(
                data,
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class FakeFirestoreTransaction {
  readonly readVersions =
    new Map<string, number>();

  readonly writeModes =
    new Map<
      string,
      "create" | "set"
    >();

  constructor(
    private readonly collections: Map<
      string,
      Map<string, FakeFirestoreData>
    >,
    private readonly versions: Map<
      string,
      number
    >,
  ) {}

  async get(
    ref:
      | FakeFirestoreDocumentReference
      | FakeFirestoreCollectionReference,
  ): Promise<
    | FakeFirestoreDocumentSnapshot
    | {
        docs: FakeFirestoreDocumentSnapshot[];
      }
  > {
    if (
      ref instanceof
      FakeFirestoreDocumentReference
    ) {
      const document =
        this.collections
          .get(ref.collectionName)
          ?.get(ref.id);
      this.readVersions.set(
        this.documentKey(
          ref.collectionName,
          ref.id,
        ),
        this.versions.get(
          this.documentKey(
            ref.collectionName,
            ref.id,
          ),
        ) ?? 0,
      );

      return new FakeFirestoreDocumentSnapshot(
        ref.id,
        document,
      );
    }

    const collection =
      this.collections.get(
        ref.collectionName,
      ) ?? new Map();

    const docs = [...collection.entries()]
        .filter(([, data]) =>
          ref.filters.every(
            (filter) =>
              data[filter.field] ===
              filter.value,
          ),
        )
    for (const [id] of docs) {
      this.readVersions.set(
        this.documentKey(
          ref.collectionName,
          id,
        ),
        this.versions.get(
          this.documentKey(
            ref.collectionName,
            id,
          ),
        ) ?? 0,
      );
    }

    return {
      docs: docs.map(
        ([id, data]) =>
          new FakeFirestoreDocumentSnapshot(
            id,
            data,
          ),
      ),
    };
  }

  create(
    ref: FakeFirestoreDocumentReference,
    data: FakeFirestoreData,
  ): void {
    const collection =
      this.getCollection(
        ref.collectionName,
      );

    if (collection.has(ref.id)) {
      throw new Error(
        `Document already exists: ${ref.id}`,
      );
    }

    collection.set(
      ref.id,
      cloneFakeFirestoreData(data),
    );
    this.writeModes.set(
      this.documentKey(
        ref.collectionName,
        ref.id,
      ),
      "create",
    );
  }

  set(
    ref: FakeFirestoreDocumentReference,
    data: FakeFirestoreData,
  ): void {
    this.getCollection(
      ref.collectionName,
    ).set(
      ref.id,
      cloneFakeFirestoreData(data),
    );
    this.writeModes.set(
      this.documentKey(
        ref.collectionName,
        ref.id,
      ),
      "set",
    );
  }

  private getCollection(
    collectionName: string,
  ): Map<string, FakeFirestoreData> {
    let collection =
      this.collections.get(
        collectionName,
      );

    if (!collection) {
      collection =
        new Map<
          string,
          FakeFirestoreData
        >();
      this.collections.set(
        collectionName,
        collection,
      );
    }

    return collection;
  }

  private documentKey(
    collectionName: string,
    documentId: string,
  ): string {
    return `${collectionName}/${documentId}`;
  }
}

class FailingTransitionKnowledgeRepository extends InMemoryKnowledgeRepository {
  private transitionCount = 0;

  constructor(
    private failingTransitionNumbers: number[],
  ) {
    super();
  }

  clearFailures(): void {
    this.failingTransitionNumbers = [];
  }

  override async transitionDocumentStatus(
    input: TransitionKnowledgeDocumentStatusInput,
  ) {
    this.transitionCount += 1;

    if (
      this.failingTransitionNumbers.includes(
        this.transitionCount,
      )
    ) {
      throw new Error(
        "Injected approval audit failure",
      );
    }

    return super.transitionDocumentStatus(
      input,
    );
  }
}

class CountingProvider
  implements GroundedQAProvider
{
  readonly name = "counting";

  calls = 0;

  readonly requests: GroundedQARequest[] =
    [];

  constructor(
    private readonly result: GroundedQAResult,
  ) {}

  async answer(
    request: GroundedQARequest,
  ): Promise<GroundedQAResult> {
    this.calls += 1;
    this.requests.push(request);
    return this.result;
  }
}

class DeferredProvider
  implements GroundedQAProvider
{
  readonly name = "deferred";

  calls = 0;

  private resolveResult:
    | ((
        result: GroundedQAResult,
      ) => void)
    | undefined;

  readonly pending =
    new Promise<GroundedQAResult>(
      (resolve) => {
        this.resolveResult = resolve;
      },
    );

  async answer(
    _request: GroundedQARequest,
  ): Promise<GroundedQAResult> {
    this.calls += 1;
    return this.pending;
  }

  resolve(
    result: GroundedQAResult,
  ): void {
    if (!this.resolveResult) {
      throw new Error(
        "Deferred provider was not initialized",
      );
    }

    this.resolveResult(result);
  }
}

class MockOpenAIKnowledgePublisherClient
  implements OpenAIKnowledgePublisherClient
{
  fileCreateCalls = 0;

  vectorStoreCreateCalls = 0;

  vectorStoreFileCreateCalls = 0;

  attachedVectorStoreIds: string[] = [];

  readonly files = {
    create: async (
      _body: Record<string, unknown>,
    ) => {
      this.fileCreateCalls += 1;

      return {
        id: `file-${this.fileCreateCalls}`,
      };
    },
  };

  readonly vectorStores = {
    create: async (
      _body: Record<string, unknown>,
    ) => {
      this.vectorStoreCreateCalls += 1;

      return {
        id: `vs-${this.vectorStoreCreateCalls}`,
        name:
          "ISE Public Knowledge - Development",
      };
    },
    files: {
      create: async (
        vectorStoreId: string,
        _body: Record<string, unknown>,
      ) => {
        this.vectorStoreFileCreateCalls += 1;
        this.attachedVectorStoreIds.push(
          vectorStoreId,
        );

        return {
          id: `vsfile-${this.vectorStoreFileCreateCalls}`,
          status:
            "completed",
        };
      },
    },
  };
}

class TrackingVectorStoreConfigRepository
  implements OpenAIVectorStoreConfigRepository
{
  getCalls = 0;

  saveCalls = 0;

  constructor(
    private readonly config: OpenAIVectorStoreConfig | null,
  ) {}

  async getVectorStoreConfig(
    _target: OpenAIVectorStoreTarget,
  ): Promise<OpenAIVectorStoreConfig | null> {
    this.getCalls += 1;

    return this.config
      ? {
          ...this.config,
        }
      : null;
  }

  async saveVectorStoreConfig(
    _config: OpenAIVectorStoreConfig,
  ): Promise<void> {
    this.saveCalls += 1;
  }
}

class FakeVectorStoreCleanupClient {
  vectorStoreFileDeleteCalls: Array<{
    fileId: string;
    vectorStoreId: string;
  }> = [];

  baseFileDeleteCalls: string[] = [];

  constructor(
    private readonly attachments: Array<{
      id: string;
      status?: string;
      created_at?: number;
      vector_store_id?: string;
    }>,
    private readonly filesById: Record<
      string,
      {
        id: string;
        filename: string;
        created_at?: number;
      }
    >,
  ) {}

  readonly files = {
    retrieve: async (fileId: string) =>
      this.filesById[fileId] ?? {
        id: fileId,
        filename: "",
      },
    delete: async (fileId: string) => {
      this.baseFileDeleteCalls.push(
        fileId,
      );
      return {
        id: fileId,
        deleted: true,
      };
    },
  };

  readonly vectorStores = {
    files: {
      list: async (
        _vectorStoreId: string,
      ) => ({
        data:
          this.attachments.map(
            (attachment) => ({
              ...attachment,
            }),
          ),
      }),
      delete: async (
        fileId: string,
        params: {
          vector_store_id: string;
        },
      ) => {
        this.vectorStoreFileDeleteCalls
          .push({
            fileId,
            vectorStoreId:
              params.vector_store_id,
          });
        return {
          id: fileId,
          deleted: true,
        };
      },
    },
  };
}

function createApprovedPublicKnowledgeDocument(
  overrides: Partial<KnowledgeDocument> = {},
): KnowledgeDocument {
  return {
    id: "doc-public",
    title:
      "Admission Criteria AY2027",
    sourceSystem: "manual",
    audience: "public",
    status: "approved",
    category: "admission",
    version: "AY2027",
    filename:
      "admission-ay2027.txt",
    contentType: "text/plain",
    content:
      "Option 1 CU-ATS minimum is 800.",
    contentHash:
      computeContentHash(
        "Option 1 CU-ATS minimum is 800.",
      ),
    createdAt:
      "2027-01-01T00:00:00.000Z",
    updatedAt:
      "2027-01-01T00:00:00.000Z",
    approvedAt:
      "2027-01-01T00:00:00.000Z",
    approvedBy:
      "approver-1",
    ...overrides,
  };
}

function createTestService(
  provider: CountingProvider,
) {
  const conversationRepository =
    new InMemoryConversationRepository();
  const handoffRepository =
    new InMemoryHandoffRepository();

  const service =
    new ConversationService({
      conversationRepository,
      handoffRepository,
      answerService:
        new AnswerService(provider),
      idGenerator:
        new TestIdGenerator(),
      now: () =>
        `2027-01-01T00:00:${String(provider.calls).padStart(2, "0")}.000Z`,
    });

  return {
    service,
    conversationRepository,
    handoffRepository,
    provider,
  };
}

function createAtomicTestService(
  provider:
    | CountingProvider
    | DeferredProvider,
) {
  const db =
    new FakeFirestore();
  const conversationRepository =
    new FirestoreAIPlatformConversationRepository(
      db,
    );
  const handoffRepository =
    new FirestoreAIPlatformHandoffRepository(
      db,
    );
  const conversationWorkflowRepository =
    new FirestoreAIPlatformConversationWorkflowRepository(
      db,
    );
  const service =
    new ConversationService({
      conversationRepository,
      handoffRepository,
      conversationWorkflowRepository,
      answerService:
        new AnswerService(provider),
      idGenerator:
        new TestIdGenerator(),
      now: () =>
        `2027-01-01T00:00:${String(provider.calls).padStart(2, "0")}.000Z`,
    });

  return {
    db,
    service,
    conversationRepository,
    handoffRepository,
    conversationWorkflowRepository,
    provider,
  };
}

function groundedCountingProvider(
  answer = "grounded answer",
): CountingProvider {
  return new CountingProvider({
    answerable: true,
    answer,
    citations: [
      {
        documentId: "doc-1",
      },
    ],
    provider: "counting",
  });
}

function unsupportedCountingProvider(): CountingProvider {
  return new CountingProvider({
    answerable: false,
    answer: "",
    citations: [],
    provider: "counting",
  });
}

function countMessagesBySender(
  messages: ConversationMessage[],
  senderType: ConversationMessage["senderType"],
): number {
  return messages.filter(
    (message) =>
      message.senderType === senderType,
  ).length;
}

function createKnowledgeTestService() {
  const knowledgeRepository =
    new InMemoryKnowledgeRepository();
  const publicationRepository =
    new InMemoryKnowledgePublicationRepository();
  const publisher =
    new MockKnowledgePublisher({
      publicationRepository,
      targetAudience: "public",
      now: () =>
        "2027-01-01T00:00:00.000Z",
    });
  const service =
    new KnowledgeGovernanceService({
      knowledgeRepository,
      publisher,
      idGenerator:
        new TestGovernanceIdGenerator(),
      now: () =>
        "2027-01-01T00:00:00.000Z",
    });

  return {
    service,
    knowledgeRepository,
    publicationRepository,
    publisher,
  };
}

function createSharePointPublicationTestEnvironment(input: {
  knowledgeRepository?: InMemoryKnowledgeRepository;
  publicationRepository?: InMemoryKnowledgePublicationRepository;
  publisher?: MockKnowledgePublisher;
  idGenerator?: GovernanceIdGenerator;
  now?: () => string;
} = {}) {
  const knowledgeRepository =
    input.knowledgeRepository ??
    new InMemoryKnowledgeRepository();
  const publicationRepository =
    input.publicationRepository ??
    new InMemoryKnowledgePublicationRepository();
  const publisher =
    input.publisher ??
    new MockKnowledgePublisher({
      publicationRepository,
      targetAudience: "public",
      now:
        input.now ??
        (() =>
          "2027-01-01T00:00:00.000Z"),
    });
  const governanceService =
    new KnowledgeGovernanceService({
      knowledgeRepository,
      publisher,
      idGenerator:
        input.idGenerator ??
        new TestGovernanceIdGenerator(),
      now:
        input.now ??
        (() =>
          "2027-01-01T00:00:00.000Z"),
    });
  const useCase =
    new PublishApprovedKnowledge({
      knowledgeRepository,
      governanceService,
      now: () =>
        "2027-01-01T00:00:00.000Z",
    });

  return {
    useCase,
    knowledgeRepository,
    publicationRepository,
    governanceService,
    publisher,
  };
}

function approvedSharePointInput(
  overrides: Partial<
    Parameters<
      PublishApprovedKnowledge["execute"]
    >[0]
  > = {},
): Parameters<
  PublishApprovedKnowledge["execute"]
>[0] {
  return {
    sourceSystem: "sharepoint",
    sourceItemId:
      "sp-item-1",
    sourceVersion: "1.0",
    fileName:
      "admission-ay2027.txt",
    content:
      Buffer.from(
        "approved public knowledge",
        "utf8",
      ),
    audience: "public",
    knowledgeCategory:
      "Admission",
    knowledgeOwner:
      "ISE",
    knowledgeVersion:
      "AY2027",
    effectiveFrom: null,
    effectiveTo: null,
    approvalStatus:
      "Approved",
    sourceModifiedAt:
      "2027-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function rawSharePointRequest(input: {
  secret?: string;
  body?: BodyInit;
  headers?: Record<string, string>;
} = {}): Request {
  const requestBody =
    input.body ?? "raw bytes";

  return new Request(
    "http://localhost/api/integrations/sharepoint/publication",
    {
      method: "POST",
      headers: {
        authorization:
          `Bearer ${input.secret ?? "test-secret"}`,
        "content-type":
          "application/octet-stream",
        "x-ise-source-system":
          "sharepoint",
        "x-ise-source-item-id":
          "raw-item-1",
        "x-ise-file-name":
          "admission.docx",
        "x-ise-audience":
          "public",
        "x-ise-approval-status":
          "Approved",
        "x-ise-knowledge-category":
          "Admission",
        "x-ise-knowledge-version":
          "AY2027",
        ...input.headers,
      },
      body: requestBody,
    },
  );
}

async function createKnowledgeUnpublishTestEnvironment(input: {
  documentId?: string;
  sourceReference?: string;
  sourceItemId?: string;
  sourceSystem?: "sharepoint" | "manual";
  audience?: "public" | "internal";
  publicationStatus?:
    | "published"
    | "unpublished"
    | "failed"
    | "pending";
} = {}) {
  const documentId =
    input.documentId ??
    "knowledge-sharepoint_local-admission-test";
  const knowledgeRepository =
    new InMemoryKnowledgeRepository();
  const publicationRepository =
    new InMemoryKnowledgePublicationRepository();
  const publisher = {
    calls: 0,
    async unpublish(
      targetDocumentId: string,
      targetProvider: string,
      targetEnvironment:
        | "development"
        | "production" =
        "development",
    ) {
      this.calls += 1;
      const publication =
        await publicationRepository
          .findLatestPublication(
            targetDocumentId,
            targetProvider,
            targetEnvironment,
          );

      if (publication) {
        await publicationRepository
          .updatePublication({
            id:
              publication.id,
            publicationStatus:
              "unpublished",
            unpublishedAt:
              "2027-01-01T00:01:00.000Z",
          });
      }
    },
  };

  await knowledgeRepository
    .createDocument({
      id: documentId,
      title:
        "Admission Local Test",
      sourceSystem:
        input.sourceSystem ??
        "sharepoint",
      sourceReference:
        input.sourceReference ??
        "sharepoint:local-admission:public",
      audience:
        input.audience ?? "public",
      status: "approved",
      content:
        "Local test admission content",
      contentHash:
        computeContentHash(
          "Local test admission content",
        ),
      createdAt:
        "2027-01-01T00:00:00.000Z",
      updatedAt:
        "2027-01-01T00:00:00.000Z",
      metadata: {
        sourceIdentity:
          input.sourceReference ??
          "sharepoint:local-admission:public",
        sourceItemId:
          input.sourceItemId ??
          "local-admission",
      },
    });

  await publicationRepository
    .createPublication({
      id:
        "openai-publication-local-test",
      documentId,
      targetProvider: "openai",
      targetEnvironment:
        "development",
      publicationStatus:
        input.publicationStatus ??
        "published",
      externalResourceId:
        "file-local-test",
      contentHash:
        "hash-local-test",
      publishedAt:
        "2027-01-01T00:00:00.000Z",
      providerMetadata: {
        provider: "openai",
        vectorStoreId:
          "vs-public-dev",
        fileId:
          "file-local-test",
        vectorStoreFileId:
          "vsfile-local-test",
      },
    });

  return {
    documentId,
    knowledgeRepository,
    publicationRepository,
    publisher,
  };
}

async function createVectorStoreCleanupTestEnvironment(input: {
  referencedFileId?: string;
  referencedPublicationStatus?:
    | "published"
    | "unpublished";
} = {}) {
  const vectorStoreConfigRepository =
    new InMemoryOpenAIVectorStoreConfigRepository();
  const publicationRepository =
    new InMemoryKnowledgePublicationRepository();
  const vectorStoreId =
    "vs-public-development";
  const canonicalFileId =
    "file-NG32bTBK6jEH7Sgd4bL4zk";
  const orphanFileId =
    "file-Qt36UTLZREr7L5f7sMSiyg";
  const referencedFileId =
    input.referencedFileId ??
    canonicalFileId;

  await vectorStoreConfigRepository
    .saveVectorStoreConfig({
      audience: "public",
      environment:
        "development",
      vectorStoreId,
      name:
        "ISE Public Knowledge - Development",
      createdAt:
        "2027-01-01T00:00:00.000Z",
      updatedAt:
        "2027-01-01T00:00:00.000Z",
    });

  await publicationRepository
    .createPublication({
      id:
        "openai-publication-canonical",
      documentId:
        "knowledge-sharepoint-83",
      targetProvider: "openai",
      targetEnvironment:
        "development",
      publicationStatus:
        input.referencedPublicationStatus ??
        "published",
      externalResourceId:
        referencedFileId,
      contentHash:
        "canonical-hash",
      publishedAt:
        "2027-01-01T00:00:00.000Z",
      providerMetadata: {
        provider: "openai",
        vectorStoreId,
        fileId:
          referencedFileId,
      },
    });

  const client =
    new FakeVectorStoreCleanupClient(
      [
        {
          id: canonicalFileId,
          status:
            "completed",
          created_at:
            1800000000,
          vector_store_id:
            vectorStoreId,
        },
        {
          id: orphanFileId,
          status:
            "completed",
          created_at:
            1800000100,
          vector_store_id:
            vectorStoreId,
        },
      ],
      {
        [canonicalFileId]: {
          id: canonicalFileId,
          filename:
            "ISE_Admission_AY2027_Public_Clean_RAG_Master_v2.docx",
          created_at:
            1800000000,
        },
        [orphanFileId]: {
          id: orphanFileId,
          filename:
            "ISE_Admission_AY2027_Public_Clean_RAG_Master_v2.docx",
          created_at:
            1800000100,
        },
      },
    );

  return {
    vectorStoreId,
    canonicalFileId,
    orphanFileId,
    vectorStoreConfigRepository,
    publicationRepository,
    client,
  };
}

function testGroundingGate() {
  assert.deepEqual(
    evaluateGroundingResult({
      answerable: true,
      answer:
        "Mock grounded answer",
      citations: [
        {
          documentId:
            "mock-doc-1",
        },
      ],
      provider: "mock",
    }),
    {
      answerable: true,
      safeToSend: true,
      reason: "grounded",
    },
  );

  assert.deepEqual(
    evaluateGroundingResult({
      answerable: false,
      answer: "",
      citations: [],
      provider: "mock",
    }),
    {
      answerable: false,
      safeToSend: false,
      reason: "unsupported",
    },
  );

  assert.deepEqual(
    evaluateGroundingResult({
      answerable: true,
      answer:
        "Unsupported grounded claim",
      citations: [],
      provider: "mock",
    }),
    {
      answerable: true,
      safeToSend: false,
      reason: "missing_citation",
    },
  );

  assert.deepEqual(
    evaluateGroundingResult({
      answerable: false,
      answer: "",
      citations: [],
      provider: "openai",
      providerMetadata: {
        providerError:
          "OpenAI unavailable",
      },
    }),
    {
      answerable: false,
      safeToSend: false,
      reason: "provider_error",
    },
  );
}

async function testAnswerService() {
  const service =
    new AnswerService(
      getGroundedQAProvider("mock", {
        scenario: "grounded",
      }),
    );

  const result =
    await service.answer({
      question: "test",
      audience: "public",
    });

  assert.equal(
    result.safeToSend,
    true,
  );
  assert.equal(
    result.groundingReason,
    "grounded",
  );
  assert.equal(
    result.provider,
    "mock",
  );
}

function testProviderRegistry() {
  assert.deepEqual(
    listGroundedQAProviderNames(),
    [
      "mock",
      "openai",
    ],
  );

  assert.equal(
    getGroundedQAProvider(
      "mock",
    ).name,
    "mock",
  );

  assert.equal(
    getGroundedQAProvider(
      "openai",
      {
        openai: {
          client: {
            responses: {
              create: async () => ({
                output_text:
                  "UNSUPPORTED_BY_KB",
              }),
            },
          },
          vectorStoreId:
            "vs_test",
        },
      },
    ).name,
    "openai",
  );
}

function testOpenAIResponseMapping() {
  const response = {
    output_text:
      "สำหรับ Option 1 คะแนน CU-ATS ขั้นต่ำคือ 800",
    output: [
      {
        type: "file_search_call",
        query:
          "Option 1 CU-ATS minimum",
        results: [
          {
            file_id: "file-1",
            filename:
              "admission-ay2027.txt",
            score: 0.91,
            content: [
              {
                type: "text",
                text:
                  "CU-ATS minimum score is 800.",
              },
            ],
          },
        ],
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text:
              "สำหรับ Option 1 คะแนน CU-ATS ขั้นต่ำคือ 800",
            annotations: [
              {
                type: "file_citation",
                file_id: "file-1",
                filename:
                  "admission-ay2027.txt",
                index: 0,
              },
              {
                type: "file_citation",
                file_id: "file-1",
                filename:
                  "admission-ay2027.txt",
                index: 10,
              },
            ],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
    },
  };

  const mapped =
    mapOpenAIResponseToGroundedQAResult({
      response,
      provider: "openai",
      model:
        "gpt-5.6-terra",
      latencyMs: 123,
    });

  assert.equal(
    mapped.result.answerable,
    true,
  );
  assert.equal(
    mapped.result.answer,
    response.output_text,
  );
  assert.equal(
    mapped.result.citations.length,
    1,
  );
  assert.equal(
    mapped.result.citations[0]
      .externalFileId,
    "file-1",
  );
  assert.equal(
    mapped.retrieval.results[0]
      .score,
    0.91,
  );
  assert.deepEqual(
    mapped.result.usage,
    {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    },
  );
}

function testOpenAIUnsupportedMapping() {
  const mapped =
    mapOpenAIResponseToGroundedQAResult({
      response: {
        output_text:
          UNSUPPORTED_BY_KB,
        output: [
          {
            type: "file_search_call",
            query: "tuition",
            results: [],
          },
        ],
      },
      provider: "openai",
      model:
        "gpt-5.6-terra",
    });

  assert.equal(
    mapped.result.answerable,
    false,
  );
  assert.equal(
    mapped.result.answer,
    "",
  );
  assert.equal(
    mapped.result.citations.length,
    0,
  );
  assert.equal(
    mapped.result.providerMetadata
      ?.unsupportedToken,
    UNSUPPORTED_BY_KB,
  );
  assert.deepEqual(
    mapped.result.providerMetadata
      ?.retrieval,
    {
      queries: [
        "tuition",
      ],
      results: [],
    },
  );
}

async function testOpenAIGroundedQAProviderUsesFileSearch() {
  let requestBody:
    | Record<string, unknown>
    | undefined;

  const provider =
    new OpenAIGroundedQAProvider({
      vectorStoreId:
        "vs_public_dev",
      client: {
        responses: {
          create: async (
            body: Record<
              string,
              unknown
            >,
          ) => {
            requestBody =
              body;

            return {
              output_text:
                "Answer",
              output: [
                {
                  type: "message",
                  content: [
                    {
                      text:
                        "Answer",
                      annotations: [
                        {
                          type:
                            "file_citation",
                          file_id:
                            "file-1",
                          filename:
                            "doc.txt",
                          index: 0,
                        },
                      ],
                    },
                  ],
                },
              ],
            };
          },
        },
      },
    });

  const result =
    await provider.answer({
      question:
        "test question",
      audience: "public",
    });

  assert.equal(
    result.answerable,
    true,
  );
  assert.deepEqual(
    requestBody?.tools,
    [
      {
        type: "file_search",
        vector_store_ids: [
          "vs_public_dev",
        ],
      },
    ],
  );
  assert.deepEqual(
    requestBody?.include,
    [
      "file_search_call.results",
    ],
  );
  assert.deepEqual(
    requestBody?.reasoning,
    {
      effort: "low",
    },
  );
  assert.equal(
    requestBody?.store,
    false,
  );
}

async function testOpenAIGroundedQAProviderVectorStoreResolution() {
  const originalPublicVectorStoreId =
    process.env
      .OPENAI_PUBLIC_VECTOR_STORE_ID;

  try {
    const answerWithProvider =
      async (provider: OpenAIGroundedQAProvider) =>
        provider.answer({
          question:
            "test question",
          audience: "public",
        });

    const response = {
      output_text: "Answer",
      output: [
        {
          type: "message",
          content: [
            {
              text: "Answer",
              annotations: [
                {
                  type: "file_citation",
                  file_id: "file-1",
                  filename: "doc.txt",
                  index: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    {
      process.env
        .OPENAI_PUBLIC_VECTOR_STORE_ID =
        "vs_env_should_not_win";
      let requestBody:
        | Record<string, unknown>
        | undefined;
      const repository =
        new TrackingVectorStoreConfigRepository(
          {
            audience: "public",
            environment:
              "development",
            vectorStoreId:
              "vs_repo_should_not_win",
            name: "Repo Store",
            createdAt:
              "2027-01-01T00:00:00.000Z",
            updatedAt:
              "2027-01-01T00:00:00.000Z",
          },
        );
      const provider =
        new OpenAIGroundedQAProvider({
          vectorStoreId:
            "vs_constructor",
          vectorStoreConfigRepository:
            repository,
          client: {
            responses: {
              create: async (
                body: Record<
                  string,
                  unknown
                >,
              ) => {
                requestBody =
                  body;
                return response;
              },
            },
          },
        });

      await answerWithProvider(provider);

      assert.deepEqual(
        requestBody?.tools,
        [
          {
            type: "file_search",
            vector_store_ids: [
              "vs_constructor",
            ],
          },
        ],
      );
      assert.equal(
        repository.getCalls,
        0,
      );
      assert.equal(
        repository.saveCalls,
        0,
      );
    }

    {
      process.env
        .OPENAI_PUBLIC_VECTOR_STORE_ID =
        "vs_env_public";
      let requestBody:
        | Record<string, unknown>
        | undefined;
      const repository =
        new TrackingVectorStoreConfigRepository(
          {
            audience: "public",
            environment:
              "development",
            vectorStoreId:
              "vs_repo_should_not_win",
            name: "Repo Store",
            createdAt:
              "2027-01-01T00:00:00.000Z",
            updatedAt:
              "2027-01-01T00:00:00.000Z",
          },
        );
      const provider =
        new OpenAIGroundedQAProvider({
          vectorStoreConfigRepository:
            repository,
          client: {
            responses: {
              create: async (
                body: Record<
                  string,
                  unknown
                >,
              ) => {
                requestBody =
                  body;
                return response;
              },
            },
          },
        });

      await answerWithProvider(provider);

      assert.deepEqual(
        requestBody?.tools,
        [
          {
            type: "file_search",
            vector_store_ids: [
              "vs_env_public",
            ],
          },
        ],
      );
      assert.equal(
        repository.getCalls,
        0,
      );
      assert.equal(
        repository.saveCalls,
        0,
      );
    }

    {
      delete process.env
        .OPENAI_PUBLIC_VECTOR_STORE_ID;
      let requestBody:
        | Record<string, unknown>
        | undefined;
      const repository =
        new TrackingVectorStoreConfigRepository(
          {
            audience: "public",
            environment:
              "development",
            vectorStoreId:
              "vs_firestore_style",
            name: "Firestore Store",
            createdAt:
              "2027-01-01T00:00:00.000Z",
            updatedAt:
              "2027-01-01T00:00:00.000Z",
          },
        );
      const provider =
        new OpenAIGroundedQAProvider({
          vectorStoreConfigRepository:
            repository,
          client: {
            responses: {
              create: async (
                body: Record<
                  string,
                  unknown
                >,
              ) => {
                requestBody =
                  body;
                return response;
              },
            },
          },
        });

      const result =
        await answerWithProvider(
          provider,
        );

      assert.equal(
        result.answerable,
        true,
      );
      assert.deepEqual(
        requestBody?.tools,
        [
          {
            type: "file_search",
            vector_store_ids: [
              "vs_firestore_style",
            ],
          },
        ],
      );
      assert.equal(
        repository.getCalls,
        1,
      );
      assert.equal(
        repository.saveCalls,
        0,
      );
    }

    {
      delete process.env
        .OPENAI_PUBLIC_VECTOR_STORE_ID;
      const repository =
        new TrackingVectorStoreConfigRepository(
          null,
        );
      const provider =
        new OpenAIGroundedQAProvider({
          vectorStoreConfigRepository:
            repository,
          client: {
            responses: {
              create: async () => {
                throw new Error(
                  "Responses API should not be called without vector store config",
                );
              },
            },
          },
        });
      const service =
        new AnswerService(provider);

      const result =
        await service.answer({
          question:
            "test question",
          audience: "public",
        });

      assert.equal(
        result.groundingReason,
        "provider_error",
      );
      assert.match(
        String(
          result.providerMetadata
            ?.providerError,
        ),
        /vector store is not configured/,
      );
      assert.equal(
        repository.getCalls,
        1,
      );
      assert.equal(
        repository.saveCalls,
        0,
      );
    }
  } finally {
    if (
      originalPublicVectorStoreId ===
      undefined
    ) {
      delete process.env
        .OPENAI_PUBLIC_VECTOR_STORE_ID;
    } else {
      process.env
        .OPENAI_PUBLIC_VECTOR_STORE_ID =
        originalPublicVectorStoreId;
    }
  }
}

async function testRagV2AdminRouteUsesFirestoreVectorStoreConfig() {
  const routeSource =
    await readFile(
      path.join(
        process.cwd(),
        "src",
        "app",
        "api",
        "admin",
        "experiments",
        "rag-v2",
        "chat",
        "route.ts",
      ),
      "utf8",
    );

  assert.equal(
    routeSource.includes(
      "FirestoreOpenAIVectorStoreConfigRepository",
    ),
    true,
  );
  assert.equal(
    routeSource.includes(
      "new OpenAIGroundedQAProvider({",
    ),
    true,
  );
  assert.equal(
    routeSource.includes(
      "providerError",
    ),
    true,
  );
}

function hasOwn(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype
    .hasOwnProperty.call(
      value,
      key,
    );
}

function testFirestoreSerializationRemovesUndefinedValues() {
  const date =
    new Date(
      "2027-01-01T00:00:00.000Z",
    );
  const buffer =
    Buffer.from(
      "approved public knowledge",
      "utf8",
    );

  const document =
    removeUndefinedFirestoreValues({
      id: "knowledge-1",
      title:
        "Admission Criteria",
      sourceSystem:
        "sharepoint",
      sourceReference:
        undefined,
      audience: "public",
      status: "approved",
      category: "",
      owner: undefined,
      version: "AY2027",
      createdAt:
        "2027-01-01T00:00:00.000Z",
      updatedAt:
        "2027-01-01T00:00:00.000Z",
      metadata: {
        missing:
          undefined,
        keepNull: null,
        keepFalse: false,
        keepZero: 0,
        keepEmpty: "",
        nested: {
          missing:
            undefined,
          value: "kept",
        },
        values: [
          "first",
          undefined,
          {
            missing:
              undefined,
            value: "second",
          },
          null,
        ],
        date,
        buffer,
      },
      content: "content",
    });

  assert.equal(
    hasOwn(
      document,
      "sourceReference",
    ),
    false,
  );
  assert.equal(
    hasOwn(document, "owner"),
    false,
  );
  assert.equal(
    document.category,
    "",
  );

  const metadata =
    document.metadata as Record<
      string,
      unknown
    >;

  assert.equal(
    hasOwn(metadata, "missing"),
    false,
  );
  assert.equal(
    metadata.keepNull,
    null,
  );
  assert.equal(
    metadata.keepFalse,
    false,
  );
  assert.equal(
    metadata.keepZero,
    0,
  );
  assert.equal(
    metadata.keepEmpty,
    "",
  );
  assert.deepEqual(
    metadata.nested,
    {
      value: "kept",
    },
  );
  assert.deepEqual(
    metadata.values,
    [
      "first",
      {
        value: "second",
      },
      null,
    ],
  );
  assert.equal(
    metadata.date,
    date,
  );
  assert.equal(
    metadata.buffer,
    buffer,
  );

  const publication =
    removeUndefinedFirestoreValues({
      id: "publication-1",
      documentId:
        "knowledge-1",
      targetProvider:
        "openai",
      targetEnvironment:
        "development",
      publicationStatus:
        "published",
      externalResourceId:
        undefined,
      contentHash:
        "hash",
      providerMetadata: {
        vectorStoreId:
          "vs-public",
        missing:
          undefined,
        nested: {
          missing:
            undefined,
          fileId: "file-1",
        },
      },
    });

  assert.equal(
    hasOwn(
      publication,
      "externalResourceId",
    ),
    false,
  );
  assert.deepEqual(
    publication.providerMetadata,
    {
      vectorStoreId:
        "vs-public",
      nested: {
        fileId: "file-1",
      },
    },
  );

  const vectorStoreConfig =
    removeUndefinedFirestoreValues({
      audience: "public",
      environment:
        "development",
      vectorStoreId:
        "vs-public",
      name:
        "ISE Public Knowledge",
      createdAt:
        "2027-01-01T00:00:00.000Z",
      updatedAt:
        "2027-01-01T00:00:00.000Z",
      optional:
        undefined,
    });

  assert.equal(
    hasOwn(
      vectorStoreConfig,
      "optional",
    ),
    false,
  );
}

async function testOpenAIPublisherPolicyAndIdempotency() {
  const client =
    new MockOpenAIKnowledgePublisherClient();
  const publicationRepository =
    new InMemoryKnowledgePublicationRepository();
  const vectorStoreConfigRepository =
    new InMemoryOpenAIVectorStoreConfigRepository();
  const publisher =
    new OpenAIKnowledgePublisher({
      client,
      publicationRepository,
      vectorStoreConfigRepository,
      now: () =>
        "2027-01-01T00:00:00.000Z",
    });
  const document =
    createApprovedPublicKnowledgeDocument();

  const first =
    await publisher.publish({
      document,
      targetProvider:
        "openai",
      targetEnvironment:
        "development",
    });

  const second =
    await publisher.publish({
      document,
      targetProvider:
        "openai",
      targetEnvironment:
        "development",
    });

  assert.equal(
    first.published,
    true,
  );
  assert.equal(
    second.published,
    false,
  );
  assert.equal(
    second.reason,
    "already_current",
  );
  assert.equal(
    client.vectorStoreCreateCalls,
    1,
  );
  assert.equal(
    client.fileCreateCalls,
    1,
  );
  assert.equal(
    client.vectorStoreFileCreateCalls,
    1,
  );
  assert.equal(
    first.publication
      .externalResourceId,
    "file-1",
  );
  assert.equal(
    first.publication
      .providerMetadata
      ?.vectorStoreId,
    "vs-1",
  );
  assert.equal(
    document.metadata
      ?.vectorStoreId,
    undefined,
  );

  await assert.rejects(
    () =>
      publisher.publish({
        document: {
          ...document,
          status: "draft",
        },
        targetProvider:
          "openai",
        targetEnvironment:
          "development",
      }),
    /Only approved/,
  );

  await assert.rejects(
    () =>
      publisher.publish({
        document: {
          ...document,
          id: "doc-internal",
          audience:
            "internal",
        },
        targetProvider:
          "openai",
        targetEnvironment:
          "development",
      }),
    /Cannot publish internal knowledge to public target/,
  );
}

async function testOpenAIPublisherVectorStoreReuse() {
  {
    const client =
      new MockOpenAIKnowledgePublisherClient();
    const publicationRepository =
      new InMemoryKnowledgePublicationRepository();
    const publisher =
      new OpenAIKnowledgePublisher({
        client,
        publicationRepository,
        vectorStoreConfigRepository:
          new InMemoryOpenAIVectorStoreConfigRepository(),
        publicVectorStoreId:
          "vs_env_public",
        now: () =>
          "2027-01-01T00:00:00.000Z",
      });

    await publisher.publish({
      document:
        createApprovedPublicKnowledgeDocument(),
      targetProvider:
        "openai",
      targetEnvironment:
        "development",
    });

    assert.equal(
      client.vectorStoreCreateCalls,
      0,
    );
    assert.deepEqual(
      client.attachedVectorStoreIds,
      [
        "vs_env_public",
      ],
    );
  }

  {
    const client =
      new MockOpenAIKnowledgePublisherClient();
    const vectorStoreConfigRepository =
      new InMemoryOpenAIVectorStoreConfigRepository();

    const firstPublisher =
      new OpenAIKnowledgePublisher({
        client,
        publicationRepository:
          new InMemoryKnowledgePublicationRepository(),
        vectorStoreConfigRepository,
        now: () =>
          "2027-01-01T00:00:00.000Z",
      });

    await firstPublisher.publish({
      document:
        createApprovedPublicKnowledgeDocument({
          id: "doc-one",
        }),
      targetProvider:
        "openai",
      targetEnvironment:
        "development",
    });

    const secondPublisher =
      new OpenAIKnowledgePublisher({
        client,
        publicationRepository:
          new InMemoryKnowledgePublicationRepository(),
        vectorStoreConfigRepository,
        now: () =>
          "2027-01-01T00:01:00.000Z",
      });

    await secondPublisher.publish({
      document:
        createApprovedPublicKnowledgeDocument({
          id: "doc-two",
          content:
            "Second document content",
          contentHash:
            computeContentHash(
              "Second document content",
            ),
        }),
      targetProvider:
        "openai",
      targetEnvironment:
        "development",
    });

    assert.equal(
      client.vectorStoreCreateCalls,
      1,
    );
    assert.deepEqual(
      client.attachedVectorStoreIds,
      [
        "vs-1",
        "vs-1",
      ],
    );
  }
}

async function testKnowledgeUnpublishAdmin() {
  {
    const environment =
      await createKnowledgeUnpublishTestEnvironment();

    const report =
      await unpublishKnowledgePublication(
        environment,
        {
          documentId:
            environment.documentId,
        },
      );

    assert.equal(report.dryRun, true);
    assert.equal(
      report.executed,
      false,
    );
    assert.equal(
      report.wouldChange,
      true,
    );
    assert.equal(
      report.vectorStoreId,
      "vs-public-dev",
    );
    assert.equal(
      report.fileId,
      "file-local-test",
    );
    assert.equal(
      environment.publisher.calls,
      0,
    );
    assert.equal(
      (
        await environment
          .publicationRepository
          .getPublication(
            "openai-publication-local-test",
          )
      )?.publicationStatus,
      "published",
    );
  }

  {
    const environment =
      await createKnowledgeUnpublishTestEnvironment();

    const report =
      await unpublishKnowledgePublication(
        environment,
        {
          documentId:
            environment.documentId,
          execute: true,
        },
      );

    assert.equal(report.dryRun, false);
    assert.equal(
      report.executed,
      true,
    );
    assert.equal(
      report.publicationStatus,
      "unpublished",
    );
    assert.equal(
      environment.publisher.calls,
      1,
    );
    assert.equal(
      (
        await environment
          .publicationRepository
          .getPublication(
            "openai-publication-local-test",
          )
      )?.publicationStatus,
      "unpublished",
    );
  }

  {
    const environment =
      await createKnowledgeUnpublishTestEnvironment({
        documentId:
          "knowledge-sharepoint_83-public",
        sourceReference:
          "sharepoint:83:public",
        sourceItemId: "83",
      });

    await assert.rejects(
      () =>
        unpublishKnowledgePublication(
          environment,
          {
            documentId:
              environment.documentId,
            execute: true,
          },
        ),
      /Refusing to unpublish canonical SharePoint Item 83/,
    );
    assert.equal(
      environment.publisher.calls,
      0,
    );
  }

  {
    const environment =
      await createKnowledgeUnpublishTestEnvironment({
        publicationStatus:
          "unpublished",
      });

    const report =
      await unpublishKnowledgePublication(
        environment,
        {
          documentId:
            environment.documentId,
          execute: true,
        },
      );

    assert.equal(
      report.executed,
      false,
    );
    assert.equal(
      report.wouldChange,
      false,
    );
    assert.match(
      report.action,
      /already unpublished/,
    );
    assert.equal(
      environment.publisher.calls,
      0,
    );
  }

  {
    const environment =
      await createKnowledgeUnpublishTestEnvironment();

    await assert.rejects(
      () =>
        unpublishKnowledgePublication(
          environment,
          {
            documentId:
              "missing-document",
          },
        ),
      /Knowledge document not found: missing-document/,
    );
  }
}

async function testVectorStoreOrphanCleanupAdmin() {
  {
    const environment =
      await createVectorStoreCleanupTestEnvironment();

    const report =
      await runVectorStoreOrphanCleanup(
        environment,
        {
          list: true,
        },
      );

    assert.equal(
      report.mode,
      "list",
    );
    assert.equal(
      report.vectorStoreId,
      environment.vectorStoreId,
    );
    assert.equal(
      report.files?.length,
      2,
    );
    assert.equal(
      report.files?.[0].filename,
      "ISE_Admission_AY2027_Public_Clean_RAG_Master_v2.docx",
    );
    assert.equal(
      environment.client
        .vectorStoreFileDeleteCalls
        .length,
      0,
    );
  }

  {
    const environment =
      await createVectorStoreCleanupTestEnvironment();

    const report =
      await runVectorStoreOrphanCleanup(
        environment,
        {
          fileId:
            environment.orphanFileId,
        },
      );

    assert.equal(
      report.mode,
      "inspect",
    );
    assert.equal(
      report.dryRun,
      true,
    );
    assert.equal(
      report.file?.fileId,
      environment.orphanFileId,
    );
    assert.deepEqual(
      report.publicationReferences,
      [],
    );
    assert.equal(
      environment.client
        .vectorStoreFileDeleteCalls
        .length,
      0,
    );
  }

  {
    const environment =
      await createVectorStoreCleanupTestEnvironment();

    await assert.rejects(
      () =>
        runVectorStoreOrphanCleanup(
          environment,
          {
            fileId:
              environment.canonicalFileId,
            execute: true,
          },
        ),
      /protected canonical Admission file/,
    );
    assert.equal(
      environment.client
        .vectorStoreFileDeleteCalls
        .length,
      0,
    );
  }

  {
    const environment =
      await createVectorStoreCleanupTestEnvironment({
        referencedFileId:
          "file-Qt36UTLZREr7L5f7sMSiyg",
      });

    await assert.rejects(
      () =>
        runVectorStoreOrphanCleanup(
          environment,
          {
            fileId:
              environment.orphanFileId,
            execute: true,
          },
        ),
      /referenced by Firestore publication/,
    );
    assert.equal(
      environment.client
        .vectorStoreFileDeleteCalls
        .length,
      0,
    );
  }

  {
    const environment =
      await createVectorStoreCleanupTestEnvironment();

    const report =
      await runVectorStoreOrphanCleanup(
        environment,
        {
          fileId:
            environment.orphanFileId,
          execute: true,
        },
      );

    assert.equal(
      report.mode,
      "detach",
    );
    assert.equal(
      report.executed,
      true,
    );
    assert.deepEqual(
      environment.client
        .vectorStoreFileDeleteCalls,
      [
        {
          fileId:
            environment.orphanFileId,
          vectorStoreId:
            environment.vectorStoreId,
        },
      ],
    );
    assert.deepEqual(
      environment.client
        .baseFileDeleteCalls,
      [],
    );
  }
}

async function testProductionSafeGovernanceIds() {
  const firstGenerator =
    new RandomUuidGovernanceIdGenerator();
  const secondGenerator =
    new RandomUuidGovernanceIdGenerator();
  const firstId =
    firstGenerator.nextId(
      "approval",
    );
  const secondId =
    secondGenerator.nextId(
      "approval",
    );

  assert.match(
    firstId,
    /^approval-[0-9a-f-]{36}$/,
  );
  assert.match(
    secondId,
    /^approval-[0-9a-f-]{36}$/,
  );
  assert.notEqual(
    firstId,
    secondId,
  );

  const knowledgeRepository =
    new InMemoryKnowledgeRepository();
  const firstService =
    new KnowledgeGovernanceService({
      knowledgeRepository,
      idGenerator:
        new RandomUuidGovernanceIdGenerator(),
      now: () =>
        "2027-01-01T00:00:00.000Z",
    });
  const secondService =
    new KnowledgeGovernanceService({
      knowledgeRepository,
      idGenerator:
        new RandomUuidGovernanceIdGenerator(),
      now: () =>
        "2027-01-01T00:00:01.000Z",
    });

  await firstService.createDraft({
    id: "doc-id-1",
    title: "Doc 1",
    sourceSystem: "manual",
    audience: "public",
    actorId: "tester",
    content: "Document 1",
  });
  await secondService.createDraft({
    id: "doc-id-2",
    title: "Doc 2",
    sourceSystem: "manual",
    audience: "public",
    actorId: "tester",
    content: "Document 2",
  });

  await firstService.submitForReview({
    documentId: "doc-id-1",
    actorId: "tester",
  });
  await secondService.submitForReview({
    documentId: "doc-id-2",
    actorId: "tester",
  });

  const firstApproval =
    (
      await knowledgeRepository
        .listApprovals("doc-id-1")
    )[0];
  const secondApproval =
    (
      await knowledgeRepository
        .listApprovals("doc-id-2")
    )[0];

  assert.notEqual(
    firstApproval.id,
    secondApproval.id,
  );
}

async function testGovernanceTransitionIsAtomicWhenAuditFails() {
  const knowledgeRepository =
    new InMemoryKnowledgeRepository();
  const firstService =
    new KnowledgeGovernanceService({
      knowledgeRepository,
      idGenerator:
        new ConstantGovernanceIdGenerator(),
      now: () =>
        "2027-01-01T00:00:00.000Z",
    });
  const secondService =
    new KnowledgeGovernanceService({
      knowledgeRepository,
      idGenerator:
        new ConstantGovernanceIdGenerator(),
      now: () =>
        "2027-01-01T00:00:01.000Z",
    });

  await firstService.createDraft({
    id: "atomic-doc-1",
    title: "Atomic Doc 1",
    sourceSystem: "manual",
    audience: "public",
    actorId: "tester",
    content: "Document 1",
  });
  await secondService.createDraft({
    id: "atomic-doc-2",
    title: "Atomic Doc 2",
    sourceSystem: "manual",
    audience: "public",
    actorId: "tester",
    content: "Document 2",
  });

  await firstService.submitForReview({
    documentId:
      "atomic-doc-1",
    actorId: "tester",
  });

  await assert.rejects(
    () =>
      secondService.submitForReview({
        documentId:
          "atomic-doc-2",
        actorId:
          "tester",
      }),
    /Knowledge approval already exists/,
  );

  assert.equal(
    (
      await knowledgeRepository
        .getDocument(
          "atomic-doc-2",
        )
    )?.status,
    "draft",
  );
  assert.deepEqual(
    await knowledgeRepository
      .listApprovals(
        "atomic-doc-2",
      ),
    [],
  );
}

async function testSharePointDeterministicPartialStateRecovery() {
  {
    const knowledgeRepository =
      new FailingTransitionKnowledgeRepository([
        1, 2,
      ]);
    const environment =
      createSharePointPublicationTestEnvironment({
        knowledgeRepository,
      });

    await assert.rejects(
      () =>
        environment.useCase.execute(
          approvedSharePointInput({
            sourceItemId:
              "draft-recovery",
          }),
        ),
      /Injected approval audit failure/,
    );

    const partialDocument =
      (
        await knowledgeRepository
          .listDocuments()
      )[0];

    assert.equal(
      partialDocument.status,
      "draft",
    );

    knowledgeRepository.clearFailures();

    const recovered =
      await environment.useCase.execute(
        approvedSharePointInput({
          sourceItemId:
            "draft-recovery",
        }),
      );

    assert.equal(
      recovered.outcome,
      "published",
    );
    assert.equal(
      (
        await knowledgeRepository
          .getDocument(
            partialDocument.id,
          )
      )?.status,
      "approved",
    );
  }

  {
    const knowledgeRepository =
      new FailingTransitionKnowledgeRepository([
        2, 3,
      ]);
    const environment =
      createSharePointPublicationTestEnvironment({
        knowledgeRepository,
      });

    await assert.rejects(
      () =>
        environment.useCase.execute(
          approvedSharePointInput({
            sourceItemId:
              "review-recovery",
          }),
        ),
      /Injected approval audit failure/,
    );

    const partialDocument =
      (
        await knowledgeRepository
          .listDocuments()
      )[0];

    assert.equal(
      partialDocument.status,
      "review",
    );

    knowledgeRepository.clearFailures();

    const recovered =
      await environment.useCase.execute(
        approvedSharePointInput({
          sourceItemId:
            "review-recovery",
        }),
      );

    assert.equal(
      recovered.outcome,
      "published",
    );
    assert.equal(
      (
        await knowledgeRepository
          .getDocument(
            partialDocument.id,
          )
      )?.status,
      "approved",
    );
  }

  {
    const publicationRepository =
      new InMemoryKnowledgePublicationRepository();
    const publisher =
      new MockKnowledgePublisher({
        publicationRepository,
        targetAudience: "public",
        now: () =>
          "2027-01-01T00:00:00.000Z",
      });
    publisher.setFailNextPublish();

    const environment =
      createSharePointPublicationTestEnvironment({
        publicationRepository,
        publisher,
      });

    await assert.rejects(
      () =>
        environment.useCase.execute(
          approvedSharePointInput({
            sourceItemId:
              "approved-recovery",
          }),
        ),
      /Mock publication failure/,
    );

    const approvedDocument =
      (
        await environment
          .knowledgeRepository
          .listDocuments()
      )[0];

    assert.equal(
      approvedDocument.status,
      "approved",
    );

    const recovered =
      await environment.useCase.execute(
        approvedSharePointInput({
          sourceItemId:
            "approved-recovery",
        }),
      );

    assert.equal(
      recovered.outcome,
      "published",
    );
    assert.equal(
      (
        await publicationRepository
          .listPublications({
            documentId:
              approvedDocument.id,
          })
      ).filter(
        (publication) =>
          publication
            .publicationStatus ===
          "published",
      ).length,
      1,
    );
  }
}

async function testSharePointRetryAndConcurrentSafety() {
  const sequentialEnvironment =
    createSharePointPublicationTestEnvironment();

  const first =
    await sequentialEnvironment.useCase
      .execute(
        approvedSharePointInput({
          sourceItemId:
            "sequential-retry",
        }),
      );
  const second =
    await sequentialEnvironment.useCase
      .execute(
        approvedSharePointInput({
          sourceItemId:
            "sequential-retry",
        }),
      );

  assert.equal(
    first.outcome,
    "published",
  );
  assert.equal(
    second.outcome,
    "already_current",
  );
  assert.equal(
    (
      await sequentialEnvironment
        .knowledgeRepository
        .listDocuments()
    ).length,
    1,
  );

  const concurrentEnvironment =
    createSharePointPublicationTestEnvironment({
      idGenerator:
        new RandomUuidGovernanceIdGenerator(),
    });
  const concurrentInput =
    approvedSharePointInput({
      sourceItemId:
        "concurrent-retry",
    });

  const outcomes =
    await Promise.all(
      [
        concurrentEnvironment
          .useCase.execute(
            concurrentInput,
          ),
        concurrentEnvironment
          .useCase.execute(
            concurrentInput,
          ),
      ],
    );

  assert.equal(
    (
      await concurrentEnvironment
        .knowledgeRepository
        .listDocuments()
    ).length,
    1,
  );
  assert.ok(
    outcomes.every(
      (outcome) =>
        outcome.knowledgeDocumentId ===
        outcomes[0]
          .knowledgeDocumentId,
    ),
  );
  assert.ok(
    outcomes.every(
      (outcome) =>
        outcome.outcome ===
          "published" ||
        outcome.outcome ===
          "already_current",
    ),
  );
}

async function testPublishApprovedKnowledgeUseCase() {
  const accepted =
    createSharePointPublicationTestEnvironment();

  const first =
    await accepted.useCase.execute(
      approvedSharePointInput(),
    );

  assert.equal(
    first.outcome,
    "published",
  );
  assert.ok(
    first.knowledgeDocumentId,
  );
  assert.ok(first.publicationId);
  assert.equal(
    first.contentHash,
    computeContentHash(
      Buffer.from(
        "approved public knowledge",
        "utf8",
      ),
    ),
  );

  for (const approvalStatus of [
    "Draft",
    "Pending",
  ]) {
    const environment =
      createSharePointPublicationTestEnvironment();

    assert.equal(
      (
        await environment.useCase.execute(
          approvedSharePointInput({
            approvalStatus,
          }),
        )
      ).outcome,
      "rejected_not_approved",
    );
  }

  {
    const environment =
      createSharePointPublicationTestEnvironment();

    assert.equal(
      (
        await environment.useCase.execute(
          approvedSharePointInput({
            audience: "internal",
          }),
        )
      ).outcome,
      "rejected_wrong_audience",
    );
  }

  {
    const environment =
      createSharePointPublicationTestEnvironment();

    assert.equal(
      (
        await environment.useCase.execute(
          approvedSharePointInput({
            effectiveFrom:
              "2027-02-01T00:00:00.000Z",
          }),
        )
      ).outcome,
      "rejected_not_effective",
    );
  }

  {
    const environment =
      createSharePointPublicationTestEnvironment();

    await environment.useCase.execute(
      approvedSharePointInput(),
    );
    const second =
      await environment.useCase.execute(
        approvedSharePointInput(),
      );

    assert.equal(
      second.outcome,
      "already_current",
    );
    assert.equal(
      (
        await environment
          .knowledgeRepository
          .listDocuments()
      ).length,
      1,
    );
    assert.equal(
      (
        await environment
          .publicationRepository
          .listPublications()
      ).length,
      1,
    );
  }

  {
    const environment =
      createSharePointPublicationTestEnvironment();

    const original =
      await environment.useCase.execute(
        approvedSharePointInput(),
      );
    const changed =
      await environment.useCase.execute(
        approvedSharePointInput({
          content:
            Buffer.from(
              "changed approved public knowledge",
              "utf8",
            ),
          sourceVersion: "2.0",
        }),
      );

    assert.equal(
      changed.outcome,
      "published",
    );
    assert.equal(
      changed
        .supersededKnowledgeDocumentId,
      original.knowledgeDocumentId,
    );
    assert.equal(
      (
        await environment
          .knowledgeRepository
          .getDocument(
            original.knowledgeDocumentId ??
              "",
          )
      )?.status,
      "superseded",
    );
    assert.equal(
      (
        await environment
          .knowledgeRepository
          .listDocuments()
      ).length,
      2,
    );
    assert.deepEqual(
      (
        await environment
          .publicationRepository
          .listPublications()
      ).map(
        (publication) =>
          publication
            .publicationStatus,
      ),
      [
        "unpublished",
        "published",
      ],
    );
  }

  {
    const shared =
      createSharePointPublicationTestEnvironment();
    const firstService =
      new PublishApprovedKnowledge({
        knowledgeRepository:
          shared.knowledgeRepository,
        governanceService:
          new KnowledgeGovernanceService({
            knowledgeRepository:
              shared.knowledgeRepository,
            publisher:
              new MockKnowledgePublisher({
                publicationRepository:
                  shared.publicationRepository,
                targetAudience:
                  "public",
                now: () =>
                  "2027-01-01T00:00:00.000Z",
              }),
            idGenerator:
              new TestGovernanceIdGenerator(),
            now: () =>
              "2027-01-01T00:00:00.000Z",
          }),
        now: () =>
          "2027-01-01T00:00:00.000Z",
      });
    const secondService =
      new PublishApprovedKnowledge({
        knowledgeRepository:
          shared.knowledgeRepository,
        governanceService:
          new KnowledgeGovernanceService({
            knowledgeRepository:
              shared.knowledgeRepository,
            publisher:
              new MockKnowledgePublisher({
                publicationRepository:
                  shared.publicationRepository,
                targetAudience:
                  "public",
                now: () =>
                  "2027-01-01T00:01:00.000Z",
              }),
            idGenerator:
              new TestGovernanceIdGenerator(),
            now: () =>
              "2027-01-01T00:01:00.000Z",
          }),
        now: () =>
          "2027-01-01T00:01:00.000Z",
      });

    assert.equal(
      (
        await firstService.execute(
          approvedSharePointInput({
            sourceItemId:
              "persistent-item-1",
          }),
        )
      ).outcome,
      "published",
    );
    assert.equal(
      (
        await secondService.execute(
          approvedSharePointInput({
            sourceItemId:
              "persistent-item-1",
          }),
        )
      ).outcome,
      "already_current",
    );
    assert.equal(
      (
        await shared
          .knowledgeRepository
          .listDocuments()
      ).length,
      1,
    );
  }

  {
    const environment =
      createSharePointPublicationTestEnvironment();

    await environment.useCase.execute(
      approvedSharePointInput({
        sourceItemId:
          "metadata-item-1",
        knowledgeVersion: "AY2027",
      }),
    );
    const metadataChanged =
      await environment.useCase.execute(
        approvedSharePointInput({
          sourceItemId:
            "metadata-item-1",
          knowledgeVersion:
            "AY2027-revised",
        }),
      );

    assert.equal(
      metadataChanged.outcome,
      "published",
    );
    assert.equal(
      (
        await environment
          .knowledgeRepository
          .listDocuments()
      ).length,
      2,
    );
    assert.notEqual(
      (
        await environment
          .knowledgeRepository
          .listDocuments()
      )[0].metadata
        ?.metadataFingerprint,
      (
        await environment
          .knowledgeRepository
          .listDocuments()
      )[1].metadata
        ?.metadataFingerprint,
    );
  }
}

async function testPowerAutomateHttpAdapter() {
  const secret = "test-secret";
  const successfulUseCase = {
    calls: 0,
    async execute() {
      this.calls += 1;
      return {
        outcome:
          "published" as const,
        knowledgeDocumentId:
          "knowledge-1",
      };
    },
  };

  const malformed =
    await handleSharePointPublicationRequest(
      new Request(
        "http://localhost/api/integrations/sharepoint/publication",
        {
          method: "POST",
          headers: {
            authorization:
              `Bearer ${secret}`,
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            sourceSystem:
              "sharepoint",
          }),
        },
      ),
      {
        secret,
        useCase:
          successfulUseCase,
      },
    );

  assert.equal(
    malformed.status,
    400,
  );
  assert.equal(
    successfulUseCase.calls,
    0,
  );

  const missingSecret =
    await handleSharePointPublicationRequest(
      new Request(
        "http://localhost/api/integrations/sharepoint/publication",
        {
          method: "POST",
          body: "{}",
        },
      ),
      {
        secret,
        useCase:
          successfulUseCase,
      },
    );

  assert.equal(
    missingSecret.status,
    401,
  );

  const wrongSecret =
    await handleSharePointPublicationRequest(
      new Request(
        "http://localhost/api/integrations/sharepoint/publication",
        {
          method: "POST",
          headers: {
            authorization:
              "Bearer wrong",
          },
          body: "{}",
        },
      ),
      {
        secret,
        useCase:
          successfulUseCase,
      },
    );

  assert.equal(
    wrongSecret.status,
    401,
  );

  const unconfigured =
    await handleSharePointPublicationRequest(
      new Request(
        "http://localhost/api/integrations/sharepoint/publication",
        {
          method: "POST",
          headers: {
            authorization:
              "Bearer anything",
          },
          body: "{}",
        },
      ),
      {
        secret: undefined,
        useCase:
          successfulUseCase,
      },
    );

  assert.equal(
    unconfigured.status,
    403,
  );
}

async function testPowerAutomateJsonAndRawParsing() {
  const jsonParsed =
    parsePowerAutomatePublicationPayload({
      sourceSystem: "sharepoint",
      sourceItemId: "json-item-1",
      fileName: "admission.txt",
      contentBase64:
        Buffer.from(
          "json content",
          "utf8",
        ).toString("base64"),
      audience: "public",
      approvalStatus: "Approved",
    });

  assert.equal(jsonParsed.ok, true);
  if (jsonParsed.ok) {
    assert.equal(
      Buffer.from(
        jsonParsed.input.content,
      ).toString("utf8"),
      "json content",
    );
  }

  const rawParsed =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest(),
    );

  assert.equal(rawParsed.ok, true);
  if (rawParsed.ok) {
    assert.equal(
      rawParsed.input.sourceItemId,
      "raw-item-1",
    );
    assert.equal(
      Buffer.from(
        rawParsed.input.content,
      ).toString("utf8"),
      "raw bytes",
    );
  }

  const wrappedParsed =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest({
        body: JSON.stringify({
          "$content-type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          $content:
            Buffer.from(
              "wrapped docx bytes",
              "utf8",
            ).toString("base64"),
        }),
      }),
    );

  assert.equal(
    wrappedParsed.ok,
    true,
  );
  if (wrappedParsed.ok) {
    assert.equal(
      Buffer.from(
        wrappedParsed.input.content,
      ).toString("utf8"),
      "wrapped docx bytes",
    );
  }

  const malformedWrapper =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest({
        body:
          '{"$content-type":"application/octet-stream","$content":',
      }),
    );

  assert.equal(
    malformedWrapper.ok,
    false,
  );
  if (!malformedWrapper.ok) {
    assert.equal(
      malformedWrapper.status,
      400,
    );
  }

  const emptyWrapperContent =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest({
        body: JSON.stringify({
          "$content-type":
            "application/octet-stream",
          $content: "",
        }),
      }),
    );

  assert.equal(
    emptyWrapperContent.ok,
    false,
  );
  if (!emptyWrapperContent.ok) {
    assert.equal(
      emptyWrapperContent.status,
      400,
    );
  }

  const invalidWrapperBase64 =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest({
        body: JSON.stringify({
          "$content-type":
            "application/octet-stream",
          $content:
            "not valid base64",
        }),
      }),
    );

  assert.equal(
    invalidWrapperBase64.ok,
    false,
  );
  if (!invalidWrapperBase64.ok) {
    assert.equal(
      invalidWrapperBase64.status,
      400,
    );
  }

  const oversizedWrapper =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest({
        body: JSON.stringify({
          "$content-type":
            "application/octet-stream",
          $content:
            Buffer.from(
              "12345",
              "utf8",
            ).toString("base64"),
        }),
      }),
      4,
    );

  assert.equal(
    oversizedWrapper.ok,
    false,
  );
  if (!oversizedWrapper.ok) {
    assert.equal(
      oversizedWrapper.status,
      413,
    );
  }

  const emptyRaw =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest({
        body: "",
      }),
    );

  assert.equal(emptyRaw.ok, false);
  if (!emptyRaw.ok) {
    assert.equal(
      emptyRaw.status,
      400,
    );
  }

  const oversizedRaw =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest({
        body: "12345",
      }),
      4,
    );

  assert.equal(oversizedRaw.ok, false);
  if (!oversizedRaw.ok) {
    assert.equal(
      oversizedRaw.status,
      413,
    );
  }

  const missingMetadata =
    await parseRawPowerAutomatePublicationRequest(
      rawSharePointRequest({
        headers: {
          "x-ise-source-item-id":
            "",
        },
      }),
    );

  assert.equal(
    missingMetadata.ok,
    false,
  );
  if (!missingMetadata.ok) {
    assert.equal(
      missingMetadata.status,
      400,
    );
  }
}

async function testRawRequestPolicyAndSharedUseCase() {
  const environment =
    createSharePointPublicationTestEnvironment();

  const draft =
    await handleSharePointPublicationRequest(
      rawSharePointRequest({
        headers: {
          "x-ise-approval-status":
            "Draft",
        },
      }),
      {
        secret: "test-secret",
        useCase:
          environment.useCase,
      },
    );

  assert.equal(draft.status, 200);
  assert.equal(
    (
      await draft.json()
    ).outcome,
    "rejected_not_approved",
  );

  const internal =
    await handleSharePointPublicationRequest(
      rawSharePointRequest({
        headers: {
          "x-ise-audience":
            "internal",
        },
      }),
      {
        secret: "test-secret",
        useCase:
          environment.useCase,
      },
    );

  assert.equal(
    (
      await internal.json()
    ).outcome,
    "rejected_wrong_audience",
  );

  let called = false;
  const approved =
    await handleSharePointPublicationRequest(
      rawSharePointRequest(),
      {
        secret: "test-secret",
        useCase: {
          async execute(input) {
            called = true;
            assert.equal(
              input.sourceSystem,
              "sharepoint",
            );
            assert.equal(
              input.fileName,
              "admission.docx",
            );

            return {
              outcome:
                "published",
            };
          },
        },
      },
    );

  assert.equal(approved.status, 200);
  assert.equal(called, true);
}

async function testProductionDefaultAvoidsLocalVectorStoreFiles() {
  const source =
    await readFile(
      path.join(
        process.cwd(),
        "src",
        "core",
        "ai-platform",
        "integrations",
        "sharepoint",
        "default-publish-approved-knowledge.ts",
      ),
      "utf8",
    );

  assert.equal(
    source.includes(".rag-v2"),
    false,
  );
  assert.equal(
    source.includes(
      "FileOpenAIVectorStoreConfigRepository",
    ),
    false,
  );
  assert.equal(
    source.includes(
      "InMemoryKnowledgeRepository",
    ),
    false,
  );
  assert.equal(
    source.includes(
      "InMemoryKnowledgePublicationRepository",
    ),
    false,
  );
}

async function testOneDriveQueueAdapter() {
  const tempRoot =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "ise-queue-test-",
      ),
    );

  try {
    const validQueue =
      path.join(
        tempRoot,
        "valid",
      );
    await mkdir(validQueue);
    const contentPath =
      path.join(
        validQueue,
        "stable-1__admission.txt",
      );
    const manifestPath =
      `${contentPath}.publish.json`;

    await writeFile(
      contentPath,
      "approved queue content",
      "utf8",
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        sourceSystem:
          "sharepoint",
        sourceItemId:
          "queue-item-1",
        fileName:
          "admission.txt",
        audience: "public",
        knowledgeCategory:
          "Admission",
        approvalStatus:
          "Approved",
      }),
      "utf8",
    );

    let calls = 0;
    const adapter =
      new OneDriveQueueAdapter({
        async execute(input) {
          calls += 1;
          assert.equal(
            input.sourceItemId,
            "queue-item-1",
          );
          assert.equal(
            input.content
              .toString(),
            "approved queue content",
          );

          return {
            outcome:
              "published",
          };
        },
      });

    const results =
      await adapter.processQueue(
        validQueue,
      );

    assert.equal(
      results.length,
      1,
    );
    assert.equal(
      results[0].ok,
      true,
    );
    assert.equal(calls, 1);

    const missingQueue =
      path.join(
        tempRoot,
        "missing",
      );
    await mkdir(missingQueue);
    await writeFile(
      path.join(
        missingQueue,
        "stable-2__missing.txt.publish.json",
      ),
      JSON.stringify({
        sourceSystem:
          "sharepoint",
        sourceItemId:
          "queue-item-2",
        fileName:
          "missing.txt",
        audience: "public",
        approvalStatus:
          "Approved",
      }),
      "utf8",
    );

    const missingResults =
      await adapter.processQueue(
        missingQueue,
      );

    assert.equal(
      missingResults[0].ok,
      false,
    );
    assert.match(
      missingResults[0].error ?? "",
      /cannot find|ENOENT/i,
    );

    const malformedQueue =
      path.join(
        tempRoot,
        "malformed",
      );
    await mkdir(malformedQueue);
    await writeFile(
      path.join(
        malformedQueue,
        "stable-3__bad.txt",
      ),
      "content",
      "utf8",
    );
    await writeFile(
      path.join(
        malformedQueue,
        "stable-3__bad.txt.publish.json",
      ),
      JSON.stringify({
        sourceSystem:
          "sharepoint",
      }),
      "utf8",
    );

    const malformedResults =
      await adapter.processQueue(
        malformedQueue,
      );

    assert.equal(
      malformedResults[0].ok,
      false,
    );
    assert.equal(
      malformedResults[0].error,
      "Malformed publish sidecar",
    );

    const rerunQueue =
      path.join(
        tempRoot,
        "rerun",
      );
    await mkdir(rerunQueue);
    const rerunContentPath =
      path.join(
        rerunQueue,
        "stable-4__rerun.txt",
      );
    await writeFile(
      rerunContentPath,
      "same queue content",
      "utf8",
    );
    await writeFile(
      `${rerunContentPath}.publish.json`,
      JSON.stringify({
        sourceSystem:
          "sharepoint",
        sourceItemId:
          "queue-item-4",
        fileName:
          "rerun.txt",
        audience: "public",
        approvalStatus:
          "Approved",
      }),
      "utf8",
    );

    const environment =
      createSharePointPublicationTestEnvironment();
    const realAdapter =
      new OneDriveQueueAdapter(
        environment.useCase,
      );

    const first =
      await realAdapter.processQueue(
        rerunQueue,
      );
    const second =
      await realAdapter.processQueue(
        rerunQueue,
      );

    assert.equal(
      first[0].result?.outcome,
      "published",
    );
    assert.equal(
      second[0].result?.outcome,
      "already_current",
    );
    assert.equal(
      (
        await environment
          .publicationRepository
          .listPublications()
      ).length,
      1,
    );
  } finally {
    await rm(tempRoot, {
      recursive: true,
      force: true,
    });
  }
}

function testAudiencePolicy() {
  assert.deepEqual(
    getChannelPolicy("line"),
    {
      channel: "line",
      channelAudience: "external",
      allowedKnowledgeAudience:
        "public",
    },
  );

  assert.deepEqual(
    getChannelPolicy("facebook"),
    {
      channel: "facebook",
      channelAudience: "external",
      allowedKnowledgeAudience:
        "public",
    },
  );

  assert.deepEqual(
    getChannelPolicy("web"),
    {
      channel: "web",
      channelAudience: "external",
      allowedKnowledgeAudience:
        "public",
    },
  );

  assert.deepEqual(
    getChannelPolicy("teams"),
    {
      channel: "teams",
      channelAudience: "internal",
      allowedKnowledgeAudience:
        "internal",
    },
  );
}

function testConversationTransitions() {
  assert.equal(
    canTransitionConversationMode(
      "ai_active",
      "waiting_human",
    ),
    true,
  );

  assert.equal(
    canTransitionConversationMode(
      "waiting_human",
      "human_active",
    ),
    true,
  );

  assert.equal(
    canTransitionConversationMode(
      "human_active",
      "resolved",
    ),
    true,
  );

  assert.equal(
    canTransitionConversationMode(
      "resolved",
      "ai_active",
    ),
    true,
  );

  assert.equal(
    canTransitionConversationMode(
      "ai_active",
      "human_active",
    ),
    false,
  );

  assert.equal(
    canTransitionConversationMode(
      "human_active",
      "waiting_human",
    ),
    false,
  );

  assert.doesNotThrow(() =>
    assertConversationTransition({
      from: "ai_active",
      to: "waiting_human",
    }),
  );

  assert.throws(
    () =>
      assertConversationTransition({
        from: "resolved",
        to: "human_active",
      }),
    /Invalid conversation transition/,
  );
}

async function testInMemoryRepositories() {
  const conversationRepository =
    new InMemoryConversationRepository();
  const handoffRepository =
    new InMemoryHandoffRepository();

  const conversation =
    await conversationRepository
      .createConversation({
        id: "conversation-1",
        channel: "web",
        channelAudience:
          "external",
        channelUserId:
          "user-1",
        mode: "ai_active",
        createdAt:
          "2027-01-01T00:00:00.000Z",
        updatedAt:
          "2027-01-01T00:00:00.000Z",
      });

  assert.equal(
    conversation.id,
    "conversation-1",
  );
  assert.equal(
    (
      await conversationRepository
        .getConversation(
          "conversation-1",
        )
    )?.mode,
    "ai_active",
  );

  await conversationRepository
    .updateConversation({
      id: "conversation-1",
      mode: "waiting_human",
      updatedAt:
        "2027-01-01T00:00:01.000Z",
    });

  assert.equal(
    (
      await conversationRepository
        .listConversations({
          mode: "waiting_human",
        })
    ).length,
    1,
  );

  await conversationRepository
    .appendMessage({
      id: "message-2",
      conversationId:
        "conversation-1",
      senderType: "user",
      text: "second",
      createdAt:
        "2027-01-01T00:00:02.000Z",
    });

  await conversationRepository
    .appendMessage({
      id: "message-1",
      conversationId:
        "conversation-1",
      senderType: "user",
      text: "first",
      createdAt:
        "2027-01-01T00:00:01.000Z",
    });

  assert.deepEqual(
    (
      await conversationRepository
        .listMessages(
          "conversation-1",
        )
    ).map((message) => message.text),
    [
      "first",
      "second",
    ],
  );

  const handoff =
    await handoffRepository
      .createHandoff({
        id: "handoff-1",
        conversationId:
          "conversation-1",
        reason:
          "knowledge_not_found",
        status: "waiting",
        requestedAt:
          "2027-01-01T00:00:03.000Z",
        requestedBy: "ai",
      });

  assert.equal(
    handoff.id,
    "handoff-1",
  );
  assert.equal(
    (
      await handoffRepository
        .getActiveHandoff(
          "conversation-1",
        )
    )?.status,
    "waiting",
  );
  assert.equal(
    (
      await handoffRepository
        .listWaitingHandoffs()
    ).length,
    1,
  );
}

async function testFirestoreConversationRepository() {
  const db =
    new FakeFirestore();
  const repository =
    new FirestoreAIPlatformConversationRepository(
      db,
    );

  const conversation =
    await repository.createConversation({
      id: "conversation-firestore-1",
      channel: "web",
      channelAudience: "external",
      channelUserId: "user-1",
      mode: "ai_active",
      createdAt:
        "2027-01-01T00:00:00.000Z",
      updatedAt:
        "2027-01-01T00:00:00.000Z",
      metadata: {
        keepNull: null,
        nested: {
          missing:
            undefined,
          value: "kept",
        },
      },
    });

  assert.equal(
    conversation.id,
    "conversation-firestore-1",
  );
  assert.equal(
    (
      await repository.getConversation(
        "conversation-firestore-1",
      )
    )?.mode,
    "ai_active",
  );
  assert.deepEqual(
    db.getStoredDocument(
      "ai_platform_conversations",
      "conversation-firestore-1",
    )?.metadata,
    {
      keepNull: null,
      nested: {
        value: "kept",
      },
    },
  );

  await assert.rejects(
    () =>
      repository.createConversation({
        id: "conversation-firestore-1",
        channel: "web",
        channelAudience:
          "external",
        channelUserId: "user-1",
        mode: "ai_active",
        createdAt:
          "2027-01-01T00:00:00.000Z",
        updatedAt:
          "2027-01-01T00:00:00.000Z",
      }),
    /already exists/,
  );

  await repository.updateConversation({
    id: "conversation-firestore-1",
    mode: "waiting_human",
    assignedAgentId:
      "agent-1",
    updatedAt:
      "2027-01-01T00:00:01.000Z",
    lastMessageAt:
      "2027-01-01T00:00:01.000Z",
  });

  assert.equal(
    (
      await repository.getConversation(
        "conversation-firestore-1",
      )
    )?.assignedAgentId,
    "agent-1",
  );

  await repository.updateConversation({
    id: "conversation-firestore-1",
    clearAssignedAgentId: true,
    updatedAt:
      "2027-01-01T00:00:02.000Z",
  });

  const storedAfterClear =
    db.getStoredDocument(
      "ai_platform_conversations",
      "conversation-firestore-1",
    );

  assert.equal(
    hasOwn(
      storedAfterClear ?? {},
      "assignedAgentId",
    ),
    false,
  );

  await assert.rejects(
    () =>
      repository.updateConversation({
        id: "conversation-missing",
        updatedAt:
          "2027-01-01T00:00:00.000Z",
      }),
    /Conversation not found/,
  );

  await repository.createConversation({
    id: "conversation-firestore-2",
    channel: "line",
    channelAudience: "external",
    channelUserId: "user-2",
    mode: "ai_active",
    createdAt:
      "2027-01-01T00:00:00.000Z",
    updatedAt:
      "2027-01-01T00:00:03.000Z",
  });
  await repository.createConversation({
    id: "conversation-firestore-3",
    channel: "web",
    channelAudience: "external",
    channelUserId: "user-3",
    mode: "waiting_human",
    createdAt:
      "2027-01-01T00:00:00.000Z",
    updatedAt:
      "2027-01-01T00:00:04.000Z",
  });
  await repository.updateConversation({
    id: "conversation-firestore-3",
    assignedAgentId:
      "agent-2",
    updatedAt:
      "2027-01-01T00:00:04.000Z",
    lastMessageAt:
      "2027-01-01T00:00:05.000Z",
  });

  assert.deepEqual(
    (
      await repository.listConversations({
        channel: "web",
      })
    ).map(
      (item) => item.id,
    ),
    [
      "conversation-firestore-3",
      "conversation-firestore-1",
    ],
  );
  assert.deepEqual(
    (
      await repository.listConversations({
        assignedAgentId:
          "agent-2",
      })
    ).map(
      (item) => item.id,
    ),
    [
      "conversation-firestore-3",
    ],
  );
  assert.deepEqual(
    (
      await repository.listConversations({
        mode: "ai_active",
      })
    ).map(
      (item) => item.id,
    ),
    [
      "conversation-firestore-2",
    ],
  );

  await repository.appendMessage({
    id: "message-2",
    conversationId:
      "conversation-firestore-1",
    senderType: "user",
    text: "second",
    createdAt:
      "2027-01-01T00:00:02.000Z",
  });
  await repository.appendMessage({
    id: "message-1",
    conversationId:
      "conversation-firestore-1",
    senderType: "user",
    text: "first",
    createdAt:
      "2027-01-01T00:00:01.000Z",
    metadata: {
      keepFalse: false,
      missing: undefined,
    },
  });
  await repository.appendMessage({
    id: "message-3",
    conversationId:
      "conversation-firestore-2",
    senderType: "user",
    text: "other conversation",
    createdAt:
      "2027-01-01T00:00:00.000Z",
  });

  assert.deepEqual(
    (
      await repository.listMessages(
        "conversation-firestore-1",
      )
    ).map((message) => message.id),
    [
      "message-1",
      "message-2",
    ],
  );
  assert.deepEqual(
    db.getStoredDocument(
      "ai_platform_conversation_messages",
      "message-1",
    )?.metadata,
    {
      keepFalse: false,
    },
  );
  await assert.rejects(
    () =>
      repository.appendMessage({
        id: "message-1",
        conversationId:
          "conversation-firestore-1",
        senderType: "user",
        text: "duplicate",
        createdAt:
          "2027-01-01T00:00:03.000Z",
      }),
    /already exists/,
  );
}

async function testFirestoreHandoffRepository() {
  const db =
    new FakeFirestore();
  const repository =
    new FirestoreAIPlatformHandoffRepository(
      db,
    );

  await repository.createHandoff({
    id: "handoff-resolved",
    conversationId:
      "conversation-1",
    reason:
      "knowledge_not_found",
    status: "resolved",
    requestedAt:
      "2027-01-01T00:00:00.000Z",
    requestedBy: "ai",
  });

  assert.equal(
    await repository.getActiveHandoff(
      "conversation-1",
    ),
    null,
  );

  const waiting =
    await repository.createHandoff({
      id: "handoff-waiting",
      conversationId:
        "conversation-1",
      reason:
        "user_requested_human",
      status: "waiting",
      requestedAt:
        "2027-01-01T00:00:02.000Z",
      requestedBy: "user",
      metadata: {
        keepZero: 0,
        nested: {
          missing:
            undefined,
          value: "kept",
        },
      },
    });

  assert.equal(
    waiting.status,
    "waiting",
  );
  assert.equal(
    (
      await repository.getActiveHandoff(
        "conversation-1",
      )
    )?.id,
    "handoff-waiting",
  );
  assert.deepEqual(
    db.getStoredDocument(
      "ai_platform_handoffs",
      "handoff-waiting",
    )?.metadata,
    {
      keepZero: 0,
      nested: {
        value: "kept",
      },
    },
  );

  const active =
    await repository.updateHandoff({
      id: "handoff-waiting",
      status: "active",
      assignedAgentId:
        "agent-1",
      takenAt:
        "2027-01-01T00:00:03.000Z",
    });

  assert.equal(
    active.status,
    "active",
  );
  assert.equal(
    active.assignedAgentId,
    "agent-1",
  );

  await repository.updateHandoff({
    id: "handoff-waiting",
    clearAssignedAgentId: true,
    status: "waiting",
  });
  assert.equal(
    hasOwn(
      db.getStoredDocument(
        "ai_platform_handoffs",
        "handoff-waiting",
      ) ?? {},
      "assignedAgentId",
    ),
    false,
  );

  await repository.updateHandoff({
    id: "handoff-waiting",
    status: "resolved",
    resolvedAt:
      "2027-01-01T00:00:04.000Z",
    resolutionNote:
      "handled",
  });
  assert.equal(
    await repository.getActiveHandoff(
      "conversation-1",
    ),
    null,
  );

  await repository.createHandoff({
    id: "handoff-later",
    conversationId:
      "conversation-2",
    reason: "other",
    status: "waiting",
    requestedAt:
      "2027-01-01T00:00:06.000Z",
    requestedBy: "staff",
  });
  await repository.createHandoff({
    id: "handoff-earlier",
    conversationId:
      "conversation-3",
    reason: "other",
    status: "waiting",
    requestedAt:
      "2027-01-01T00:00:05.000Z",
    requestedBy: "staff",
  });

  assert.deepEqual(
    (
      await repository.listWaitingHandoffs({
        limit: 1,
      })
    ).map((handoff) => handoff.id),
    [
      "handoff-earlier",
    ],
  );

  await assert.rejects(
    () =>
      repository.updateHandoff({
        id: "handoff-missing",
        status: "active",
      }),
    /Handoff not found/,
  );
  await assert.rejects(
    () =>
      repository.createHandoff({
        id: "handoff-later",
        conversationId:
          "conversation-2",
        reason: "other",
        status: "waiting",
        requestedAt:
          "2027-01-01T00:00:06.000Z",
        requestedBy: "staff",
      }),
    /already exists/,
  );
}

async function testProductionSafeConversationIds() {
  const idGenerator =
    new RandomUuidIdGenerator();
  const conversationId =
    idGenerator.nextId(
      "conversation",
    );
  const messageId =
    idGenerator.nextId("message");
  const handoffId =
    idGenerator.nextId("handoff");

  assert.match(
    conversationId,
    /^conversation-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  assert.match(
    messageId,
    /^message-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  assert.match(
    handoffId,
    /^handoff-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  assert.notEqual(
    idGenerator.nextId(
      "conversation",
    ),
    idGenerator.nextId(
      "conversation",
    ),
  );

  const service =
    new ConversationService({
      conversationRepository:
        new InMemoryConversationRepository(),
      handoffRepository:
        new InMemoryHandoffRepository(),
      answerService:
        new AnswerService(
          new CountingProvider({
            answerable: true,
            answer: "ok",
            citations: [
              {
                documentId: "doc-1",
              },
            ],
            provider: "counting",
          }),
        ),
      now: () =>
        "2027-01-01T00:00:00.000Z",
    });

  const first =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });
  const second =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-2",
    });

  assert.match(
    first.id,
    /^conversation-[0-9a-f-]{36}$/i,
  );
  assert.notEqual(first.id, second.id);
  assert.notEqual(
    first.id,
    "conversation-000001",
  );
}

async function testAtomicHandoffRequestWorkflow() {
  const db =
    new FakeFirestore();
  const conversationRepository =
    new FirestoreAIPlatformConversationRepository(
      db,
    );
  const handoffRepository =
    new FirestoreAIPlatformHandoffRepository(
      db,
    );
  const workflow =
    new FirestoreAIPlatformConversationWorkflowRepository(
      db,
    );

  await conversationRepository
    .createConversation({
      id: "conversation-atomic-1",
      channel: "web",
      channelAudience: "external",
      channelUserId: "user-1",
      mode: "ai_active",
      createdAt:
        "2027-01-01T00:00:00.000Z",
      updatedAt:
        "2027-01-01T00:00:00.000Z",
    });

  const first =
    await workflow.requestHumanHandoff({
      conversationId:
        "conversation-atomic-1",
      updatedAt:
        "2027-01-01T00:00:01.000Z",
      handoff: {
        id: "handoff-atomic-1",
        conversationId:
          "conversation-atomic-1",
        reason:
          "knowledge_not_found",
        status: "waiting",
        requestedAt:
          "2027-01-01T00:00:01.000Z",
        requestedBy: "ai",
      },
      systemMessage: {
        id: "message-system-1",
        conversationId:
          "conversation-atomic-1",
        senderType: "system",
        text:
          "Human handoff requested.",
        createdAt:
          "2027-01-01T00:00:01.000Z",
      },
    });

  assert.equal(first.created, true);
  assert.equal(
    first.conversation.mode,
    "waiting_human",
  );
  assert.equal(
    first.handoff.status,
    "waiting",
  );
  assert.equal(
    (
      await conversationRepository
        .listMessages(
          "conversation-atomic-1",
        )
    ).length,
    1,
  );

  const second =
    await workflow.requestHumanHandoff({
      conversationId:
        "conversation-atomic-1",
      updatedAt:
        "2027-01-01T00:00:02.000Z",
      handoff: {
        id: "handoff-atomic-2",
        conversationId:
          "conversation-atomic-1",
        reason:
          "user_requested_human",
        status: "waiting",
        requestedAt:
          "2027-01-01T00:00:02.000Z",
        requestedBy: "user",
      },
      systemMessage: {
        id: "message-system-2",
        conversationId:
          "conversation-atomic-1",
        senderType: "system",
        text:
          "Human handoff requested.",
        createdAt:
          "2027-01-01T00:00:02.000Z",
      },
    });

  assert.equal(second.created, false);
  assert.equal(
    second.handoff.id,
    "handoff-atomic-1",
  );
  assert.equal(
    (
      await handoffRepository
        .listWaitingHandoffs()
    ).length,
    1,
  );
}

async function testAtomicHandoffRequestHasNoPartialStateOnFailure() {
  const db =
    new FakeFirestore();
  const conversationRepository =
    new FirestoreAIPlatformConversationRepository(
      db,
    );
  const handoffRepository =
    new FirestoreAIPlatformHandoffRepository(
      db,
    );
  const workflow =
    new FirestoreAIPlatformConversationWorkflowRepository(
      db,
    );

  await conversationRepository
    .createConversation({
      id: "conversation-no-partial",
      channel: "web",
      channelAudience: "external",
      channelUserId: "user-1",
      mode: "ai_active",
      createdAt:
        "2027-01-01T00:00:00.000Z",
      updatedAt:
        "2027-01-01T00:00:00.000Z",
    });
  await conversationRepository
    .appendMessage({
      id: "message-duplicate",
      conversationId:
        "conversation-no-partial",
      senderType: "system",
      text: "existing",
      createdAt:
        "2027-01-01T00:00:00.000Z",
    });

  await assert.rejects(
    () =>
      workflow.requestHumanHandoff({
        conversationId:
          "conversation-no-partial",
        updatedAt:
          "2027-01-01T00:00:01.000Z",
        handoff: {
          id: "handoff-no-partial",
          conversationId:
            "conversation-no-partial",
          reason:
            "knowledge_not_found",
          status: "waiting",
          requestedAt:
            "2027-01-01T00:00:01.000Z",
          requestedBy: "ai",
        },
        systemMessage: {
          id: "message-duplicate",
          conversationId:
            "conversation-no-partial",
          senderType: "system",
          text:
            "Human handoff requested.",
          createdAt:
            "2027-01-01T00:00:01.000Z",
        },
      }),
    /already exists/,
  );

  assert.equal(
    (
      await conversationRepository
        .getConversation(
          "conversation-no-partial",
        )
    )?.mode,
    "ai_active",
  );
  assert.equal(
    await handoffRepository.getActiveHandoff(
      "conversation-no-partial",
    ),
    null,
  );
}

async function testAtomicCompetingTakeoverWorkflow() {
  const provider =
    new CountingProvider({
      answerable: true,
      answer: "ok",
      citations: [
        {
          documentId: "doc-1",
        },
      ],
      provider: "counting",
    });
  const {
    service,
    handoffRepository,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.requestHumanHandoff({
    conversationId:
      conversation.id,
    requestedBy: "user",
    reason:
      "user_requested_human",
  });

  const results =
    await Promise.allSettled([
      service.takeOverConversation({
        conversationId:
          conversation.id,
        agentId: "agent-A",
      }),
      service.takeOverConversation({
        conversationId:
          conversation.id,
        agentId: "agent-B",
      }),
    ]);
  const fulfilled =
    results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<ConversationServiceResult> =>
        result.status ===
        "fulfilled",
    );
  const rejected =
    results.filter(
      (result) =>
        result.status === "rejected",
    );

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(
    rejected[0].reason instanceof
      ConversationConflictError,
    true,
  );

  const winningAgent =
    fulfilled[0].value.conversation
      .assignedAgentId;
  const activeHandoff =
    await handoffRepository
      .getActiveHandoff(
        conversation.id,
      );

  assert.equal(
    fulfilled[0].value.conversation
      .mode,
    "human_active",
  );
  assert.equal(
    activeHandoff?.assignedAgentId,
    winningAgent,
  );
  assert.equal(
    activeHandoff?.status,
    "active",
  );
}

async function testAtomicResolveAndReturnWorkflow() {
  const provider =
    new CountingProvider({
      answerable: true,
      answer: "ok",
      citations: [
        {
          documentId: "doc-1",
        },
      ],
      provider: "counting",
    });

  {
    const {
      db,
      service,
      conversationRepository,
      handoffRepository,
    } = createAtomicTestService(provider);
    const conversation =
      await service.createConversation({
        channel: "web",
        channelUserId:
          "waiting-user",
      });

    await service.requestHumanHandoff({
      conversationId:
        conversation.id,
      requestedBy: "ai",
      reason:
        "knowledge_not_found",
    });

    const resolved =
      await service.resolveConversation({
        conversationId:
          conversation.id,
        resolvedBy: "agent-1",
        resolutionNote:
          "resolved while waiting",
      });

    assert.equal(
      resolved.conversation.mode,
      "resolved",
    );
    assert.equal(
      resolved.conversation
        .assignedAgentId,
      undefined,
    );
    assert.equal(
      resolved.handoff?.status,
      "resolved",
    );
    assert.equal(
      await handoffRepository
        .getActiveHandoff(
          conversation.id,
        ),
      null,
    );

    const returned =
      await service.returnConversationToAI({
        conversationId:
          conversation.id,
      });

    assert.equal(
      returned.conversation.mode,
      "ai_active",
    );
    assert.equal(
      returned.conversation
        .assignedAgentId,
      undefined,
    );
    assert.equal(
      await handoffRepository
        .getActiveHandoff(
          conversation.id,
        ),
      null,
    );
    assert.equal(
      db.getStoredDocument(
        "ai_platform_handoffs",
        resolved.handoff?.id ?? "",
      )?.status,
      "resolved",
    );
    assert.equal(
      (
        await conversationRepository
          .getConversation(
            conversation.id,
          )
      )?.mode,
      "ai_active",
    );
  }

  {
    const {
      service,
    } = createAtomicTestService(provider);
    const conversation =
      await service.createConversation({
        channel: "web",
        channelUserId:
          "active-user",
      });

    await service.requestHumanHandoff({
      conversationId:
        conversation.id,
      requestedBy: "user",
      reason:
        "user_requested_human",
    });
    await service.takeOverConversation({
      conversationId:
        conversation.id,
      agentId: "agent-1",
    });

    const resolved =
      await service.resolveConversation({
        conversationId:
          conversation.id,
      });

    assert.equal(
      resolved.conversation.mode,
      "resolved",
    );
    assert.equal(
      resolved.handoff?.status,
      "resolved",
    );
  }
}

async function testAtomicResolveDetectsMissingActiveHandoff() {
  const db =
    new FakeFirestore();
  const conversationRepository =
    new FirestoreAIPlatformConversationRepository(
      db,
    );
  const workflow =
    new FirestoreAIPlatformConversationWorkflowRepository(
      db,
    );

  await conversationRepository
    .createConversation({
      id: "conversation-invariant",
      channel: "web",
      channelAudience: "external",
      channelUserId: "user-1",
      mode: "waiting_human",
      createdAt:
        "2027-01-01T00:00:00.000Z",
      updatedAt:
        "2027-01-01T00:00:00.000Z",
    });

  await assert.rejects(
    () =>
      workflow.resolveConversation({
        conversationId:
          "conversation-invariant",
        resolvedAt:
          "2027-01-01T00:00:01.000Z",
      }),
    ConversationInvariantError,
  );
}

async function testLateAiReplyIsDiscarded() {
  const provider =
    new DeferredProvider();
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });
  const pending =
    service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "question",
    });

  for (
    let attempt = 0;
    attempt < 10 && provider.calls === 0;
    attempt += 1
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, 0),
    );
  }
  assert.equal(provider.calls, 1);

  await service.requestHumanHandoff({
    conversationId:
      conversation.id,
    requestedBy: "user",
    reason:
      "user_requested_human",
  });

  provider.resolve({
    answerable: true,
    answer:
      "late answer should be discarded",
    citations: [
      {
        documentId: "doc-1",
      },
    ],
    provider: "deferred",
  });

  const result =
    await pending;

  assert.equal(
    result.outboundMessage,
    undefined,
  );
  assert.equal(
    result.conversation.mode,
    "waiting_human",
  );
  assert.deepEqual(
    (
      await service.listMessages(
        conversation.id,
      )
    ).map((message) => message.text),
    [
      "question",
      "Human handoff requested.",
    ],
  );
}

async function testAtomicHumanReplyOwnershipRace() {
  const provider =
    new CountingProvider({
      answerable: true,
      answer: "ok",
      citations: [
        {
          documentId: "doc-1",
        },
      ],
      provider: "counting",
    });
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.requestHumanHandoff({
    conversationId:
      conversation.id,
    requestedBy: "user",
    reason:
      "user_requested_human",
  });
  await service.takeOverConversation({
    conversationId:
      conversation.id,
    agentId: "agent-1",
  });

  await assert.rejects(
    () =>
      service.sendHumanReply({
        conversationId:
          conversation.id,
        agentId: "agent-2",
        text: "wrong agent",
      }),
    ConversationConflictError,
  );

  await service.resolveConversation({
    conversationId:
      conversation.id,
  });

  await assert.rejects(
    () =>
      service.sendHumanReply({
        conversationId:
          conversation.id,
        agentId: "agent-1",
        text: "stale agent",
      }),
    ConversationConflictError,
  );

  assert.deepEqual(
    (
      await service.listMessages(
        conversation.id,
      )
    ).filter(
      (message) =>
        message.senderType === "human",
    ),
    [],
  );
}

async function testProductionConversationCompositionSource() {
  const source =
    await readFile(
      path.join(
        process.cwd(),
        "src",
        "core",
        "ai-platform",
        "conversations",
        "production-conversation-environment.ts",
      ),
      "utf8",
    );

  assert.equal(
    source.includes(
      "FirestoreAIPlatformConversationRepository",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "FirestoreAIPlatformHandoffRepository",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "FirestoreAIPlatformConversationWorkflowRepository",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "new OpenAIGroundedQAProvider({",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "FirestoreOpenAIVectorStoreConfigRepository",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "conversationWorkflowRepository,",
    ),
    true,
  );
}

async function testConversationExperimentRoutesUseProductionComposition() {
  const routePaths = [
    [
      "src",
      "app",
      "api",
      "admin",
      "experiments",
      "conversations",
      "route.ts",
    ],
    [
      "src",
      "app",
      "api",
      "admin",
      "experiments",
      "conversations",
      "[id]",
      "route.ts",
    ],
    [
      "src",
      "app",
      "api",
      "admin",
      "experiments",
      "conversations",
      "[id]",
      "messages",
      "route.ts",
    ],
    [
      "src",
      "app",
      "api",
      "admin",
      "experiments",
      "conversations",
      "[id]",
      "handoff",
      "route.ts",
    ],
    [
      "src",
      "app",
      "api",
      "admin",
      "experiments",
      "conversations",
      "[id]",
      "takeover",
      "route.ts",
    ],
    [
      "src",
      "app",
      "api",
      "admin",
      "experiments",
      "conversations",
      "[id]",
      "human-reply",
      "route.ts",
    ],
    [
      "src",
      "app",
      "api",
      "admin",
      "experiments",
      "conversations",
      "[id]",
      "resolve",
      "route.ts",
    ],
    [
      "src",
      "app",
      "api",
      "admin",
      "experiments",
      "conversations",
      "[id]",
      "return-to-ai",
      "route.ts",
    ],
  ];

  for (const routePath of routePaths) {
    const source =
      await readFile(
        path.join(
          process.cwd(),
          ...routePath,
        ),
        "utf8",
      );

    assert.equal(
      source.includes(
        "createProductionConversationEnvironment",
      ),
      true,
      routePath.join("/"),
    );
    assert.equal(
      source.includes(
        "createMockConversationService",
      ),
      false,
      routePath.join("/"),
    );
  }

  const messagesSource =
    await readFile(
      path.join(
        process.cwd(),
        "src",
        "app",
        "api",
        "admin",
        "experiments",
        "conversations",
        "[id]",
        "messages",
        "route.ts",
      ),
      "utf8",
    );

  assert.equal(
    messagesSource.includes("scenario"),
    false,
  );
}

async function testConversationRouteErrorMappingSource() {
  const source =
    await readFile(
      path.join(
        process.cwd(),
        "src",
        "app",
        "api",
        "admin",
        "experiments",
        "conversations",
        "route-utils.ts",
      ),
      "utf8",
    );

  assert.equal(
    source.includes(
      "ConversationConflictError",
    ),
    true,
  );
  assert.equal(
    source.includes("status: 409"),
    true,
  );
  assert.equal(
    source.includes(
      "ConversationInvariantError",
    ),
    true,
  );
  assert.equal(
    source.includes("status: 500"),
    true,
  );
  assert.equal(
    source.includes("status: 404"),
    true,
  );
  assert.equal(
    source.includes("status: 401"),
    true,
  );
}

async function testMultiTurnContextIncludesPreviousTurnsOnly() {
  const provider =
    new CountingProvider({
      answerable: true,
      answer:
        "grounded answer",
      citations: [
        {
          documentId: "doc-1",
        },
      ],
      provider: "counting",
    });
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "first question",
  });
  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "second question",
  });

  assert.deepEqual(
    provider.requests[0]
      .conversationContext,
    [],
  );
  assert.deepEqual(
    provider.requests[1]
      .conversationContext,
    [
      {
        role: "user",
        text: "first question",
      },
      {
        role: "assistant",
        text: "grounded answer",
      },
    ],
  );
  assert.equal(
    provider.requests[1]
      .conversationContext?.some(
        (message) =>
          message.text ===
          "second question",
      ),
    false,
  );
}

async function testConversationContextExcludesSystemAndMapsHumanReplies() {
  const provider =
    new CountingProvider({
      answerable: true,
      answer:
        "grounded answer",
      citations: [
        {
          documentId: "doc-1",
        },
      ],
      provider: "counting",
    });
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.requestHumanHandoff({
    conversationId:
      conversation.id,
    requestedBy: "user",
    reason:
      "user_requested_human",
  });
  await service.takeOverConversation({
    conversationId:
      conversation.id,
    agentId: "agent-1",
  });
  await service.sendHumanReply({
    conversationId:
      conversation.id,
    agentId: "agent-1",
    text: "human answer",
  });
  await service.resolveConversation({
    conversationId:
      conversation.id,
  });
  await service.returnConversationToAI({
    conversationId:
      conversation.id,
  });
  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "follow-up question",
  });

  assert.deepEqual(
    provider.requests[0]
      .conversationContext,
    [
      {
        role: "assistant",
        text: "human answer",
      },
    ],
  );
}

async function testConversationContextIsBoundedToTenMessages() {
  const provider =
    new CountingProvider({
      answerable: true,
      answer:
        "grounded answer",
      citations: [
        {
          documentId: "doc-1",
        },
      ],
      provider: "counting",
    });
  const {
    service,
    conversationRepository,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  for (let index = 1; index <= 12; index += 1) {
    await conversationRepository
      .appendMessage({
        id: `seed-message-${String(index).padStart(2, "0")}`,
        conversationId:
          conversation.id,
        senderType:
          index % 2 === 0
            ? "ai"
            : "user",
        text: `seed ${index}`,
        createdAt:
          `2027-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
      });
  }

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "current question",
  });

  assert.deepEqual(
    provider.requests[0]
      .conversationContext?.map(
        (message) => message.text,
      ),
    [
      "seed 3",
      "seed 4",
      "seed 5",
      "seed 6",
      "seed 7",
      "seed 8",
      "seed 9",
      "seed 10",
      "seed 11",
      "seed 12",
    ],
  );
}

async function testInboundMessageReceiptFirstAppendProcessesOnce() {
  const provider =
    groundedCountingProvider(
      "first grounded answer",
    );
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  const result =
    await service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "hello",
      channelMessageId:
        "external-message-1",
    });
  const messages =
    await service.listMessages(
      conversation.id,
    );

  assert.equal(
    result.duplicateInbound,
    undefined,
  );
  assert.equal(provider.calls, 1);
  assert.equal(
    result.outboundMessage?.text,
    "first grounded answer",
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "user",
    ),
    1,
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "ai",
    ),
    1,
  );
}

async function testInboundMessageReceiptSequentialRetryIsIdempotent() {
  const provider =
    groundedCountingProvider(
      "grounded retry answer",
    );
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "hello",
    channelMessageId:
      "external-message-1",
  });
  const duplicate =
    await service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "hello",
      channelMessageId:
        "external-message-1",
    });
  const messages =
    await service.listMessages(
      conversation.id,
    );

  assert.equal(
    duplicate.duplicateInbound,
    true,
  );
  assert.equal(
    duplicate.outboundMessage,
    undefined,
  );
  assert.equal(provider.calls, 1);
  assert.equal(
    countMessagesBySender(
      messages,
      "user",
    ),
    1,
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "ai",
    ),
    1,
  );
}

async function testInboundMessageReceiptConcurrentRetryIsIdempotent() {
  const provider =
    new DeferredProvider();
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  const first =
    service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "hello",
      channelMessageId:
        "external-message-1",
    });
  const second =
    service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "hello",
      channelMessageId:
        "external-message-1",
    });

  for (
    let attempt = 0;
    attempt < 10 && provider.calls === 0;
    attempt += 1
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, 0),
    );
  }
  assert.equal(provider.calls, 1);

  provider.resolve({
    answerable: true,
    answer:
      "concurrent grounded answer",
    citations: [
      {
        documentId: "doc-1",
      },
    ],
    provider: "deferred",
  });

  const results =
    await Promise.all([first, second]);
  const messages =
    await service.listMessages(
      conversation.id,
    );

  assert.equal(provider.calls, 1);
  assert.equal(
    results.filter(
      (result) =>
        result.duplicateInbound ===
        true,
    ).length,
    1,
  );
  assert.equal(
    results.filter(
      (result) =>
        result.outboundMessage
          ?.senderType === "ai",
    ).length,
    1,
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "user",
    ),
    1,
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "ai",
    ),
    1,
  );
}

async function testInboundMessageReceiptUnsupportedRetryDoesNotDuplicateHandoff() {
  const provider =
    unsupportedCountingProvider();
  const {
    service,
    handoffRepository,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "unknown",
    channelMessageId:
      "external-message-1",
  });
  const duplicate =
    await service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "unknown",
      channelMessageId:
        "external-message-1",
    });
  const messages =
    await service.listMessages(
      conversation.id,
    );
  const waitingHandoffs =
    await handoffRepository
      .listWaitingHandoffs();

  assert.equal(
    duplicate.duplicateInbound,
    true,
  );
  assert.equal(provider.calls, 1);
  assert.equal(
    waitingHandoffs.length,
    1,
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "user",
    ),
    1,
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "system",
    ),
    1,
  );
}

async function testInboundMessageReceiptSameChannelMessageDifferentConversations() {
  const provider =
    groundedCountingProvider();
  const {
    service,
  } = createAtomicTestService(provider);
  const firstConversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });
  const secondConversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-2",
    });

  await service.receiveUserMessage({
    conversationId:
      firstConversation.id,
    text: "first",
    channelMessageId:
      "shared-channel-message",
  });
  await service.receiveUserMessage({
    conversationId:
      secondConversation.id,
    text: "second",
    channelMessageId:
      "shared-channel-message",
  });

  assert.equal(provider.calls, 2);
  assert.equal(
    countMessagesBySender(
      await service.listMessages(
        firstConversation.id,
      ),
      "user",
    ),
    1,
  );
  assert.equal(
    countMessagesBySender(
      await service.listMessages(
        secondConversation.id,
      ),
      "user",
    ),
    1,
  );
}

async function testInboundMessageReceiptSameConversationDifferentTextConflicts() {
  const provider =
    groundedCountingProvider();
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "original text",
    channelMessageId:
      "external-message-1",
  });

  await assert.rejects(
    () =>
      service.receiveUserMessage({
        conversationId:
          conversation.id,
        text: "changed text",
        channelMessageId:
          "external-message-1",
      }),
    ConversationConflictError,
  );
  assert.equal(provider.calls, 1);
}

async function testInboundMessageReceiptAbsentChannelMessageIdPreservesRepeatBehavior() {
  const provider =
    groundedCountingProvider();
  const {
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "hello",
  });
  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "hello",
  });
  const messages =
    await service.listMessages(
      conversation.id,
    );

  assert.equal(provider.calls, 2);
  assert.equal(
    countMessagesBySender(
      messages,
      "user",
    ),
    2,
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "ai",
    ),
    2,
  );
}

async function testInboundMessageReceiptDuplicateInHumanModesDoesNotMutateState() {
  const provider =
    unsupportedCountingProvider();
  const {
    db,
    service,
  } = createAtomicTestService(provider);
  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId: "user-1",
    });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "unknown",
    channelMessageId:
      "external-message-1",
  });
  const waitingBefore =
    db.getStoredDocument(
      "ai_platform_conversations",
      conversation.id,
    );
  const waitingDuplicate =
    await service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "unknown",
      channelMessageId:
        "external-message-1",
    });
  const waitingAfter =
    db.getStoredDocument(
      "ai_platform_conversations",
      conversation.id,
    );

  assert.equal(
    waitingDuplicate
      .duplicateInbound,
    true,
  );
  assert.deepEqual(
    waitingAfter,
    waitingBefore,
  );

  await service.takeOverConversation({
    conversationId:
      conversation.id,
    agentId: "agent-1",
  });
  const activeBefore =
    db.getStoredDocument(
      "ai_platform_conversations",
      conversation.id,
    );
  const activeDuplicate =
    await service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "unknown",
      channelMessageId:
        "external-message-1",
    });
  const activeAfter =
    db.getStoredDocument(
      "ai_platform_conversations",
      conversation.id,
    );
  const messages =
    await service.listMessages(
      conversation.id,
    );

  assert.equal(
    activeDuplicate
      .duplicateInbound,
    true,
  );
  assert.deepEqual(
    activeAfter,
    activeBefore,
  );
  assert.equal(provider.calls, 1);
  assert.equal(
    countMessagesBySender(
      messages,
      "user",
    ),
    1,
  );
  assert.equal(
    countMessagesBySender(
      messages,
      "system",
    ),
    1,
  );
}

async function testConversationServiceGroundedAnswer() {
  const provider =
    new CountingProvider({
      answerable: true,
      answer:
        "Mock grounded answer",
      citations: [
        {
          documentId:
            "mock-doc-1",
        },
      ],
      provider: "counting",
    });

  const {
    service,
    handoffRepository,
  } = createTestService(provider);

  const conversation =
    await service.createConversation({
      channel: "line",
      channelUserId:
        "line-user-1",
    });

  const result =
    await service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "hello",
    });

  assert.equal(
    provider.calls,
    1,
  );
  assert.equal(
    result.conversation.mode,
    "ai_active",
  );
  assert.equal(
    result.outboundMessage?.senderType,
    "ai",
  );
  assert.equal(
    await handoffRepository
      .getActiveHandoff(
        conversation.id,
      ),
    null,
  );
}

async function testConversationServiceUnsupportedHandoff() {
  const provider =
    new CountingProvider({
      answerable: false,
      answer: "",
      citations: [],
      provider: "counting",
    });

  const {
    service,
    handoffRepository,
  } = createTestService(provider);

  const conversation =
    await service.createConversation({
      channel: "web",
      channelUserId:
        "web-user-1",
    });

  const result =
    await service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "unknown",
    });

  const handoff =
    await handoffRepository
      .getActiveHandoff(
        conversation.id,
      );

  assert.equal(
    result.conversation.mode,
    "waiting_human",
  );
  assert.equal(
    handoff?.status,
    "waiting",
  );
  assert.equal(
    handoff?.reason,
    "knowledge_not_found",
  );
}

async function testConversationServiceMissingCitationHandoff() {
  const provider =
    new CountingProvider({
      answerable: true,
      answer:
        "Unsupported grounded claim",
      citations: [],
      provider: "counting",
    });

  const {
    service,
    handoffRepository,
  } = createTestService(provider);

  const conversation =
    await service.createConversation({
      channel: "facebook",
      channelUserId:
        "fb-user-1",
    });

  const result =
    await service.receiveUserMessage({
      conversationId:
        conversation.id,
      text: "claim",
    });

  const handoff =
    await handoffRepository
      .getActiveHandoff(
        conversation.id,
      );

  assert.equal(
    result.conversation.mode,
    "waiting_human",
  );
  assert.equal(
    handoff?.reason,
    "missing_citation",
  );
}

async function testHumanOwnedModesDoNotInvokeAI() {
  const provider =
    new CountingProvider({
      answerable: false,
      answer: "",
      citations: [],
      provider: "counting",
    });

  const {
    service,
  } = createTestService(provider);

  const conversation =
    await service.createConversation({
      channel: "line",
      channelUserId:
        "line-user-2",
    });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "unknown",
  });

  assert.equal(
    provider.calls,
    1,
  );

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text:
      "another message while waiting",
  });

  assert.equal(
    provider.calls,
    1,
  );

  await service.takeOverConversation({
    conversationId:
      conversation.id,
    agentId: "agent-1",
  });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text:
      "another message while human active",
  });

  assert.equal(
    provider.calls,
    1,
  );
}

async function testTakeoverHumanReplyResolveReturnToAI() {
  const provider =
    new CountingProvider({
      answerable: false,
      answer: "",
      citations: [],
      provider: "counting",
    });

  const {
    service,
  } = createTestService(provider);

  const conversation =
    await service.createConversation({
      channel: "teams",
      channelUserId:
        "teams-user-1",
    });

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text: "unknown",
  });

  const takeover =
    await service.takeOverConversation({
      conversationId:
        conversation.id,
      agentId: "agent-1",
    });

  assert.equal(
    takeover.conversation.mode,
    "human_active",
  );
  assert.equal(
    takeover.handoff?.status,
    "active",
  );
  assert.equal(
    takeover.conversation
      .assignedAgentId,
    "agent-1",
  );

  await assert.rejects(
    () =>
      service.sendHumanReply({
        conversationId:
          conversation.id,
        agentId: "agent-2",
        text: "not allowed",
      }),
    /does not own/,
  );

  const reply =
    await service.sendHumanReply({
      conversationId:
        conversation.id,
      agentId: "agent-1",
      text:
        "เจ้าหน้าที่กำลังตรวจสอบข้อมูลให้ครับ",
    });

  assert.equal(
    reply.outboundMessage?.senderType,
    "human",
  );
  assert.equal(
    (
      await service.listMessages(
        conversation.id,
      )
    ).at(-1)?.senderId,
    "agent-1",
  );

  const resolved =
    await service.resolveConversation({
      conversationId:
        conversation.id,
      resolvedBy: "agent-1",
    });

  assert.equal(
    resolved.conversation.mode,
    "resolved",
  );
  assert.equal(
    resolved.handoff?.status,
    "resolved",
  );

  const returned =
    await service.returnConversationToAI({
      conversationId:
        conversation.id,
    });

  assert.equal(
    returned.conversation.mode,
    "ai_active",
  );

  await service.receiveUserMessage({
    conversationId:
      conversation.id,
    text:
      "next message after return",
  });

  assert.equal(
    provider.calls,
    2,
  );
}

function testKnowledgeStateMachine() {
  assert.equal(
    canTransitionKnowledgeStatus(
      "draft",
      "review",
    ),
    true,
  );
  assert.equal(
    canTransitionKnowledgeStatus(
      "review",
      "draft",
    ),
    true,
  );
  assert.equal(
    canTransitionKnowledgeStatus(
      "review",
      "approved",
    ),
    true,
  );
  assert.equal(
    canTransitionKnowledgeStatus(
      "approved",
      "superseded",
    ),
    true,
  );
  assert.equal(
    canTransitionKnowledgeStatus(
      "approved",
      "archived",
    ),
    true,
  );
  assert.equal(
    canTransitionKnowledgeStatus(
      "superseded",
      "archived",
    ),
    true,
  );
  assert.equal(
    canTransitionKnowledgeStatus(
      "draft",
      "approved",
    ),
    false,
  );
  assert.equal(
    canTransitionKnowledgeStatus(
      "approved",
      "draft",
    ),
    false,
  );
  assert.equal(
    canTransitionKnowledgeStatus(
      "superseded",
      "approved",
    ),
    false,
  );
  assert.throws(
    () =>
      assertKnowledgeStatusTransition(
        "draft",
        "approved",
      ),
    /Invalid knowledge status transition/,
  );
}

function testEffectiveDatePolicyAndHashing() {
  const baseDocument = {
    id: "doc-1",
    title: "Policy",
    sourceSystem: "manual" as const,
    audience: "public" as const,
    status: "approved" as const,
    createdAt:
      "2027-01-01T00:00:00.000Z",
    updatedAt:
      "2027-01-01T00:00:00.000Z",
    content: "same",
  };

  assert.equal(
    isCurrentlyEffective(
      baseDocument,
      "2027-01-02T00:00:00.000Z",
    ),
    true,
  );
  assert.equal(
    isCurrentlyEffective(
      {
        ...baseDocument,
        effectiveFrom:
          "2027-02-01T00:00:00.000Z",
      },
      "2027-01-02T00:00:00.000Z",
    ),
    false,
  );
  assert.equal(
    isCurrentlyEffective(
      {
        ...baseDocument,
        effectiveTo:
          "2026-12-31T23:59:59.000Z",
      },
      "2027-01-02T00:00:00.000Z",
    ),
    false,
  );
  assert.equal(
    isCurrentlyEffective(
      {
        ...baseDocument,
        status: "draft" as const,
      },
      "2027-01-02T00:00:00.000Z",
    ),
    false,
  );

  assert.equal(
    computeContentHash("abc"),
    computeContentHash("abc"),
  );
  assert.notEqual(
    computeContentHash("abc"),
    computeContentHash("abcd"),
  );
}

async function testKnowledgeGovernanceAndPublishingScenarios() {
  const {
    service,
    knowledgeRepository,
    publicationRepository,
  } = createKnowledgeTestService();

  const v1 =
    await service.createDraft({
      title:
        "Admission Criteria AY2027 v1",
      sourceSystem: "manual",
      audience: "public",
      category: "admission",
      version: "v1",
      actorId: "staff-1",
      content:
        "Admission criteria v1",
    });

  await assert.rejects(
    () =>
      service.publish({
        documentId: v1.id,
        targetProvider: "mock",
        targetEnvironment:
          "development",
      }),
    /Only approved/,
  );

  await service.submitForReview({
    documentId: v1.id,
    actorId: "staff-1",
  });

  await assert.rejects(
    () =>
      service.publish({
        documentId: v1.id,
        targetProvider: "mock",
        targetEnvironment:
          "development",
      }),
    /Only approved/,
  );

  const v1Approved =
    await service.approve({
      documentId: v1.id,
      actorId: "approver-1",
    });

  assert.equal(
    v1Approved.status,
    "approved",
  );

  const firstPublish =
    await service.publish({
      documentId: v1.id,
      targetProvider: "mock",
      targetEnvironment:
        "development",
    });

  assert.equal(
    firstPublish.published,
    true,
  );
  assert.equal(
    firstPublish.publication
      .publicationStatus,
    "published",
  );

  const secondPublish =
    await service.publish({
      documentId: v1.id,
      targetProvider: "mock",
      targetEnvironment:
        "development",
    });

  assert.equal(
    secondPublish.published,
    false,
  );
  assert.equal(
    secondPublish.reason,
    "already_current",
  );
  assert.equal(
    (
      await publicationRepository
        .listPublications({
          documentId: v1.id,
        })
    ).length,
    1,
  );

  const v2 =
    await service.createDraft({
      title:
        "Admission Criteria AY2027 v2",
      sourceSystem: "manual",
      audience: "public",
      category: "admission",
      version: "v2",
      actorId: "staff-1",
      content:
        "Admission criteria v2",
    });

  assert.deepEqual(
    (
      await service.getCurrentApprovedKnowledge({
        audience: "public",
        category: "admission",
      })
    ).map((document) => document.id),
    [
      v1.id,
    ],
  );

  await service.submitForReview({
    documentId: v2.id,
    actorId: "staff-1",
  });
  await service.approve({
    documentId: v2.id,
    actorId: "approver-1",
  });
  await service.supersede({
    oldDocumentId: v1.id,
    replacementDocumentId: v2.id,
    actorId: "approver-1",
  });

  assert.deepEqual(
    (
      await service.getCurrentApprovedKnowledge({
        audience: "public",
        category: "admission",
      })
    ).map((document) => document.id),
    [
      v2.id,
    ],
  );

  assert.equal(
    (
      await knowledgeRepository
        .getDocument(v1.id)
    )?.status,
    "superseded",
  );
  assert.ok(
    await knowledgeRepository
      .getDocument(v1.id),
  );

  const internal =
    await service.createDraft({
      title: "Internal Policy",
      sourceSystem: "manual",
      audience: "internal",
      category: "admission",
      actorId: "staff-1",
      content:
        "Internal information",
    });

  await service.submitForReview({
    documentId: internal.id,
    actorId: "staff-1",
  });
  await service.approve({
    documentId: internal.id,
    actorId: "approver-1",
  });

  assert.deepEqual(
    (
      await service.getCurrentApprovedKnowledge({
        audience: "public",
        category: "admission",
      })
    ).map((document) => document.id),
    [
      v2.id,
    ],
  );

  await assert.rejects(
    () =>
      service.publish({
        documentId: internal.id,
        targetProvider: "mock",
        targetEnvironment:
          "development",
      }),
    /Cannot publish internal knowledge to public target/,
  );
}

function testPublicationSecurityPolicy() {
  const now =
    "2027-01-01T00:00:00.000Z";

  const approvedPublic = {
    id: "doc-public",
    title: "Public",
    sourceSystem: "manual" as const,
    audience: "public" as const,
    status: "approved" as const,
    createdAt: now,
    updatedAt: now,
    content: "content",
  };

  assert.doesNotThrow(() =>
    assertCanPublishKnowledge({
      document: approvedPublic,
      targetAudience: "public",
      targetEnvironment:
        "development",
      now,
    }),
  );

  for (const status of [
    "draft",
    "review",
    "superseded",
    "archived",
  ] as const) {
    assert.throws(
      () =>
        assertCanPublishKnowledge({
          document: {
            ...approvedPublic,
            status,
          },
          targetAudience: "public",
          targetEnvironment:
            "development",
          now,
        }),
      /Only approved/,
    );
  }

  assert.throws(
    () =>
      assertCanPublishKnowledge({
        document: {
          ...approvedPublic,
          effectiveFrom:
            "2027-02-01T00:00:00.000Z",
        },
        targetAudience: "public",
        targetEnvironment:
          "development",
        now,
      }),
    /Only approved/,
  );

  assert.throws(
    () =>
      assertCanPublishKnowledge({
        document: {
          ...approvedPublic,
          effectiveTo:
            "2026-12-31T00:00:00.000Z",
        },
        targetAudience: "public",
        targetEnvironment:
          "development",
        now,
      }),
    /Only approved/,
  );
}

async function testMockSourceAdapterAndSync() {
  const sourceAdapter =
    new MockKnowledgeSourceAdapter([
      {
        descriptor: {
          sourceReference:
            "sharepoint:item-1",
          title:
            "Source Document",
          filename:
            "source.txt",
          modifiedAt:
            "2027-01-02T00:00:00.000Z",
          metadata: {
            version: "v1",
          },
        },
        text:
          "Draft source content",
      },
    ]);

  assert.equal(
    (
      await sourceAdapter
        .listChangedDocuments(
          "2027-01-01T00:00:00.000Z",
        )
    ).length,
    1,
  );

  const payload =
    await sourceAdapter.fetchDocument(
      "sharepoint:item-1",
    );

  assert.equal(
    payload.content.type,
    "text",
  );

  const {
    service,
    knowledgeRepository,
    publicationRepository,
  } = createKnowledgeTestService();

  const syncService =
    new KnowledgeSyncService(
      sourceAdapter,
      service,
    );

  const result =
    await syncService.syncChangedDocuments({
      defaultAudience: "public",
      defaultCategory: "admission",
      actorId: "sync",
      submitForReview: false,
    });

  assert.equal(
    result.createdDocumentIds.length,
    1,
  );
  assert.equal(
    (
      await knowledgeRepository
        .getDocument(
          result.createdDocumentIds[0],
        )
    )?.status,
    "draft",
  );
  assert.equal(
    (
      await publicationRepository
        .listPublications()
    ).length,
    0,
  );
}

async function main() {
  testGroundingGate();
  await testAnswerService();
  testProviderRegistry();
  testOpenAIResponseMapping();
  testOpenAIUnsupportedMapping();
  await testOpenAIGroundedQAProviderUsesFileSearch();
  await testOpenAIGroundedQAProviderVectorStoreResolution();
  await testRagV2AdminRouteUsesFirestoreVectorStoreConfig();
  testFirestoreSerializationRemovesUndefinedValues();
  await testOpenAIPublisherPolicyAndIdempotency();
  await testOpenAIPublisherVectorStoreReuse();
  await testKnowledgeUnpublishAdmin();
  await testVectorStoreOrphanCleanupAdmin();
  await testProductionSafeGovernanceIds();
  await testGovernanceTransitionIsAtomicWhenAuditFails();
  await testSharePointDeterministicPartialStateRecovery();
  await testSharePointRetryAndConcurrentSafety();
  await testPublishApprovedKnowledgeUseCase();
  await testPowerAutomateHttpAdapter();
  await testPowerAutomateJsonAndRawParsing();
  await testRawRequestPolicyAndSharedUseCase();
  await testProductionDefaultAvoidsLocalVectorStoreFiles();
  await testOneDriveQueueAdapter();
  testAudiencePolicy();
  testConversationTransitions();
  await testInMemoryRepositories();
  await testFirestoreConversationRepository();
  await testFirestoreHandoffRepository();
  await testProductionSafeConversationIds();
  await testAtomicHandoffRequestWorkflow();
  await testAtomicHandoffRequestHasNoPartialStateOnFailure();
  await testAtomicCompetingTakeoverWorkflow();
  await testAtomicResolveAndReturnWorkflow();
  await testAtomicResolveDetectsMissingActiveHandoff();
  await testLateAiReplyIsDiscarded();
  await testAtomicHumanReplyOwnershipRace();
  await testProductionConversationCompositionSource();
  await testConversationExperimentRoutesUseProductionComposition();
  await testConversationRouteErrorMappingSource();
  await testMultiTurnContextIncludesPreviousTurnsOnly();
  await testConversationContextExcludesSystemAndMapsHumanReplies();
  await testConversationContextIsBoundedToTenMessages();
  await testInboundMessageReceiptFirstAppendProcessesOnce();
  await testInboundMessageReceiptSequentialRetryIsIdempotent();
  await testInboundMessageReceiptConcurrentRetryIsIdempotent();
  await testInboundMessageReceiptUnsupportedRetryDoesNotDuplicateHandoff();
  await testInboundMessageReceiptSameChannelMessageDifferentConversations();
  await testInboundMessageReceiptSameConversationDifferentTextConflicts();
  await testInboundMessageReceiptAbsentChannelMessageIdPreservesRepeatBehavior();
  await testInboundMessageReceiptDuplicateInHumanModesDoesNotMutateState();
  await testConversationServiceGroundedAnswer();
  await testConversationServiceUnsupportedHandoff();
  await testConversationServiceMissingCitationHandoff();
  await testHumanOwnedModesDoNotInvokeAI();
  await testTakeoverHumanReplyResolveReturnToAI();
  testKnowledgeStateMachine();
  testEffectiveDatePolicyAndHashing();
  await testKnowledgeGovernanceAndPublishingScenarios();
  testPublicationSecurityPolicy();
  await testMockSourceAdapterAndSync();

  console.log(
    "ai-platform unit tests passed",
  );
}

void main();
