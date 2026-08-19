import type {
  ConversationMode,
  ConversationTransition,
} from "@/core/ai-platform/types/conversations";

const ALLOWED_TRANSITIONS: Record<
  ConversationMode,
  ConversationMode[]
> = {
  ai_active: [
    "waiting_human",
  ],
  waiting_human: [
    "human_active",
    "resolved",
  ],
  human_active: [
    "resolved",
  ],
  resolved: [
    "ai_active",
  ],
};

export function canTransitionConversationMode(
  from: ConversationMode,
  to: ConversationMode,
): boolean {
  return ALLOWED_TRANSITIONS[from]
    .includes(to);
}

export function assertConversationTransition(
  transition: ConversationTransition,
): void {
  if (
    !canTransitionConversationMode(
      transition.from,
      transition.to,
    )
  ) {
    throw new Error(
      `Invalid conversation transition: ${transition.from} to ${transition.to}`,
    );
  }
}
