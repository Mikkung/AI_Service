import {
  ChannelResponseConfigService,
} from "@/core/ai-platform/channels/channel-response-config-service";

import {
  createProductionConversationEnvironment,
} from "@/core/ai-platform/conversations/production-conversation-environment";

import {
  LineMessageService,
} from "@/core/ai-platform/integrations/line/line-message-service";

import {
  LineMessagingApiMediaClient,
} from "@/core/ai-platform/integrations/line/line-media-client";

import {
  LineMessagingApiReplyClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

import {
  LineMessagingApiProfileClient,
} from "@/core/ai-platform/integrations/line/line-profile-client";

import {
  LineContactService,
} from "@/core/ai-platform/integrations/line/line-contact-service";

import {
  LineMessagingApiReadClient,
  LineReadSyncService,
} from "@/core/ai-platform/integrations/line/line-read-sync";

import {
  FirestoreChannelResponseConfigRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-channel-response-config-repository";

import {
  FirestoreSuggestedReplyDraftRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-suggested-reply-draft-repository";

import {
  FirestoreChannelContactRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-channel-contact-repository";

import {
  OpenAIImageUnderstandingProvider,
} from "@/core/ai-platform/providers/openai/openai-image-understanding-provider";

import {
  env,
} from "@/core/config/env";

export function createProductionLineEnvironment() {
  const conversationEnvironment =
    createProductionConversationEnvironment();
  const configService =
    new ChannelResponseConfigService(
      new FirestoreChannelResponseConfigRepository(),
    );
  const draftRepository =
    new FirestoreSuggestedReplyDraftRepository();
  const replyClient =
    new LineMessagingApiReplyClient({
      channelAccessToken:
        env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  const mediaClient =
    new LineMessagingApiMediaClient({
      channelAccessToken:
        env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  const imageUnderstandingProvider =
    new OpenAIImageUnderstandingProvider();
  const contactService =
    new LineContactService({
      repository:
        new FirestoreChannelContactRepository(),
      profileClient:
        new LineMessagingApiProfileClient({
          channelAccessToken:
            env.LINE_CHANNEL_ACCESS_TOKEN,
        }),
    });
  const readSyncService =
    new LineReadSyncService({
      conversationRepository:
        conversationEnvironment
          .conversationRepository,
      readClient:
        new LineMessagingApiReadClient({
          channelAccessToken:
            env.LINE_CHANNEL_ACCESS_TOKEN,
        }),
    });
  const lineMessageService =
    new LineMessageService({
      configService,
      conversationService:
        conversationEnvironment.service,
      conversationRepository:
        conversationEnvironment
          .conversationRepository,
      conversationWorkflowRepository:
        conversationEnvironment
          .conversationWorkflowRepository,
      answerService:
        conversationEnvironment
          .answerService,
      draftRepository,
      replyClient,
      mediaClient,
      imageUnderstandingProvider,
      contactService,
      readSyncService,
    });

  return {
    lineMessageService,
    mediaClient,
  };
}
