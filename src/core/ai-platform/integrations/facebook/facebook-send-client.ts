export interface FacebookTextSendInput {
  pageId: string;
  recipientId: string;
  text: string;
}

export interface FacebookTextSendResult {
  recipientId: string;
  messageId: string;
}

export interface FacebookSendClient {
  sendText(
    input: FacebookTextSendInput,
  ): Promise<FacebookTextSendResult>;
}

export class FacebookSendRejectedError extends Error {
  constructor(readonly status: number) {
    super("Facebook rejected the Messenger send request");
    this.name = "FacebookSendRejectedError";
  }
}

export class FacebookDeliveryUncertainError extends Error {
  constructor() {
    super(
      "Facebook delivery outcome is uncertain and requires manual reconciliation",
    );
    this.name = "FacebookDeliveryUncertainError";
  }
}

export class FacebookGraphApiSendClient
  implements FacebookSendClient
{
  constructor(
    private readonly options: {
      pageAccessToken: string;
      pageId: string;
      graphApiVersion: string;
      fetch?: typeof fetch;
    },
  ) {}

  async sendText(
    input: FacebookTextSendInput,
  ): Promise<FacebookTextSendResult> {
    if (input.pageId !== this.options.pageId) {
      throw new Error("Facebook Page identity mismatch");
    }

    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(
        `https://graph.facebook.com/${encodeURIComponent(this.options.graphApiVersion)}/${encodeURIComponent(this.options.pageId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.pageAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recipient: { id: input.recipientId },
            messaging_type: "RESPONSE",
            message: { text: input.text },
          }),
        },
      );
    } catch {
      throw new FacebookDeliveryUncertainError();
    }

    if (!response.ok) {
      throw new FacebookSendRejectedError(response.status);
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new FacebookDeliveryUncertainError();
    }

    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as Record<string, unknown>).recipient_id !== "string" ||
      typeof (value as Record<string, unknown>).message_id !== "string" ||
      (value as Record<string, unknown>).recipient_id !== input.recipientId
    ) {
      throw new FacebookDeliveryUncertainError();
    }

    return {
      recipientId: (value as Record<string, string>).recipient_id,
      messageId: (value as Record<string, string>).message_id,
    };
  }
}
