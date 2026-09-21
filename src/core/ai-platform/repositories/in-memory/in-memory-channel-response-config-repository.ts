import type {
  ChannelResponseConfigRepository,
  UpsertChannelResponseConfigInput,
} from "@/core/ai-platform/repositories/channel-response-config-repository";

import type {
  ChannelResponseConfig,
  ExternalResponseChannel,
} from "@/core/ai-platform/types/channel-response";

function keyForConfig(
  channel: ExternalResponseChannel,
  channelAccountId: string,
): string {
  return `${channel}:${channelAccountId}`;
}

export class InMemoryChannelResponseConfigRepository
  implements ChannelResponseConfigRepository
{
  private readonly configs =
    new Map<string, ChannelResponseConfig>();

  async getConfig(
    channel: ExternalResponseChannel,
    channelAccountId: string,
  ): Promise<ChannelResponseConfig | null> {
    const config = this.configs.get(
      keyForConfig(
        channel,
        channelAccountId,
      ),
    );

    return config
      ? {
          ...config,
        }
      : null;
  }

  async upsertConfig(
    input: UpsertChannelResponseConfigInput,
  ): Promise<ChannelResponseConfig> {
    const key = keyForConfig(
      input.channel,
      input.channelAccountId,
    );
    const existing =
      this.configs.get(key);
    const config: ChannelResponseConfig = {
      ...input,
      createdAt:
        existing?.createdAt ??
        input.updatedAt,
    };

    this.configs.set(key, {
      ...config,
    });

    return {
      ...config,
    };
  }
}
