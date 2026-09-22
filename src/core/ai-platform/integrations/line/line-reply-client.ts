export interface LineReplyClient {
  replyText(
    replyToken: string,
    text: string,
  ): Promise<void>;
}

export interface LineMessagingApiReplyClientOptions {
  channelAccessToken: string;
  fetchImplementation?: typeof fetch;
}

export class LineMessagingApiReplyClient
  implements LineReplyClient
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
}
