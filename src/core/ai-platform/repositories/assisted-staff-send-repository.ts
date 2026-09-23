import type {
  Conversation,
  ConversationMessage,
} from "@/core/ai-platform/types/conversations";

export type AssistedStaffSendStatus =
  | "pending"
  | "delivered";

export interface AssistedStaffSendReceipt {
  clientRequestId: string;
  conversationId: string;
  text: string;
  textSha256: string;
  sourceMessageId?: string;
  retryKey: string;
  messageId: string;
  status: AssistedStaffSendStatus;
  createdAt: string;
  deliveredAt?: string;
}

export interface PrepareAssistedStaffSendInput {
  clientRequestId: string;
  conversationId: string;
  text: string;
  sourceMessageId?: string;
  createdAt: string;
}

export interface CompleteAssistedStaffSendInput {
  clientRequestId: string;
  deliveredAt: string;
  staffId: string;
}

export interface CompleteAssistedStaffSendResult {
  receipt: AssistedStaffSendReceipt;
  conversation: Conversation;
  message: ConversationMessage;
  newlyCompleted: boolean;
}

export class AssistedStaffSendConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "AssistedStaffSendConflictError";
  }
}

export class AssistedStaffSendInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "AssistedStaffSendInvariantError";
  }
}

export interface AssistedStaffSendRepository {
  prepareSend(
    input: PrepareAssistedStaffSendInput,
  ): Promise<AssistedStaffSendReceipt>;

  completeDeliveredSend(
    input: CompleteAssistedStaffSendInput,
  ): Promise<CompleteAssistedStaffSendResult>;
}
