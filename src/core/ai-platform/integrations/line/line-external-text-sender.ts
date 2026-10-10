import type {
  ExternalChannelTextSendInput,
  ExternalChannelTextSender,
} from "@/core/ai-platform/integrations/external-channel-text-sender";

import type {
  LinePushClient,
} from "@/core/ai-platform/integrations/line/line-reply-client";

export class LineExternalTextSender
  implements ExternalChannelTextSender
{
  readonly channel = "line" as const;

  constructor(
    private readonly client: LinePushClient,
  ) {}

  async sendText(
    input: ExternalChannelTextSendInput,
  ) {
    await this.client.pushText(
      input.channelUserId,
      input.text,
      input.clientRequestId,
    );

    return {};
  }
}
