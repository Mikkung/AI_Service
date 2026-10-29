import type {
  ConversationRepository,
} from "@/core/ai-platform/repositories/conversation-repository";
import type {
  Conversation,
} from "@/core/ai-platform/types/conversations";

export interface LineReadClient {
  markAsRead(
    markAsReadToken: string,
  ): Promise<void>;
}

export class LineMessagingApiReadClient
  implements LineReadClient
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

  async markAsRead(
    markAsReadToken: string,
  ): Promise<void> {
    const response =
      await this.fetchImplementation(
        "https://api.line.me/v2/bot/chat/markAsRead",
        {
          method: "POST",
          headers: {
            authorization:
              `Bearer ${this.options.channelAccessToken}`,
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            markAsReadToken,
          }),
        },
      );
    if (!response.ok) {
      throw new Error(
        `LINE mark-as-read API failed with status ${response.status}`,
      );
    }
  }
}

export class LineReadSyncService {
  constructor(
    private readonly dependencies: {
      conversationRepository:
        ConversationRepository;
      readClient: LineReadClient;
      now?: () => string;
    },
  ) {}

  async markReadBestEffort(
    conversation: Conversation,
  ): Promise<boolean> {
    const token =
      conversation.lineMarkAsReadToken;
    if (
      conversation.channel !== "line" ||
      !token ||
      conversation.lineMarkedReadToken ===
        token
    ) {
      return false;
    }
    try {
      await this.dependencies.readClient
        .markAsRead(token);
      return this.dependencies
        .conversationRepository
        .markLineReadSynced(
          conversation.id,
          token,
          this.dependencies.now?.() ??
            new Date().toISOString(),
        );
    } catch {
      return false;
    }
  }
}
