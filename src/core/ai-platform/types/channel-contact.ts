import type {
  Channel,
} from "@/core/ai-platform/types/channels";

export interface ChannelContact {
  id: string;
  channel: Channel;
  channelAccountId: string;
  channelUserId: string;
  displayName?: string;
  pictureUrl?: string;
  language?: string;
  profileFetchedAt: string;
  createdAt: string;
  updatedAt: string;
}
