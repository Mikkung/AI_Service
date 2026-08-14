import {
  createHash,
} from "node:crypto";

import type {
  ApprovedQaRecord,
  PromoteQaInput,
} from "@/core/admin-ai/review-types";

import {
  getEmbeddingProvider,
} from "@/infrastructure/embeddings/provider-registry";

import {
  FirestoreAdminReviewRepository,
} from "@/infrastructure/repositories/firestore-admin-review-repository";

function normalizeText(
  value: string,
): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stableId(
  sourceType: string,
  sourceRecordId: string,
): string {
  return createHash("sha256")
    .update(
      `${sourceType}:${sourceRecordId}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
}

export class ApprovedQaService {
  private readonly repository =
    new FirestoreAdminReviewRepository();

  private readonly embeddingProvider =
    getEmbeddingProvider();

  async promoteHistoricalQa(input: {
    historyId: string;
    canonicalQuestion?: string;
    approvedAnswer?: string;
    topic?: string;
    audience?: "public" | "internal";
    academicYear?: string;
    officialSource?: string;
    approvedBy: string;
  }): Promise<ApprovedQaRecord> {
    const history =
      await this.repository
        .getHistoricalQa(
          input.historyId,
        );

    if (!history) {
      throw new Error(
        "Historical Q&A record not found.",
      );
    }

    if (
      history.containsPii &&
      !history.piiRedacted
    ) {
      throw new Error(
        "Historical Q&A contains PII that has not been marked as redacted.",
      );
    }

    const canonicalQuestion =
      normalizeText(
        input.canonicalQuestion ??
          history.correctedQuestion ??
          history.question,
      );

    const approvedAnswer =
      normalizeText(
        input.approvedAnswer ??
          history.correctedAnswer ??
          history.historicalAnswer,
      );

    if (!canonicalQuestion) {
      throw new Error(
        "Approved question cannot be empty.",
      );
    }

    if (!approvedAnswer) {
      throw new Error(
        "Approved answer cannot be empty.",
      );
    }

    const promotion: PromoteQaInput = {
      sourceType: "historical_qa",
      sourceRecordId:
        history.id,
      canonicalQuestion,
      approvedAnswer,
      topic:
        input.topic ??
        history.topic,
      audience:
        input.audience ??
        history.knowledgeAudience ??
        "public",
      academicYear:
        input.academicYear ??
        history.historicalReferenceYear,
      officialSource:
        input.officialSource,
      approvedBy:
        input.approvedBy,
    };

    return this.promote(
      promotion,
    );
  }

  async approveFeedback(input: {
    feedbackId: string;
    canonicalQuestion?: string;
    approvedAnswer?: string;
    topic?: string;
    audience?: "public" | "internal";
    academicYear?: string;
    officialSource?: string;
    approvedBy: string;
  }): Promise<ApprovedQaRecord> {
    const feedback =
      await this.repository
        .getFeedback(
          input.feedbackId,
        );

    if (!feedback) {
      throw new Error(
        "Feedback record not found.",
      );
    }

    const canonicalQuestion =
      normalizeText(
        input.canonicalQuestion ??
          feedback.question,
      );

    let approvedAnswer =
      input.approvedAnswer ??
      feedback.correctedAnswer;

    if (
      !approvedAnswer &&
      feedback.rating === "positive"
    ) {
      approvedAnswer =
        feedback.aiAnswer;
    }

    if (!approvedAnswer) {
      throw new Error(
        "Negative feedback must have a corrected answer before it can be approved to knowledge.",
      );
    }

    approvedAnswer =
      normalizeText(
        approvedAnswer,
      );

    const promotion: PromoteQaInput = {
      sourceType:
        "admin_feedback",
      sourceRecordId:
        feedback.id,
      canonicalQuestion,
      approvedAnswer,
      topic:
        input.topic,
      audience:
        input.audience ??
        "public",
      academicYear:
        input.academicYear,
      officialSource:
        input.officialSource,
      approvedBy:
        input.approvedBy,
    };

    return this.promote(
      promotion,
    );
  }

  private async promote(
    promotion: PromoteQaInput,
  ): Promise<ApprovedQaRecord> {
    const approvedId = stableId(
      promotion.sourceType,
      promotion.sourceRecordId,
    );

    const knowledgeSourceId =
      `approved-qa-${approvedId}`;

    const knowledgeChunkId =
      `${knowledgeSourceId}-001`;

    const title =
      `Approved Q&A: ${promotion.canonicalQuestion}`.slice(
        0,
        180,
      );

    const text = [
      `Question: ${promotion.canonicalQuestion}`,
      `Answer: ${promotion.approvedAnswer}`,
      promotion.topic
        ? `Topic: ${promotion.topic}`
        : undefined,
      promotion.academicYear
        ? `Academic year: ${promotion.academicYear}`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    const embedding =
      await this.embeddingProvider
        .embedDocument({
          title,
          text,
        });

    const approved:
      ApprovedQaRecord = {
        id: approvedId,
        canonicalQuestion:
          promotion.canonicalQuestion,
        approvedAnswer:
          promotion.approvedAnswer,
        topic:
          promotion.topic,
        audience:
          promotion.audience,
        academicYear:
          promotion.academicYear,
        officialSource:
          promotion.officialSource,
        sourceType:
          promotion.sourceType,
        sourceRecordId:
          promotion.sourceRecordId,
        status: "active",
        approvedBy:
          promotion.approvedBy,
        knowledgeSourceId,
        knowledgeChunkId,
      };

    await this.repository
      .commitApprovedQa({
        approved,
        promotion,
        embedding,
      });

    return approved;
  }
}
