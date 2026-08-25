import type {
  ConversationRepository,
  CreateConversationInput,
  ListConversationsFilter,
  UpdateConversationInput,
} from "@/core/ai-platform/repositories/conversation-repository";

import type {
  Conversation,
  ConversationMessage,
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

interface FirestoreDocumentSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface FirestoreCollectionSnapshot {
  docs: FirestoreDocumentSnapshot[];
}

interface FirestoreDocumentReference {
  create(
    data: Record<string, unknown>,
  ): Promise<unknown>;
  get(): Promise<FirestoreDocumentSnapshot>;
  set(
    data: Record<string, unknown>,
  ): Promise<unknown>;
}

interface FirestoreCollectionReference {
  doc(id: string): FirestoreDocumentReference;
  get(): Promise<FirestoreCollectionSnapshot>;
}

interface FirestoreLike {
  collection(
    name: string,
  ): FirestoreCollectionReference;
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

function mapMessageSnapshot(
  snapshot: FirestoreDocumentSnapshot,
): ConversationMessage {
  return cloneMessage({
    id: snapshot.id,
    ...(snapshot.data() as Omit<
      ConversationMessage,
      "id"
    >),
  });
}

export class FirestoreAIPlatformConversationRepository
  implements ConversationRepository
{
  private readonly db: FirestoreLike;

  constructor(db?: FirestoreLike) {
    this.db =
      db ??
      (firestore as unknown as FirestoreLike);
  }

  async createConversation(
    input: CreateConversationInput,
  ): Promise<Conversation> {
    const conversation: Conversation = {
      ...input,
    };
    const firestoreConversation =
      removeUndefinedFirestoreValues(
        conversation,
      );

    await this.db
      .collection(CONVERSATIONS_COLLECTION)
      .doc(input.id)
      .create(
        firestoreConversation as unknown as Record<
          string,
          unknown
        >,
      );

    return cloneConversation(
      firestoreConversation,
    );
  }

  async getConversation(
    id: string,
  ): Promise<Conversation | null> {
    const snapshot =
      await this.db
        .collection(
          CONVERSATIONS_COLLECTION,
        )
        .doc(id)
        .get();

    if (!snapshot.exists) {
      return null;
    }

    return mapConversationSnapshot(
      snapshot,
    );
  }

  async updateConversation(
    input: UpdateConversationInput,
  ): Promise<Conversation> {
    const existing =
      await this.getConversation(input.id);

    if (!existing) {
      throw new Error(
        `Conversation not found: ${input.id}`,
      );
    }

    const updated: Conversation = {
      ...existing,
      mode:
        input.mode ?? existing.mode,
      assignedAgentId:
        input.clearAssignedAgentId
          ? undefined
          : input.assignedAgentId ??
            existing.assignedAgentId,
      updatedAt:
        input.updatedAt,
      lastMessageAt:
        input.lastMessageAt ??
        existing.lastMessageAt,
      metadata:
        input.metadata ??
        existing.metadata,
    };
    const firestoreConversation =
      removeUndefinedFirestoreValues(
        updated,
      );

    await this.db
      .collection(CONVERSATIONS_COLLECTION)
      .doc(input.id)
      .set(
        firestoreConversation as unknown as Record<
          string,
          unknown
        >,
      );

    return cloneConversation(
      firestoreConversation,
    );
  }

  async listConversations(
    filter: ListConversationsFilter = {},
  ): Promise<Conversation[]> {
    const snapshot =
      await this.db
        .collection(
          CONVERSATIONS_COLLECTION,
        )
        .get();

    return snapshot.docs
      .map(mapConversationSnapshot)
      .filter(
        (conversation) =>
          (!filter.channel ||
            conversation.channel ===
              filter.channel) &&
          (!filter.mode ||
            conversation.mode ===
              filter.mode) &&
          (!filter.assignedAgentId ||
            conversation.assignedAgentId ===
              filter.assignedAgentId),
      )
      .sort((left, right) => {
        const leftSort =
          left.lastMessageAt ??
          left.updatedAt;
        const rightSort =
          right.lastMessageAt ??
          right.updatedAt;

        return (
          rightSort.localeCompare(
            leftSort,
          ) ||
          left.id.localeCompare(right.id)
        );
      })
      .map(cloneConversation);
  }

  async appendMessage(
    message: ConversationMessage,
  ): Promise<void> {
    const firestoreMessage =
      removeUndefinedFirestoreValues(
        cloneMessage(message),
      );

    await this.db
      .collection(MESSAGES_COLLECTION)
      .doc(message.id)
      .create(
        firestoreMessage as unknown as Record<
          string,
          unknown
        >,
      );
  }

  async listMessages(
    conversationId: string,
  ): Promise<ConversationMessage[]> {
    const snapshot =
      await this.db
        .collection(MESSAGES_COLLECTION)
        .get();

    return snapshot.docs
      .map(mapMessageSnapshot)
      .filter(
        (message) =>
          message.conversationId ===
          conversationId,
      )
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.id.localeCompare(
              right.id,
            )
          : left.createdAt.localeCompare(
              right.createdAt,
            ),
      )
      .map(cloneMessage);
  }
}
