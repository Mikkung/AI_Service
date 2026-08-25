import {
  randomUUID,
} from "node:crypto";

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
  ConversationWorkflowRepository,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";

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
  conversationWorkflowRepository?: ConversationWorkflowRepository;
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

export class SequentialIdGenerator
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

export class RandomUuidIdGenerator
  implements IdGenerator
{
  nextId(prefix: string): string {
    return `${prefix}-${randomUUID()}`;
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
      new RandomUuidIdGenerator();
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
    const timestamp =
      this.now();
    const initialConversation =
      await this.requireConversation(
        input.conversationId,
      );
    const userMessage: ConversationMessage = {
      id:
        this.idGenerator.nextId(
          "message",
        ),
      conversationId:
        initialConversation.id,
      senderType: "user",
      senderId:
        initialConversation.channelUserId,
      text:
        input.text,
      createdAt:
        timestamp,
      channelMessageId:
        input.channelMessageId,
      metadata:
        input.metadata,
    };

    const conversation =
      this.dependencies
        .conversationWorkflowRepository
        ? await this.dependencies
            .conversationWorkflowRepository
            .appendUserMessage({
              conversationId:
                initialConversation.id,
              message:
                userMessage,
              updatedAt:
                timestamp,
            })
        : await this.appendUserMessageWithoutWorkflow(
            userMessage,
            timestamp,
          );

    if (conversation.mode !== "ai_active") {
      return {
        conversation:
          conversation,
        events: [],
      };
    }

    const policy =
      getChannelPolicy(
        conversation.channel,
      );
    const conversationContext =
      await this.buildConversationContext(
        conversation.id,
        userMessage.id,
      );

    const answer =
      await this.dependencies
        .answerService
        .answer({
          question:
            input.text,
          audience:
            policy.allowedKnowledgeAudience,
          conversationContext,
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

      const result =
        this.dependencies
          .conversationWorkflowRepository
          ? await this.dependencies
              .conversationWorkflowRepository
              .persistAiMessageIfActive({
                conversationId:
                  conversation.id,
                message:
                  aiMessage,
                updatedAt:
                  aiMessage.createdAt,
              })
          : {
              conversation:
                await this.persistAiMessageWithoutWorkflow(
                  aiMessage,
                ),
              persisted: true,
            };

      if (!result.persisted) {
        return {
          conversation:
            result.conversation,
          events: [],
        };
      }

      return {
        conversation:
          result.conversation,
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
    if (
      this.dependencies
        .conversationWorkflowRepository
    ) {
      const existingConversation =
        await this.requireConversation(
          input.conversationId,
        );
      const timestamp =
        this.now();
      const handoff: HumanHandoff = {
        id:
          this.idGenerator.nextId(
            "handoff",
          ),
        conversationId:
          existingConversation.id,
        reason:
          input.reason,
        status: "waiting",
        requestedAt:
          timestamp,
        requestedBy:
          input.requestedBy,
        metadata:
          input.metadata,
      };
      const systemMessage: ConversationMessage =
        {
          id:
            this.idGenerator.nextId(
              "message",
            ),
          conversationId:
            existingConversation.id,
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
        };
      const result =
        await this.dependencies
          .conversationWorkflowRepository
          .requestHumanHandoff({
            conversationId:
              existingConversation.id,
            handoff,
            systemMessage,
            updatedAt:
              timestamp,
          });

      return {
        conversation:
          result.conversation,
        handoff:
          result.handoff,
        outboundMessage:
          result.created
            ? {
                text:
                  systemMessage.text,
                senderType: "system",
              }
            : undefined,
        events:
          result.created
            ? [
                {
                  type:
                    "conversation.handoff_requested",
                  conversationId:
                    result.conversation
                      .id,
                  handoffId:
                    result.handoff.id,
                  reason:
                    result.handoff
                      .reason,
                  occurredAt:
                    timestamp,
                },
              ]
            : [],
      };
    }

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
    if (
      this.dependencies
        .conversationWorkflowRepository
    ) {
      const timestamp =
        this.now();
      const result =
        await this.dependencies
          .conversationWorkflowRepository
          .takeOverConversation({
            conversationId:
              input.conversationId,
            agentId:
              input.agentId,
            takenAt:
              timestamp,
          });

      return {
        conversation:
          result.conversation,
        handoff:
          result.handoff,
        events: [
          {
            type:
              "conversation.taken_over",
            conversationId:
              result.conversation.id,
            handoffId:
              result.handoff.id,
            agentId:
              input.agentId,
            occurredAt:
              timestamp,
          },
        ],
      };
    }

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
    if (
      this.dependencies
        .conversationWorkflowRepository
    ) {
      const timestamp =
        this.now();
      const message: ConversationMessage = {
        id:
          this.idGenerator.nextId(
            "message",
          ),
        conversationId:
          input.conversationId,
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
      const conversation =
        await this.dependencies
          .conversationWorkflowRepository
          .persistHumanMessageIfOwned({
            conversationId:
              input.conversationId,
            agentId:
              input.agentId,
            message,
            updatedAt:
              timestamp,
          });

      return {
        conversation,
        outboundMessage: {
          text:
            message.text,
          senderType: "human",
        },
        events: [],
      };
    }

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
    if (
      this.dependencies
        .conversationWorkflowRepository
    ) {
      const timestamp =
        this.now();
      const result =
        await this.dependencies
          .conversationWorkflowRepository
          .resolveConversation({
            conversationId:
              input.conversationId,
            resolvedAt:
              timestamp,
            resolutionNote:
              input.resolutionNote,
          });

      return {
        conversation:
          result.conversation,
        handoff:
          result.handoff,
        events: [
          {
            type:
              "conversation.resolved",
            conversationId:
              result.conversation.id,
            handoffId:
              result.handoff.id,
            resolvedBy:
              input.resolvedBy,
            occurredAt:
              timestamp,
          },
        ],
      };
    }

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
    if (
      this.dependencies
        .conversationWorkflowRepository
    ) {
      const updated =
        await this.dependencies
          .conversationWorkflowRepository
          .returnConversationToAI({
            conversationId:
              input.conversationId,
            updatedAt:
              this.now(),
          });

      return {
        conversation:
          updated,
        events: [],
      };
    }

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

  private async appendUserMessageWithoutWorkflow(
    message: ConversationMessage,
    timestamp: string,
  ): Promise<Conversation> {
    await this.appendMessage(message);

    return this.dependencies
      .conversationRepository
      .updateConversation({
        id:
          message.conversationId,
        updatedAt:
          timestamp,
        lastMessageAt:
          timestamp,
      });
  }

  private async persistAiMessageWithoutWorkflow(
    message: ConversationMessage,
  ): Promise<Conversation> {
    await this.appendMessage(message);

    return this.dependencies
      .conversationRepository
      .updateConversation({
        id:
          message.conversationId,
        updatedAt:
          message.createdAt,
        lastMessageAt:
          message.createdAt,
      });
  }

  private async buildConversationContext(
    conversationId: string,
    currentUserMessageId: string,
  ) {
    const messages =
      await this.dependencies
        .conversationRepository
        .listMessages(conversationId);

    return messages
      .filter(
        (message) =>
          message.id !==
            currentUserMessageId &&
          message.senderType !==
            "system",
      )
      .map((message) => ({
        role:
          message.senderType === "user"
            ? ("user" as const)
            : ("assistant" as const),
        text:
          message.text,
      }))
      .filter(
        (message) =>
          message.text.trim().length > 0,
      )
      .slice(-10);
  }

  private async appendMessage(
    message: ConversationMessage,
  ): Promise<void> {
    await this.dependencies
      .conversationRepository
      .appendMessage(message);
  }
}
