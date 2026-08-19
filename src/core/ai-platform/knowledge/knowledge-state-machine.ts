import type {
  KnowledgeApprovalAction,
  KnowledgeStatus,
} from "@/core/ai-platform/types/knowledge";

const ALLOWED_TRANSITIONS: Record<
  KnowledgeStatus,
  KnowledgeStatus[]
> = {
  draft: [
    "review",
    "archived",
  ],
  review: [
    "draft",
    "approved",
  ],
  approved: [
    "superseded",
    "archived",
  ],
  superseded: [
    "archived",
  ],
  archived: [],
};

export function canTransitionKnowledgeStatus(
  from: KnowledgeStatus,
  to: KnowledgeStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]
    .includes(to);
}

export function assertKnowledgeStatusTransition(
  from: KnowledgeStatus,
  to: KnowledgeStatus,
): void {
  if (
    !canTransitionKnowledgeStatus(
      from,
      to,
    )
  ) {
    throw new Error(
      `Invalid knowledge status transition: ${from} to ${to}`,
    );
  }
}

export function approvalActionForTransition(
  to: KnowledgeStatus,
): KnowledgeApprovalAction {
  if (to === "review") {
    return "submitted_for_review";
  }

  if (to === "draft") {
    return "returned_to_draft";
  }

  if (to === "approved") {
    return "approved";
  }

  if (to === "superseded") {
    return "superseded";
  }

  return "archived";
}
