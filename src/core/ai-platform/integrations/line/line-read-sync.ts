import type {
  ConversationRepository,
} from "@/core/ai-platform/repositories/conversation-repository";
import type {
  Conversation,
} from "@/core/ai-platform/types/conversations";

export type LineReadSyncStatus =
  | "synced"
  | "already_synced"
  | "no_token"
  | "not_line"
  | "failed";

export type LineReadSyncOperationSource =
  | "staff_open"
  | "staff_reply"
  | "ai_auto_reply"
  | "unknown";

export interface LineReadSyncResult {
  status: LineReadSyncStatus;
}

export interface LineReadClient {
  markAsRead(
    markAsReadToken: string,
  ): Promise<void>;
}

export class LineMarkAsReadApiError extends Error {
  constructor(
    readonly status: number,
    readonly providerMessage?: string,
  ) {
    super(
      providerMessage
        ? `LINE mark-as-read API failed with status ${status}: ${providerMessage}`
        : `LINE mark-as-read API failed with status ${status}`,
    );
    this.name = "LineMarkAsReadApiError";
  }
}

function sanitizeProviderMessage(
  rawBody: string,
  secrets: string[],
): string | undefined {
  let candidate = rawBody;
  try {
    const parsed = JSON.parse(rawBody) as {
      message?: unknown;
    };
    if (typeof parsed.message === "string") {
      candidate = parsed.message;
    }
  } catch {
    // A small plain-text provider response is still useful diagnostics.
  }

  candidate = candidate
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim();
  for (const secret of secrets) {
    if (secret) {
      candidate = candidate.replaceAll(
        secret,
        "[REDACTED]",
      );
    }
  }
  candidate = candidate.slice(0, 500);
  return candidate || undefined;
}

export class LineMessagingApiReadClient
  implements LineReadClient
{
  // Operational prerequisite (check separately with GET /v2/bot/info):
  // chatMode must be "chat" and markAsReadMode must be "manual".
  // Bot-info is intentionally not fetched on the request path.
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
            "content-type": "application/json",
          },
          body: JSON.stringify({
            markAsReadToken,
          }),
        },
      );
    if (!response.ok) {
      const rawBody =
        (await response.text()).slice(
          0,
          2_000,
        );
      throw new LineMarkAsReadApiError(
        response.status,
        sanitizeProviderMessage(
          rawBody,
          [
            markAsReadToken,
            this.options.channelAccessToken,
          ],
        ),
      );
    }
  }
}

interface LineReadSyncLogger {
  info(
    message: string,
    context: Record<string, unknown>,
  ): void;
  error(
    message: string,
    context: Record<string, unknown>,
  ): void;
}

export class LineReadSyncService {
  private readonly logger: LineReadSyncLogger;

  constructor(
    private readonly dependencies: {
      conversationRepository:
        ConversationRepository;
      readClient: LineReadClient;
      now?: () => string;
      logger?: LineReadSyncLogger;
    },
  ) {
    this.logger = dependencies.logger ?? console;
  }

  async markReadBestEffort(
    conversation: Conversation,
    operationSource: LineReadSyncOperationSource =
      "unknown",
  ): Promise<LineReadSyncResult> {
    const logContext = {
      conversationId: conversation.id,
      operationSource,
    };

    if (conversation.channel !== "line") {
      this.logger.info(
        "LINE mark-as-read skipped",
        {
          ...logContext,
          outcome: "skipped_not_line",
        },
      );
      return { status: "not_line" };
    }

    const token = conversation.lineMarkAsReadToken;
    if (!token) {
      this.logger.info(
        "LINE mark-as-read skipped",
        {
          ...logContext,
          outcome: "skipped_no_token",
        },
      );
      return { status: "no_token" };
    }

    if (
      conversation.lineMarkedReadToken === token
    ) {
      this.logger.info(
        "LINE mark-as-read skipped",
        {
          ...logContext,
          outcome:
            "skipped_already_synced",
        },
      );
      return {
        status: "already_synced",
      };
    }

    try {
      await this.dependencies.readClient
        .markAsRead(token);
      const persisted =
        await this.dependencies
          .conversationRepository
          .markLineReadSynced(
            conversation.id,
            token,
            this.dependencies.now?.() ??
              new Date().toISOString(),
          );
      if (!persisted) {
        this.logger.error(
          "LINE mark-as-read state changed before persistence",
          {
            ...logContext,
            outcome: "api_success",
          },
        );
        return { status: "failed" };
      }
      this.logger.info(
        "LINE mark-as-read succeeded",
        {
          ...logContext,
          outcome: "api_success",
        },
      );
      return { status: "synced" };
    } catch (error) {
      this.logger.error(
        "LINE mark-as-read failed",
        {
          ...logContext,
          outcome: "api_failure",
          status:
            error instanceof
            LineMarkAsReadApiError
              ? error.status
              : undefined,
          message:
            error instanceof
            LineMarkAsReadApiError
              ? error.providerMessage
              : "LINE mark-as-read request failed",
        },
      );
      return { status: "failed" };
    }
  }
}
