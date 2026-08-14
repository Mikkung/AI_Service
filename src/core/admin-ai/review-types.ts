import type {
  FeedbackReason,
  FeedbackStatus,
  HistoricalQaChannel,
  QaReviewStatus,
} from "@/core/admin-ai/types";

export type ApprovedQaSourceType =
  | "historical_qa"
  | "admin_feedback"
  | "manual";

export interface HistoricalQaReviewRecord {
  id: string;
  importBatchId?: string;
  qaCandidateId?: string;
  channel: HistoricalQaChannel;
  conversationId?: string;
  questionAt?: string;
  answerAt?: string;
  question: string;
  historicalAnswer: string;
  contextBefore?: string;
  topic?: string;
  language?: string;
  historicalReferenceYear?: string;
  timeSensitive?: boolean;
  answerStability?: string;
  reusability?: string;
  candidateConfidence?: string;
  reviewPriority?: string;
  knowledgeAudience?: "public" | "internal";
  sourceTraceId?: string;
  reviewStatus: QaReviewStatus;
  approvedForKnowledge: boolean;
  containsPii: boolean;
  piiRedacted: boolean;
  correctedQuestion?: string;
  correctedAnswer?: string;
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AnswerFeedbackReviewRecord {
  id: string;
  sessionId?: string;
  messageId?: string;
  channel?: string;
  question: string;
  aiAnswer: string;
  rating: "positive" | "negative";
  reason?: FeedbackReason;
  correctedAnswer?: string;
  adminNote?: string;
  requestedForKnowledge?: boolean;
  submittedBy?: string;
  sourceIds?: string[];
  status: FeedbackStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApprovedQaRecord {
  id: string;
  canonicalQuestion: string;
  approvedAnswer: string;
  topic?: string;
  audience: "public" | "internal";
  academicYear?: string;
  officialSource?: string;
  sourceType: ApprovedQaSourceType;
  sourceRecordId: string;
  status: "active" | "inactive";
  approvedBy: string;
  knowledgeSourceId: string;
  knowledgeChunkId: string;
}

export interface PromoteQaInput {
  sourceType: ApprovedQaSourceType;
  sourceRecordId: string;
  canonicalQuestion: string;
  approvedAnswer: string;
  topic?: string;
  audience: "public" | "internal";
  academicYear?: string;
  officialSource?: string;
  approvedBy: string;
}
