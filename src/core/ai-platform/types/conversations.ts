import type {
  ChannelAudience,
  Channel,
} from "@/core/ai-platform/types/channels";

import type {
  Citation,
} from "@/core/ai-platform/types/citations";

export type ConversationMode =
  | "ai_active"
  | "waiting_human"
  | "human_active"
  | "resolved";

export type MessageSenderType =
  | "user"
  | "ai"
  | "human"
  | "system";

export type HandoffReason =
  | "user_requested_human"
  | "knowledge_not_found"
  | "missing_citation"
  | "provider_error"
  | "low_confidence"
  | "safety_escalation"
  | "staff_requested"
  | "other";

export type HandoffStatus =
  | "waiting"
  | "active"
  | "resolved"
  | "cancelled";

export type HandoffRequestedBy =
  | "user"
  | "ai"
  | "staff"
  | "system";

export interface Conversation {
  id: string;
  channel: Channel;
  channelAudience: ChannelAudience;
  channelUserId: string;
  mode: ConversationMode;
  assignedAgentId?: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId?: string;
  text: string;
  createdAt: string;
  channelMessageId?: string;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
}

export interface HumanHandoff {
  id: string;
  conversationId: string;
  reason: HandoffReason;
  status: HandoffStatus;
  requestedAt: string;
  requestedBy: HandoffRequestedBy;
  assignedAgentId?: string;
  takenAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationParticipant {
  id: string;
  displayName?: string;
  role: "user" | "assistant" | "staff";
}

export interface ConversationRecord {
  id: string;
  channel: Channel;
  mode: ConversationMode;
  participants: ConversationParticipant[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationTransition {
  from: ConversationMode;
  to: ConversationMode;
  reason?: string;
  requestedBy?: string;
}

export interface KnowledgeCandidateSignal {
  conversationId: string;
  messageId: string;
  suggestedByAgentId: string;
}
