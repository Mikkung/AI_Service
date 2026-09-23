export interface LineReplyClient {
  replyText(
    replyToken: string,
    text: string,
  ): Promise<void>;
}

export interface LinePushResult {
  duplicateAccepted: boolean;
}

export interface LinePushClient {
  pushText(
    channelUserId: string,
    text: string,
    retryKey: string,
  ): Promise<LinePushResult>;
}

export interface LineMessagingApiReplyClientOptions {
  channelAccessToken: string;
  fetchImplementation?: typeof fetch;
}

export class LineMessagingApiReplyClient
  implements LineReplyClient, LinePushClient
{
  private readonly fetchImplementation: typeof fetch;

  constructor(
    private readonly options: LineMessagingApiReplyClientOptions,
  ) {
    this.fetchImplementation =
      options.fetchImplementation ?? fetch;
  }

  async replyText(
    replyToken: string,
    text: string,
  ): Promise<void> {
    const response =
      await this.fetchImplementation(
        "https://api.line.me/v2/bot/message/reply",
        {
          method: "POST",
          headers: {
            authorization:
              `Bearer ${this.options.channelAccessToken}`,
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            replyToken,
            messages: [
              {
                type: "text",
                text,
              },
            ],
          }),
        },
      );

    if (!response.ok) {
      throw new Error(
        `LINE reply API failed with status ${response.status}`,
      );
    }
  }

  async pushText(
    channelUserId: string,
    text: string,
    retryKey: string,
  ): Promise<LinePushResult> {
    const response =
      await this.fetchImplementation(
        "https://api.line.me/v2/bot/message/push",
        {
          method: "POST",
          headers: {
            authorization:
              `Bearer ${this.options.channelAccessToken}`,
            "content-type":
              "application/json",
            "x-line-retry-key":
              retryKey,
          },
          body: JSON.stringify({
            to: channelUserId,
            messages: [
              {
                type: "text",
                text,
              },
            ],
          }),
        },
      );

    if (response.ok) {
      return {
        duplicateAccepted: false,
      };
    }

    const acceptedRequestId =
      response.headers
        .get(
          "x-line-accepted-request-id",
        )
        ?.trim();

    if (
      response.status === 409 &&
      acceptedRequestId
    ) {
      return {
        duplicateAccepted: true,
      };
    }

    throw new Error(
      `LINE push API failed with status ${response.status}`,
    );
  }
}
