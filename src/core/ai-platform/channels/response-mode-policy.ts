import type {
  ResponseMode,
  ResponseModeDecision,
} from "@/core/ai-platform/types/channel-response";

const RESPONSE_MODE_DECISIONS: Record<
  ResponseMode,
  ResponseModeDecision
> = {
  off: {
    generateAi: false,
    persistAsDraft: false,
    autoSend: false,
  },
  draft: {
    generateAi: true,
    persistAsDraft: true,
    autoSend: false,
  },
  auto: {
    generateAi: true,
    persistAsDraft: false,
    autoSend: true,
  },
};

export function getResponseModeDecision(
  responseMode: ResponseMode,
): ResponseModeDecision {
  return {
    ...RESPONSE_MODE_DECISIONS[
      responseMode
    ],
  };
}
