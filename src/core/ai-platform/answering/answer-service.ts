import {
  evaluateGroundingResult,
  type GroundingReason,
} from "@/core/ai-platform/answering/grounding-gate";

import type {
  Citation,
  RetrievalEvidence,
} from "@/core/ai-platform/types/citations";

import type {
  GroundedQAProvider,
  GroundedQARequest,
  GroundedQAUsage,
} from "@/core/ai-platform/types/grounded-answer";

export interface AnswerServiceResult {
  answerable: boolean;
  safeToSend: boolean;
  answer: string;
  citations: Citation[];
  evidence?: RetrievalEvidence[];
  provider: string;
  model?: string;
  usage?: GroundedQAUsage;
  latencyMs?: number;
  groundingReason: GroundingReason;
  providerMetadata?: Record<string, unknown>;
}

export class AnswerService {
  constructor(
    private readonly provider: GroundedQAProvider,
  ) {}

  async answer(
    request: GroundedQARequest,
  ): Promise<AnswerServiceResult> {
    const result =
      await this.provider.answer(request);

    const decision =
      evaluateGroundingResult(result);

    return {
      answerable:
        decision.answerable,
      safeToSend:
        decision.safeToSend,
      answer:
        result.answer,
      citations:
        result.citations,
      evidence:
        result.evidence,
      provider:
        result.provider,
      model:
        result.model,
      usage:
        result.usage,
      latencyMs:
        result.latencyMs,
      groundingReason:
        decision.reason,
      providerMetadata:
        result.providerMetadata,
    };
  }
}
