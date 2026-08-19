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

export class InMemoryConversationRepository
  implements ConversationRepository
{
  private readonly conversations =
    new Map<string, Conversation>();

  private readonly messages =
    new Map<
      string,
      ConversationMessage[]
    >();

  async createConversation(
    input: CreateConversationInput,
  ): Promise<Conversation> {
    if (
      this.conversations.has(input.id)
    ) {
      throw new Error(
        `Conversation already exists: ${input.id}`,
      );
    }

    const conversation: Conversation = {
      ...input,
    };

    this.conversations.set(
      input.id,
      cloneConversation(
        conversation,
      ),
    );

    return cloneConversation(
      conversation,
    );
  }

  async getConversation(
    id: string,
  ): Promise<Conversation | null> {
    const conversation =
      this.conversations.get(id);

    return conversation
      ? cloneConversation(conversation)
      : null;
  }

  async updateConversation(
    input: UpdateConversationInput,
  ): Promise<Conversation> {
    const existing =
      this.conversations.get(input.id);

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

    this.conversations.set(
      input.id,
      cloneConversation(updated),
    );

    return cloneConversation(updated);
  }

  async listConversations(
    filter: ListConversationsFilter = {},
  ): Promise<Conversation[]> {
    return [
      ...this.conversations.values(),
    ]
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
      .sort((left, right) =>
        left.createdAt.localeCompare(
          right.createdAt,
        ),
      )
      .map(cloneConversation);
  }

  async appendMessage(
    message: ConversationMessage,
  ): Promise<void> {
    const existing =
      this.messages.get(
        message.conversationId,
      ) ?? [];

    this.messages.set(
      message.conversationId,
      [
        ...existing,
        cloneMessage(message),
      ],
    );
  }

  async listMessages(
    conversationId: string,
  ): Promise<ConversationMessage[]> {
    return (
      this.messages.get(
        conversationId,
      ) ?? []
    )
      .slice()
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
