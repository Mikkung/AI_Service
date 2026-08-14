import {
  FieldValue,
} from "firebase-admin/firestore";

import type {
  AnswerFeedbackInput,
  CreateImportBatchInput,
  CreatedAnswerFeedback,
  HistoricalQaImportResult,
  HistoricalQaWriteInput,
} from "@/core/admin-ai/types";

import type {
  AdminAiRepository,
} from "@/infrastructure/repositories/admin-ai-repository";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

const IMPORT_BATCHES = "ai_import_batches";
const QA_HISTORY = "ai_qa_history";
const ANSWER_FEEDBACK = "ai_answer_feedback";

const WRITE_BATCH_SIZE = 400;
const READ_BATCH_SIZE = 400;

/**
 * Firestore rejects explicit `undefined` values by default.
 * Keep optional TypeScript fields optional in application code,
 * but omit them entirely before writing documents.
 */
function omitUndefined<T extends Record<string, unknown>>(
  value: T,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, fieldValue]) => fieldValue !== undefined,
    ),
  );
}

export class FirestoreAdminAiRepository
  implements AdminAiRepository
{
  async createImportBatch(
    input: CreateImportBatchInput,
  ): Promise<string> {
    const ref = firestore
      .collection(IMPORT_BATCHES)
      .doc();

    await ref.set({
      ...omitUndefined(input as unknown as Record<string, unknown>),
      status: "processing",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return ref.id;
  }

  async importHistoricalQa(
    importBatchId: string,
    rows: HistoricalQaWriteInput[],
  ): Promise<HistoricalQaImportResult> {
    const existingIds = new Set<string>();

    // First determine which stable Q&A IDs already exist.
    // Existing rows are not rewritten, so repeat imports are truly idempotent.
    for (
      let start = 0;
      start < rows.length;
      start += READ_BATCH_SIZE
    ) {
      const slice = rows.slice(
        start,
        start + READ_BATCH_SIZE,
      );

      const refs = slice.map((row) =>
        firestore
          .collection(QA_HISTORY)
          .doc(row.id),
      );

      if (refs.length === 0) continue;

      const snapshots =
        await firestore.getAll(...refs);

      for (const snapshot of snapshots) {
        if (snapshot.exists) {
          existingIds.add(snapshot.id);
        }
      }
    }

    const newRows = rows.filter(
      (row) => !existingIds.has(row.id),
    );

    for (
      let start = 0;
      start < newRows.length;
      start += WRITE_BATCH_SIZE
    ) {
      const slice = newRows.slice(
        start,
        start + WRITE_BATCH_SIZE,
      );

      const batch = firestore.batch();

      for (const row of slice) {
        const ref = firestore
          .collection(QA_HISTORY)
          .doc(row.id);

        batch.set(
          ref,
          {
            ...omitUndefined(
              row as unknown as Record<
                string,
                unknown
              >,
            ),
            importBatchId,
            updatedAt:
              FieldValue.serverTimestamp(),
            createdAt:
              FieldValue.serverTimestamp(),
          },
          { merge: false },
        );
      }

      await batch.commit();
    }

    return {
      importBatchId,
      received: rows.length,
      inserted: newRows.length,
      duplicates: existingIds.size,
    };
  }

  async completeImportBatch(input: {
    importBatchId: string;
    received: number;
    inserted: number;
    duplicates: number;
  }): Promise<void> {
    await firestore
      .collection(IMPORT_BATCHES)
      .doc(input.importBatchId)
      .set(
        {
          status: "completed",
          received: input.received,
          inserted: input.inserted,
          duplicates: input.duplicates,
          completedAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }

  async failImportBatch(input: {
    importBatchId: string;
    errorMessage: string;
  }): Promise<void> {
    await firestore
      .collection(IMPORT_BATCHES)
      .doc(input.importBatchId)
      .set(
        {
          status: "failed",
          errorMessage:
            input.errorMessage.slice(0, 2_000),
          failedAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }

  async createAnswerFeedback(
    input: AnswerFeedbackInput,
  ): Promise<CreatedAnswerFeedback> {
    const ref = firestore
      .collection(ANSWER_FEEDBACK)
      .doc();

    const status = "pending" as const;

    await ref.set({
      ...omitUndefined(
        input as unknown as Record<
          string,
          unknown
        >,
      ),
      status,
      createdAt:
        FieldValue.serverTimestamp(),
      updatedAt:
        FieldValue.serverTimestamp(),
    });

    return {
      id: ref.id,
      ...input,
      status,
    };
  }
}
