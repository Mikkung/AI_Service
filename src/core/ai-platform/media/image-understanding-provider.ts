import type {
  MediaCategory,
  MediaSensitivity,
} from "@/core/ai-platform/types/media";

export interface ImageUnderstandingRequest {
  bytes: Uint8Array;
  contentType: string;
  purpose: "conversation_context";
}

export interface ImageUnderstandingResult {
  category: MediaCategory;
  sensitivity: MediaSensitivity;
  safeContextText: string;
  detectedLanguage?: string;
  requiresHumanReview: boolean;
  provider: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface ImageUnderstandingProvider {
  readonly name: string;
  analyze(
    request: ImageUnderstandingRequest,
  ): Promise<ImageUnderstandingResult>;
}
