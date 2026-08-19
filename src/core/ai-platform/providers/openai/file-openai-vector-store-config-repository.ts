import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  OpenAIVectorStoreConfig,
  OpenAIVectorStoreConfigRepository,
  OpenAIVectorStoreTarget,
} from "@/core/ai-platform/providers/openai/openai-rag-types";

const DEFAULT_CONFIG_PATH = path.join(
  process.cwd(),
  ".rag-v2",
  "openai-vector-stores.json",
);

function keyForTarget(
  target: OpenAIVectorStoreTarget,
): string {
  return `${target.audience}:${target.environment}`;
}

type ConfigFile = Record<
  string,
  OpenAIVectorStoreConfig
>;

export class FileOpenAIVectorStoreConfigRepository
  implements OpenAIVectorStoreConfigRepository
{
  constructor(
    private readonly filePath = DEFAULT_CONFIG_PATH,
  ) {}

  async getVectorStoreConfig(
    target: OpenAIVectorStoreTarget,
  ): Promise<OpenAIVectorStoreConfig | null> {
    const configs =
      await this.readConfigs();

    const config =
      configs[keyForTarget(target)];

    return config
      ? {
          ...config,
        }
      : null;
  }

  async saveVectorStoreConfig(
    config: OpenAIVectorStoreConfig,
  ): Promise<void> {
    const configs =
      await this.readConfigs();

    configs[keyForTarget(config)] = {
      ...config,
    };

    await mkdir(
      path.dirname(this.filePath),
      {
        recursive: true,
      },
    );

    await writeFile(
      this.filePath,
      JSON.stringify(
        configs,
        null,
        2,
      ),
      "utf8",
    );
  }

  private async readConfigs(): Promise<ConfigFile> {
    try {
      return JSON.parse(
        await readFile(
          this.filePath,
          "utf8",
        ),
      ) as ConfigFile;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return {};
      }

      throw error;
    }
  }
}
