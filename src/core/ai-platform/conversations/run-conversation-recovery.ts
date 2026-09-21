import {
  createProductionConversationEnvironment,
} from "@/core/ai-platform/conversations/production-conversation-environment";

import type {
  RecoverExpiredInboundSummary,
} from "@/core/ai-platform/conversations/conversation-service";

export interface RunConversationRecoveryInput {
  limit: number;
}

export async function runConversationRecovery(
  input: RunConversationRecoveryInput,
): Promise<RecoverExpiredInboundSummary> {
  const {
    service,
  } =
    createProductionConversationEnvironment();

  return service.recoverExpiredInboundProcessing(
    input,
  );
}
