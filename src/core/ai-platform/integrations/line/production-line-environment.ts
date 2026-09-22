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
  LineMessagingApiReplyClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

import {
  FirestoreChannelResponseConfigRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-channel-response-config-repository";

import {
  FirestoreSuggestedReplyDraftRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-suggested-reply-draft-repository";

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
    });

  return {
    lineMessageService,
  };
}
