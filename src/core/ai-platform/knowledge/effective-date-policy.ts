import type {
  KnowledgeDocument,
} from "@/core/ai-platform/types/knowledge";

function parseTime(
  timestamp: string,
): number {
  const value =
    Date.parse(timestamp);

  if (Number.isNaN(value)) {
    throw new Error(
      `Invalid UTC timestamp: ${timestamp}`,
    );
  }

  return value;
}

export function isCurrentlyEffective(
  document: KnowledgeDocument,
  now = new Date().toISOString(),
): boolean {
  if (document.status !== "approved") {
    return false;
  }

  const currentTime =
    parseTime(now);

  if (
    document.effectiveFrom &&
    parseTime(document.effectiveFrom) >
      currentTime
  ) {
    return false;
  }

  if (
    document.effectiveTo &&
    parseTime(document.effectiveTo) <
      currentTime
  ) {
    return false;
  }

  return true;
}
