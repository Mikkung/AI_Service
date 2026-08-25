import type {
  CreateHandoffInput,
  HandoffRepository,
  ListWaitingHandoffsFilter,
  UpdateHandoffInput,
} from "@/core/ai-platform/repositories/handoff-repository";

import type {
  HumanHandoff,
} from "@/core/ai-platform/types/conversations";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

import {
  removeUndefinedFirestoreValues,
} from "./firestore-serialization";

const HANDOFFS_COLLECTION =
  "ai_platform_handoffs";

interface FirestoreDocumentSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface FirestoreCollectionSnapshot {
  docs: FirestoreDocumentSnapshot[];
}

interface FirestoreDocumentReference {
  create(
    data: Record<string, unknown>,
  ): Promise<unknown>;
  get(): Promise<FirestoreDocumentSnapshot>;
  set(
    data: Record<string, unknown>,
  ): Promise<unknown>;
}

interface FirestoreCollectionReference {
  doc(id: string): FirestoreDocumentReference;
  get(): Promise<FirestoreCollectionSnapshot>;
}

interface FirestoreLike {
  collection(
    name: string,
  ): FirestoreCollectionReference;
}

function cloneHandoff(
  handoff: HumanHandoff,
): HumanHandoff {
  return {
    ...handoff,
    metadata:
      handoff.metadata
        ? {
            ...handoff.metadata,
          }
        : undefined,
  };
}

function mapHandoffSnapshot(
  snapshot: FirestoreDocumentSnapshot,
): HumanHandoff {
  return cloneHandoff({
    id: snapshot.id,
    ...(snapshot.data() as Omit<
      HumanHandoff,
      "id"
    >),
  });
}

export class FirestoreAIPlatformHandoffRepository
  implements HandoffRepository
{
  private readonly db: FirestoreLike;

  constructor(db?: FirestoreLike) {
    this.db =
      db ??
      (firestore as unknown as FirestoreLike);
  }

  async createHandoff(
    input: CreateHandoffInput,
  ): Promise<HumanHandoff> {
    const handoff: HumanHandoff = {
      ...input,
    };
    const firestoreHandoff =
      removeUndefinedFirestoreValues(
        handoff,
      );

    await this.db
      .collection(HANDOFFS_COLLECTION)
      .doc(input.id)
      .create(
        firestoreHandoff as unknown as Record<
          string,
          unknown
        >,
      );

    return cloneHandoff(
      firestoreHandoff,
    );
  }

  async getActiveHandoff(
    conversationId: string,
  ): Promise<HumanHandoff | null> {
    const snapshot =
      await this.db
        .collection(HANDOFFS_COLLECTION)
        .get();

    return (
      snapshot.docs
        .map(mapHandoffSnapshot)
        .filter(
          (handoff) =>
            handoff.conversationId ===
              conversationId &&
            (handoff.status ===
              "waiting" ||
              handoff.status ===
                "active"),
        )
        .sort((left, right) =>
          right.requestedAt.localeCompare(
            left.requestedAt,
          ) ||
          left.id.localeCompare(right.id),
        )[0] ?? null
    );
  }

  async updateHandoff(
    input: UpdateHandoffInput,
  ): Promise<HumanHandoff> {
    const existingSnapshot =
      await this.db
        .collection(HANDOFFS_COLLECTION)
        .doc(input.id)
        .get();

    if (!existingSnapshot.exists) {
      throw new Error(
        `Handoff not found: ${input.id}`,
      );
    }

    const existing =
      mapHandoffSnapshot(
        existingSnapshot,
      );

    const updated: HumanHandoff = {
      ...existing,
      status:
        input.status ??
        existing.status,
      assignedAgentId:
        input.clearAssignedAgentId
          ? undefined
          : input.assignedAgentId ??
            existing.assignedAgentId,
      takenAt:
        input.takenAt ??
        existing.takenAt,
      resolvedAt:
        input.resolvedAt ??
        existing.resolvedAt,
      resolutionNote:
        input.resolutionNote ??
        existing.resolutionNote,
      metadata:
        input.metadata ??
        existing.metadata,
    };
    const firestoreHandoff =
      removeUndefinedFirestoreValues(
        updated,
      );

    await this.db
      .collection(HANDOFFS_COLLECTION)
      .doc(input.id)
      .set(
        firestoreHandoff as unknown as Record<
          string,
          unknown
        >,
      );

    return cloneHandoff(
      firestoreHandoff,
    );
  }

  async listWaitingHandoffs(
    filter: ListWaitingHandoffsFilter = {},
  ): Promise<HumanHandoff[]> {
    const limit =
      filter.limit ??
      Number.POSITIVE_INFINITY;
    const snapshot =
      await this.db
        .collection(HANDOFFS_COLLECTION)
        .get();

    return snapshot.docs
      .map(mapHandoffSnapshot)
      .filter(
        (handoff) =>
          handoff.status === "waiting",
      )
      .sort((left, right) =>
        left.requestedAt.localeCompare(
          right.requestedAt,
        ) ||
        left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map(cloneHandoff);
  }
}
