import {
  MockGroundedQAProvider,
  type MockGroundedQAScenario,
} from "@/core/ai-platform/providers/mock/mock-grounded-qa-provider";

import {
  OpenAIGroundedQAProvider,
  type OpenAIGroundedQAClient,
} from "@/core/ai-platform/providers/openai/openai-grounded-qa-provider";

import type {
  OpenAIVectorStoreConfigRepository,
} from "@/core/ai-platform/providers/openai/openai-rag-types";

import type {
  GroundedQAProvider,
} from "@/core/ai-platform/types/grounded-answer";

export class UnsupportedGroundedQAProviderError
  extends Error
{
  constructor(provider: string) {
    super(
      `Unsupported grounded QA provider: ${provider}`,
    );
    this.name =
      "UnsupportedGroundedQAProviderError";
  }
}

export interface GetGroundedQAProviderOptions {
  scenario?: MockGroundedQAScenario;
  openai?: {
    client?: OpenAIGroundedQAClient;
    apiKey?: string;
    model?: string;
    vectorStoreId?: string;
    vectorStoreConfigRepository?: OpenAIVectorStoreConfigRepository;
  };
}

export function getGroundedQAProvider(
  providerName: string,
  options: GetGroundedQAProviderOptions = {},
): GroundedQAProvider {
  const normalized =
    providerName.trim().toLowerCase();

  if (normalized === "mock") {
    return new MockGroundedQAProvider({
      scenario:
        options.scenario,
    });
  }

  if (normalized === "openai") {
    return new OpenAIGroundedQAProvider(
      options.openai,
    );
  }

  throw new UnsupportedGroundedQAProviderError(
    providerName,
  );
}

export function listGroundedQAProviderNames(): string[] {
  return [
    "mock",
    "openai",
  ];
}
