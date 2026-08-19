import {
  isCurrentlyEffective,
} from "@/core/ai-platform/knowledge/effective-date-policy";

import type {
  KnowledgeDocument,
} from "@/core/ai-platform/types/knowledge";

import type {
  KnowledgePublicationEnvironment,
} from "@/core/ai-platform/types/knowledge-publication";

export type KnowledgePublicationTarget =
  | "public"
  | "internal";

export interface KnowledgePublicationPolicyInput {
  document: KnowledgeDocument;
  targetAudience: KnowledgePublicationTarget;
  targetEnvironment: KnowledgePublicationEnvironment;
  now?: string;
}

export function assertCanPublishKnowledge(
  input: KnowledgePublicationPolicyInput,
): void {
  if (
    input.document.audience !==
    input.targetAudience
  ) {
    throw new Error(
      `Cannot publish ${input.document.audience} knowledge to ${input.targetAudience} target`,
    );
  }

  if (
    !isCurrentlyEffective(
      input.document,
      input.now,
    )
  ) {
    throw new Error(
      "Only approved and currently effective knowledge can be published",
    );
  }
}
