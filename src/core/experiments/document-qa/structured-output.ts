import { z } from "zod";

import type {
  DocumentQAOutput,
  DocumentQAUsage,
} from "@/core/experiments/document-qa/types";

const evidenceSchema = z.object({
  text: z.string(),
});

const payloadSchema = z.object({
  answerable: z.boolean(),
  answer: z.string(),
  evidence: z.array(evidenceSchema),
});

export class MalformedDocumentQAResponseError
  extends Error
{
  constructor(message = "Malformed document QA response") {
    super(message);
    this.name =
      "MalformedDocumentQAResponseError";
  }
}

export interface ParseDocumentQAResponseMetadata {
  provider: string;
  model: string;
  finishReason?: string;
  usage?: DocumentQAUsage;
}

function parseJsonPayload(
  value: unknown,
): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new MalformedDocumentQAResponseError(
      "Document QA provider returned invalid JSON",
    );
  }
}

export function parseDocumentQAResponse(
  value: unknown,
  metadata: ParseDocumentQAResponseMetadata,
): DocumentQAOutput {
  const parsed =
    payloadSchema.safeParse(
      parseJsonPayload(value),
    );

  if (!parsed.success) {
    throw new MalformedDocumentQAResponseError(
      "Document QA provider response did not match the expected schema",
    );
  }

  const usage =
    metadata.usage &&
    Object.values(metadata.usage).some(
      (item) => item !== undefined,
    )
      ? metadata.usage
      : undefined;

  return {
    ...parsed.data,
    provider:
      metadata.provider,
    model:
      metadata.model,
    finishReason:
      metadata.finishReason,
    usage,
  };
}
