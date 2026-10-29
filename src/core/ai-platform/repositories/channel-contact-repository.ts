import type {
  ChannelContact,
} from "@/core/ai-platform/types/channel-contact";

export interface ChannelContactIdentity {
  channel: ChannelContact["channel"];
  channelAccountId: string;
  channelUserId: string;
}

export interface ChannelContactRepository {
  getContact(
    identity: ChannelContactIdentity,
  ): Promise<ChannelContact | null>;

  upsertContact(
    contact: ChannelContact,
  ): Promise<ChannelContact>;
}
