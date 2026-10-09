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

import {
  getConversationContextText,
} from "@/core/ai-platform/conversations/conversation-context";

import type {
  ConversationService,
} from "@/core/ai-platform/conversations/conversation-service";

import type {
  LineReplyClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

import {
  LineMediaBlockedError,
  LineMediaUnavailableError,
  type LineMediaClient,
} from "@/core/ai-platform/integrations/line/line-media-client";

import type {
  ImageUnderstandingProvider,
} from "@/core/ai-platform/media/image-understanding-provider";

import {
  sanitizeImageUnderstandingResult,
} from "@/core/ai-platform/media/media-privacy-policy";

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

import type {
  MessageAttachment,
} from "@/core/ai-platform/types/media";

export interface LineTextInboundEvent {
  channelAccountId: string;
  channelUserId: string;
  channelMessageId: string;
  lineMessageId: string;
  replyToken: string;
  text: string;
}

export interface LineImageInboundEvent {
  channelAccountId: string;
  channelUserId: string;
  channelMessageId: string;
  lineMessageId: string;
  replyToken: string;
  contentProviderType: string;
}

export interface LineTextInboundResult {
  conversationId: string;
  responseMode: ResponseMode;
  duplicate: boolean;
  draftStatus?: "ready" | "failed";
  replied: boolean;
  replyFailed?: boolean;
  deferredForImageContext?: boolean;
}

export interface LineImageInboundResult {
  conversationId: string;
  responseMode: ResponseMode;
  duplicate: boolean;
  analysisStatus:
    MessageAttachment["analysisStatus"];
  replied: false;
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
  mediaClient: LineMediaClient;
  imageUnderstandingProvider: ImageUnderstandingProvider;
  now?: () => string;
  nextId?: (prefix: string) => string;
  wait?: (durationMs: number) => Promise<void>;
  imageContextWaitTimeoutMs?: number;
  imageContextPollIntervalMs?: number;
}

const DEFAULT_IMAGE_CONTEXT_WAIT_TIMEOUT_MS =
  8_000;
const DEFAULT_IMAGE_CONTEXT_POLL_INTERVAL_MS =
  200;

export class LineMessageService {
  private readonly now: () => string;

  private readonly nextId: (
    prefix: string,
  ) => string;

  private readonly wait: (
    durationMs: number,
  ) => Promise<void>;

  private readonly imageContextWaitAttempts: number;

  private readonly imageContextPollIntervalMs: number;

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
    this.wait =
      dependencies.wait ??
      ((durationMs) =>
        new Promise((resolve) => {
          setTimeout(resolve, durationMs);
        }));
    this.imageContextPollIntervalMs =
      Math.max(
        1,
        dependencies
          .imageContextPollIntervalMs ??
          DEFAULT_IMAGE_CONTEXT_POLL_INTERVAL_MS,
      );
    this.imageContextWaitAttempts =
      Math.max(
        1,
        Math.ceil(
          (dependencies
            .imageContextWaitTimeoutMs ??
            DEFAULT_IMAGE_CONTEXT_WAIT_TIMEOUT_MS) /
            this.imageContextPollIntervalMs,
        ),
      );
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

    if (
      decision.generateAi &&
      conversation.mode ===
        "ai_active" &&
      !(await this.waitForLatestImageAnalysis(
        conversation.id,
      ))
    ) {
      return this.deferTextForImageContext(
        conversation,
        event,
        effectiveConfig.responseMode,
        decision.persistAsDraft,
      );
    }

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

  async processImageEvent(
    event: LineImageInboundEvent,
  ): Promise<LineImageInboundResult> {
    const effectiveConfig =
      await this.dependencies
        .configService
        .resolveResponseMode(
          "line",
          event.channelAccountId,
        );
    const responseMode =
      effectiveConfig.responseMode;
    const conversation =
      await this.resolveConversation(event);
    const shouldAnalyze =
      responseMode !== "off" &&
      conversation.mode ===
        "ai_active" &&
      event.contentProviderType ===
        "line";
    const attachment: MessageAttachment = {
      id:
        `attachment-${event.lineMessageId}`,
      type: "image",
      source: "line",
      sourceMediaId:
        event.lineMessageId,
      analysisStatus:
        event.contentProviderType !==
          "line"
          ? "blocked"
          : shouldAnalyze
            ? "processing"
            : "not_requested",
      requiresHumanReview:
        event.contentProviderType !==
          "line"
          ? true
          : undefined,
    };
    const timestamp = this.now();
    const message: ConversationMessage = {
      id: this.nextId("message"),
      conversationId:
        conversation.id,
      senderType: "user",
      senderId:
        event.channelUserId,
      text: "[User sent an image]",
      createdAt: timestamp,
      channelMessageId:
        event.channelMessageId,
      attachments: [attachment],
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
            shouldAnalyze
              ? responseMode === "auto"
                ? "auto"
                : "draft"
              : "off",
        });

    if (!appendResult.shouldProcess) {
      return {
        conversationId:
          conversation.id,
        responseMode,
        duplicate:
          !appendResult.appended,
        analysisStatus:
          attachment.analysisStatus,
        replied: false,
      };
    }

    if (!appendResult.processingToken) {
      throw new ConversationInvariantError(
        "Image inbound processing is missing ownership",
      );
    }

    return this.analyzeImage(
      event,
      conversation.id,
      attachment,
      appendResult.processingToken,
      responseMode,
    );
  }

  private async resolveConversation(
    event:
      | LineTextInboundEvent
      | LineImageInboundEvent,
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

  private async analyzeImage(
    event: LineImageInboundEvent,
    conversationId: string,
    attachment: MessageAttachment,
    processingToken: string,
    responseMode: ResponseMode,
  ): Promise<LineImageInboundResult> {
    let completedAttachment:
      MessageAttachment;
    let completionOutcome: string;

    try {
      const content =
        await this.dependencies
          .mediaClient
          .getImageContent(
            event.lineMessageId,
          );
      const result =
        sanitizeImageUnderstandingResult(
          await this.dependencies
            .imageUnderstandingProvider
            .analyze({
              bytes: content.bytes,
              contentType:
                content.contentType,
              purpose:
                "conversation_context",
            }),
        );
      const blocked =
        result.safeContextText.length ===
        0;
      completedAttachment = {
        ...attachment,
        contentType:
          content.contentType,
        analysisStatus:
          blocked
            ? "blocked"
            : "ready",
        safeContextText:
          blocked
            ? undefined
            : result.safeContextText,
        category: result.category,
        sensitivity:
          result.sensitivity,
        requiresHumanReview:
          result.requiresHumanReview,
        metadata: {
          provider: result.provider,
          model: result.model,
          detectedLanguage:
            result.detectedLanguage,
        },
      };
      completionOutcome = blocked
        ? "image_analysis_blocked"
        : "image_analysis_ready";
    } catch (error) {
      const blocked =
        error instanceof
        LineMediaBlockedError;
      completedAttachment = {
        ...attachment,
        analysisStatus:
          blocked
            ? "blocked"
            : "failed",
        requiresHumanReview: true,
        metadata: {
          failureCode:
            error instanceof
            LineMediaUnavailableError
              ? "line_media_unavailable"
              : blocked
                ? "media_blocked"
                : "vision_failed",
        },
      };
      completionOutcome = blocked
        ? "image_analysis_blocked"
        : "image_analysis_failed";
    }

    const completed =
      await this.dependencies
        .conversationWorkflowRepository
        .completeImageAnalysisIfOwned({
          conversationId,
          channelMessageId:
            event.channelMessageId,
          processingToken,
          attachment:
            completedAttachment,
          completedAt: this.now(),
          completionOutcome,
        });

    if (!completed) {
      throw new ConversationInvariantError(
        "Image processing ownership was lost",
      );
    }

    return {
      conversationId,
      responseMode,
      duplicate: false,
      analysisStatus:
        completedAttachment.analysisStatus,
      replied: false,
    };
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

  private async waitForLatestImageAnalysis(
    conversationId: string,
  ): Promise<boolean> {
    for (
      let attempt = 0;
      attempt <=
      this.imageContextWaitAttempts;
      attempt += 1
    ) {
      const messages =
        await this.dependencies
          .conversationRepository
          .listMessages(conversationId);
      const latestImageMessage =
        [...messages]
          .reverse()
          .find(
            (message) =>
              message.senderType ===
                "user" &&
              message.attachments?.some(
                (attachment) =>
                  attachment.type ===
                  "image",
              ),
          );
      const latestImageIsProcessing =
        latestImageMessage?.attachments?.some(
          (attachment) =>
            attachment.type === "image" &&
            attachment.analysisStatus ===
              "processing",
        ) ?? false;

      if (!latestImageIsProcessing) {
        return true;
      }

      if (
        attempt ===
        this.imageContextWaitAttempts
      ) {
        return false;
      }

      await this.wait(
        this.imageContextPollIntervalMs,
      );
    }

    return false;
  }

  private async deferTextForImageContext(
    conversation: Conversation,
    event: LineTextInboundEvent,
    responseMode: ResponseMode,
    persistAsDraft: boolean,
  ): Promise<LineTextInboundResult> {
    const timestamp = this.now();
    const appendResult =
      await this.dependencies
        .conversationWorkflowRepository
        .appendUserMessage({
          conversationId:
            conversation.id,
          message: {
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
          },
          updatedAt: timestamp,
          processingDisposition:
            persistAsDraft
              ? "draft"
              : "auto",
        });

    return {
      conversationId:
        conversation.id,
      responseMode,
      duplicate:
        !appendResult.appended,
      replied: false,
      deferredForImageContext:
        appendResult.shouldProcess
          ? true
          : undefined,
    };
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
        text:
          getConversationContextText(
            message,
          ),
      }));
  }
}
