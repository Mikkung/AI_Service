import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  assertConversationTransition,
} from "@/core/ai-platform/conversations/conversation-transitions";

import {
  ConversationConflictError,
  ConversationInvariantError,
  type AppendUserMessageWorkflowResult,
  type AppendUserMessageInput,
  type ConditionalMessageWorkflowResult,
  type ConversationWorkflowRepository,
  type InboundProcessingOwnershipInput,
  type PersistAiMessageForInboundIfOwnedInput,
  type PersistAiMessageForInboundIfOwnedResult,
  type PersistAiMessageIfActiveInput,
  type PersistHumanMessageIfOwnedInput,
  type RequestHandoffForInboundIfOwnedInput,
  type RequestHandoffForInboundIfOwnedResult,
  type RequestHandoffWorkflowInput,
  type RequestHandoffWorkflowResult,
  type ResolveConversationWorkflowInput,
  type ReturnConversationToAIWorkflowInput,
  type TakeOverConversationWorkflowInput,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";

import type {
  Conversation,
  ConversationMessage,
  HumanHandoff,
} from "@/core/ai-platform/types/conversations";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

import {
  removeUndefinedFirestoreValues,
} from "./firestore-serialization";

const CONVERSATIONS_COLLECTION =
  "ai_platform_conversations";

const MESSAGES_COLLECTION =
  "ai_platform_conversation_messages";

const HANDOFFS_COLLECTION =
  "ai_platform_handoffs";

const INBOUND_RECEIPTS_COLLECTION =
  "ai_platform_inbound_message_receipts";

const INBOUND_PROCESSING_LEASE_SECONDS =
  120;

type InboundProcessingStatus =
  | "processing"
  | "completed";

interface InboundMessageReceipt {
  conversationId: string;
  channelMessageId: string;
  messageId: string;
  textSha256: string;
  receivedAt: string;
  processingStatus?: InboundProcessingStatus;
  processingToken?: string;
  leaseExpiresAt?: string;
  processingAttempts?: number;
  completedAt?: string;
  completionOutcome?: string;
}

interface FirestoreDocumentSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface FirestoreCollectionSnapshot {
  docs: FirestoreDocumentSnapshot[];
}

interface FirestoreDocumentReference {
  id: string;
}

interface FirestoreQueryReference {
  where(
    field: string,
    operator: "==",
    value: unknown,
  ): FirestoreQueryReference;
}

interface FirestoreCollectionReference
  extends FirestoreQueryReference
{
  doc(id: string): FirestoreDocumentReference;
}

interface FirestoreTransaction {
  get(
    ref:
      | FirestoreDocumentReference
      | FirestoreQueryReference,
  ): Promise<
    | FirestoreDocumentSnapshot
    | FirestoreCollectionSnapshot
  >;
  create(
    ref: FirestoreDocumentReference,
    data: Record<string, unknown>,
  ): void;
  set(
    ref: FirestoreDocumentReference,
    data: Record<string, unknown>,
  ): void;
}

interface FirestoreLike {
  collection(
    name: string,
  ): FirestoreCollectionReference;
  runTransaction<T>(
    updateFunction: (
      transaction: FirestoreTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

function isCollectionSnapshot(
  snapshot:
    | FirestoreDocumentSnapshot
    | FirestoreCollectionSnapshot,
): snapshot is FirestoreCollectionSnapshot {
  return Array.isArray(
    (
      snapshot as FirestoreCollectionSnapshot
    ).docs,
  );
}

function cloneConversation(
  conversation: Conversation,
): Conversation {
  return {
    ...conversation,
    metadata:
      conversation.metadata
        ? {
            ...conversation.metadata,
          }
        : undefined,
  };
}

function cloneMessage(
  message: ConversationMessage,
): ConversationMessage {
  return {
    ...message,
    citations:
      message.citations?.map(
        (citation) => ({
          ...citation,
          providerMetadata:
            citation.providerMetadata
              ? {
                  ...citation.providerMetadata,
                }
              : undefined,
        }),
      ),
    metadata:
      message.metadata
        ? {
            ...message.metadata,
          }
        : undefined,
  };
}

function cloneHandoff(
  handoff: HumanHandoff,
): HumanHandoff {
  return {
    ...handoff,
    metadata:
      handoff.metadata
        ? {
            ...handoff.metadata,
          }
        : undefined,
  };
}

function serialize(
  value: unknown,
): Record<string, unknown> {
  return removeUndefinedFirestoreValues(
    value,
  ) as Record<string, unknown>;
}

function sha256(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function getInboundReceiptId(
  conversationId: string,
  channelMessageId: string,
): string {
  return sha256(
    `${conversationId}\0${channelMessageId}`,
  );
}

function createProcessingToken(): string {
  return `inbound-${randomUUID()}`;
}

function addSeconds(
  isoTimestamp: string,
  seconds: number,
): string {
  return new Date(
    new Date(isoTimestamp).getTime() +
      seconds * 1000,
  ).toISOString();
}

function getLeaseExpiresAt(
  timestamp: string,
): string {
  return addSeconds(
    timestamp,
    INBOUND_PROCESSING_LEASE_SECONDS,
  );
}

function isLeaseExpired(
  leaseExpiresAt: string,
  now: string,
): boolean {
  return (
    new Date(leaseExpiresAt).getTime() <=
    new Date(now).getTime()
  );
}

function mapInboundReceiptSnapshot(
  snapshot: FirestoreDocumentSnapshot,
): InboundMessageReceipt {
  return snapshot.data() as unknown as InboundMessageReceipt;
}

function mapConversationSnapshot(
  snapshot: FirestoreDocumentSnapshot,
): Conversation {
  return cloneConversation({
    id: snapshot.id,
    ...(snapshot.data() as Omit<
      Conversation,
      "id"
    >),
  });
}

function mapHandoffSnapshot(
  snapshot: FirestoreDocumentSnapshot,
): HumanHandoff {
  return cloneHandoff({
    id: snapshot.id,
    ...(snapshot.data() as Omit<
      HumanHandoff,
      "id"
    >),
  });
}

function assertDocumentSnapshot(
  snapshot:
    | FirestoreDocumentSnapshot
    | FirestoreCollectionSnapshot,
): FirestoreDocumentSnapshot {
  if (isCollectionSnapshot(snapshot)) {
    throw new Error(
      "Expected Firestore document snapshot",
    );
  }

  return snapshot;
}

function assertCollectionSnapshot(
  snapshot:
    | FirestoreDocumentSnapshot
    | FirestoreCollectionSnapshot,
): FirestoreCollectionSnapshot {
  if (!isCollectionSnapshot(snapshot)) {
    throw new Error(
      "Expected Firestore collection snapshot",
    );
  }

  return snapshot;
}

export class FirestoreAIPlatformConversationWorkflowRepository
  implements ConversationWorkflowRepository
{
  private readonly db: FirestoreLike;

  constructor(db?: FirestoreLike) {
    this.db =
      db ??
      (firestore as unknown as FirestoreLike);
  }

  async appendUserMessage(
    input: AppendUserMessageInput,
  ): Promise<AppendUserMessageWorkflowResult> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );

        const channelMessageId =
          input.message.channelMessageId;
        const receiptRef =
          channelMessageId
            ? this.inboundReceiptRef(
                getInboundReceiptId(
                  input.conversationId,
                  channelMessageId,
                ),
              )
            : undefined;
        const textSha256 =
          channelMessageId
            ? sha256(input.message.text)
            : undefined;

        if (
          receiptRef &&
          channelMessageId &&
          textSha256
        ) {
          const receiptSnapshot =
            assertDocumentSnapshot(
              await transaction.get(
                receiptRef,
              ),
            );

          if (receiptSnapshot.exists) {
            const receipt =
              mapInboundReceiptSnapshot(
                receiptSnapshot,
              );

            if (
              receipt.conversationId !==
                input.conversationId ||
              receipt.channelMessageId !==
                channelMessageId
            ) {
              throw new ConversationInvariantError(
                `Inbound receipt ${receiptSnapshot.id} does not match conversation message identity`,
              );
            }

            if (
              receipt.textSha256 !==
              textSha256
            ) {
              throw new ConversationConflictError(
                "Inbound message receipt already exists with different text",
              );
            }

            if (
              receipt.processingStatus ===
              "processing"
            ) {
              if (
                typeof receipt.leaseExpiresAt !==
                  "string" ||
                typeof receipt.processingToken !==
                  "string" ||
                typeof receipt.processingAttempts !==
                  "number" ||
                typeof receipt.messageId !==
                  "string"
              ) {
                throw new ConversationInvariantError(
                  `Inbound receipt ${receiptSnapshot.id} is processing without complete lease state`,
                );
              }

              if (
                !isLeaseExpired(
                  receipt.leaseExpiresAt,
                  input.updatedAt,
                )
              ) {
                return {
                  conversation:
                    cloneConversation(
                      conversation,
                    ),
                  appended: false,
                  shouldProcess: false,
                  messageId:
                    receipt.messageId,
                };
              }

              if (
                conversation.mode !==
                "ai_active"
              ) {
                const outcome =
                  `recovery_no_ai_processing_${conversation.mode}`;
                transaction.set(
                  receiptRef,
                  serialize(
                    this.completeReceipt(
                      receipt,
                      input.updatedAt,
                      outcome,
                    ),
                  ),
                );

                return {
                  conversation:
                    cloneConversation(
                      conversation,
                    ),
                  appended: false,
                  shouldProcess: false,
                  messageId:
                    receipt.messageId,
                };
              }

              const processingToken =
                createProcessingToken();
              const reclaimedReceipt: InboundMessageReceipt =
                {
                  ...receipt,
                  processingToken,
                  leaseExpiresAt:
                    getLeaseExpiresAt(
                      input.updatedAt,
                    ),
                  processingAttempts:
                    receipt.processingAttempts +
                    1,
                };

              transaction.set(
                receiptRef,
                serialize(
                  reclaimedReceipt,
                ),
              );

              return {
                conversation:
                  cloneConversation(
                    conversation,
                  ),
                appended: false,
                shouldProcess: true,
                messageId:
                  receipt.messageId,
                processingToken,
                recovered: true,
              };
            }

            return {
              conversation:
                cloneConversation(
                  conversation,
                ),
              appended: false,
              shouldProcess: false,
              messageId:
                receipt.messageId,
            };
          }
        }

        if (
          conversation.mode === "resolved"
        ) {
          throw new ConversationConflictError(
            `Conversation is resolved: ${conversation.id}`,
          );
        }

        const updated =
          this.withMessageTimestamps(
            conversation,
            input.updatedAt,
          );

        transaction.set(
          conversationRef,
          serialize(updated),
        );
        transaction.create(
          this.messageRef(
            input.message.id,
          ),
          serialize(
            cloneMessage(
              input.message,
            ),
          ),
        );

        if (
          receiptRef &&
          channelMessageId &&
          textSha256
        ) {
          const processingToken =
            createProcessingToken();
          const shouldProcess =
            conversation.mode ===
            "ai_active";
          const receipt: InboundMessageReceipt =
            {
              conversationId:
                input.conversationId,
              channelMessageId,
              messageId:
                input.message.id,
              textSha256,
              receivedAt:
                input.updatedAt,
              processingStatus:
                shouldProcess
                  ? "processing"
                  : "completed",
              processingToken,
              leaseExpiresAt:
                getLeaseExpiresAt(
                  input.updatedAt,
                ),
              processingAttempts: 1,
              completedAt:
                shouldProcess
                  ? undefined
                  : input.updatedAt,
              completionOutcome:
                shouldProcess
                  ? undefined
                  : `no_ai_processing_${conversation.mode}`,
            };

          transaction.create(
            receiptRef,
            serialize(receipt),
          );

          return {
            conversation:
              cloneConversation(updated),
            appended: true,
            shouldProcess,
            messageId:
              input.message.id,
            processingToken:
              shouldProcess
                ? processingToken
                : undefined,
          };
        }

        return {
          conversation:
            cloneConversation(updated),
          appended: true,
          shouldProcess: true,
          messageId:
            input.message.id,
        };
      },
    );
  }

  async persistAiMessageIfActive(
    input: PersistAiMessageIfActiveInput,
  ): Promise<ConditionalMessageWorkflowResult> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );

        if (
          conversation.mode !== "ai_active"
        ) {
          return {
            conversation:
              cloneConversation(
                conversation,
              ),
            persisted: false,
          };
        }

        const updated =
          this.withMessageTimestamps(
            conversation,
            input.updatedAt,
          );

        transaction.set(
          conversationRef,
          serialize(updated),
        );
        transaction.create(
          this.messageRef(
            input.message.id,
          ),
          serialize(
            cloneMessage(
              input.message,
            ),
          ),
        );

        return {
          conversation:
            cloneConversation(
              updated,
            ),
          persisted: true,
        };
      },
    );
  }

  async persistAiMessageForInboundIfOwned(
    input: PersistAiMessageForInboundIfOwnedInput,
  ): Promise<PersistAiMessageForInboundIfOwnedResult> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );
        const ownership =
          await this.getInboundProcessingOwnership(
            transaction,
            input,
          );

        if (!ownership.owned) {
          return {
            conversation:
              cloneConversation(
                conversation,
              ),
            persisted: false,
            completed: false,
          };
        }

        if (
          conversation.mode !== "ai_active"
        ) {
          const outcome =
            "ai_suppressed_mode_changed";
          transaction.set(
            ownership.receiptRef,
            serialize(
              this.completeReceipt(
                ownership.receipt,
                input.updatedAt,
                outcome,
              ),
            ),
          );

          return {
            conversation:
              cloneConversation(
                conversation,
              ),
            persisted: false,
            completed: true,
            completionOutcome:
              outcome,
          };
        }

        const updated =
          this.withMessageTimestamps(
            conversation,
            input.updatedAt,
          );
        const outcome = "ai_replied";

        transaction.set(
          conversationRef,
          serialize(updated),
        );
        transaction.create(
          this.messageRef(
            input.message.id,
          ),
          serialize(
            cloneMessage(
              input.message,
            ),
          ),
        );
        transaction.set(
          ownership.receiptRef,
          serialize(
            this.completeReceipt(
              ownership.receipt,
              input.updatedAt,
              outcome,
            ),
          ),
        );

        return {
          conversation:
            cloneConversation(updated),
          persisted: true,
          completed: true,
          completionOutcome:
            outcome,
        };
      },
    );
  }

  async persistHumanMessageIfOwned(
    input: PersistHumanMessageIfOwnedInput,
  ): Promise<Conversation> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );

        if (
          conversation.mode !==
            "human_active" ||
          conversation.assignedAgentId !==
            input.agentId
        ) {
          throw new ConversationConflictError(
            "Conversation is not owned by this human agent",
          );
        }

        const updated =
          this.withMessageTimestamps(
            conversation,
            input.updatedAt,
          );

        transaction.set(
          conversationRef,
          serialize(updated),
        );
        transaction.create(
          this.messageRef(
            input.message.id,
          ),
          serialize(
            cloneMessage(
              input.message,
            ),
          ),
        );

        return cloneConversation(updated);
      },
    );
  }

  async requestHumanHandoff(
    input: RequestHandoffWorkflowInput,
  ): Promise<RequestHandoffWorkflowResult> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );
        const existingHandoff =
          await this.getActiveHandoff(
            transaction,
            input.conversationId,
          );

        if (existingHandoff) {
          if (
            conversation.mode !==
              "waiting_human" &&
            conversation.mode !==
              "human_active"
          ) {
            throw new ConversationInvariantError(
              `Conversation ${conversation.id} is ${conversation.mode} but already has an active handoff`,
            );
          }

          return {
            conversation:
              cloneConversation(
                conversation,
              ),
            handoff:
              cloneHandoff(
                existingHandoff,
              ),
            created: false,
          };
        }

        if (
          conversation.mode !== "ai_active"
        ) {
          if (
            conversation.mode !==
              "waiting_human" &&
            conversation.mode !==
              "human_active"
          ) {
            throw new ConversationConflictError(
              `Conversation cannot request handoff from mode ${conversation.mode}`,
            );
          }

          throw new ConversationInvariantError(
            `Conversation ${conversation.id} is ${conversation.mode} without an active handoff`,
          );
        }

        assertConversationTransition({
          from: conversation.mode,
          to: "waiting_human",
          reason:
            input.handoff.reason,
          requestedBy:
            input.handoff.requestedBy,
        });

        const updated: Conversation = {
          ...conversation,
          mode: "waiting_human",
          updatedAt:
            input.updatedAt,
        };

        transaction.set(
          conversationRef,
          serialize(updated),
        );
        transaction.create(
          this.handoffRef(
            input.handoff.id,
          ),
          serialize(
            cloneHandoff(
              input.handoff,
            ),
          ),
        );
        transaction.create(
          this.messageRef(
            input.systemMessage.id,
          ),
          serialize(
            cloneMessage(
              input.systemMessage,
            ),
          ),
        );

        return {
          conversation:
            cloneConversation(
              updated,
            ),
          handoff:
            cloneHandoff(
              input.handoff,
            ),
          created: true,
        };
      },
    );
  }

  async requestHumanHandoffForInboundIfOwned(
    input: RequestHandoffForInboundIfOwnedInput,
  ): Promise<RequestHandoffForInboundIfOwnedResult> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );
        const ownership =
          await this.getInboundProcessingOwnership(
            transaction,
            input,
          );

        if (!ownership.owned) {
          return {
            conversation:
              cloneConversation(
                conversation,
              ),
            created: false,
            completed: false,
          };
        }

        const existingHandoff =
          await this.getActiveHandoff(
            transaction,
            input.conversationId,
          );
        const outcome =
          "handoff_requested";

        if (existingHandoff) {
          if (
            conversation.mode !==
              "waiting_human" &&
            conversation.mode !==
              "human_active"
          ) {
            throw new ConversationInvariantError(
              `Conversation ${conversation.id} is ${conversation.mode} but already has an active handoff`,
            );
          }

          transaction.set(
            ownership.receiptRef,
            serialize(
              this.completeReceipt(
                ownership.receipt,
                input.updatedAt,
                outcome,
              ),
            ),
          );

          return {
            conversation:
              cloneConversation(
                conversation,
              ),
            handoff:
              cloneHandoff(
                existingHandoff,
              ),
            created: false,
            completed: true,
            completionOutcome:
              outcome,
          };
        }

        if (
          conversation.mode !== "ai_active"
        ) {
          if (
            conversation.mode ===
            "resolved"
          ) {
            const suppressedOutcome =
              "handoff_suppressed_mode_changed";
            transaction.set(
              ownership.receiptRef,
              serialize(
                this.completeReceipt(
                  ownership.receipt,
                  input.updatedAt,
                  suppressedOutcome,
                ),
              ),
            );

            return {
              conversation:
                cloneConversation(
                  conversation,
                ),
              created: false,
              completed: true,
              completionOutcome:
                suppressedOutcome,
            };
          }

          if (
            conversation.mode !==
              "waiting_human" &&
            conversation.mode !==
              "human_active"
          ) {
            throw new ConversationConflictError(
              `Conversation cannot request handoff from mode ${conversation.mode}`,
            );
          }

          throw new ConversationInvariantError(
            `Conversation ${conversation.id} is ${conversation.mode} without an active handoff`,
          );
        }

        assertConversationTransition({
          from: conversation.mode,
          to: "waiting_human",
          reason:
            input.handoff.reason,
          requestedBy:
            input.handoff.requestedBy,
        });

        const updated: Conversation = {
          ...conversation,
          mode: "waiting_human",
          updatedAt:
            input.updatedAt,
        };

        transaction.set(
          conversationRef,
          serialize(updated),
        );
        transaction.create(
          this.handoffRef(
            input.handoff.id,
          ),
          serialize(
            cloneHandoff(
              input.handoff,
            ),
          ),
        );
        transaction.create(
          this.messageRef(
            input.systemMessage.id,
          ),
          serialize(
            cloneMessage(
              input.systemMessage,
            ),
          ),
        );
        transaction.set(
          ownership.receiptRef,
          serialize(
            this.completeReceipt(
              ownership.receipt,
              input.updatedAt,
              outcome,
            ),
          ),
        );

        return {
          conversation:
            cloneConversation(
              updated,
            ),
          handoff:
            cloneHandoff(
              input.handoff,
            ),
          created: true,
          completed: true,
          completionOutcome:
            outcome,
        };
      },
    );
  }

  async takeOverConversation(
    input: TakeOverConversationWorkflowInput,
  ): Promise<{
    conversation: Conversation;
    handoff: HumanHandoff;
  }> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );
        const handoff =
          await this.getActiveHandoff(
            transaction,
            input.conversationId,
          );

        if (
          conversation.mode !==
          "waiting_human"
        ) {
          throw new ConversationConflictError(
            "Conversation must be waiting for human takeover",
          );
        }

        if (!handoff) {
          throw new ConversationInvariantError(
            `Waiting conversation has no active handoff: ${conversation.id}`,
          );
        }

        if (
          handoff.status !== "waiting" ||
          handoff.assignedAgentId
        ) {
          throw new ConversationConflictError(
            "Handoff is not available for takeover",
          );
        }

        assertConversationTransition({
          from: conversation.mode,
          to: "human_active",
        });

        const updatedConversation: Conversation =
          {
            ...conversation,
            mode: "human_active",
            assignedAgentId:
              input.agentId,
            updatedAt:
              input.takenAt,
          };
        const updatedHandoff: HumanHandoff =
          {
            ...handoff,
            status: "active",
            assignedAgentId:
              input.agentId,
            takenAt:
              input.takenAt,
          };

        transaction.set(
          conversationRef,
          serialize(updatedConversation),
        );
        transaction.set(
          this.handoffRef(handoff.id),
          serialize(updatedHandoff),
        );

        return {
          conversation:
            cloneConversation(
              updatedConversation,
            ),
          handoff:
            cloneHandoff(
              updatedHandoff,
            ),
        };
      },
    );
  }

  async resolveConversation(
    input: ResolveConversationWorkflowInput,
  ): Promise<{
    conversation: Conversation;
    handoff: HumanHandoff;
  }> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );
        const handoff =
          await this.getActiveHandoff(
            transaction,
            input.conversationId,
          );

        if (
          conversation.mode !==
            "human_active" &&
          conversation.mode !==
            "waiting_human"
        ) {
          throw new ConversationConflictError(
            "Only human handoff conversations can be resolved",
          );
        }

        if (!handoff) {
          throw new ConversationInvariantError(
            `Handoff conversation has no active handoff: ${conversation.id}`,
          );
        }

        assertConversationTransition({
          from: conversation.mode,
          to: "resolved",
        });

        const updatedConversation: Conversation =
          {
            ...conversation,
            mode: "resolved",
            assignedAgentId:
              undefined,
            updatedAt:
              input.resolvedAt,
          };
        const updatedHandoff: HumanHandoff =
          {
            ...handoff,
            status: "resolved",
            resolvedAt:
              input.resolvedAt,
            resolutionNote:
              input.resolutionNote ??
              handoff.resolutionNote,
          };

        transaction.set(
          conversationRef,
          serialize(updatedConversation),
        );
        transaction.set(
          this.handoffRef(handoff.id),
          serialize(updatedHandoff),
        );

        return {
          conversation:
            cloneConversation(
              removeUndefinedFirestoreValues(
                updatedConversation,
              ),
            ),
          handoff:
            cloneHandoff(
              removeUndefinedFirestoreValues(
                updatedHandoff,
              ),
            ),
        };
      },
    );
  }

  async returnConversationToAI(
    input: ReturnConversationToAIWorkflowInput,
  ): Promise<Conversation> {
    return this.db.runTransaction(
      async (transaction) => {
        const {
          conversation,
          conversationRef,
        } = await this.getRequiredConversation(
          transaction,
          input.conversationId,
        );
        const activeHandoff =
          await this.getActiveHandoff(
            transaction,
            input.conversationId,
          );

        if (
          conversation.mode !== "resolved"
        ) {
          throw new ConversationConflictError(
            "Only resolved conversations can return to AI",
          );
        }

        if (activeHandoff) {
          throw new ConversationInvariantError(
            `Resolved conversation has active handoff: ${conversation.id}`,
          );
        }

        assertConversationTransition({
          from: conversation.mode,
          to: "ai_active",
        });

        const updated: Conversation = {
          ...conversation,
          mode: "ai_active",
          assignedAgentId:
            undefined,
          updatedAt:
            input.updatedAt,
        };
        const sanitized =
          removeUndefinedFirestoreValues(
            updated,
          );

        transaction.set(
          conversationRef,
          serialize(sanitized),
        );

        return cloneConversation(
          sanitized,
        );
      },
    );
  }

  private async getInboundProcessingOwnership(
    transaction: FirestoreTransaction,
    input: InboundProcessingOwnershipInput,
  ): Promise<
    | {
        owned: true;
        receipt: InboundMessageReceipt;
        receiptRef: FirestoreDocumentReference;
      }
    | {
        owned: false;
      }
  > {
    const receiptRef =
      this.inboundReceiptRef(
        getInboundReceiptId(
          input.conversationId,
          input.channelMessageId,
        ),
      );
    const receiptSnapshot =
      assertDocumentSnapshot(
        await transaction.get(receiptRef),
      );

    if (!receiptSnapshot.exists) {
      throw new ConversationInvariantError(
        `Inbound receipt not found for conversation ${input.conversationId}`,
      );
    }

    const receipt =
      mapInboundReceiptSnapshot(
        receiptSnapshot,
      );

    if (
      receipt.conversationId !==
        input.conversationId ||
      receipt.channelMessageId !==
        input.channelMessageId
    ) {
      throw new ConversationInvariantError(
        `Inbound receipt ${receiptSnapshot.id} does not match processing identity`,
      );
    }

    if (
      receipt.processingStatus !==
        "processing" ||
      receipt.processingToken !==
        input.processingToken
    ) {
      return {
        owned: false,
      };
    }

    return {
      owned: true,
      receipt,
      receiptRef,
    };
  }

  private completeReceipt(
    receipt: InboundMessageReceipt,
    completedAt: string,
    completionOutcome: string,
  ): InboundMessageReceipt {
    return {
      ...receipt,
      processingStatus: "completed",
      completedAt,
      completionOutcome,
    };
  }

  private async getRequiredConversation(
    transaction: FirestoreTransaction,
    conversationId: string,
  ): Promise<{
    conversation: Conversation;
    conversationRef: FirestoreDocumentReference;
  }> {
    const conversationRef =
      this.conversationRef(
        conversationId,
      );
    const snapshot =
      assertDocumentSnapshot(
        await transaction.get(
          conversationRef,
        ),
      );

    if (!snapshot.exists) {
      throw new Error(
        `Conversation not found: ${conversationId}`,
      );
    }

    return {
      conversation:
        mapConversationSnapshot(
          snapshot,
        ),
      conversationRef,
    };
  }

  private async getActiveHandoff(
    transaction: FirestoreTransaction,
    conversationId: string,
  ): Promise<HumanHandoff | null> {
    const query =
      this.db
        .collection(HANDOFFS_COLLECTION)
        .where(
          "conversationId",
          "==",
          conversationId,
        );
    const snapshot =
      assertCollectionSnapshot(
        await transaction.get(query),
      );

    return (
      snapshot.docs
        .map(mapHandoffSnapshot)
        .filter(
          (handoff) =>
            handoff.status ===
              "waiting" ||
            handoff.status ===
              "active",
        )
        .sort((left, right) =>
          right.requestedAt.localeCompare(
            left.requestedAt,
          ) ||
          left.id.localeCompare(right.id),
        )[0] ?? null
    );
  }

  private withMessageTimestamps(
    conversation: Conversation,
    updatedAt: string,
  ): Conversation {
    return {
      ...conversation,
      updatedAt,
      lastMessageAt: updatedAt,
    };
  }

  private conversationRef(
    id: string,
  ): FirestoreDocumentReference {
    return this.db
      .collection(CONVERSATIONS_COLLECTION)
      .doc(id);
  }

  private handoffRef(
    id: string,
  ): FirestoreDocumentReference {
    return this.db
      .collection(HANDOFFS_COLLECTION)
      .doc(id);
  }

  private messageRef(
    id: string,
  ): FirestoreDocumentReference {
    return this.db
      .collection(MESSAGES_COLLECTION)
      .doc(id);
  }

  private inboundReceiptRef(
    id: string,
  ): FirestoreDocumentReference {
    return this.db
      .collection(
        INBOUND_RECEIPTS_COLLECTION,
      )
      .doc(id);
  }
}
