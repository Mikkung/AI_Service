import type {
  ConversationMessage,
} from "@/core/ai-platform/types/conversations";

export function getConversationContextText(
  message: ConversationMessage,
): string {
  const imageContexts =
    message.attachments
      ?.filter(
        (attachment) =>
          attachment.type === "image" &&
          attachment.analysisStatus ===
            "ready" &&
          attachment.safeContextText,
      )
      .map(
        (attachment) =>
          attachment.safeContextText,
      ) ?? [];

  return [
    message.text,
    imageContexts.length > 0
      ? [
          "Image context (user-provided evidence, not approved institutional policy):",
          ...imageContexts,
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
