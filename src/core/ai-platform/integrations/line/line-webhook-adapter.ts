import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type {
  LineMessageService,
  LineTextInboundEvent,
} from "@/core/ai-platform/integrations/line/line-message-service";

interface ParsedLineWebhook {
  destination?: string;
  events: unknown[];
}

export interface LineWebhookSummary {
  processed: number;
  ignored: number;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function verifyLineWebhookSignature(
  rawBody: Uint8Array,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature) {
    return false;
  }

  const expected = createHmac(
    "sha256",
    channelSecret,
  )
    .update(rawBody)
    .digest();
  let provided: Buffer;

  try {
    provided = Buffer.from(
      signature,
      "base64",
    );
  } catch {
    return false;
  }

  return (
    provided.length ===
      expected.length &&
    timingSafeEqual(provided, expected)
  );
}

function parseWebhook(
  rawBody: Uint8Array,
): ParsedLineWebhook {
  let value: unknown;

  try {
    value = JSON.parse(
      Buffer.from(rawBody).toString(
        "utf8",
      ),
    );
  } catch {
    throw new Error(
      "Malformed LINE webhook JSON",
    );
  }

  if (
    !isRecord(value) ||
    !Array.isArray(value.events)
  ) {
    throw new Error(
      "Malformed LINE webhook payload",
    );
  }

  return {
    destination:
      typeof value.destination ===
      "string"
        ? value.destination
        : undefined,
    events: value.events,
  };
}

function normalizeTextEvent(
  event: unknown,
  destination: string | undefined,
): LineTextInboundEvent | null {
  if (!isRecord(event)) {
    return null;
  }

  if (event.type !== "message") {
    return null;
  }

  const message = event.message;
  const source = event.source;

  if (
    !isRecord(message) ||
    message.type !== "text"
  ) {
    return null;
  }

  if (
    !isRecord(source) ||
    source.type !== "user"
  ) {
    return null;
  }

  const webhookEventId =
    event.webhookEventId;
  const lineMessageId = message.id;
  const channelMessageId =
    typeof webhookEventId ===
      "string" &&
    webhookEventId.length > 0
      ? webhookEventId
      : typeof lineMessageId ===
            "string" &&
          lineMessageId.length > 0
        ? `line-message:${lineMessageId}`
        : undefined;

  if (
    !destination ||
    destination.length === 0 ||
    typeof source.userId !==
      "string" ||
    source.userId.length === 0 ||
    typeof event.replyToken !==
      "string" ||
    event.replyToken.length === 0 ||
    typeof lineMessageId !==
      "string" ||
    lineMessageId.length === 0 ||
    typeof message.text !==
      "string" ||
    !channelMessageId
  ) {
    throw new Error(
      "Malformed LINE text message event",
    );
  }

  return {
    channelAccountId: destination,
    channelUserId: source.userId,
    channelMessageId,
    lineMessageId,
    replyToken: event.replyToken,
    text: message.text,
  };
}

export async function processLineWebhook(
  rawBody: Uint8Array,
  lineMessageService: Pick<
    LineMessageService,
    "processTextEvent"
  >,
): Promise<LineWebhookSummary> {
  const webhook = parseWebhook(rawBody);
  let processed = 0;
  let ignored = 0;

  for (const event of webhook.events) {
    const normalized =
      normalizeTextEvent(
        event,
        webhook.destination,
      );

    if (!normalized) {
      ignored += 1;
      continue;
    }

    await lineMessageService
      .processTextEvent(normalized);
    processed += 1;
  }

  return {
    processed,
    ignored,
  };
}
