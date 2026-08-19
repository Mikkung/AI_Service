import {
  AnswerService,
} from "@/core/ai-platform/answering/answer-service";

import {
  ConversationService,
  type IdGenerator,
} from "@/core/ai-platform/conversations/conversation-service";

import {
  MockGroundedQAProvider,
  type MockGroundedQAScenario,
} from "@/core/ai-platform/providers/mock/mock-grounded-qa-provider";

import {
  InMemoryConversationRepository,
} from "@/core/ai-platform/repositories/in-memory/in-memory-conversation-repository";

import {
  InMemoryHandoffRepository,
} from "@/core/ai-platform/repositories/in-memory/in-memory-handoff-repository";

class SharedIdGenerator
  implements IdGenerator
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

const conversationRepository =
  new InMemoryConversationRepository();

const handoffRepository =
  new InMemoryHandoffRepository();

const idGenerator =
  new SharedIdGenerator();

export function createMockConversationService(
  scenario: MockGroundedQAScenario = "grounded",
): ConversationService {
  return new ConversationService({
    conversationRepository,
    handoffRepository,
    answerService:
      new AnswerService(
        new MockGroundedQAProvider({
          scenario,
        }),
      ),
    idGenerator,
  });
}

export {
  conversationRepository as mockConversationRepository,
  handoffRepository as mockHandoffRepository,
};
