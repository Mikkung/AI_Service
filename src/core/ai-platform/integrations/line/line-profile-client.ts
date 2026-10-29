export interface LineProfile {
  displayName: string;
  pictureUrl?: string;
  language?: string;
}

export interface LineProfileClient {
  getProfile(
    channelUserId: string,
  ): Promise<LineProfile>;
}

export class LineMessagingApiProfileClient
  implements LineProfileClient
{
  private readonly fetchImplementation:
    typeof fetch;

  constructor(
    private readonly options: {
      channelAccessToken: string;
      fetchImplementation?: typeof fetch;
    },
  ) {
    this.fetchImplementation =
      options.fetchImplementation ?? fetch;
  }

  async getProfile(
    channelUserId: string,
  ): Promise<LineProfile> {
    const response =
      await this.fetchImplementation(
        `https://api.line.me/v2/bot/profile/${encodeURIComponent(channelUserId)}`,
        {
          headers: {
            authorization:
              `Bearer ${this.options.channelAccessToken}`,
          },
        },
      );
    if (!response.ok) {
      throw new Error(
        `LINE profile API failed with status ${response.status}`,
      );
    }
    const body =
      await response.json() as Record<
        string,
        unknown
      >;
    if (
      typeof body.displayName !==
        "string" ||
      !body.displayName.trim()
    ) {
      throw new Error(
        "LINE profile API returned an invalid profile",
      );
    }
    return {
      displayName:
        body.displayName.trim(),
      pictureUrl:
        typeof body.pictureUrl ===
          "string"
          ? body.pictureUrl
          : undefined,
      language:
        typeof body.language === "string"
          ? body.language
          : undefined,
    };
  }
}
