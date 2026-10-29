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
import {
  firestore,
} from "@/infrastructure/db/firebase-admin";
import {
  removeUndefinedFirestoreValues,
} from "./firestore-serialization";

const COLLECTION =
  "ai_platform_channel_contacts";

interface Snapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface DocumentReference {
  get(): Promise<Snapshot>;
  set(
    data: Record<string, unknown>,
    options?: { merge: boolean },
  ): Promise<unknown>;
}

interface FirestoreLike {
  collection(name: string): {
    doc(id: string): DocumentReference;
  };
}

export class FirestoreChannelContactRepository
  implements ChannelContactRepository
{
  private readonly db: FirestoreLike;

  constructor(db?: FirestoreLike) {
    this.db =
      db ??
      (firestore as unknown as FirestoreLike);
  }

  async getContact(
    identity: ChannelContactIdentity,
  ): Promise<ChannelContact | null> {
    const snapshot = await this.db
      .collection(COLLECTION)
      .doc(channelContactId(identity))
      .get();
    if (!snapshot.exists) {
      return null;
    }
    return {
      id: snapshot.id,
      ...(snapshot.data() as Omit<
        ChannelContact,
        "id"
      >),
    };
  }

  async upsertContact(
    contact: ChannelContact,
  ): Promise<ChannelContact> {
    const serialized =
      removeUndefinedFirestoreValues(
        contact,
      );
    await this.db
      .collection(COLLECTION)
      .doc(contact.id)
      .set(
        serialized as unknown as Record<
          string,
          unknown
        >,
      );
    return { ...serialized };
  }
}
