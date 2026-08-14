import {
  FieldValue,
} from "firebase-admin/firestore";

import type {
  AnswerFeedbackReviewRecord,
  ApprovedQaRecord,
  HistoricalQaReviewRecord,
  PromoteQaInput,
} from "@/core/admin-ai/review-types";

import type {
  EmbeddingResult,
} from "@/infrastructure/embeddings/embedding-provider";

import {
  firestore,
} from "@/infrastructure/db/firebase-admin";

const QA_HISTORY = "ai_qa_history";
const ANSWER_FEEDBACK = "ai_answer_feedback";
const APPROVED_QA = "ai_approved_qa";
const KNOWLEDGE_SOURCES = "ai_knowledge_sources";
const KNOWLEDGE_CHUNKS = "ai_knowledge_chunks";

function omitUndefined(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, fieldValue]) => fieldValue !== undefined,
    ),
  );
}

function toIso(
  value: unknown,
): string | undefined {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (
      value as { toDate?: unknown }
    ).toDate === "function"
  ) {
    return (
      value as { toDate: () => Date }
    ).toDate().toISOString();
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value;
  }

  return undefined;
}

function asOptionalString(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed
    ? trimmed
    : undefined;
}

function asOptionalStringArray(
  value: unknown,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length
    ? values
    : undefined;
}

export class FirestoreAdminReviewRepository {
  async listHistoricalQa(input: {
    status: "pending" | "reviewed" | "rejected" | "promoted";
    limit: number;
  }): Promise<HistoricalQaReviewRecord[]> {
    const snapshot = await firestore
      .collection(QA_HISTORY)
      .where(
        "reviewStatus",
        "==",
        input.status,
      )
      .limit(input.limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        importBatchId:
          asOptionalString(
            data.importBatchId,
          ),
        qaCandidateId:
          asOptionalString(
            data.qaCandidateId,
          ),
        channel: data.channel,
        conversationId:
          asOptionalString(
            data.conversationId,
          ),
        questionAt:
          asOptionalString(
            data.questionAt,
          ),
        answerAt:
          asOptionalString(
            data.answerAt,
          ),
        question:
          String(data.question ?? ""),
        historicalAnswer:
          String(
            data.historicalAnswer ?? "",
          ),
        contextBefore:
          asOptionalString(
            data.contextBefore,
          ),
        topic:
          asOptionalString(data.topic),
        language:
          asOptionalString(
            data.language,
          ),
        historicalReferenceYear:
          asOptionalString(
            data.historicalReferenceYear,
          ),
        timeSensitive:
          typeof data.timeSensitive ===
          "boolean"
            ? data.timeSensitive
            : undefined,
        answerStability:
          asOptionalString(
            data.answerStability,
          ),
        reusability:
          asOptionalString(
            data.reusability,
          ),
        candidateConfidence:
          asOptionalString(
            data.candidateConfidence,
          ),
        reviewPriority:
          asOptionalString(
            data.reviewPriority,
          ),
        knowledgeAudience:
          data.knowledgeAudience ===
            "internal"
            ? "internal"
            : "public",
        sourceTraceId:
          asOptionalString(
            data.sourceTraceId,
          ),
        reviewStatus:
          data.reviewStatus,
        approvedForKnowledge:
          Boolean(
            data.approvedForKnowledge,
          ),
        containsPii:
          Boolean(data.containsPii),
        piiRedacted:
          Boolean(data.piiRedacted),
        correctedQuestion:
          asOptionalString(
            data.correctedQuestion,
          ),
        correctedAnswer:
          asOptionalString(
            data.correctedAnswer,
          ),
        adminNote:
          asOptionalString(
            data.adminNote,
          ),
        reviewedBy:
          asOptionalString(
            data.reviewedBy,
          ),
        reviewedAt:
          toIso(data.reviewedAt),
        createdAt:
          toIso(data.createdAt),
        updatedAt:
          toIso(data.updatedAt),
      } as HistoricalQaReviewRecord;
    });
  }

  async getHistoricalQa(
    id: string,
  ): Promise<
    HistoricalQaReviewRecord | null
  > {
    const doc = await firestore
      .collection(QA_HISTORY)
      .doc(id)
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() ?? {};

    return {
      id: doc.id,
      importBatchId:
        asOptionalString(
          data.importBatchId,
        ),
      qaCandidateId:
        asOptionalString(
          data.qaCandidateId,
        ),
      channel: data.channel,
      conversationId:
        asOptionalString(
          data.conversationId,
        ),
      questionAt:
        asOptionalString(
          data.questionAt,
        ),
      answerAt:
        asOptionalString(
          data.answerAt,
        ),
      question:
        String(data.question ?? ""),
      historicalAnswer:
        String(
          data.historicalAnswer ?? "",
        ),
      contextBefore:
        asOptionalString(
          data.contextBefore,
        ),
      topic:
        asOptionalString(data.topic),
      language:
        asOptionalString(
          data.language,
        ),
      historicalReferenceYear:
        asOptionalString(
          data.historicalReferenceYear,
        ),
      timeSensitive:
        typeof data.timeSensitive ===
        "boolean"
          ? data.timeSensitive
          : undefined,
      answerStability:
        asOptionalString(
          data.answerStability,
        ),
      reusability:
        asOptionalString(
          data.reusability,
        ),
      candidateConfidence:
        asOptionalString(
          data.candidateConfidence,
        ),
      reviewPriority:
        asOptionalString(
          data.reviewPriority,
        ),
      knowledgeAudience:
        data.knowledgeAudience ===
          "internal"
          ? "internal"
          : "public",
      sourceTraceId:
        asOptionalString(
          data.sourceTraceId,
        ),
      reviewStatus:
        data.reviewStatus,
      approvedForKnowledge:
        Boolean(
          data.approvedForKnowledge,
        ),
      containsPii:
        Boolean(data.containsPii),
      piiRedacted:
        Boolean(data.piiRedacted),
      correctedQuestion:
        asOptionalString(
          data.correctedQuestion,
        ),
      correctedAnswer:
        asOptionalString(
          data.correctedAnswer,
        ),
      adminNote:
        asOptionalString(
          data.adminNote,
        ),
      reviewedBy:
        asOptionalString(
          data.reviewedBy,
        ),
      reviewedAt:
        toIso(data.reviewedAt),
      createdAt:
        toIso(data.createdAt),
      updatedAt:
        toIso(data.updatedAt),
    } as HistoricalQaReviewRecord;
  }

  async reviewHistoricalQa(input: {
    id: string;
    status: "reviewed" | "rejected";
    correctedQuestion?: string;
    correctedAnswer?: string;
    adminNote?: string;
    reviewedBy: string;
  }): Promise<void> {
    await firestore
      .collection(QA_HISTORY)
      .doc(input.id)
      .set(
        {
          ...omitUndefined({
            reviewStatus: input.status,
            correctedQuestion:
              input.correctedQuestion,
            correctedAnswer:
              input.correctedAnswer,
            adminNote:
              input.adminNote,
            reviewedBy:
              input.reviewedBy,
          }),
          reviewedAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }

  async listFeedback(input: {
    status: "pending" | "reviewed" | "approved" | "rejected";
    limit: number;
  }): Promise<
    AnswerFeedbackReviewRecord[]
  > {
    const snapshot = await firestore
      .collection(ANSWER_FEEDBACK)
      .where(
        "status",
        "==",
        input.status,
      )
      .limit(input.limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        sessionId:
          asOptionalString(
            data.sessionId,
          ),
        messageId:
          asOptionalString(
            data.messageId,
          ),
        channel:
          asOptionalString(
            data.channel,
          ),
        question:
          String(data.question ?? ""),
        aiAnswer:
          String(data.aiAnswer ?? ""),
        rating: data.rating,
        reason: data.reason,
        correctedAnswer:
          asOptionalString(
            data.correctedAnswer,
          ),
        adminNote:
          asOptionalString(
            data.adminNote,
          ),
        requestedForKnowledge:
          typeof data.requestedForKnowledge ===
          "boolean"
            ? data.requestedForKnowledge
            : undefined,
        submittedBy:
          asOptionalString(
            data.submittedBy,
          ),
        sourceIds:
          asOptionalStringArray(
            data.sourceIds,
          ),
        status: data.status,
        reviewedBy:
          asOptionalString(
            data.reviewedBy,
          ),
        reviewedAt:
          toIso(data.reviewedAt),
        createdAt:
          toIso(data.createdAt),
        updatedAt:
          toIso(data.updatedAt),
      } as AnswerFeedbackReviewRecord;
    });
  }

  async getFeedback(
    id: string,
  ): Promise<
    AnswerFeedbackReviewRecord | null
  > {
    const doc = await firestore
      .collection(ANSWER_FEEDBACK)
      .doc(id)
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() ?? {};

    return {
      id: doc.id,
      sessionId:
        asOptionalString(
          data.sessionId,
        ),
      messageId:
        asOptionalString(
          data.messageId,
        ),
      channel:
        asOptionalString(
          data.channel,
        ),
      question:
        String(data.question ?? ""),
      aiAnswer:
        String(data.aiAnswer ?? ""),
      rating: data.rating,
      reason: data.reason,
      correctedAnswer:
        asOptionalString(
          data.correctedAnswer,
        ),
      adminNote:
        asOptionalString(
          data.adminNote,
        ),
      requestedForKnowledge:
        typeof data.requestedForKnowledge ===
        "boolean"
          ? data.requestedForKnowledge
          : undefined,
      submittedBy:
        asOptionalString(
          data.submittedBy,
        ),
      sourceIds:
        asOptionalStringArray(
          data.sourceIds,
        ),
      status: data.status,
      reviewedBy:
        asOptionalString(
          data.reviewedBy,
        ),
      reviewedAt:
        toIso(data.reviewedAt),
      createdAt:
        toIso(data.createdAt),
      updatedAt:
        toIso(data.updatedAt),
    } as AnswerFeedbackReviewRecord;
  }

  async reviewFeedback(input: {
    id: string;
    status: "reviewed" | "rejected";
    correctedAnswer?: string;
    adminNote?: string;
    reviewedBy: string;
  }): Promise<void> {
    await firestore
      .collection(ANSWER_FEEDBACK)
      .doc(input.id)
      .set(
        {
          ...omitUndefined({
            status: input.status,
            correctedAnswer:
              input.correctedAnswer,
            adminNote:
              input.adminNote,
            reviewedBy:
              input.reviewedBy,
          }),
          reviewedAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }

  async commitApprovedQa(input: {
    approved: ApprovedQaRecord;
    promotion: PromoteQaInput;
    embedding: EmbeddingResult;
  }): Promise<void> {
    const {
      approved,
      promotion,
      embedding,
    } = input;

    const approvedRef = firestore
      .collection(APPROVED_QA)
      .doc(approved.id);

    const knowledgeSourceRef =
      firestore
        .collection(KNOWLEDGE_SOURCES)
        .doc(
          approved.knowledgeSourceId,
        );

    const knowledgeChunkRef =
      firestore
        .collection(KNOWLEDGE_CHUNKS)
        .doc(
          approved.knowledgeChunkId,
        );

    const sourceText = [
      `Question: ${approved.canonicalQuestion}`,
      `Answer: ${approved.approvedAnswer}`,
      approved.topic
        ? `Topic: ${approved.topic}`
        : undefined,
      approved.academicYear
        ? `Academic year: ${approved.academicYear}`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    const batch = firestore.batch();

    batch.set(
      approvedRef,
      {
        ...omitUndefined({
          ...approved,
          officialSource:
            approved.officialSource,
          academicYear:
            approved.academicYear,
          topic:
            approved.topic,
        }),
        approvedAt:
          FieldValue.serverTimestamp(),
        updatedAt:
          FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    batch.set(
      knowledgeSourceRef,
      {
        id:
          approved.knowledgeSourceId,
        title:
          `Approved Q&A: ${approved.canonicalQuestion}`.slice(
            0,
            180,
          ),
        audience:
          approved.audience,
        status: "active",
        version: "1",
        sourceType:
          approved.sourceType,
        sourceRecordId:
          approved.sourceRecordId,
        approvedQaId:
          approved.id,
        updatedAt:
          FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    batch.set(
      knowledgeChunkRef,
      {
        id:
          approved.knowledgeChunkId,
        sourceId:
          approved.knowledgeSourceId,
        title:
          `Approved Q&A: ${approved.canonicalQuestion}`.slice(
            0,
            180,
          ),
        text: sourceText,
        audience:
          approved.audience,
        status: "active",
        embedding:
          embedding.embedding,
        embeddingProvider:
          embedding.provider,
        embeddingModel:
          embedding.model,
        embeddingDimensions:
          embedding.dimensions,
        updatedAt:
          FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (
      promotion.sourceType ===
      "historical_qa"
    ) {
      const sourceRef = firestore
        .collection(QA_HISTORY)
        .doc(
          promotion.sourceRecordId,
        );

      batch.set(
        sourceRef,
        {
          reviewStatus:
            "promoted",
          approvedForKnowledge:
            true,
          correctedQuestion:
            approved.canonicalQuestion,
          correctedAnswer:
            approved.approvedAnswer,
          reviewedBy:
            promotion.approvedBy,
          reviewedAt:
            FieldValue.serverTimestamp(),
          approvedQaId:
            approved.id,
          knowledgeSourceId:
            approved.knowledgeSourceId,
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (
      promotion.sourceType ===
      "admin_feedback"
    ) {
      const sourceRef = firestore
        .collection(ANSWER_FEEDBACK)
        .doc(
          promotion.sourceRecordId,
        );

      batch.set(
        sourceRef,
        {
          status: "approved",
          correctedAnswer:
            approved.approvedAnswer,
          reviewedBy:
            promotion.approvedBy,
          reviewedAt:
            FieldValue.serverTimestamp(),
          approvedQaId:
            approved.id,
          knowledgeSourceId:
            approved.knowledgeSourceId,
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    await batch.commit();
  }
}
