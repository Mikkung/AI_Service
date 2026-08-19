import type {
  Channel,
  ChannelAudience,
} from "@/core/ai-platform/types/channels";

import type {
  Conversation,
  ConversationMessage,
  ConversationMode,
} from "@/core/ai-platform/types/conversations";

export interface CreateConversationInput {
  id: string;
  channel: Channel;
  channelAudience: ChannelAudience;
  channelUserId: string;
  mode: ConversationMode;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateConversationInput {
  id: string;
  mode?: ConversationMode;
  assignedAgentId?: string;
  clearAssignedAgentId?: boolean;
  updatedAt: string;
  lastMessageAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ListConversationsFilter {
  channel?: Channel;
  mode?: ConversationMode;
  assignedAgentId?: string;
}

export interface ConversationRepository {
  createConversation(
    input: CreateConversationInput,
  ): Promise<Conversation>;

  getConversation(
    id: string,
  ): Promise<Conversation | null>;

  updateConversation(
    input: UpdateConversationInput,
  ): Promise<Conversation>;

  listConversations(
    filter?: ListConversationsFilter,
  ): Promise<Conversation[]>;

  appendMessage(
    message: ConversationMessage,
  ): Promise<void>;

  listMessages(
    conversationId: string,
  ): Promise<ConversationMessage[]>;
}
