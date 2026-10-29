import {
  ChannelResponseConfigService,
} from "@/core/ai-platform/channels/channel-response-config-service";

import {
  LineMessagingApiReplyClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

import { LineExternalTextSender } from "@/core/ai-platform/integrations/line/line-external-text-sender";
import { FacebookExternalTextSender } from "@/core/ai-platform/integrations/facebook/facebook-external-text-sender";
import { getFacebookIntegrationConfigIfAvailable } from "@/core/ai-platform/integrations/facebook/facebook-config";
import { FacebookGraphApiSendClient } from "@/core/ai-platform/integrations/facebook/facebook-send-client";

import {
  LineMessagingApiMediaClient,
} from "@/core/ai-platform/integrations/line/line-media-client";

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
  StaffInboxService,
} from "@/core/ai-platform/inbox/staff-inbox-service";

import {
  FirestoreAssistedStaffSendRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-assisted-staff-send-repository";

import {
  FirestoreAIPlatformConversationRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-ai-platform-conversation-repository";

import {
  FirestoreAIPlatformConversationWorkflowRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-ai-platform-conversation-workflow-repository";

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
  const lineMediaClient =
    new LineMessagingApiMediaClient({
      channelAccessToken:
        env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  const facebookConfig = getFacebookIntegrationConfigIfAvailable();
  const facebookSendClient = facebookConfig
    ? new FacebookGraphApiSendClient({
        pageAccessToken: facebookConfig.pageAccessToken,
        pageId: facebookConfig.pageId,
        graphApiVersion: facebookConfig.graphApiVersion,
      })
    : undefined;
  const textSenders = {
    line: new LineExternalTextSender(linePushClient),
    ...(facebookSendClient
      ? { facebook: new FacebookExternalTextSender(facebookSendClient) }
      : {}),
  };
  const sendRepository =
    new FirestoreAssistedStaffSendRepository();
  const conversationWorkflowRepository =
    new FirestoreAIPlatformConversationWorkflowRepository();
  const contactRepository =
    new FirestoreChannelContactRepository();
  const lineContactService =
    new LineContactService({
      repository: contactRepository,
      profileClient:
        new LineMessagingApiProfileClient({
          channelAccessToken:
            env.LINE_CHANNEL_ACCESS_TOKEN,
        }),
    });
  const lineReadSyncService =
    new LineReadSyncService({
      conversationRepository,
      readClient:
        new LineMessagingApiReadClient({
          channelAccessToken:
            env.LINE_CHANNEL_ACCESS_TOKEN,
        }),
    });
  const service = new StaffInboxService({
    conversationRepository,
    draftRepository,
    configService,
    textSenders,
    lineMediaClient,
    sendRepository,
    conversationWorkflowRepository,
    contactRepository,
    lineContactService,
    lineReadSyncService,
  });

  return {
    service,
    conversationRepository,
    draftRepository,
    configService,
    linePushClient,
    facebookSendClient,
    textSenders,
    lineMediaClient,
    sendRepository,
    conversationWorkflowRepository,
    contactRepository,
    lineContactService,
    lineReadSyncService,
  };
}
