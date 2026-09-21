import type {
  ChannelResponseConfigRepository,
  UpsertChannelResponseConfigInput,
} from "@/core/ai-platform/repositories/channel-response-config-repository";

import type {
  ChannelResponseConfig,
  ExternalResponseChannel,
  ResponseMode,
} from "@/core/ai-platform/types/channel-response";

export interface EffectiveChannelResponseConfig {
  channel: ExternalResponseChannel;
  channelAccountId: string;
  responseMode: ResponseMode;
  configured: boolean;
  config: ChannelResponseConfig | null;
}

export class ChannelResponseConfigService {
  constructor(
    private readonly repository: ChannelResponseConfigRepository,
    private readonly now: () => string = () =>
      new Date().toISOString(),
  ) {}

  async resolveResponseMode(
    channel: ExternalResponseChannel,
    channelAccountId: string,
  ): Promise<EffectiveChannelResponseConfig> {
    const config =
      await this.repository.getConfig(
        channel,
        channelAccountId,
      );

    return {
      channel,
      channelAccountId,
      responseMode:
        config?.responseMode ?? "off",
      configured: config !== null,
      config,
    };
  }

  async updateResponseMode(
    input: Omit<
      UpsertChannelResponseConfigInput,
      "updatedAt"
    >,
  ): Promise<ChannelResponseConfig> {
    return this.repository.upsertConfig({
      ...input,
      updatedAt: this.now(),
    });
  }
}
