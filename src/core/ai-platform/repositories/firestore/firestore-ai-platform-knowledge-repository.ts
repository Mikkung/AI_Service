import type {
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  isCurrentlyEffective,
} from "@/core/ai-platform/knowledge/effective-date-policy";

import type {
  CreateKnowledgeDocumentInput,
  FindCurrentApprovedDocumentsFilter,
  KnowledgeRepository,
  ListKnowledgeDocumentsFilter,
  TransitionKnowledgeDocumentStatusInput,
  UpdateKnowledgeDocumentInput,
} from "@/core/ai-platform/repositories/knowledge-repository";

import type {
  KnowledgeApproval,
  KnowledgeDocument,
} from "@/core/ai-platform/types/knowledge";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

import {
  removeUndefinedFirestoreValues,
} from "./firestore-serialization";

const DOCUMENTS_COLLECTION =
  "ai_platform_knowledge_documents";

const APPROVALS_COLLECTION =
  "ai_platform_knowledge_approvals";

function cloneDocument(
  document: KnowledgeDocument,
): KnowledgeDocument {
  return {
    ...document,
    metadata:
      document.metadata
        ? {
            ...document.metadata,
          }
        : undefined,
  };
}

function mapDocumentSnapshot(
  snapshot: QueryDocumentSnapshot,
): KnowledgeDocument {
  return cloneDocument({
    id: snapshot.id,
    ...(snapshot.data() as Omit<
      KnowledgeDocument,
      "id"
    >),
  });
}

function cloneApproval(
  approval: KnowledgeApproval,
): KnowledgeApproval {
  return {
    ...approval,
  };
}

export class FirestoreAIPlatformKnowledgeRepository
  implements KnowledgeRepository
{
  async createDocument(
    input: CreateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const document: KnowledgeDocument = {
      ...input,
    };
    const firestoreDocument =
      removeUndefinedFirestoreValues(
        document,
      );

    await firestore
      .collection(DOCUMENTS_COLLECTION)
      .doc(input.id)
      .create(firestoreDocument);

    return cloneDocument(
      firestoreDocument,
    );
  }

  async getDocument(
    id: string,
  ): Promise<KnowledgeDocument | null> {
    const snapshot =
      await firestore
        .collection(DOCUMENTS_COLLECTION)
        .doc(id)
        .get();

    if (!snapshot.exists) {
      return null;
    }

    return cloneDocument({
      id: snapshot.id,
      ...(snapshot.data() as Omit<
        KnowledgeDocument,
        "id"
      >),
    });
  }

  async updateDocument(
    input: UpdateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const existing =
      await this.getDocument(input.id);

    if (!existing) {
      throw new Error(
        `Knowledge document not found: ${input.id}`,
      );
    }

    const updated: KnowledgeDocument = {
      ...existing,
      ...input,
      updatedAt:
        input.updatedAt,
    };
    const firestoreDocument =
      removeUndefinedFirestoreValues(
        updated,
      );

    await firestore
      .collection(DOCUMENTS_COLLECTION)
      .doc(input.id)
      .set(firestoreDocument);

    return cloneDocument(
      firestoreDocument,
    );
  }

  async transitionDocumentStatus(
    input: TransitionKnowledgeDocumentStatusInput,
  ): Promise<KnowledgeDocument> {
    const documentRef =
      firestore
        .collection(DOCUMENTS_COLLECTION)
        .doc(input.id);
    const approvalRef =
      firestore
        .collection(APPROVALS_COLLECTION)
        .doc(input.approval.id);

    return firestore.runTransaction(
      async (transaction) => {
        const [
          documentSnapshot,
          approvalSnapshot,
        ] = await Promise.all([
          transaction.get(documentRef),
          transaction.get(approvalRef),
        ]);

        if (!documentSnapshot.exists) {
          throw new Error(
            `Knowledge document not found: ${input.id}`,
          );
        }

        if (approvalSnapshot.exists) {
          throw new Error(
            `Knowledge approval already exists: ${input.approval.id}`,
          );
        }

        const existing =
          cloneDocument({
            id: documentSnapshot.id,
            ...(documentSnapshot.data() as Omit<
              KnowledgeDocument,
              "id"
            >),
          });

        if (
          existing.status !==
          input.expectedStatus
        ) {
          throw new Error(
            `Knowledge document status changed before transition: ${input.id}`,
          );
        }

        const updated =
          removeUndefinedFirestoreValues({
            ...existing,
            status:
              input.status,
            updatedAt:
              input.updatedAt,
            ...(input.approvedAt !==
            undefined
              ? {
                  approvedAt:
                    input.approvedAt,
                }
              : {}),
            ...(input.approvedBy !==
            undefined
              ? {
                  approvedBy:
                    input.approvedBy,
                }
              : {}),
            ...(input.supersededByDocumentId !==
            undefined
              ? {
                  supersededByDocumentId:
                    input.supersededByDocumentId,
                }
              : {}),
          });
        const approval =
          removeUndefinedFirestoreValues(
            cloneApproval(
              input.approval,
            ),
          );

        transaction.set(
          documentRef,
          updated,
        );
        transaction.create(
          approvalRef,
          approval,
        );

        return cloneDocument(updated);
      },
    );
  }

  async listDocuments(
    filters: ListKnowledgeDocumentsFilter = {},
  ): Promise<KnowledgeDocument[]> {
    const snapshot =
      await firestore
        .collection(DOCUMENTS_COLLECTION)
        .get();

    return snapshot.docs
      .map(mapDocumentSnapshot)
      .filter(
        (document) =>
          (!filters.audience ||
            document.audience ===
              filters.audience) &&
          (!filters.status ||
            document.status ===
              filters.status) &&
          (!filters.category ||
            document.category ===
              filters.category) &&
          (!filters.owner ||
            document.owner ===
              filters.owner) &&
          (!filters.sourceSystem ||
            document.sourceSystem ===
              filters.sourceSystem),
      )
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.id.localeCompare(
              right.id,
            )
          : left.createdAt.localeCompare(
              right.createdAt,
            ),
      )
      .map(cloneDocument);
  }

  async findCurrentApprovedDocuments(
    filters: FindCurrentApprovedDocumentsFilter,
  ): Promise<KnowledgeDocument[]> {
    return (
      await this.listDocuments({
        audience:
          filters.audience,
        status: "approved",
        category:
          filters.category,
      })
    ).filter((document) =>
      isCurrentlyEffective(
        document,
        filters.now,
      ),
    );
  }

  async recordApproval(
    approval: KnowledgeApproval,
  ): Promise<void> {
    const firestoreApproval =
      removeUndefinedFirestoreValues(
        cloneApproval(approval),
      );

    await firestore
      .collection(APPROVALS_COLLECTION)
      .doc(approval.id)
      .create(firestoreApproval);
  }

  async listApprovals(
    documentId: string,
  ): Promise<KnowledgeApproval[]> {
    const snapshot =
      await firestore
        .collection(APPROVALS_COLLECTION)
        .where(
          "documentId",
          "==",
          documentId,
        )
        .get();

    return snapshot.docs
      .map(
        (document) =>
          document.data() as KnowledgeApproval,
      )
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.id.localeCompare(
              right.id,
            )
          : left.createdAt.localeCompare(
              right.createdAt,
            ),
      )
      .map(cloneApproval);
  }
}
