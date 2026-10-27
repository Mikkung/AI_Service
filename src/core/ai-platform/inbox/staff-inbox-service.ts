import type {
  ChannelResponseConfigService,
} from "@/core/ai-platform/channels/channel-response-config-service";

import type {
  ExternalChannelTextSenderRegistry,
} from "@/core/ai-platform/integrations/external-channel-text-sender";

import type {
  LinePushClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

import {
  FacebookDeliveryUncertainError,
  FacebookSendRejectedError,
} from "@/core/ai-platform/integrations/facebook/facebook-send-client";

import type {
  LineMediaClient,
  LineMediaContent,
} from "@/core/ai-platform/integrations/line/line-media-client";

import type {
  AssistedStaffSendRepository,
} from "@/core/ai-platform/repositories/assisted-staff-send-repository";

import type {
  ConversationRepository,
} from "@/core/ai-platform/repositories/conversation-repository";

import type {
  ConversationWorkflowRepository,
} from "@/core/ai-platform/repositories/conversation-workflow-repository";

import type {
  SuggestedReplyDraftRepository,
} from "@/core/ai-platform/repositories/suggested-reply-draft-repository";

import type {
  ExternalResponseChannel,
  ResponseMode,
  SuggestedReplyDraft,
} from "@/core/ai-platform/types/channel-response";

import type {
  Conversation,
  ConversationMessage,
} from "@/core/ai-platform/types/conversations";

const MAX_REPLY_LENGTH = 5000;
const LINE_RETRY_KEY_SAFE_WINDOW_MS =
  24 * 60 * 60 * 1000;
const FACEBOOK_STANDARD_WINDOW_MS =
  24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StaffInboxConversation {
  id: string;
  channel: ExternalResponseChannel;
  channelAccountId?: string;
  channelUserId: string;
  mode: Conversation["mode"];
  updatedAt: string;
  lastMessageAt?: string;
  lastInboundAt?: string;
  lastStaffReadAt?: string;
  unread: boolean;
  draftStatus?: SuggestedReplyDraft["status"];
}

type SupportedExternalConversation = Conversation & {
  channel: ExternalResponseChannel;
};

export interface StaffInboxDetail {
  conversation: StaffInboxConversation;
  messages: StaffInboxMessage[];
  responseMode: ResponseMode;
  draft: SuggestedReplyDraft | null;
  latestInboundMessageId?: string;
}

export type StaffInboxMessage = Pick<
  ConversationMessage,
  | "id"
  | "senderType"
  | "senderId"
  | "text"
  | "createdAt"
  | "attachments"
  | "citations"
>;

export interface SendAssistedReplyInput {
  conversationId: string;
  staffActorId: string;
  text: string;
  clientRequestId: string;
  sourceMessageId?: string;
}

export interface StaffInboxServiceDependencies {
  conversationRepository: ConversationRepository;
  draftRepository: SuggestedReplyDraftRepository;
  sendRepository: AssistedStaffSendRepository;
  configService: Pick<
    ChannelResponseConfigService,
    "resolveResponseMode" | "updateResponseMode"
  >;
  textSenders?: ExternalChannelTextSenderRegistry;
  /** @deprecated Test compatibility; production uses textSenders. */
  linePushClient?: LinePushClient;
  lineMediaClient: LineMediaClient;
  conversationWorkflowRepository: Pick<
    ConversationWorkflowRepository,
    "resolveHandoffAndResumeAI"
  >;
  now?: () => string;
}

export class LinePushDeliveryError extends Error {
  constructor() {
    super(
      "LINE delivery failed. Retry with the same clientRequestId.",
    );
    this.name = "LinePushDeliveryError";
  }
}

export class AssistedSendReconciliationRequiredError
  extends Error
{
  constructor(
    message = "Pending LINE delivery is outside the 24-hour retry-key safety window and requires manual reconciliation.",
  ) {
    super(
      message,
    );
    this.name =
      "AssistedSendReconciliationRequiredError";
  }
}

export class FacebookMessagingWindowExpiredError extends Error {
  constructor() {
    super(
      "Facebook's standard messaging window has expired. This conversation cannot be sent as a normal Messenger response.",
    );
    this.name = "FacebookMessagingWindowExpiredError";
  }
}

export class FacebookSendDeliveryError extends Error {
  constructor() {
    super(
      "Facebook Messenger delivery was rejected. No message was recorded as delivered.",
    );
    this.name = "FacebookSendDeliveryError";
  }
}

export function isConversationUnread(
  conversation: Pick<
    Conversation,
    "lastInboundAt" | "lastStaffReadAt"
  >,
): boolean {
  return Boolean(
    conversation.lastInboundAt &&
      (!conversation.lastStaffReadAt ||
        conversation.lastInboundAt >
          conversation.lastStaffReadAt),
  );
}

function toInboxConversation(
  conversation: Conversation,
): StaffInboxConversation {
  if (
    conversation.channel !== "line" &&
    conversation.channel !== "facebook"
  ) {
    throw new Error(
      "Staff Inbox supports LINE and Facebook conversations only",
    );
  }

  return {
    id: conversation.id,
    channel: conversation.channel,
    channelAccountId:
      conversation.channelAccountId,
    channelUserId:
      conversation.channelUserId,
    mode: conversation.mode,
    updatedAt: conversation.updatedAt,
    lastMessageAt:
      conversation.lastMessageAt,
    lastInboundAt:
      conversation.lastInboundAt,
    lastStaffReadAt:
      conversation.lastStaffReadAt,
    unread:
      isConversationUnread(
        conversation,
      ),
  };
}

export class StaffInboxService {
  private readonly now: () => string;

  constructor(
    private readonly dependencies: StaffInboxServiceDependencies,
  ) {
    this.now =
      dependencies.now ??
      (() => new Date().toISOString());
  }

  async listConversations(
    limit = 50,
    beforeUpdatedAt?: string,
  ): Promise<StaffInboxConversation[]> {
    const boundedLimit = Math.min(
      50,
      Math.max(1, limit),
    );
    const [line, facebook] = await Promise.all([
      this.dependencies.conversationRepository
        .listInboxConversations({
          channel: "line",
          limit: boundedLimit,
          beforeUpdatedAt,
        }),
      this.dependencies.conversationRepository
        .listInboxConversations({
          channel: "facebook",
          limit: boundedLimit,
          beforeUpdatedAt,
        }),
    ]);
    const conversations = [...line, ...facebook]
      .sort((left, right) =>
        right.updatedAt.localeCompare(
          left.updatedAt,
        ))
      .slice(0, boundedLimit);

    return Promise.all(
      conversations.map(
        async (conversation) => {
          const item =
            toInboxConversation(
              conversation,
            );
          const draft =
            conversation.lastInboundMessageId
              ? await this.dependencies
                  .draftRepository
                  .getDraft(
                    conversation.id,
                    conversation.lastInboundMessageId,
                  )
              : null;

          return {
            ...item,
            draftStatus:
              draft?.status,
          };
        },
      ),
    );
  }

  async getConversationDetail(
    conversationId: string,
  ): Promise<StaffInboxDetail> {
    const conversation =
      await this.requireSupportedExternalConversation(
        conversationId,
      );
    const messages =
      await this.dependencies
        .conversationRepository
        .listMessages(conversationId);
    const latestInbound = messages
      .filter(
        (message) =>
          message.senderType === "user",
      )
      .at(-1);
    const draft = latestInbound
      ? await this.dependencies
          .draftRepository
          .getDraft(
            conversationId,
            latestInbound.id,
          )
      : null;
    const responseMode =
      conversation.channelAccountId
        ? (
            await this.dependencies
              .configService
              .resolveResponseMode(
                conversation.channel,
                conversation.channelAccountId,
              )
          ).responseMode
        : "off";

    return {
      conversation:
        toInboxConversation(
          conversation,
        ),
      messages: messages.map(
        (message) => ({
          id: message.id,
          senderType:
            message.senderType,
          senderId: message.senderId,
          text: message.text,
          createdAt:
            message.createdAt,
          attachments:
            message.attachments,
          citations:
            message.citations,
        }),
      ),
      responseMode,
      draft,
      latestInboundMessageId:
        latestInbound?.id,
    };
  }

  async getImagePreview(input: {
    conversationId: string;
    messageId: string;
  }): Promise<LineMediaContent> {
    await this.requireLineConversation(
      input.conversationId,
    );
    const messages =
      await this.dependencies
        .conversationRepository
        .listMessages(
          input.conversationId,
        );
    const message = messages.find(
      (candidate) =>
        candidate.id ===
        input.messageId,
    );

    if (!message) {
      throw new Error(
        `Conversation message not found: ${input.messageId}`,
      );
    }

    const attachment =
      message.attachments?.find(
        (candidate) =>
          candidate.type === "image" &&
          candidate.source === "line" &&
          candidate.sourceMediaId,
      );

    if (!attachment?.sourceMediaId) {
      throw new Error(
        "LINE image attachment not found",
      );
    }

    return this.dependencies
      .lineMediaClient
      .getImagePreview(
        attachment.sourceMediaId,
      );
  }

  async markRead(
    conversationId: string,
  ): Promise<StaffInboxConversation> {
    await this.requireSupportedExternalConversation(
      conversationId,
    );
    const conversation =
      await this.dependencies
        .conversationRepository
        .markStaffRead(
          conversationId,
          this.now(),
        );
    return toInboxConversation(
      conversation,
    );
  }

  async editDraft(input: {
    conversationId: string;
    sourceMessageId: string;
    text: string;
  }): Promise<SuggestedReplyDraft> {
    await this.requireSupportedExternalConversation(
      input.conversationId,
    );
    const text = input.text.trim();

    if (
      !text ||
      text.length > MAX_REPLY_LENGTH
    ) {
      throw new Error(
        "Draft text must contain 1 to 5000 characters",
      );
    }

    const draft =
      await this.dependencies
        .draftRepository
        .getDraft(
          input.conversationId,
          input.sourceMessageId,
        );

    if (!draft || draft.status !== "ready") {
      throw new Error(
        "Ready suggested reply draft not found",
      );
    }

    return this.dependencies
      .draftRepository
      .updateDraft({
        conversationId:
          input.conversationId,
        sourceMessageId:
          input.sourceMessageId,
        text,
        status: "ready",
        updatedAt: this.now(),
      });
  }

  async sendAssistedReply(
    input: SendAssistedReplyInput,
  ) {
    const text = input.text.trim();
    const staffActorId =
      input.staffActorId.trim();

    if (!staffActorId) {
      throw new Error(
        "Staff actor identity is required",
      );
    }

    if (
      !UUID_PATTERN.test(
        input.clientRequestId,
      )
    ) {
      throw new Error(
        "clientRequestId must be a UUID",
      );
    }

    if (
      !text ||
      text.length > MAX_REPLY_LENGTH
    ) {
      throw new Error(
        "Reply text must contain 1 to 5000 characters",
      );
    }

    const conversation =
      await this.requireSupportedExternalConversation(
        input.conversationId,
      );

    if (!conversation.channelAccountId) {
      throw new Error(
        "External conversation is missing channelAccountId",
      );
    }

    const attemptedAt = this.now();
    const receipt =
      await this.dependencies
        .sendRepository
        .prepareSend({
          clientRequestId:
            input.clientRequestId,
          conversationId:
            input.conversationId,
          text,
          sourceMessageId:
            input.sourceMessageId,
          createdAt: attemptedAt,
        });

    if (receipt.status === "uncertain") {
      throw new AssistedSendReconciliationRequiredError(
        "Facebook delivery outcome is uncertain and requires manual reconciliation. The message was not retried.",
      );
    }

    if (receipt.status !== "delivered") {
      const receiptAge =
        new Date(attemptedAt).getTime() -
        new Date(
          receipt.createdAt,
        ).getTime();

      if (
        conversation.channel === "line" &&
        (!Number.isFinite(receiptAge) ||
          receiptAge >= LINE_RETRY_KEY_SAFE_WINDOW_MS)
      ) {
        throw new AssistedSendReconciliationRequiredError();
      }

      if (conversation.channel === "facebook") {
        const lastInboundAt = conversation.lastInboundAt
          ? new Date(conversation.lastInboundAt).getTime()
          : Number.NaN;
        const attemptedAtMs = new Date(attemptedAt).getTime();
        if (
          !Number.isFinite(lastInboundAt) ||
          !Number.isFinite(attemptedAtMs) ||
          attemptedAtMs - lastInboundAt >= FACEBOOK_STANDARD_WINDOW_MS
        ) {
          throw new FacebookMessagingWindowExpiredError();
        }
      }

      const sender =
        this.dependencies.textSenders?.[
          conversation.channel
        ];
      const legacyLineClient =
        conversation.channel === "line"
          ? this.dependencies.linePushClient
          : undefined;
      if (!sender && !legacyLineClient) {
        throw new Error(`${conversation.channel} text sender is not configured`);
      }

      try {
        if (sender) {
          await sender.sendText({
            channelAccountId: conversation.channelAccountId,
            channelUserId: conversation.channelUserId,
            text: receipt.text,
            clientRequestId: receipt.retryKey,
          });
        } else {
          await legacyLineClient!.pushText(
            conversation.channelUserId,
            receipt.text,
            receipt.retryKey,
          );
        }
      } catch (error) {
        if (
          conversation.channel === "facebook" &&
          error instanceof FacebookDeliveryUncertainError
        ) {
          await this.dependencies.sendRepository.markSendUncertain({
            clientRequestId: input.clientRequestId,
            uncertainAt: this.now(),
            reason: "facebook_delivery_outcome_uncertain",
          });
          throw new AssistedSendReconciliationRequiredError(
            "Facebook delivery outcome is uncertain and requires manual reconciliation. The message was not retried.",
          );
        }
        if (
          conversation.channel === "facebook" &&
          error instanceof FacebookSendRejectedError
        ) {
          throw new FacebookSendDeliveryError();
        }
        if (conversation.channel === "facebook") {
          await this.dependencies.sendRepository.markSendUncertain({
            clientRequestId: input.clientRequestId,
            uncertainAt: this.now(),
            reason: "facebook_delivery_outcome_uncertain",
          });
          throw new AssistedSendReconciliationRequiredError(
            "Facebook delivery outcome is uncertain and requires manual reconciliation. The message was not retried.",
          );
        }
        throw new LinePushDeliveryError();
      }
    }

    const completed =
      await this.dependencies
        .sendRepository
        .completeDeliveredSend({
          clientRequestId:
            input.clientRequestId,
          deliveredAt: this.now(),
          staffId: staffActorId,
        });

    return {
      delivered: true,
      duplicate:
        !completed.newlyCompleted,
      message: completed.message,
      conversation:
        toInboxConversation(
          completed.conversation,
        ),
    };
  }

  async resumeAI(
    conversationId: string,
  ) {
    await this.requireSupportedExternalConversation(
      conversationId,
    );

    return this.dependencies
      .conversationWorkflowRepository
      .resolveHandoffAndResumeAI({
        conversationId,
        resolvedAt: this.now(),
        resolutionNote:
          "returned_to_ai_by_staff",
      });
  }

  async sendAssistedReplyAndResumeAI(
    input: SendAssistedReplyInput,
  ) {
    const delivery =
      await this.sendAssistedReply(input);
    const resume = await this.resumeAI(
      input.conversationId,
    );

    return {
      ...delivery,
      conversation:
        toInboxConversation(
          resume.conversation,
        ),
      resumed: resume.resumed,
    };
  }

  async updateResponseMode(input: {
    channel?: ExternalResponseChannel;
    channelAccountId: string;
    responseMode: ResponseMode;
  }) {
    return this.dependencies
      .configService
      .updateResponseMode({
        channel: input.channel ?? "line",
        channelAccountId:
          input.channelAccountId,
        responseMode:
          input.responseMode,
      });
  }

  private async requireLineConversation(
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

    if (conversation.channel !== "line") {
      throw new Error(
        "Staff Inbox currently supports LINE conversations only",
      );
    }

    return conversation;
  }

  private async requireSupportedExternalConversation(
    conversationId: string,
  ): Promise<SupportedExternalConversation> {
    const conversation =
      await this.dependencies
        .conversationRepository
        .getConversation(
          conversationId,
        );
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (
      conversation.channel !== "line" &&
      conversation.channel !== "facebook"
    ) {
      throw new Error(
        "Staff Inbox supports LINE and Facebook conversations only",
      );
    }
    return conversation as SupportedExternalConversation;
  }
}
