import {
  assertConversationTransition,
} from "@/core/ai-platform/conversations/conversation-transitions";

import {
  ConversationConflictError,
  ConversationInvariantError,
  type AppendUserMessageInput,
  type ConditionalMessageWorkflowResult,
  type ConversationWorkflowRepository,
  type PersistAiMessageIfActiveInput,
  type PersistHumanMessageIfOwnedInput,
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

        return cloneConversation(updated);
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
}
