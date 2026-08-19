import type {
  DocumentQAProvider,
} from "@/core/experiments/document-qa/types";

import {
  GeminiDocumentQAProvider,
} from "@/core/experiments/document-qa/providers/gemini-document-qa-provider";

export class UnsupportedDocumentQAProviderError
  extends Error
{
  constructor(provider: string) {
    super(
      `Unsupported document QA provider: ${provider}`,
    );
    this.name =
      "UnsupportedDocumentQAProviderError";
  }
}

export function getDefaultDocumentQAProviderName(): string {
  return (
    process.env.EXPERIMENT_DOCUMENT_QA_PROVIDER ??
    "gemini"
  );
}

export function getDocumentQAProvider(
  providerName = getDefaultDocumentQAProviderName(),
): DocumentQAProvider {
  const normalized =
    providerName.trim().toLowerCase();

  if (normalized === "gemini") {
    return new GeminiDocumentQAProvider();
  }

  throw new UnsupportedDocumentQAProviderError(
    providerName,
  );
}

export function listDocumentQAProviderNames(): string[] {
  return [
    "gemini",
  ];
}
