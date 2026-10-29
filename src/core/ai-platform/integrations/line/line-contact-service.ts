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
import type {
  LineProfileClient,
} from "@/core/ai-platform/integrations/line/line-profile-client";

export const LINE_PROFILE_TTL_MS =
  24 * 60 * 60 * 1000;

export class LineContactService {
  constructor(
    private readonly dependencies: {
      repository: ChannelContactRepository;
      profileClient: LineProfileClient;
      now?: () => string;
    },
  ) {}

  async getCachedContact(
    identity: ChannelContactIdentity,
  ): Promise<ChannelContact | null> {
    return this.dependencies.repository
      .getContact(identity);
  }

  async refreshIfStale(
    identity: ChannelContactIdentity,
  ): Promise<ChannelContact | null> {
    const existing =
      await this.dependencies.repository
        .getContact(identity);
    const now =
      this.dependencies.now?.() ??
      new Date().toISOString();
    const age =
      new Date(now).getTime() -
      new Date(
        existing?.profileFetchedAt ?? 0,
      ).getTime();
    if (
      existing &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < LINE_PROFILE_TTL_MS
    ) {
      return existing;
    }

    try {
      const profile =
        await this.dependencies.profileClient
          .getProfile(
            identity.channelUserId,
          );
      return this.dependencies.repository
        .upsertContact({
          id: channelContactId(identity),
          ...identity,
          ...profile,
          profileFetchedAt: now,
          createdAt:
            existing?.createdAt ?? now,
          updatedAt: now,
        });
    } catch {
      return existing;
    }
  }
}
