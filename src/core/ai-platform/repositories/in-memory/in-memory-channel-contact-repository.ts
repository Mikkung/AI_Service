import {
  channelContactId,
} from "@/core/ai-platform/repositories/channel-contact-id";
import type {
  ChannelContactIdentity,
  ChannelContactRepository,
} from "@/core/ai-platform/repositories/channel-contact-repository";
import type {
  ChannelContact,
} from "@/core/ai-platform/types/channel-contact";

export class InMemoryChannelContactRepository
  implements ChannelContactRepository
{
  private readonly contacts =
    new Map<string, ChannelContact>();

  async getContact(
    identity: ChannelContactIdentity,
  ): Promise<ChannelContact | null> {
    const contact = this.contacts.get(
      channelContactId(identity),
    );
    return contact ? { ...contact } : null;
  }

  async upsertContact(
    contact: ChannelContact,
  ): Promise<ChannelContact> {
    this.contacts.set(
      contact.id,
      { ...contact },
    );
    return { ...contact };
  }
}
