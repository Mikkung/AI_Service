export type HistoricalQaChannel =
  | "facebook"
  | "facebook_messenger"
  | "line"
  | "web"
  | "teams"
  | "manual"
  | "other";

export type QaReviewStatus =
  | "pending"
  | "reviewed"
  | "rejected"
  | "promoted";

export type FeedbackRating = "positive" | "negative";

export type FeedbackReason =
  | "incorrect_fact"
  | "incomplete"
  | "unclear"
  | "wrong_source"
  | "tone"
  | "other";

export type FeedbackStatus =
  | "pending"
  | "reviewed"
  | "approved"
  | "rejected";

export interface CreateImportBatchInput {
  channel: HistoricalQaChannel;
  sourceFile: string;
  importedBy?: string;
}

export interface HistoricalQaInput {
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
}

export interface HistoricalQaWriteInput extends HistoricalQaInput {
  id: string;
  importBatchId: string;
  reviewStatus: QaReviewStatus;
  approvedForKnowledge: boolean;
  containsPii: boolean;
  piiRedacted: boolean;
}

export interface HistoricalQaImportResult {
  importBatchId: string;
  received: number;
  inserted: number;
  duplicates: number;
}

export interface AnswerFeedbackInput {
  sessionId?: string;
  messageId?: string;
  channel?: string;
  question: string;
  aiAnswer: string;
  rating: FeedbackRating;
  reason?: FeedbackReason;
  correctedAnswer?: string;
  adminNote?: string;
  requestedForKnowledge?: boolean;
  submittedBy?: string;
  sourceIds?: string[];
}

export interface CreatedAnswerFeedback extends AnswerFeedbackInput {
  id: string;
  status: FeedbackStatus;
}
