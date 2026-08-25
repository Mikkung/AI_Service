import {
  AnswerService,
} from "@/core/ai-platform/answering/answer-service";

import {
  ConversationService,
} from "@/core/ai-platform/conversations/conversation-service";

import {
  FirestoreOpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/firestore-openai-vector-store-config-repository";

import {
  OpenAIGroundedQAProvider,
} from "@/core/ai-platform/providers/openai/openai-grounded-qa-provider";

import {
  FirestoreAIPlatformConversationRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-ai-platform-conversation-repository";

import {
  FirestoreAIPlatformConversationWorkflowRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-ai-platform-conversation-workflow-repository";

import {
  FirestoreAIPlatformHandoffRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-ai-platform-handoff-repository";

export function createProductionConversationEnvironment() {
  const conversationRepository =
    new FirestoreAIPlatformConversationRepository();
  const handoffRepository =
    new FirestoreAIPlatformHandoffRepository();
  const conversationWorkflowRepository =
    new FirestoreAIPlatformConversationWorkflowRepository();
  const answerService =
    new AnswerService(
      new OpenAIGroundedQAProvider({
        vectorStoreConfigRepository:
          new FirestoreOpenAIVectorStoreConfigRepository(),
      }),
    );
  const service =
    new ConversationService({
      conversationRepository,
      handoffRepository,
      conversationWorkflowRepository,
      answerService,
    });

  return {
    service,
    conversationRepository,
    handoffRepository,
    conversationWorkflowRepository,
  };
}
