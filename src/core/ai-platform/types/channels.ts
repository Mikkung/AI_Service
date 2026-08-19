import type {
  KnowledgeAudience,
} from "@/core/ai-platform/types/knowledge";

export type Channel =
  | "web"
  | "line"
  | "facebook"
  | "teams";

export type ChannelAudience =
  | "external"
  | "internal";

export interface ChannelPolicy {
  channel: Channel;
  channelAudience: ChannelAudience;
  allowedKnowledgeAudience: KnowledgeAudience;
}
