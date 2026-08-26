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

export interface AppendUserMessageWorkflowResult {
  conversation: Conversation;
  appended: boolean;
  shouldProcess: boolean;
  messageId: string;
  processingToken?: string;
  recovered?: boolean;
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

export interface InboundProcessingOwnershipInput {
  conversationId: string;
  channelMessageId: string;
  processingToken: string;
}

export interface PersistAiMessageForInboundIfOwnedInput
  extends InboundProcessingOwnershipInput {
  message: ConversationMessage;
  updatedAt: string;
}

export interface PersistAiMessageForInboundIfOwnedResult {
  conversation: Conversation;
  persisted: boolean;
  completed: boolean;
  completionOutcome?: string;
}

export interface RequestHandoffForInboundIfOwnedInput
  extends InboundProcessingOwnershipInput {
  handoff: HumanHandoff;
  systemMessage: ConversationMessage;
  updatedAt: string;
}

export interface RequestHandoffForInboundIfOwnedResult {
  conversation: Conversation;
  handoff?: HumanHandoff;
  created: boolean;
  completed: boolean;
  completionOutcome?: string;
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
  ): Promise<AppendUserMessageWorkflowResult>;

  persistAiMessageIfActive(
    input: PersistAiMessageIfActiveInput,
  ): Promise<ConditionalMessageWorkflowResult>;

  persistAiMessageForInboundIfOwned(
    input: PersistAiMessageForInboundIfOwnedInput,
  ): Promise<PersistAiMessageForInboundIfOwnedResult>;

  persistHumanMessageIfOwned(
    input: PersistHumanMessageIfOwnedInput,
  ): Promise<Conversation>;

  requestHumanHandoff(
    input: RequestHandoffWorkflowInput,
  ): Promise<RequestHandoffWorkflowResult>;

  requestHumanHandoffForInboundIfOwned(
    input: RequestHandoffForInboundIfOwnedInput,
  ): Promise<RequestHandoffForInboundIfOwnedResult>;

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
