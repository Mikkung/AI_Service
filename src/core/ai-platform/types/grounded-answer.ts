import type {
  Citation,
  RetrievalEvidence,
} from "@/core/ai-platform/types/citations";

import type {
  KnowledgeAudience,
} from "@/core/ai-platform/types/knowledge";

export interface ConversationContextMessage {
  role: "user" | "assistant";
  text: string;
}

export interface GroundedQARequest {
  question: string;
  audience: KnowledgeAudience;
  knowledgeScope?: {
    categories?: string[];
    documentIds?: string[];
  };
  conversationContext?: ConversationContextMessage[];
}

export interface GroundedQAUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface GroundedQAResult {
  answerable: boolean;
  answer: string;
  citations: Citation[];
  evidence?: RetrievalEvidence[];
  provider: string;
  model?: string;
  usage?: GroundedQAUsage;
  latencyMs?: number;
  providerMetadata?: Record<string, unknown>;
}

export interface GroundedQAProvider {
  readonly name: string;

  answer(
    request: GroundedQARequest,
  ): Promise<GroundedQAResult>;
}
