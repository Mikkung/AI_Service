import {
  ChannelResponseConfigService,
} from "@/core/ai-platform/channels/channel-response-config-service";

import {
  LineMessagingApiReplyClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

import {
  StaffInboxService,
} from "@/core/ai-platform/inbox/staff-inbox-service";

import {
  FirestoreAssistedStaffSendRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-assisted-staff-send-repository";

import {
  FirestoreAIPlatformConversationRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-ai-platform-conversation-repository";

import {
  FirestoreChannelResponseConfigRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-channel-response-config-repository";

import {
  FirestoreSuggestedReplyDraftRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-suggested-reply-draft-repository";

import {
  env,
} from "@/core/config/env";

export function createProductionStaffInboxEnvironment() {
  const conversationRepository =
    new FirestoreAIPlatformConversationRepository();
  const draftRepository =
    new FirestoreSuggestedReplyDraftRepository();
  const configService =
    new ChannelResponseConfigService(
      new FirestoreChannelResponseConfigRepository(),
    );
  const linePushClient =
    new LineMessagingApiReplyClient({
      channelAccessToken:
        env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  const sendRepository =
    new FirestoreAssistedStaffSendRepository();
  const service = new StaffInboxService({
    conversationRepository,
    draftRepository,
    configService,
    linePushClient,
    sendRepository,
  });

  return {
    service,
    conversationRepository,
    draftRepository,
    configService,
    linePushClient,
    sendRepository,
  };
}
