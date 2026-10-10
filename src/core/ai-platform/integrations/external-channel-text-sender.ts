import type {
  ExternalResponseChannel,
} from "@/core/ai-platform/types/channel-response";

export interface ExternalChannelTextSendInput {
  channelAccountId: string;
  channelUserId: string;
  text: string;
  clientRequestId: string;
}

export interface ExternalChannelTextSendResult {
  providerMessageId?: string;
}

export interface ExternalChannelTextSender {
  readonly channel: ExternalResponseChannel;
  sendText(
    input: ExternalChannelTextSendInput,
  ): Promise<ExternalChannelTextSendResult>;
}

export type ExternalChannelTextSenderRegistry = Partial<
  Record<ExternalResponseChannel, ExternalChannelTextSender>
>;
