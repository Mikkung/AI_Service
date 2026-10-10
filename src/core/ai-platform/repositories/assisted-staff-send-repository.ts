import type {
  Conversation,
  ConversationMessage,
} from "@/core/ai-platform/types/conversations";

import type {
  ExternalResponseChannel,
} from "@/core/ai-platform/types/channel-response";

export type AssistedStaffSendStatus =
  | "pending"
  | "uncertain"
  | "delivered";

export interface AssistedStaffSendReceipt {
  clientRequestId: string;
  conversationId: string;
  channel?: ExternalResponseChannel;
  text: string;
  textSha256: string;
  sourceMessageId?: string;
  retryKey: string;
  messageId: string;
  status: AssistedStaffSendStatus;
  createdAt: string;
  deliveredAt?: string;
  uncertainAt?: string;
  uncertaintyReason?: string;
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

export interface MarkAssistedStaffSendUncertainInput {
  clientRequestId: string;
  uncertainAt: string;
  reason: string;
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

  markSendUncertain(
    input: MarkAssistedStaffSendUncertainInput,
  ): Promise<AssistedStaffSendReceipt>;
}
