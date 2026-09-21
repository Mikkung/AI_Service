import {
  createHash,
} from "node:crypto";

export function suggestedReplyDraftId(
  conversationId: string,
  sourceMessageId: string,
): string {
  return `suggested-reply-${createHash(
    "sha256",
  )
    .update(
      `${conversationId}\u0000${sourceMessageId}`,
    )
    .digest("hex")}`;
}
