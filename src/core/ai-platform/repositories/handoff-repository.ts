import type {
  HandoffReason,
  HandoffRequestedBy,
  HandoffStatus,
  HumanHandoff,
} from "@/core/ai-platform/types/conversations";

export interface CreateHandoffInput {
  id: string;
  conversationId: string;
  reason: HandoffReason;
  status: HandoffStatus;
  requestedAt: string;
  requestedBy: HandoffRequestedBy;
  metadata?: Record<string, unknown>;
}

export interface UpdateHandoffInput {
  id: string;
  status?: HandoffStatus;
  assignedAgentId?: string;
  clearAssignedAgentId?: boolean;
  takenAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  metadata?: Record<string, unknown>;
}

export interface ListWaitingHandoffsFilter {
  limit?: number;
}

export interface HandoffRepository {
  createHandoff(
    input: CreateHandoffInput,
  ): Promise<HumanHandoff>;

  getActiveHandoff(
    conversationId: string,
  ): Promise<HumanHandoff | null>;

  updateHandoff(
    input: UpdateHandoffInput,
  ): Promise<HumanHandoff>;

  listWaitingHandoffs(
    filter?: ListWaitingHandoffsFilter,
  ): Promise<HumanHandoff[]>;
}
