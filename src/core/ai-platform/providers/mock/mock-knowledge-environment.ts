import {
  KnowledgeGovernanceService,
  type GovernanceIdGenerator,
} from "@/core/ai-platform/knowledge/knowledge-governance-service";

import {
  MockKnowledgePublisher,
} from "@/core/ai-platform/providers/mock/mock-knowledge-publisher";

import {
  InMemoryKnowledgePublicationRepository,
} from "@/core/ai-platform/repositories/in-memory/in-memory-knowledge-publication-repository";

import {
  InMemoryKnowledgeRepository,
} from "@/core/ai-platform/repositories/in-memory/in-memory-knowledge-repository";

class SharedKnowledgeIdGenerator
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
  new SharedKnowledgeIdGenerator();

const publisher =
  new MockKnowledgePublisher({
    publicationRepository,
    targetAudience: "public",
  });

export function createMockKnowledgeGovernanceService(): KnowledgeGovernanceService {
  return new KnowledgeGovernanceService({
    knowledgeRepository,
    publisher,
    idGenerator,
  });
}

export {
  knowledgeRepository as mockKnowledgeRepository,
  publicationRepository as mockKnowledgePublicationRepository,
  publisher as mockKnowledgePublisher,
};
