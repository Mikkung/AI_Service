import {
  createHash,
} from "node:crypto";

import type {
  ChannelContactIdentity,
} from "@/core/ai-platform/repositories/channel-contact-repository";

export function channelContactId(
  identity: ChannelContactIdentity,
): string {
  return `contact-${createHash("sha256")
    .update(
      [
        identity.channel,
        identity.channelAccountId,
        identity.channelUserId,
      ].join("\u0000"),
    )
    .digest("hex")}`;
}
