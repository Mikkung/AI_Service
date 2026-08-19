import type {
  GroundedQAResult,
} from "@/core/ai-platform/types/grounded-answer";

export type GroundingReason =
  | "grounded"
  | "unsupported"
  | "missing_citation"
  | "provider_error"
  | "malformed_response";

export interface GroundingDecision {
  answerable: boolean;
  safeToSend: boolean;
  reason: GroundingReason;
}

export function evaluateGroundingResult(
  result: GroundedQAResult,
): GroundingDecision {
  if (
    result.providerMetadata
      ?.providerError
  ) {
    return {
      answerable: false,
      safeToSend: false,
      reason: "provider_error",
    };
  }

  if (!result.answerable) {
    return {
      answerable: false,
      safeToSend: false,
      reason: "unsupported",
    };
  }

  if (result.citations.length === 0) {
    return {
      answerable: true,
      safeToSend: false,
      reason: "missing_citation",
    };
  }

  return {
    answerable: true,
    safeToSend: true,
    reason: "grounded",
  };
}

export function createGroundingFailureDecision(
  reason:
    | "provider_error"
    | "malformed_response",
): GroundingDecision {
  return {
    answerable: false,
    safeToSend: false,
    reason,
  };
}
