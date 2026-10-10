import { ChannelResponseConfigService } from "@/core/ai-platform/channels/channel-response-config-service";
import { createProductionConversationEnvironment } from "@/core/ai-platform/conversations/production-conversation-environment";
import { getFacebookIntegrationConfig } from "@/core/ai-platform/integrations/facebook/facebook-config";
import { FacebookMessageService } from "@/core/ai-platform/integrations/facebook/facebook-message-service";
import { FacebookGraphApiSendClient } from "@/core/ai-platform/integrations/facebook/facebook-send-client";
import { FirestoreChannelResponseConfigRepository } from "@/core/ai-platform/repositories/firestore/firestore-channel-response-config-repository";
import { FirestoreSuggestedReplyDraftRepository } from "@/core/ai-platform/repositories/firestore/firestore-suggested-reply-draft-repository";

export function createProductionFacebookEnvironment() {
  const config = getFacebookIntegrationConfig();
  const conversationEnvironment = createProductionConversationEnvironment();
  const configService = new ChannelResponseConfigService(
    new FirestoreChannelResponseConfigRepository(),
  );
  const draftRepository = new FirestoreSuggestedReplyDraftRepository();
  const sendClient = new FacebookGraphApiSendClient({
    pageAccessToken: config.pageAccessToken,
    pageId: config.pageId,
    graphApiVersion: config.graphApiVersion,
  });
  const facebookMessageService = new FacebookMessageService({
    configService,
    conversationService: conversationEnvironment.service,
    conversationRepository: conversationEnvironment.conversationRepository,
    conversationWorkflowRepository: conversationEnvironment.conversationWorkflowRepository,
    answerService: conversationEnvironment.answerService,
    draftRepository,
    sendClient,
  });

  return { config, facebookMessageService, sendClient };
}
