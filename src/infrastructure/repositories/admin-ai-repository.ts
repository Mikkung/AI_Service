import type {
  AnswerFeedbackInput,
  CreateImportBatchInput,
  CreatedAnswerFeedback,
  HistoricalQaImportResult,
  HistoricalQaWriteInput,
} from "@/core/admin-ai/types";

export interface AdminAiRepository {
  createImportBatch(input: CreateImportBatchInput): Promise<string>;

  importHistoricalQa(
    importBatchId: string,
    rows: HistoricalQaWriteInput[],
  ): Promise<HistoricalQaImportResult>;

  completeImportBatch(input: {
    importBatchId: string;
    received: number;
    inserted: number;
    duplicates: number;
  }): Promise<void>;

  failImportBatch(input: {
    importBatchId: string;
    errorMessage: string;
  }): Promise<void>;

  createAnswerFeedback(
    input: AnswerFeedbackInput,
  ): Promise<CreatedAnswerFeedback>;
}
