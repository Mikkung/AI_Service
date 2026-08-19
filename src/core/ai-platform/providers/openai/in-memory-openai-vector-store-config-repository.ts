import type {
  OpenAIVectorStoreConfig,
  OpenAIVectorStoreConfigRepository,
  OpenAIVectorStoreTarget,
} from "@/core/ai-platform/providers/openai/openai-rag-types";

function keyForTarget(
  target: OpenAIVectorStoreTarget,
): string {
  return `${target.audience}:${target.environment}`;
}

export class InMemoryOpenAIVectorStoreConfigRepository
  implements OpenAIVectorStoreConfigRepository
{
  private readonly configs =
    new Map<string, OpenAIVectorStoreConfig>();

  async getVectorStoreConfig(
    target: OpenAIVectorStoreTarget,
  ): Promise<OpenAIVectorStoreConfig | null> {
    const config =
      this.configs.get(
        keyForTarget(target),
      );

    return config
      ? {
          ...config,
        }
      : null;
  }

  async saveVectorStoreConfig(
    config: OpenAIVectorStoreConfig,
  ): Promise<void> {
    this.configs.set(
      keyForTarget(config),
      {
        ...config,
      },
    );
  }
}
