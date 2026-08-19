import type {
  CreateHandoffInput,
  HandoffRepository,
  ListWaitingHandoffsFilter,
  UpdateHandoffInput,
} from "@/core/ai-platform/repositories/handoff-repository";

import type {
  HumanHandoff,
} from "@/core/ai-platform/types/conversations";

function cloneHandoff(
  handoff: HumanHandoff,
): HumanHandoff {
  return {
    ...handoff,
    metadata:
      handoff.metadata
        ? {
            ...handoff.metadata,
          }
        : undefined,
  };
}

export class InMemoryHandoffRepository
  implements HandoffRepository
{
  private readonly handoffs =
    new Map<string, HumanHandoff>();

  async createHandoff(
    input: CreateHandoffInput,
  ): Promise<HumanHandoff> {
    if (this.handoffs.has(input.id)) {
      throw new Error(
        `Handoff already exists: ${input.id}`,
      );
    }

    const handoff: HumanHandoff = {
      ...input,
    };

    this.handoffs.set(
      input.id,
      cloneHandoff(handoff),
    );

    return cloneHandoff(handoff);
  }

  async getActiveHandoff(
    conversationId: string,
  ): Promise<HumanHandoff | null> {
    const handoff = [
      ...this.handoffs.values(),
    ]
      .filter(
        (item) =>
          item.conversationId ===
            conversationId &&
          (item.status ===
            "waiting" ||
            item.status === "active"),
      )
      .sort((left, right) =>
        right.requestedAt.localeCompare(
          left.requestedAt,
        ),
      )[0];

    return handoff
      ? cloneHandoff(handoff)
      : null;
  }

  async updateHandoff(
    input: UpdateHandoffInput,
  ): Promise<HumanHandoff> {
    const existing =
      this.handoffs.get(input.id);

    if (!existing) {
      throw new Error(
        `Handoff not found: ${input.id}`,
      );
    }

    const updated: HumanHandoff = {
      ...existing,
      status:
        input.status ??
        existing.status,
      assignedAgentId:
        input.clearAssignedAgentId
          ? undefined
          : input.assignedAgentId ??
            existing.assignedAgentId,
      takenAt:
        input.takenAt ??
        existing.takenAt,
      resolvedAt:
        input.resolvedAt ??
        existing.resolvedAt,
      resolutionNote:
        input.resolutionNote ??
        existing.resolutionNote,
      metadata:
        input.metadata ??
        existing.metadata,
    };

    this.handoffs.set(
      input.id,
      cloneHandoff(updated),
    );

    return cloneHandoff(updated);
  }

  async listWaitingHandoffs(
    filter: ListWaitingHandoffsFilter = {},
  ): Promise<HumanHandoff[]> {
    const limit =
      filter.limit ??
      Number.POSITIVE_INFINITY;

    return [
      ...this.handoffs.values(),
    ]
      .filter(
        (handoff) =>
          handoff.status === "waiting",
      )
      .sort((left, right) =>
        left.requestedAt.localeCompare(
          right.requestedAt,
        ),
      )
      .slice(0, limit)
      .map(cloneHandoff);
  }
}
