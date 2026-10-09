import type {
  Channel,
} from "@/core/ai-platform/types/channels";

export type MediaCategory =
  | "general_image"
  | "screenshot"
  | "document"
  | "score_report"
  | "transcript"
  | "identity_document"
  | "application_screen"
  | "other";

export type MediaSensitivity =
  | "none"
  | "personal"
  | "sensitive";

export type MediaAnalysisStatus =
  | "not_requested"
  | "processing"
  | "ready"
  | "failed"
  | "blocked";

export interface MessageAttachment {
  id: string;
  type: "image";
  source: Channel;
  sourceMediaId?: string;
  contentType?: string;
  analysisStatus?: MediaAnalysisStatus;
  safeContextText?: string;
  category?: MediaCategory;
  sensitivity?: MediaSensitivity;
  requiresHumanReview?: boolean;
  metadata?: Record<string, unknown>;
}
