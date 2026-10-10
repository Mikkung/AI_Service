import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  FacebookMessageService,
  FacebookTextInboundEvent,
} from "@/core/ai-platform/integrations/facebook/facebook-message-service";

export interface FacebookWebhookSummary {
  processed: number;
  ignored: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function timingSafeTokenEqual(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualDigest = createHmac("sha256", "facebook-verify-token").update(actual).digest();
  const expectedDigest = createHmac("sha256", "facebook-verify-token").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function verifyFacebookWebhookSignature(
  rawBody: Uint8Array,
  signature: string | null,
  appSecret: string,
): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const hex = signature.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const provided = Buffer.from(hex, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function normalizeTextEvent(
  value: unknown,
  entryPageId: string,
  trustedPageId: string,
): FacebookTextInboundEvent | null {
  if (!isRecord(value)) return null;
  const sender = value.sender;
  const recipient = value.recipient;
  const message = value.message;
  if (!isRecord(message) || message.is_echo === true || typeof message.text !== "string") return null;
  if (!isRecord(sender) || !isRecord(recipient)) return null;
  if (
    entryPageId !== trustedPageId ||
    recipient.id !== trustedPageId ||
    typeof sender.id !== "string" || !sender.id ||
    typeof message.mid !== "string" || !message.mid
  ) return null;

  return {
    channelAccountId: trustedPageId,
    channelUserId: sender.id,
    channelMessageId: `facebook-message:${message.mid}`,
    facebookMessageId: message.mid,
    text: message.text,
  };
}

export async function processFacebookWebhook(
  rawBody: Uint8Array,
  trustedPageId: string,
  service: Pick<FacebookMessageService, "processTextEvent">,
): Promise<FacebookWebhookSummary> {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    throw new Error("Malformed Facebook webhook JSON");
  }
  if (!isRecord(payload) || !Array.isArray(payload.entry)) {
    throw new Error("Malformed Facebook webhook payload");
  }

  let processed = 0;
  let ignored = 0;
  if (payload.object !== "page") {
    return { processed, ignored: Math.max(1, payload.entry.length) };
  }

  for (const entry of payload.entry) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !Array.isArray(entry.messaging)) {
      ignored += 1;
      continue;
    }
    for (const event of entry.messaging) {
      const normalized = normalizeTextEvent(event, entry.id, trustedPageId);
      if (!normalized) {
        ignored += 1;
        continue;
      }
      await service.processTextEvent(normalized);
      processed += 1;
    }
  }
  return { processed, ignored };
}
