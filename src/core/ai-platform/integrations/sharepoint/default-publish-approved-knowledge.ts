import {
  KnowledgeGovernanceService,
} from "@/core/ai-platform/knowledge/knowledge-governance-service";

import {
  PublishApprovedKnowledge,
} from "@/core/ai-platform/integrations/sharepoint/approved-knowledge-publication";

import {
  OpenAIKnowledgePublisher,
} from "@/core/ai-platform/providers/openai/openai-knowledge-publisher";

import {
  FirestoreOpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/firestore-openai-vector-store-config-repository";

import {
  FirestoreAIPlatformKnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-ai-platform-knowledge-publication-repository";

import {
  FirestoreAIPlatformKnowledgeRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-ai-platform-knowledge-repository";

export function createDefaultPublishApprovedKnowledgeUseCase(): PublishApprovedKnowledge {
  const knowledgeRepository =
    new FirestoreAIPlatformKnowledgeRepository();
  const publicationRepository =
    new FirestoreAIPlatformKnowledgePublicationRepository();
  const publisher =
    new OpenAIKnowledgePublisher({
      publicationRepository,
      vectorStoreConfigRepository:
        new FirestoreOpenAIVectorStoreConfigRepository(),
      targetAudience: "public",
    });

  const governanceService =
    new KnowledgeGovernanceService({
      knowledgeRepository,
      publisher,
    });

  return new PublishApprovedKnowledge({
    knowledgeRepository,
    governanceService,
  });
}
