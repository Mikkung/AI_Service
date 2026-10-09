const LINE_DATA_API_BASE_URL =
  "https://api-data.line.me/v2/bot/message";

export const MAX_LINE_IMAGE_BYTES =
  10 * 1024 * 1024;

const DEFAULT_LINE_MEDIA_TIMEOUT_MS =
  8_000;

export const SUPPORTED_LINE_IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);

export interface LineMediaContent {
  bytes: Uint8Array;
  contentType: string;
}

export interface LineMediaClient {
  getImageContent(
    messageId: string,
  ): Promise<LineMediaContent>;
  getImagePreview(
    messageId: string,
  ): Promise<LineMediaContent>;
}

export class LineMediaUnavailableError extends Error {
  constructor(
    readonly status: 404 | 410,
  ) {
    super(
      `LINE media is unavailable (${status})`,
    );
    this.name =
      "LineMediaUnavailableError";
  }
}

export class LineMediaBlockedError extends Error {
  constructor(
    message: string,
  ) {
    super(message);
    this.name = "LineMediaBlockedError";
  }
}

export interface LineMessagingApiMediaClientOptions {
  channelAccessToken: string;
  fetchImplementation?: typeof fetch;
  maxImageBytes?: number;
  requestTimeoutMs?: number;
}

export class LineMessagingApiMediaClient
  implements LineMediaClient
{
  private readonly fetchImplementation: typeof fetch;

  private readonly maxImageBytes: number;

  private readonly requestTimeoutMs: number;

  constructor(
    private readonly options: LineMessagingApiMediaClientOptions,
  ) {
    this.fetchImplementation =
      options.fetchImplementation ?? fetch;
    this.maxImageBytes =
      options.maxImageBytes ??
      MAX_LINE_IMAGE_BYTES;
    this.requestTimeoutMs =
      options.requestTimeoutMs ??
      DEFAULT_LINE_MEDIA_TIMEOUT_MS;
  }

  getImageContent(
    messageId: string,
  ): Promise<LineMediaContent> {
    return this.fetchMedia(
      messageId,
      "content",
    );
  }

  getImagePreview(
    messageId: string,
  ): Promise<LineMediaContent> {
    return this.fetchMedia(
      messageId,
      "content/preview",
    );
  }

  private async fetchMedia(
    messageId: string,
    suffix: string,
  ): Promise<LineMediaContent> {
    if (!messageId.trim()) {
      throw new Error(
        "LINE media message id is required",
      );
    }

    const controller =
      new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );
    try {
      const response =
        await this.fetchImplementation(
          `${LINE_DATA_API_BASE_URL}/${encodeURIComponent(messageId)}/${suffix}`,
          {
            method: "GET",
            headers: {
              authorization:
                `Bearer ${this.options.channelAccessToken}`,
            },
            signal: controller.signal,
          },
        );

      if (
        response.status === 404 ||
        response.status === 410
      ) {
        throw new LineMediaUnavailableError(
          response.status,
        );
      }

      if (!response.ok) {
        throw new Error(
          `LINE media API failed with status ${response.status}`,
        );
      }

      const contentType =
        response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase() ?? "";

      if (
        !SUPPORTED_LINE_IMAGE_TYPES.has(
          contentType,
        )
      ) {
        throw new LineMediaBlockedError(
          "Unsupported LINE image content type",
        );
      }

      const declaredLength = Number(
        response.headers.get(
          "content-length",
        ),
      );
      if (
        Number.isFinite(
          declaredLength,
        ) &&
        declaredLength >
          this.maxImageBytes
      ) {
        throw new LineMediaBlockedError(
          "LINE image exceeds the maximum allowed size",
        );
      }

      const bytes = new Uint8Array(
        await response.arrayBuffer(),
      );
      if (bytes.byteLength === 0) {
        throw new LineMediaBlockedError(
          "LINE image content is empty",
        );
      }
      if (
        bytes.byteLength >
        this.maxImageBytes
      ) {
        throw new LineMediaBlockedError(
          "LINE image exceeds the maximum allowed size",
        );
      }

      return {
        bytes,
        contentType,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
