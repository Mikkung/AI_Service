import type {
  ChannelResponseConfig,
  ExternalResponseChannel,
  ResponseMode,
} from "@/core/ai-platform/types/channel-response";

export interface UpsertChannelResponseConfigInput {
  channel: ExternalResponseChannel;
  channelAccountId: string;
  responseMode: ResponseMode;
  updatedAt: string;
}

export interface ChannelResponseConfigRepository {
  getConfig(
    channel: ExternalResponseChannel,
    channelAccountId: string,
  ): Promise<ChannelResponseConfig | null>;

  upsertConfig(
    input: UpsertChannelResponseConfigInput,
  ): Promise<ChannelResponseConfig>;
}
