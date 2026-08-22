import type {
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type {
  CreateKnowledgePublicationInput,
  KnowledgePublicationRepository,
  ListKnowledgePublicationsFilter,
  UpdateKnowledgePublicationInput,
} from "@/core/ai-platform/repositories/knowledge-publication-repository";

import type {
  KnowledgePublication,
  KnowledgePublicationEnvironment,
} from "@/core/ai-platform/types/knowledge-publication";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

import {
  removeUndefinedFirestoreValues,
} from "./firestore-serialization";

const PUBLICATIONS_COLLECTION =
  "ai_platform_knowledge_publications";

function clonePublication(
  publication: KnowledgePublication,
): KnowledgePublication {
  return {
    ...publication,
    providerMetadata:
      publication.providerMetadata
        ? {
            ...publication.providerMetadata,
          }
        : undefined,
  };
}

function mapPublicationSnapshot(
  snapshot: QueryDocumentSnapshot,
): KnowledgePublication {
  return clonePublication({
    id: snapshot.id,
    ...(snapshot.data() as Omit<
      KnowledgePublication,
      "id"
    >),
  });
}

export class FirestoreAIPlatformKnowledgePublicationRepository
  implements KnowledgePublicationRepository
{
  async createPublication(
    input: CreateKnowledgePublicationInput,
  ): Promise<KnowledgePublication> {
    const publication: KnowledgePublication =
      {
        ...input,
      };
    const firestorePublication =
      removeUndefinedFirestoreValues(
        publication,
      );

    await firestore
      .collection(PUBLICATIONS_COLLECTION)
      .doc(input.id)
      .create(firestorePublication);

    return clonePublication(
      firestorePublication,
    );
  }

  async getPublication(
    id: string,
  ): Promise<KnowledgePublication | null> {
    const snapshot =
      await firestore
        .collection(
          PUBLICATIONS_COLLECTION,
        )
        .doc(id)
        .get();

    if (!snapshot.exists) {
      return null;
    }

    return clonePublication({
      id: snapshot.id,
      ...(snapshot.data() as Omit<
        KnowledgePublication,
        "id"
      >),
    });
  }

  async findLatestPublication(
    documentId: string,
    targetProvider: string,
    targetEnvironment: KnowledgePublicationEnvironment = "development",
  ): Promise<KnowledgePublication | null> {
    const publications =
      await this.listPublications({
        documentId,
        targetProvider,
        targetEnvironment,
      });

    return publications
      .sort((left, right) =>
        (right.publishedAt ?? "")
          .localeCompare(
            left.publishedAt ?? "",
          ) ||
        right.id.localeCompare(left.id),
      )[0] ?? null;
  }

  async updatePublication(
    input: UpdateKnowledgePublicationInput,
  ): Promise<KnowledgePublication> {
    const existing =
      await this.getPublication(
        input.id,
      );

    if (!existing) {
      throw new Error(
        `Knowledge publication not found: ${input.id}`,
      );
    }

    const updated: KnowledgePublication =
      {
        ...existing,
        ...input,
      };
    const firestorePublication =
      removeUndefinedFirestoreValues(
        updated,
      );

    await firestore
      .collection(PUBLICATIONS_COLLECTION)
      .doc(input.id)
      .set(firestorePublication);

    return clonePublication(
      firestorePublication,
    );
  }

  async listPublications(
    filters: ListKnowledgePublicationsFilter = {},
  ): Promise<KnowledgePublication[]> {
    const snapshot =
      await firestore
        .collection(
          PUBLICATIONS_COLLECTION,
        )
        .get();

    return snapshot.docs
      .map(mapPublicationSnapshot)
      .filter(
        (publication) =>
          (!filters.documentId ||
            publication.documentId ===
              filters.documentId) &&
          (!filters.targetProvider ||
            publication.targetProvider ===
              filters.targetProvider) &&
          (!filters.targetEnvironment ||
            publication.targetEnvironment ===
              filters.targetEnvironment) &&
          (!filters.publicationStatus ||
            publication.publicationStatus ===
              filters.publicationStatus),
      )
      .sort((left, right) =>
        (left.publishedAt ?? "")
          .localeCompare(
            right.publishedAt ?? "",
          ) ||
        left.id.localeCompare(right.id),
      )
      .map(clonePublication);
  }
}
