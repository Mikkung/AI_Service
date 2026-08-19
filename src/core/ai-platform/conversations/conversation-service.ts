import {
  AnswerService,
} from "@/core/ai-platform/answering/answer-service";

import type {
  GroundingReason,
} from "@/core/ai-platform/answering/grounding-gate";

import {
  getChannelPolicy,
} from "@/core/ai-platform/channels/channel-policy";

import {
  assertConversationTransition,
} from "@/core/ai-platform/conversations/conversation-transitions";

import type {
  ConversationDomainEvent,
} from "@/core/ai-platform/events/conversation-events";

import type {
  ConversationRepository,
} from "@/core/ai-platform/repositories/conversation-repository";

import type {
  HandoffRepository,
} from "@/core/ai-platform/repositories/handoff-repository";

import type {
  Channel,
} from "@/core/ai-platform/types/channels";

import type {
  Conversation,
  ConversationMessage,
  HandoffReason,
  HandoffRequestedBy,
  HumanHandoff,
} from "@/core/ai-platform/types/conversations";

export interface IdGenerator {
  nextId(prefix: string): string;
}

export interface ConversationServiceDependencies {
  conversationRepository: ConversationRepository;
  handoffRepository: HandoffRepository;
  answerService: AnswerService;
  idGenerator?: IdGenerator;
  now?: () => string;
}

export interface CreateConversationInput {
  channel: Channel;
  channelUserId: string;
  metadata?: Record<string, unknown>;
}

export interface ReceiveUserMessageInput {
  conversationId: string;
  text: string;
  channelMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface RequestHumanHandoffInput {
  conversationId: string;
  requestedBy: HandoffRequestedBy;
  reason: HandoffReason;
  metadata?: Record<string, unknown>;
}

export interface TakeOverConversationInput {
  conversationId: string;
  agentId: string;
}

export interface SendHumanReplyInput {
  conversationId: string;
  agentId: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ResolveConversationInput {
  conversationId: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface ReturnConversationToAIInput {
  conversationId: string;
}

export interface OutboundConversationMessage {
  text: string;
  senderType:
    | "ai"
    | "human"
    | "system";
  citations?: ConversationMessage["citations"];
}

export interface ConversationServiceResult {
  conversation: Conversation;
  outboundMessage?: OutboundConversationMessage;
  handoff?: HumanHandoff;
  events: ConversationDomainEvent[];
}

class SequentialIdGenerator
  implements IdGenerator
{
  private next = 1;

  nextId(prefix: string): string {
    const value =
      String(this.next).padStart(
        6,
        "0",
      );
    this.next += 1;
    return `${prefix}-${value}`;
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

function mapGroundingReasonToHandoffReason(
  reason: GroundingReason,
): HandoffReason {
  if (reason === "unsupported") {
    return "knowledge_not_found";
  }

  if (reason === "missing_citation") {
    return "missing_citation";
  }

  if (reason === "provider_error") {
    return "provider_error";
  }

  return "other";
}

export class ConversationService {
  private readonly idGenerator: IdGenerator;

  private readonly now: () => string;

  constructor(
    private readonly dependencies: ConversationServiceDependencies,
  ) {
    this.idGenerator =
      dependencies.idGenerator ??
      new SequentialIdGenerator();
    this.now =
      dependencies.now ?? defaultNow;
  }

  async createConversation(
    input: CreateConversationInput,
  ): Promise<Conversation> {
    const timestamp =
      this.now();

    const policy =
      getChannelPolicy(input.channel);

    return this.dependencies
      .conversationRepository
      .createConversation({
        id:
          this.idGenerator.nextId(
            "conversation",
          ),
        channel:
          input.channel,
        channelAudience:
          policy.channelAudience,
        channelUserId:
          input.channelUserId,
        mode: "ai_active",
        createdAt:
          timestamp,
        updatedAt:
          timestamp,
        metadata:
          input.metadata,
      });
  }

  async getConversation(
    conversationId: string,
  ): Promise<Conversation | null> {
    return this.dependencies
      .conversationRepository
      .getConversation(
        conversationId,
      );
  }

  async listMessages(
    conversationId: string,
  ): Promise<ConversationMessage[]> {
    return this.dependencies
      .conversationRepository
      .listMessages(
        conversationId,
      );
  }

  async receiveUserMessage(
    input: ReceiveUserMessageInput,
  ): Promise<ConversationServiceResult> {
    const conversation =
      await this.requireConversation(
        input.conversationId,
      );

    const timestamp =
      this.now();

    await this.appendMessage({
      id:
        this.idGenerator.nextId(
          "message",
        ),
      conversationId:
        conversation.id,
      senderType: "user",
      senderId:
        conversation.channelUserId,
      text:
        input.text,
      createdAt:
        timestamp,
      channelMessageId:
        input.channelMessageId,
      metadata:
        input.metadata,
    });

    await this.dependencies
      .conversationRepository
      .updateConversation({
        id:
          conversation.id,
        updatedAt:
          timestamp,
        lastMessageAt:
          timestamp,
      });

    if (
      conversation.mode !== "ai_active"
    ) {
      const latest =
        await this.requireConversation(
          conversation.id,
        );

      return {
        conversation:
          latest,
        events: [],
      };
    }

    const policy =
      getChannelPolicy(
        conversation.channel,
      );

    const answer =
      await this.dependencies
        .answerService
        .answer({
          question:
            input.text,
          audience:
            policy.allowedKnowledgeAudience,
        });

    if (answer.safeToSend) {
      const aiMessage: ConversationMessage = {
        id:
          this.idGenerator.nextId(
            "message",
          ),
        conversationId:
          conversation.id,
        senderType: "ai",
        text:
          answer.answer,
        createdAt:
          this.now(),
        citations:
          answer.citations,
        metadata: {
          provider:
            answer.provider,
          groundingReason:
            answer.groundingReason,
        },
      };

      await this.appendMessage(
        aiMessage,
      );

      const updated =
        await this.dependencies
          .conversationRepository
          .updateConversation({
            id:
              conversation.id,
            updatedAt:
              aiMessage.createdAt,
            lastMessageAt:
              aiMessage.createdAt,
          });

      return {
        conversation:
          updated,
        outboundMessage: {
          text:
            aiMessage.text,
          senderType: "ai",
          citations:
            aiMessage.citations,
        },
        events: [],
      };
    }

    return this.requestHumanHandoff({
      conversationId:
        conversation.id,
      requestedBy: "ai",
      reason:
        mapGroundingReasonToHandoffReason(
          answer.groundingReason,
        ),
      metadata: {
        groundingReason:
          answer.groundingReason,
      },
    });
  }

  async requestHumanHandoff(
    input: RequestHumanHandoffInput,
  ): Promise<ConversationServiceResult> {
    const conversation =
      await this.requireConversation(
        input.conversationId,
      );

    const existingHandoff =
      await this.dependencies
        .handoffRepository
        .getActiveHandoff(
          conversation.id,
        );

    if (existingHandoff) {
      return {
        conversation,
        handoff:
          existingHandoff,
        events: [],
      };
    }

    assertConversationTransition({
      from:
        conversation.mode,
      to: "waiting_human",
      reason:
        input.reason,
      requestedBy:
        input.requestedBy,
    });

    const timestamp =
      this.now();

    const handoff =
      await this.dependencies
        .handoffRepository
        .createHandoff({
          id:
            this.idGenerator.nextId(
              "handoff",
            ),
          conversationId:
            conversation.id,
          reason:
            input.reason,
          status: "waiting",
          requestedAt:
            timestamp,
          requestedBy:
            input.requestedBy,
          metadata:
            input.metadata,
        });

    const updated =
      await this.dependencies
        .conversationRepository
        .updateConversation({
          id:
            conversation.id,
          mode: "waiting_human",
          updatedAt:
            timestamp,
        });

    await this.appendMessage({
      id:
        this.idGenerator.nextId(
          "message",
        ),
      conversationId:
        conversation.id,
      senderType: "system",
      text:
        "Human handoff requested.",
      createdAt:
        timestamp,
      metadata: {
        handoffId:
          handoff.id,
        reason:
          handoff.reason,
      },
    });

    return {
      conversation:
        updated,
      handoff,
      outboundMessage: {
        text:
          "Human handoff requested.",
        senderType: "system",
      },
      events: [
        {
          type:
            "conversation.handoff_requested",
          conversationId:
            conversation.id,
          handoffId:
            handoff.id,
          reason:
            handoff.reason,
          occurredAt:
            timestamp,
        },
      ],
    };
  }

  async takeOverConversation(
    input: TakeOverConversationInput,
  ): Promise<ConversationServiceResult> {
    const conversation =
      await this.requireConversation(
        input.conversationId,
      );

    const handoff =
      await this.requireActiveHandoff(
        conversation.id,
      );

    if (
      conversation.mode !==
      "waiting_human"
    ) {
      throw new Error(
        "Conversation must be waiting for human takeover",
      );
    }

    if (
      handoff.status !== "waiting" ||
      handoff.assignedAgentId
    ) {
      throw new Error(
        "Handoff is not available for takeover",
      );
    }

    assertConversationTransition({
      from:
        conversation.mode,
      to: "human_active",
    });

    const timestamp =
      this.now();

    const updatedHandoff =
      await this.dependencies
        .handoffRepository
        .updateHandoff({
          id:
            handoff.id,
          status: "active",
          assignedAgentId:
            input.agentId,
          takenAt:
            timestamp,
        });

    const updatedConversation =
      await this.dependencies
        .conversationRepository
        .updateConversation({
          id:
            conversation.id,
          mode: "human_active",
          assignedAgentId:
            input.agentId,
          updatedAt:
            timestamp,
        });

    return {
      conversation:
        updatedConversation,
      handoff:
        updatedHandoff,
      events: [
        {
          type:
            "conversation.taken_over",
          conversationId:
            conversation.id,
          handoffId:
            handoff.id,
          agentId:
            input.agentId,
          occurredAt:
            timestamp,
        },
      ],
    };
  }

  async sendHumanReply(
    input: SendHumanReplyInput,
  ): Promise<ConversationServiceResult> {
    const conversation =
      await this.requireConversation(
        input.conversationId,
      );

    if (
      conversation.mode !==
      "human_active"
    ) {
      throw new Error(
        "Conversation is not owned by a human agent",
      );
    }

    if (
      conversation.assignedAgentId !==
      input.agentId
    ) {
      throw new Error(
        "Human reply agent does not own this conversation",
      );
    }

    const timestamp =
      this.now();

    const message: ConversationMessage = {
      id:
        this.idGenerator.nextId(
          "message",
        ),
      conversationId:
        conversation.id,
      senderType: "human",
      senderId:
        input.agentId,
      text:
        input.text,
      createdAt:
        timestamp,
      metadata:
        input.metadata,
    };

    await this.appendMessage(message);

    const updated =
      await this.dependencies
        .conversationRepository
        .updateConversation({
          id:
            conversation.id,
          updatedAt:
            timestamp,
          lastMessageAt:
            timestamp,
        });

    return {
      conversation:
        updated,
      outboundMessage: {
        text:
          message.text,
        senderType: "human",
      },
      events: [],
    };
  }

  async resolveConversation(
    input: ResolveConversationInput,
  ): Promise<ConversationServiceResult> {
    const conversation =
      await this.requireConversation(
        input.conversationId,
      );

    if (
      conversation.mode !==
        "human_active" &&
      conversation.mode !==
        "waiting_human"
    ) {
      throw new Error(
        "Only human handoff conversations can be resolved",
      );
    }

    assertConversationTransition({
      from:
        conversation.mode,
      to: "resolved",
    });

    const timestamp =
      this.now();

    const handoff =
      await this.dependencies
        .handoffRepository
        .getActiveHandoff(
          conversation.id,
        );

    const updatedHandoff =
      handoff
        ? await this.dependencies
            .handoffRepository
            .updateHandoff({
              id:
                handoff.id,
              status: "resolved",
              resolvedAt:
                timestamp,
              resolutionNote:
                input.resolutionNote,
            })
        : undefined;

    const updatedConversation =
      await this.dependencies
        .conversationRepository
        .updateConversation({
          id:
            conversation.id,
          mode: "resolved",
          clearAssignedAgentId:
            true,
          updatedAt:
            timestamp,
        });

    return {
      conversation:
        updatedConversation,
      handoff:
        updatedHandoff,
      events: [
        {
          type:
            "conversation.resolved",
          conversationId:
            conversation.id,
          handoffId:
            handoff?.id,
          resolvedBy:
            input.resolvedBy,
          occurredAt:
            timestamp,
        },
      ],
    };
  }

  async returnConversationToAI(
    input: ReturnConversationToAIInput,
  ): Promise<ConversationServiceResult> {
    const conversation =
      await this.requireConversation(
        input.conversationId,
      );

    assertConversationTransition({
      from:
        conversation.mode,
      to: "ai_active",
    });

    const timestamp =
      this.now();

    const updated =
      await this.dependencies
        .conversationRepository
        .updateConversation({
          id:
            conversation.id,
          mode: "ai_active",
          clearAssignedAgentId:
            true,
          updatedAt:
            timestamp,
        });

    return {
      conversation:
        updated,
      events: [],
    };
  }

  private async requireConversation(
    conversationId: string,
  ): Promise<Conversation> {
    const conversation =
      await this.dependencies
        .conversationRepository
        .getConversation(
          conversationId,
        );

    if (!conversation) {
      throw new Error(
        `Conversation not found: ${conversationId}`,
      );
    }

    return conversation;
  }

  private async requireActiveHandoff(
    conversationId: string,
  ): Promise<HumanHandoff> {
    const handoff =
      await this.dependencies
        .handoffRepository
        .getActiveHandoff(
          conversationId,
        );

    if (!handoff) {
      throw new Error(
        `Active handoff not found for conversation: ${conversationId}`,
      );
    }

    return handoff;
  }

  private async appendMessage(
    message: ConversationMessage,
  ): Promise<void> {
    await this.dependencies
      .conversationRepository
      .appendMessage(message);
  }
}
