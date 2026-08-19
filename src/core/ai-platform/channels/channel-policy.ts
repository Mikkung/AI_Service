import type {
  Channel,
  ChannelPolicy,
} from "@/core/ai-platform/types/channels";

const CHANNEL_POLICIES: Record<
  Channel,
  ChannelPolicy
> = {
  web: {
    channel: "web",
    channelAudience: "external",
    allowedKnowledgeAudience: "public",
  },
  line: {
    channel: "line",
    channelAudience: "external",
    allowedKnowledgeAudience: "public",
  },
  facebook: {
    channel: "facebook",
    channelAudience: "external",
    allowedKnowledgeAudience: "public",
  },
  teams: {
    channel: "teams",
    channelAudience: "internal",
    allowedKnowledgeAudience: "internal",
  },
};

export function getChannelPolicy(
  channel: Channel,
): ChannelPolicy {
  return CHANNEL_POLICIES[channel];
}

export function getAllowedKnowledgeAudienceForChannel(
  channel: Channel,
): ChannelPolicy["allowedKnowledgeAudience"] {
  return getChannelPolicy(channel)
    .allowedKnowledgeAudience;
}
