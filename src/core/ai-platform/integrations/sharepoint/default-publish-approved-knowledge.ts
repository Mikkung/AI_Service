import {
  KnowledgeGovernanceService,
  type GovernanceIdGenerator,
} from "@/core/ai-platform/knowledge/knowledge-governance-service";

import {
  PublishApprovedKnowledge,
} from "@/core/ai-platform/integrations/sharepoint/approved-knowledge-publication";

import {
  OpenAIKnowledgePublisher,
} from "@/core/ai-platform/providers/openai/openai-knowledge-publisher";

import {
  InMemoryKnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/in-memory/in-memory-knowledge-publication-repository";

import {
  InMemoryKnowledgeRepository,
} from "@/core/ai-platform/repositories/in-memory/in-memory-knowledge-repository";

class SharedPublicationIdGenerator
  implements GovernanceIdGenerator
{
  private next = 1;

  nextId(prefix: string): string {
    const id =
      String(this.next).padStart(
        6,
        "0",
      );
    this.next += 1;
    return `${prefix}-${id}`;
  }
}

const knowledgeRepository =
  new InMemoryKnowledgeRepository();

const publicationRepository =
  new InMemoryKnowledgePublicationRepository();

const idGenerator =
  new SharedPublicationIdGenerator();

export function createDefaultPublishApprovedKnowledgeUseCase(): PublishApprovedKnowledge {
  const publisher =
    new OpenAIKnowledgePublisher({
      publicationRepository,
      targetAudience: "public",
    });

  const governanceService =
    new KnowledgeGovernanceService({
      knowledgeRepository,
      publisher,
      idGenerator,
    });

  return new PublishApprovedKnowledge({
    knowledgeRepository,
    governanceService,
  });
}
