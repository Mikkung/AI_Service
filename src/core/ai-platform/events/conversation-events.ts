import type {
  HandoffReason,
} from "@/core/ai-platform/types/conversations";

export interface ConversationHandoffRequested {
  type: "conversation.handoff_requested";
  conversationId: string;
  handoffId: string;
  reason: HandoffReason;
  occurredAt: string;
}

export interface ConversationTakenOver {
  type: "conversation.taken_over";
  conversationId: string;
  handoffId: string;
  agentId: string;
  occurredAt: string;
}

export interface ConversationResolved {
  type: "conversation.resolved";
  conversationId: string;
  handoffId?: string;
  resolvedBy?: string;
  occurredAt: string;
}

export type ConversationDomainEvent =
  | ConversationHandoffRequested
  | ConversationTakenOver
  | ConversationResolved;
