import type {
  ChannelResponseConfigService,
} from "@/core/ai-platform/channels/channel-response-config-service";

import type {
  LinePushClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

import type {
  AssistedStaffSendRepository,
} from "@/core/ai-platform/repositories/assisted-staff-send-repository";

import type {
  ConversationRepository,
} from "@/core/ai-platform/repositories/conversation-repository";

import type {
  SuggestedReplyDraftRepository,
} from "@/core/ai-platform/repositories/suggested-reply-draft-repository";

import type {
  ResponseMode,
  SuggestedReplyDraft,
} from "@/core/ai-platform/types/channel-response";

import type {
  Conversation,
  ConversationMessage,
} from "@/core/ai-platform/types/conversations";

const STAFF_ID = "admin-ui-staff";
const MAX_REPLY_LENGTH = 5000;
const LINE_RETRY_KEY_SAFE_WINDOW_MS =
  24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StaffInboxConversation {
  id: string;
  channel: "line";
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
  | "citations"
>;

export interface SendAssistedReplyInput {
  conversationId: string;
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
  linePushClient: LinePushClient;
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
  constructor() {
    super(
      "Pending LINE delivery is outside the 24-hour retry-key safety window and requires manual reconciliation.",
    );
    this.name =
      "AssistedSendReconciliationRequiredError";
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
  if (conversation.channel !== "line") {
    throw new Error(
      "Staff Inbox currently supports LINE conversations only",
    );
  }

  return {
    id: conversation.id,
    channel: "line",
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
    const conversations =
      await this.dependencies
        .conversationRepository
        .listInboxConversations({
          channel: "line",
          limit: Math.min(
            50,
            Math.max(1, limit),
          ),
          beforeUpdatedAt,
        });

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
      await this.requireLineConversation(
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
                "line",
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

  async markRead(
    conversationId: string,
  ): Promise<StaffInboxConversation> {
    await this.requireLineConversation(
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
    await this.requireLineConversation(
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
      await this.requireLineConversation(
        input.conversationId,
      );

    if (!conversation.channelAccountId) {
      throw new Error(
        "LINE conversation is missing channelAccountId",
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

    if (receipt.status !== "delivered") {
      const receiptAge =
        new Date(attemptedAt).getTime() -
        new Date(
          receipt.createdAt,
        ).getTime();

      if (
        !Number.isFinite(receiptAge) ||
        receiptAge >=
          LINE_RETRY_KEY_SAFE_WINDOW_MS
      ) {
        throw new AssistedSendReconciliationRequiredError();
      }

      try {
        await this.dependencies
          .linePushClient
          .pushText(
            conversation.channelUserId,
            receipt.text,
            receipt.retryKey,
          );
      } catch {
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
          staffId: STAFF_ID,
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

  async updateResponseMode(input: {
    channelAccountId: string;
    responseMode: ResponseMode;
  }) {
    return this.dependencies
      .configService
      .updateResponseMode({
        channel: "line",
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
}
