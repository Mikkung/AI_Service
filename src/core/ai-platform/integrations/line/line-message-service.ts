import {
  randomUUID,
} from "node:crypto";

import type {
  AnswerService,
} from "@/core/ai-platform/answering/answer-service";

import type {
  ChannelResponseConfigService,
} from "@/core/ai-platform/channels/channel-response-config-service";

import {
  getResponseModeDecision,
} from "@/core/ai-platform/channels/response-mode-policy";

import type {
  ConversationService,
} from "@/core/ai-platform/conversations/conversation-service";

import type {
  LineReplyClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

import type {
  ConversationRepository,
} from "@/core/ai-platform/repositories/conversation-repository";

import {
  ConversationInvariantError,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";

import type {
  ConversationWorkflowRepository,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";

import type {
  SuggestedReplyDraftRepository,
} from "@/core/ai-platform/repositories/suggested-reply-draft-repository";

import type {
  ResponseMode,
} from "@/core/ai-platform/types/channel-response";

import type {
  Conversation,
  ConversationMessage,
} from "@/core/ai-platform/types/conversations";

export interface LineTextInboundEvent {
  channelAccountId: string;
  channelUserId: string;
  channelMessageId: string;
  lineMessageId: string;
  replyToken: string;
  text: string;
}

export interface LineTextInboundResult {
  conversationId: string;
  responseMode: ResponseMode;
  duplicate: boolean;
  draftStatus?: "ready" | "failed";
  replied: boolean;
  replyFailed?: boolean;
}

export interface LineMessageServiceDependencies {
  configService: Pick<
    ChannelResponseConfigService,
    "resolveResponseMode"
  >;
  conversationService: ConversationService;
  conversationRepository: ConversationRepository;
  conversationWorkflowRepository: ConversationWorkflowRepository;
  answerService: AnswerService;
  draftRepository: SuggestedReplyDraftRepository;
  replyClient: LineReplyClient;
  now?: () => string;
  nextId?: (prefix: string) => string;
}

export class LineMessageService {
  private readonly now: () => string;

  private readonly nextId: (
    prefix: string,
  ) => string;

  constructor(
    private readonly dependencies: LineMessageServiceDependencies,
  ) {
    this.now =
      dependencies.now ??
      (() => new Date().toISOString());
    this.nextId =
      dependencies.nextId ??
      ((prefix) =>
        `${prefix}-${randomUUID()}`);
  }

  async processTextEvent(
    event: LineTextInboundEvent,
  ): Promise<LineTextInboundResult> {
    const effectiveConfig =
      await this.dependencies
        .configService
        .resolveResponseMode(
          "line",
          event.channelAccountId,
        );
    const decision =
      getResponseModeDecision(
        effectiveConfig.responseMode,
      );
    const conversation =
      await this.resolveConversation(event);

    if (decision.autoSend) {
      return this.processAuto(
        conversation,
        event,
        effectiveConfig.responseMode,
      );
    }

    return this.processWithoutAutoSend(
      conversation,
      event,
      effectiveConfig.responseMode,
      decision.persistAsDraft,
    );
  }

  private async resolveConversation(
    event: LineTextInboundEvent,
  ): Promise<Conversation> {
    const existing =
      await this.dependencies
        .conversationRepository
        .findActiveConversation(
          "line",
          event.channelUserId,
          event.channelAccountId,
        );

    if (existing) {
      return existing;
    }

    return this.dependencies
      .conversationService
      .createConversation({
        channel: "line",
        channelAccountId:
          event.channelAccountId,
        channelUserId:
          event.channelUserId,
        metadata: {
          channelAccountId:
            event.channelAccountId,
        },
      });
  }

  private async processAuto(
    conversation: Conversation,
    event: LineTextInboundEvent,
    responseMode: ResponseMode,
  ): Promise<LineTextInboundResult> {
    const result =
      await this.dependencies
        .conversationService
        .receiveUserMessage({
          conversationId:
            conversation.id,
          text: event.text,
          channelMessageId:
            event.channelMessageId,
          metadata: {
            lineMessageId:
              event.lineMessageId,
            channelAccountId:
              event.channelAccountId,
          },
        });

    if (
      result.duplicateInbound ||
      result.outboundMessage
        ?.senderType !== "ai"
    ) {
      return {
        conversationId:
          conversation.id,
        responseMode,
        duplicate:
          result.duplicateInbound ??
          false,
        replied: false,
      };
    }

    try {
      await this.dependencies
        .replyClient
        .replyText(
          event.replyToken,
          result.outboundMessage.text,
        );

      return {
        conversationId:
          conversation.id,
        responseMode,
        duplicate: false,
        replied: true,
      };
    } catch {
      console.error(
        "LINE reply delivery failed",
        {
          conversationId:
            conversation.id,
          channelMessageId:
            event.channelMessageId,
        },
      );

      return {
        conversationId:
          conversation.id,
        responseMode,
        duplicate: false,
        replied: false,
        replyFailed: true,
      };
    }
  }

  private async processWithoutAutoSend(
    conversation: Conversation,
    event: LineTextInboundEvent,
    responseMode: ResponseMode,
    persistAsDraft: boolean,
  ): Promise<LineTextInboundResult> {
    const timestamp = this.now();
    const message: ConversationMessage = {
      id: this.nextId("message"),
      conversationId:
        conversation.id,
      senderType: "user",
      senderId:
        event.channelUserId,
      text: event.text,
      createdAt: timestamp,
      channelMessageId:
        event.channelMessageId,
      metadata: {
        lineMessageId:
          event.lineMessageId,
        channelAccountId:
          event.channelAccountId,
      },
    };
    const appendResult =
      await this.dependencies
        .conversationWorkflowRepository
        .appendUserMessage({
          conversationId:
            conversation.id,
          message,
          updatedAt: timestamp,
          processingDisposition:
            persistAsDraft
              ? "draft"
              : "off",
        });

    if (!appendResult.shouldProcess) {
      return {
        conversationId:
          conversation.id,
        responseMode,
        duplicate:
          !appendResult.appended,
        replied: false,
      };
    }

    if (
      !persistAsDraft ||
      !appendResult.processingToken
    ) {
      throw new ConversationInvariantError(
        "Draft inbound processing is missing ownership",
      );
    }

    const sourceMessage: ConversationMessage = {
      ...message,
      id: appendResult.messageId,
    };

    return this.generateDraft(
      appendResult.conversation,
      sourceMessage,
      event,
      appendResult.processingToken,
      responseMode,
    );
  }

  private async generateDraft(
    conversation: Conversation,
    sourceMessage: ConversationMessage,
    event: LineTextInboundEvent,
    processingToken: string,
    responseMode: ResponseMode,
  ): Promise<LineTextInboundResult> {
    const conversationContext =
      await this.buildConversationContext(
        conversation.id,
        sourceMessage.id,
      );
    let draftStatus:
      | "ready"
      | "failed" = "failed";
    let draftText = "";
    let provider: string | undefined;
    let citations:
      | Awaited<
          ReturnType<
            AnswerService["answer"]
          >
        >["citations"]
      | undefined;
    let metadata: Record<
      string,
      unknown
    > = {
      groundingReason:
        "provider_error",
    };

    try {
      const answer =
        await this.dependencies
          .answerService
          .answer({
            question:
              sourceMessage.text,
            audience: "public",
            conversationContext,
          });

      provider = answer.provider;
      citations = answer.citations;
      metadata = {
        groundingReason:
          answer.groundingReason,
      };

      if (answer.safeToSend) {
        draftStatus = "ready";
        draftText = answer.answer;
      }
    } catch {
      metadata = {
        groundingReason:
          "provider_error",
      };
    }

    const completedAt = this.now();

    await this.dependencies
      .draftRepository
      .saveDraft({
        conversationId:
          conversation.id,
        sourceMessageId:
          sourceMessage.id,
        text: draftText,
        status: draftStatus,
        createdAt: completedAt,
        updatedAt: completedAt,
        provider,
        citations,
        metadata,
      });

    const completed =
      await this.dependencies
        .conversationWorkflowRepository
        .completeInboundProcessingIfOwned(
          {
            conversationId:
              conversation.id,
            channelMessageId:
              event.channelMessageId,
            processingToken,
            completedAt,
            completionOutcome:
              draftStatus === "ready"
                ? "suggested_reply_draft_ready"
                : "suggested_reply_draft_failed",
          },
        );

    if (!completed) {
      throw new ConversationInvariantError(
        "Draft inbound processing ownership was lost",
      );
    }

    return {
      conversationId:
        conversation.id,
      responseMode,
      duplicate: false,
      draftStatus,
      replied: false,
    };
  }

  private async buildConversationContext(
    conversationId: string,
    excludedMessageId: string,
  ) {
    const messages =
      await this.dependencies
        .conversationRepository
        .listMessages(conversationId);

    return messages
      .filter(
        (message) =>
          message.id !==
            excludedMessageId &&
          (message.senderType ===
            "user" ||
            message.senderType ===
              "ai" ||
            message.senderType ===
              "human"),
      )
      .slice(-10)
      .map((message) => ({
        role:
          message.senderType ===
          "user"
            ? ("user" as const)
            : ("assistant" as const),
        text: message.text,
      }));
  }
}
