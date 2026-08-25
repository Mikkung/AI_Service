import type {
  Conversation,
  ConversationMessage,
  HumanHandoff,
} from "@/core/ai-platform/types/conversations";

export class ConversationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ConversationConflictError";
  }
}

export class ConversationInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ConversationInvariantError";
  }
}

export interface AppendUserMessageInput {
  conversationId: string;
  message: ConversationMessage;
  updatedAt: string;
}

export interface PersistAiMessageIfActiveInput {
  conversationId: string;
  message: ConversationMessage;
  updatedAt: string;
}

export interface PersistHumanMessageIfOwnedInput {
  conversationId: string;
  agentId: string;
  message: ConversationMessage;
  updatedAt: string;
}

export interface RequestHandoffWorkflowInput {
  conversationId: string;
  handoff: HumanHandoff;
  systemMessage: ConversationMessage;
  updatedAt: string;
}

export interface RequestHandoffWorkflowResult {
  conversation: Conversation;
  handoff: HumanHandoff;
  created: boolean;
}

export interface TakeOverConversationWorkflowInput {
  conversationId: string;
  agentId: string;
  takenAt: string;
}

export interface ResolveConversationWorkflowInput {
  conversationId: string;
  resolvedAt: string;
  resolutionNote?: string;
}

export interface ReturnConversationToAIWorkflowInput {
  conversationId: string;
  updatedAt: string;
}

export interface ConditionalMessageWorkflowResult {
  conversation: Conversation;
  persisted: boolean;
}

export interface ConversationWorkflowRepository {
  appendUserMessage(
    input: AppendUserMessageInput,
  ): Promise<Conversation>;

  persistAiMessageIfActive(
    input: PersistAiMessageIfActiveInput,
  ): Promise<ConditionalMessageWorkflowResult>;

  persistHumanMessageIfOwned(
    input: PersistHumanMessageIfOwnedInput,
  ): Promise<Conversation>;

  requestHumanHandoff(
    input: RequestHandoffWorkflowInput,
  ): Promise<RequestHandoffWorkflowResult>;

  takeOverConversation(
    input: TakeOverConversationWorkflowInput,
  ): Promise<{
    conversation: Conversation;
    handoff: HumanHandoff;
  }>;

  resolveConversation(
    input: ResolveConversationWorkflowInput,
  ): Promise<{
    conversation: Conversation;
    handoff: HumanHandoff;
  }>;

  returnConversationToAI(
    input: ReturnConversationToAIWorkflowInput,
  ): Promise<Conversation>;
}
