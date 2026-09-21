import {
  createHash,
} from "node:crypto";

import type {
  ChannelResponseConfigRepository,
  UpsertChannelResponseConfigInput,
} from "@/core/ai-platform/repositories/channel-response-config-repository";

import type {
  ChannelResponseConfig,
  ExternalResponseChannel,
} from "@/core/ai-platform/types/channel-response";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

import {
  removeUndefinedFirestoreValues,
} from "./firestore-serialization";

const CHANNEL_RESPONSE_CONFIGS_COLLECTION =
  "ai_platform_channel_response_configs";

interface FirestoreDocumentSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface FirestoreDocumentReference {
  get(): Promise<FirestoreDocumentSnapshot>;
  set(
    data: Record<string, unknown>,
  ): Promise<unknown>;
}

interface FirestoreCollectionReference {
  doc(id: string): FirestoreDocumentReference;
}

interface FirestoreLike {
  collection(
    name: string,
  ): FirestoreCollectionReference;
}

function idForConfig(
  channel: ExternalResponseChannel,
  channelAccountId: string,
): string {
  const accountHash = createHash("sha256")
    .update(channelAccountId)
    .digest("hex");

  return `${channel}_${accountHash}`;
}

export class FirestoreChannelResponseConfigRepository
  implements ChannelResponseConfigRepository
{
  private readonly db: FirestoreLike;

  constructor(db?: FirestoreLike) {
    this.db =
      db ??
      (firestore as unknown as FirestoreLike);
  }

  async getConfig(
    channel: ExternalResponseChannel,
    channelAccountId: string,
  ): Promise<ChannelResponseConfig | null> {
    const snapshot = await this.db
      .collection(
        CHANNEL_RESPONSE_CONFIGS_COLLECTION,
      )
      .doc(
        idForConfig(
          channel,
          channelAccountId,
        ),
      )
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const config =
      snapshot.data() as unknown as ChannelResponseConfig;

    if (
      config.channel !== channel ||
      config.channelAccountId !==
        channelAccountId
    ) {
      throw new Error(
        "Channel response config identity mismatch",
      );
    }

    return {
      ...config,
    };
  }

  async upsertConfig(
    input: UpsertChannelResponseConfigInput,
  ): Promise<ChannelResponseConfig> {
    const existing =
      await this.getConfig(
        input.channel,
        input.channelAccountId,
      );
    const config: ChannelResponseConfig = {
      ...input,
      createdAt:
        existing?.createdAt ??
        input.updatedAt,
    };

    await this.db
      .collection(
        CHANNEL_RESPONSE_CONFIGS_COLLECTION,
      )
      .doc(
        idForConfig(
          input.channel,
          input.channelAccountId,
        ),
      )
      .set(
        removeUndefinedFirestoreValues(
          config,
        ) as unknown as Record<
          string,
          unknown
        >,
      );

    return {
      ...config,
    };
  }
}
