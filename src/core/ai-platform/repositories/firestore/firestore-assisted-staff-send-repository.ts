import {
  createHash,
} from "node:crypto";

import {
  AssistedStaffSendConflictError,
  AssistedStaffSendInvariantError,
  type AssistedStaffSendReceipt,
  type AssistedStaffSendRepository,
  type CompleteAssistedStaffSendInput,
  type CompleteAssistedStaffSendResult,
  type PrepareAssistedStaffSendInput,
} from "@/core/ai-platform/repositories/assisted-staff-send-repository";

import {
  suggestedReplyDraftId,
} from "@/core/ai-platform/repositories/suggested-reply-draft-id";

import type {
  Conversation,
  ConversationMessage,
} from "@/core/ai-platform/types/conversations";

import type {
  SuggestedReplyDraft,
} from "@/core/ai-platform/types/channel-response";

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
const DRAFTS_COLLECTION =
  "ai_platform_suggested_reply_drafts";
const SEND_RECEIPTS_COLLECTION =
  "ai_platform_assisted_staff_send_receipts";

interface DocumentSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface DocumentReference {
  id: string;
}

interface CollectionReference {
  doc(id: string): DocumentReference;
}

interface Transaction {
  get(
    ref: DocumentReference,
  ): Promise<DocumentSnapshot>;
  create(
    ref: DocumentReference,
    data: Record<string, unknown>,
  ): void;
  set(
    ref: DocumentReference,
    data: Record<string, unknown>,
  ): void;
}

interface FirestoreLike {
  collection(
    name: string,
  ): CollectionReference;
  runTransaction<T>(
    operation: (
      transaction: Transaction,
    ) => Promise<T>,
  ): Promise<T>;
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

function mapConversation(
  snapshot: DocumentSnapshot,
): Conversation {
  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<
      Conversation,
      "id"
    >),
  };
}

function mapReceipt(
  snapshot: DocumentSnapshot,
): AssistedStaffSendReceipt {
  return snapshot.data() as unknown as AssistedStaffSendReceipt;
}

function assertMatchingReceipt(
  receipt: AssistedStaffSendReceipt,
  input: PrepareAssistedStaffSendInput,
): void {
  if (
    receipt.clientRequestId !==
      input.clientRequestId ||
    receipt.conversationId !==
      input.conversationId ||
    receipt.textSha256 !==
      sha256(input.text) ||
    receipt.sourceMessageId !==
      input.sourceMessageId
  ) {
    throw new AssistedStaffSendConflictError(
      "clientRequestId is already used for a different assisted send",
    );
  }
}

export class FirestoreAssistedStaffSendRepository
  implements AssistedStaffSendRepository
{
  private readonly db: FirestoreLike;

  constructor(db?: FirestoreLike) {
    this.db =
      db ??
      (firestore as unknown as FirestoreLike);
  }

  async prepareSend(
    input: PrepareAssistedStaffSendInput,
  ): Promise<AssistedStaffSendReceipt> {
    return this.db.runTransaction(
      async (transaction) => {
        const receiptRef =
          this.receiptRef(
            input.clientRequestId,
          );
        const existing =
          await transaction.get(receiptRef);

        if (existing.exists) {
          const receipt =
            mapReceipt(existing);
          assertMatchingReceipt(
            receipt,
            input,
          );
          return receipt;
        }

        const conversationSnapshot =
          await transaction.get(
            this.conversationRef(
              input.conversationId,
            ),
          );

        if (!conversationSnapshot.exists) {
          throw new Error(
            `Conversation not found: ${input.conversationId}`,
          );
        }

        const conversation =
          mapConversation(
            conversationSnapshot,
          );

        if (
          conversation.channel !== "line" ||
          !conversation.channelAccountId ||
          !conversation.channelUserId
        ) {
          throw new AssistedStaffSendInvariantError(
            "Assisted send requires a LINE conversation with trusted account and user identity",
          );
        }

        const receipt: AssistedStaffSendReceipt = {
          clientRequestId:
            input.clientRequestId,
          conversationId:
            input.conversationId,
          text: input.text,
          textSha256: sha256(input.text),
          sourceMessageId:
            input.sourceMessageId,
          retryKey:
            input.clientRequestId,
          messageId:
            `message-assisted-${input.clientRequestId}`,
          status: "pending",
          createdAt: input.createdAt,
        };

        transaction.create(
          receiptRef,
          serialize(receipt),
        );
        return receipt;
      },
    );
  }

  async completeDeliveredSend(
    input: CompleteAssistedStaffSendInput,
  ): Promise<CompleteAssistedStaffSendResult> {
    return this.db.runTransaction(
      async (transaction) => {
        const receiptRef =
          this.receiptRef(
            input.clientRequestId,
          );
        const receiptSnapshot =
          await transaction.get(receiptRef);

        if (!receiptSnapshot.exists) {
          throw new AssistedStaffSendInvariantError(
            "Assisted send receipt not found",
          );
        }

        const receipt =
          mapReceipt(receiptSnapshot);
        const conversationRef =
          this.conversationRef(
            receipt.conversationId,
          );
        const conversationSnapshot =
          await transaction.get(
            conversationRef,
          );

        if (!conversationSnapshot.exists) {
          throw new AssistedStaffSendInvariantError(
            "Assisted send conversation no longer exists",
          );
        }

        const conversation =
          mapConversation(
            conversationSnapshot,
          );
        const messageRef = this.messageRef(
          receipt.messageId,
        );
        const messageSnapshot =
          await transaction.get(messageRef);
        const draftRef =
          receipt.sourceMessageId
            ? this.draftRef(
                receipt.conversationId,
                receipt.sourceMessageId,
              )
            : undefined;
        const draftSnapshot = draftRef
          ? await transaction.get(draftRef)
          : undefined;
        const message: ConversationMessage = {
          id: receipt.messageId,
          conversationId:
            receipt.conversationId,
          senderType: "human",
          senderId: input.staffId,
          text: receipt.text,
          createdAt:
            receipt.deliveredAt ??
            input.deliveredAt,
          metadata: {
            assistedStaffReply: true,
            clientRequestId:
              receipt.clientRequestId,
          },
        };

        if (receipt.status === "delivered") {
          if (!messageSnapshot.exists) {
            throw new AssistedStaffSendInvariantError(
              "Delivered assisted send is missing its human message",
            );
          }

          return {
            receipt,
            conversation,
            message,
            newlyCompleted: false,
          };
        }

        if (!messageSnapshot.exists) {
          transaction.create(
            messageRef,
            serialize(message),
          );
        }

        const updatedConversation: Conversation = {
          ...conversation,
          updatedAt: input.deliveredAt,
          lastMessageAt: input.deliveredAt,
          lastStaffReadAt: input.deliveredAt,
        };
        transaction.set(
          conversationRef,
          serialize(updatedConversation),
        );

        if (
          receipt.sourceMessageId &&
          draftRef &&
          draftSnapshot?.exists
        ) {
            const draft = {
              id: draftRef.id,
              ...(draftSnapshot.data() as Omit<
                SuggestedReplyDraft,
                "id"
              >),
            };

            if (
              draft.conversationId !==
                receipt.conversationId ||
              draft.sourceMessageId !==
                receipt.sourceMessageId
            ) {
              throw new AssistedStaffSendInvariantError(
                "Linked draft identity mismatch",
              );
            }

            transaction.set(
              draftRef,
              serialize({
                ...draft,
                text: receipt.text,
                status: "sent",
                updatedAt:
                  input.deliveredAt,
              }),
            );
        }

        const deliveredReceipt: AssistedStaffSendReceipt = {
          ...receipt,
          status: "delivered",
          deliveredAt:
            input.deliveredAt,
        };
        transaction.set(
          receiptRef,
          serialize(deliveredReceipt),
        );

        return {
          receipt: deliveredReceipt,
          conversation:
            updatedConversation,
          message,
          newlyCompleted: true,
        };
      },
    );
  }

  private receiptRef(
    id: string,
  ): DocumentReference {
    return this.db
      .collection(
        SEND_RECEIPTS_COLLECTION,
      )
      .doc(id);
  }

  private conversationRef(
    id: string,
  ): DocumentReference {
    return this.db
      .collection(CONVERSATIONS_COLLECTION)
      .doc(id);
  }

  private messageRef(
    id: string,
  ): DocumentReference {
    return this.db
      .collection(MESSAGES_COLLECTION)
      .doc(id);
  }

  private draftRef(
    conversationId: string,
    sourceMessageId: string,
  ): DocumentReference {
    return this.db
      .collection(DRAFTS_COLLECTION)
      .doc(
        suggestedReplyDraftId(
          conversationId,
          sourceMessageId,
        ),
      );
  }
}
