import type {
  ExternalChannelTextSendInput,
  ExternalChannelTextSender,
} from "@/core/ai-platform/integrations/external-channel-text-sender";

import type {
  FacebookSendClient,
} from "@/core/ai-platform/integrations/facebook/facebook-send-client";

export class FacebookExternalTextSender
  implements ExternalChannelTextSender
{
  readonly channel = "facebook" as const;

  constructor(
    private readonly client: FacebookSendClient,
  ) {}

  async sendText(
    input: ExternalChannelTextSendInput,
  ) {
    const result = await this.client.sendText({
      pageId: input.channelAccountId,
      recipientId: input.channelUserId,
      text: input.text,
    });

    return {
      providerMessageId: result.messageId,
    };
  }
}
