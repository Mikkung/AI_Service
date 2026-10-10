import { randomUUID } from "node:crypto";

import type { AnswerService } from "@/core/ai-platform/answering/answer-service";
import type { ChannelResponseConfigService } from "@/core/ai-platform/channels/channel-response-config-service";
import { getResponseModeDecision } from "@/core/ai-platform/channels/response-mode-policy";
import { getConversationContextText } from "@/core/ai-platform/conversations/conversation-context";
import type { ConversationService } from "@/core/ai-platform/conversations/conversation-service";
import type { FacebookSendClient } from "@/core/ai-platform/integrations/facebook/facebook-send-client";
import type { ConversationRepository } from "@/core/ai-platform/repositories/conversation-repository";
import {
  ConversationInvariantError,
  type ConversationWorkflowRepository,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";
import type { SuggestedReplyDraftRepository } from "@/core/ai-platform/repositories/suggested-reply-draft-repository";
import type { ResponseMode } from "@/core/ai-platform/types/channel-response";
import type { Conversation, ConversationMessage } from "@/core/ai-platform/types/conversations";

export interface FacebookTextInboundEvent {
  channelAccountId: string;
  channelUserId: string;
  channelMessageId: string;
  facebookMessageId: string;
  text: string;
}

export interface FacebookTextInboundResult {
  conversationId: string;
  responseMode: ResponseMode;
  duplicate: boolean;
  draftStatus?: "ready" | "failed";
  sent: boolean;
  sendFailed?: boolean;
}

export interface FacebookMessageServiceDependencies {
  configService: Pick<ChannelResponseConfigService, "resolveResponseMode">;
  conversationService: ConversationService;
  conversationRepository: ConversationRepository;
  conversationWorkflowRepository: ConversationWorkflowRepository;
  answerService: AnswerService;
  draftRepository: SuggestedReplyDraftRepository;
  sendClient: FacebookSendClient;
  now?: () => string;
  nextId?: (prefix: string) => string;
}

export class FacebookMessageService {
  private readonly now: () => string;
  private readonly nextId: (prefix: string) => string;

  constructor(
    private readonly dependencies: FacebookMessageServiceDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.nextId = dependencies.nextId ?? ((prefix) => `${prefix}-${randomUUID()}`);
  }

  async processTextEvent(
    event: FacebookTextInboundEvent,
  ): Promise<FacebookTextInboundResult> {
    const effectiveConfig = await this.dependencies.configService.resolveResponseMode(
      "facebook",
      event.channelAccountId,
    );
    const decision = getResponseModeDecision(effectiveConfig.responseMode);
    const conversation = await this.resolveConversation(event);

    if (decision.autoSend) {
      return this.processAuto(conversation, event, effectiveConfig.responseMode);
    }

    return this.processWithoutAutoSend(
      conversation,
      event,
      effectiveConfig.responseMode,
      decision.persistAsDraft,
    );
  }

  private async resolveConversation(
    event: FacebookTextInboundEvent,
  ): Promise<Conversation> {
    const existing = await this.dependencies.conversationRepository.findActiveConversation(
      "facebook",
      event.channelUserId,
      event.channelAccountId,
    );

    if (existing) return existing;

    return this.dependencies.conversationService.createConversation({
      channel: "facebook",
      channelAccountId: event.channelAccountId,
      channelUserId: event.channelUserId,
      metadata: { channelAccountId: event.channelAccountId },
    });
  }

  private async processAuto(
    conversation: Conversation,
    event: FacebookTextInboundEvent,
    responseMode: ResponseMode,
  ): Promise<FacebookTextInboundResult> {
    const result = await this.dependencies.conversationService.receiveUserMessage({
      conversationId: conversation.id,
      text: event.text,
      channelMessageId: event.channelMessageId,
      metadata: {
        facebookMessageId: event.facebookMessageId,
        channelAccountId: event.channelAccountId,
      },
    });

    if (result.duplicateInbound || result.outboundMessage?.senderType !== "ai") {
      return {
        conversationId: conversation.id,
        responseMode,
        duplicate: result.duplicateInbound ?? false,
        sent: false,
      };
    }

    try {
      await this.dependencies.sendClient.sendText({
        pageId: event.channelAccountId,
        recipientId: event.channelUserId,
        text: result.outboundMessage.text,
      });
      return {
        conversationId: conversation.id,
        responseMode,
        duplicate: false,
        sent: true,
      };
    } catch {
      console.error("Facebook Messenger auto delivery failed", {
        conversationId: conversation.id,
        channelMessageId: event.channelMessageId,
      });
      return {
        conversationId: conversation.id,
        responseMode,
        duplicate: false,
        sent: false,
        sendFailed: true,
      };
    }
  }

  private async processWithoutAutoSend(
    conversation: Conversation,
    event: FacebookTextInboundEvent,
    responseMode: ResponseMode,
    persistAsDraft: boolean,
  ): Promise<FacebookTextInboundResult> {
    const timestamp = this.now();
    const message: ConversationMessage = {
      id: this.nextId("message"),
      conversationId: conversation.id,
      senderType: "user",
      senderId: event.channelUserId,
      text: event.text,
      createdAt: timestamp,
      channelMessageId: event.channelMessageId,
      metadata: {
        facebookMessageId: event.facebookMessageId,
        channelAccountId: event.channelAccountId,
      },
    };
    const appendResult = await this.dependencies.conversationWorkflowRepository.appendUserMessage({
      conversationId: conversation.id,
      message,
      updatedAt: timestamp,
      processingDisposition: persistAsDraft ? "draft" : "off",
    });

    if (!appendResult.shouldProcess) {
      return {
        conversationId: conversation.id,
        responseMode,
        duplicate: !appendResult.appended,
        sent: false,
      };
    }

    if (!persistAsDraft || !appendResult.processingToken) {
      throw new ConversationInvariantError("Draft inbound processing is missing ownership");
    }

    return this.generateDraft(
      appendResult.conversation,
      { ...message, id: appendResult.messageId },
      event,
      appendResult.processingToken,
      responseMode,
    );
  }

  private async generateDraft(
    conversation: Conversation,
    sourceMessage: ConversationMessage,
    event: FacebookTextInboundEvent,
    processingToken: string,
    responseMode: ResponseMode,
  ): Promise<FacebookTextInboundResult> {
    const messages = await this.dependencies.conversationRepository.listMessages(conversation.id);
    const conversationContext = messages
      .filter((message) => message.id !== sourceMessage.id && ["user", "ai", "human"].includes(message.senderType))
      .slice(-10)
      .map((message) => ({
        role: message.senderType === "user" ? ("user" as const) : ("assistant" as const),
        text: getConversationContextText(message),
      }));
    let draftStatus: "ready" | "failed" = "failed";
    let draftText = "";
    let provider: string | undefined;
    let citations: Awaited<ReturnType<AnswerService["answer"]>>["citations"] | undefined;
    let metadata: Record<string, unknown> = { groundingReason: "provider_error" };

    try {
      const answer = await this.dependencies.answerService.answer({
        question: sourceMessage.text,
        audience: "public",
        conversationContext,
      });
      provider = answer.provider;
      citations = answer.citations;
      metadata = { groundingReason: answer.groundingReason };
      if (answer.safeToSend) {
        draftStatus = "ready";
        draftText = answer.answer;
      }
    } catch {
      // Persist a failed draft and complete ownership below.
    }

    const completedAt = this.now();
    await this.dependencies.draftRepository.saveDraft({
      conversationId: conversation.id,
      sourceMessageId: sourceMessage.id,
      text: draftText,
      status: draftStatus,
      createdAt: completedAt,
      updatedAt: completedAt,
      provider,
      citations,
      metadata,
    });
    const completed = await this.dependencies.conversationWorkflowRepository.completeInboundProcessingIfOwned({
      conversationId: conversation.id,
      channelMessageId: event.channelMessageId,
      processingToken,
      completedAt,
      completionOutcome: draftStatus === "ready"
        ? "suggested_reply_draft_ready"
        : "suggested_reply_draft_failed",
    });
    if (!completed) {
      throw new ConversationInvariantError("Draft inbound processing ownership was lost");
    }

    return {
      conversationId: conversation.id,
      responseMode,
      duplicate: false,
      draftStatus,
      sent: false,
    };
  }
}
